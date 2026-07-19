"""Sources du Level.sav : SFTP et local derrière la même interface.

Lecture seule : on ne réécrit jamais le .sav. Repris de palworld_site/tools/sync_palbox.py.
"""
from __future__ import annotations

import base64
import contextlib
import hashlib
import logging
import os
from pathlib import Path

log = logging.getLogger("palhub-agent")

LEVEL_SAV = "Level.sav"
WORLD_ID_LEN = 32


class HostKeyMismatch(Exception):
    """La clé d'hôte SSH ne correspond pas à l'empreinte mémorisée (TOFU)."""


def _fingerprint(key) -> str:
    """Empreinte SHA256 façon OpenSSH : 'SHA256:' + base64(sha256(blob)) sans '='."""
    digest = hashlib.sha256(key.asbytes()).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


class SaveSource:
    world_id: str

    def fetch(self) -> bytes:
        raise NotImplementedError

    def stat(self):
        """(taille, mtime) du save, sans le télécharger."""
        raise NotImplementedError


def looks_like_world_id(name: str) -> bool:
    return len(name) == WORLD_ID_LEN and all(c in "0123456789ABCDEFabcdef" for c in name)


class LocalSource(SaveSource):
    """--source ./chemin/vers/SaveGames/0/<WorldID>/ — ou directement le fichier."""

    def __init__(self, path: Path, world_id: str | None = None):
        path = path.expanduser().resolve()
        self.sav = path if path.is_file() else path / LEVEL_SAV
        if not self.sav.is_file():
            raise SystemExit(f"introuvable : {self.sav}")
        name = self.sav.parent.name
        if world_id:
            self.world_id = world_id
        elif looks_like_world_id(name):
            self.world_id = name
        else:
            self.world_id = name
            log.warning(
                "%s ne ressemble pas à un WorldID — utilise --world-id pour forcer", name
            )

    def fetch(self) -> bytes:
        log.info("lecture locale : %s", self.sav)
        return self.sav.read_bytes()

    def stat(self):
        st = self.sav.stat()
        return st.st_size, int(st.st_mtime)


class SftpSource(SaveSource):
    """Pull du Level.sav depuis le serveur de jeu.

    Auth par clé (fichier `key` ou contenu `key_data`) ou par mot de passe
    (`password`) — jamais de repli silencieux d'un mode vers l'autre.
    """

    def __init__(self, host, port, user, key, world_path, password=None,
                 key_data=None, host_key_fp=None):
        self.host, self.port, self.user, self.key = host, port, user, key
        self.password, self.key_data = password, key_data
        self.world_path = world_path.rstrip("/")
        self.world_id = self.world_path.rsplit("/", 1)[-1]
        # TOFU : empreinte attendue (None = 1re connexion) et empreinte observée.
        self.host_key_fp = host_key_fp
        self._observed: dict[str, str] = {}

    @property
    def observed_host_key_fp(self) -> str | None:
        return self._observed.get("fp")

    @property
    def remote(self):
        return f"{self.world_path}/{LEVEL_SAV}"

    def _connect(self):
        return sftp_connect(
            self.host, self.port, self.user, self.key,
            password=self.password, key_data=self.key_data,
            expected_fp=self.host_key_fp, observed=self._observed,
        )

    def stat(self):
        with self._connect() as sftp:
            a = sftp.stat(self.remote)
            return a.st_size, int(a.st_mtime)

    def fetch(self) -> bytes:
        with self._connect() as sftp:
            log.info("pull sftp : %s@%s:%s", self.user, self.host, self.remote)
            # On ne lit QUE Level.sav : jamais backup/, backup_old/, *_old.sav.
            with sftp.open(self.remote, "rb") as f:
                f.prefetch()
                return f.read()


def _tofu_policy(expected_fp):
    """Politique paramiko : mémorise l'empreinte à la 1re connexion (TOFU) et
    refuse AVANT l'authentification si elle a changé (pas d'envoi des identifiants)."""
    import paramiko

    class _Policy(paramiko.MissingHostKeyPolicy):
        def __init__(self):
            self.observed_fp: str | None = None

        def missing_host_key(self, client, hostname, key):
            fp = _fingerprint(key)
            self.observed_fp = fp
            if expected_fp and fp != expected_fp:
                raise HostKeyMismatch(
                    f"clé d'hôte de {hostname} changée (attendu {expected_fp}, vu {fp}) "
                    "— réinitialise l'empreinte dans la config si le changement est légitime"
                )
            # empreinte inconnue ou identique : on accepte (et on l'a mémorisée)

    return _Policy()


@contextlib.contextmanager
def sftp_connect(host, port, user, key_path=None, password=None, key_data=None,
                 expected_fp=None, observed=None):
    import paramiko

    key = None
    if key_data:
        key = load_key_data(key_data)
    elif key_path:
        key = load_key(key_path)
    elif not password:
        raise SystemExit("aucune authentification fournie (clé ou mot de passe)")

    client = paramiko.SSHClient()
    # Sync hébergée : hôte inconnu du runner -> TOFU avec vérification d'empreinte.
    # Agent local (clé sur disque) : known_hosts strict.
    policy = None
    if key_data or password:
        policy = _tofu_policy(expected_fp)
        client.set_missing_host_key_policy(policy)
    else:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    known = Path.home() / ".ssh" / "known_hosts"
    if known.exists():
        client.load_host_keys(str(known))
    try:
        client.connect(
            hostname=host,
            port=int(port),
            username=user,
            pkey=key,
            password=password if not key else None,
            allow_agent=False,
            look_for_keys=False,
            timeout=30,
        )
    except paramiko.AuthenticationException as e:
        raise SystemExit(
            f"clé refusée par {host}:{port} pour {user} ({e}). "
            "Vérifie que la pubkey est autorisée chez l'hébergeur."
        ) from e
    # Empreinte observée remontée à l'appelant (pour la mémoriser côté API).
    if policy is not None and observed is not None and policy.observed_fp:
        observed["fp"] = policy.observed_fp
    try:
        yield client.open_sftp()
    finally:
        client.close()


def load_key(key_path):
    import paramiko

    p = Path(key_path).expanduser()
    if not p.is_file():
        raise SystemExit(f"clé introuvable : {p}")
    for cls in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
        try:
            return cls.from_private_key_file(str(p))
        except paramiko.PasswordRequiredException as e:
            raise SystemExit(
                f"{p} est protégée par passphrase — utilise une clé dédiée sans passphrase"
            ) from e
        except paramiko.SSHException:
            continue
    raise SystemExit(f"format de clé non reconnu : {p}")


def load_key_data(key_str: str):
    """Charge une clé privée depuis son contenu (sync hébergée)."""
    import io

    import paramiko

    for cls in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
        try:
            return cls.from_private_key(io.StringIO(key_str))
        except paramiko.PasswordRequiredException as e:
            raise RuntimeError("clé protégée par passphrase — fournis une clé sans passphrase") from e
        except paramiko.SSHException:
            continue
    raise RuntimeError("format de clé privée non reconnu")


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        raise SystemExit(f"variable d'environnement manquante : {name} (cf .env.example)")
    return v


def build_source(arg: str | None, world_id: str | None = None) -> SaveSource:
    if arg and not arg.startswith("sftp://"):
        return LocalSource(Path(arg), world_id)
    return SftpSource(
        host=env("PALHUB_SRC_HOST", required=True),
        port=env("PALHUB_SRC_PORT", "22"),
        user=env("PALHUB_SRC_USER", required=True),
        key=env("PALHUB_SRC_KEY", required=True),
        world_path=env("PALHUB_SRC_PATH", required=True),
    )
