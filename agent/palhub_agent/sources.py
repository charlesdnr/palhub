"""Sources du Level.sav : SFTP et local derrière la même interface.

Lecture seule : on ne réécrit jamais le .sav. Repris de palworld_site/tools/sync_palbox.py.
"""
from __future__ import annotations

import contextlib
import logging
import os
from pathlib import Path

log = logging.getLogger("palhub-agent")

LEVEL_SAV = "Level.sav"
WORLD_ID_LEN = 32


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
    """Pull du Level.sav depuis le serveur de jeu. Auth par clé uniquement."""

    def __init__(self, host, port, user, key, world_path):
        self.host, self.port, self.user, self.key = host, port, user, key
        self.world_path = world_path.rstrip("/")
        self.world_id = self.world_path.rsplit("/", 1)[-1]

    @property
    def remote(self):
        return f"{self.world_path}/{LEVEL_SAV}"

    def stat(self):
        with sftp_connect(self.host, self.port, self.user, self.key) as sftp:
            a = sftp.stat(self.remote)
            return a.st_size, int(a.st_mtime)

    def fetch(self) -> bytes:
        with sftp_connect(self.host, self.port, self.user, self.key) as sftp:
            log.info("pull sftp : %s@%s:%s", self.user, self.host, self.remote)
            # On ne lit QUE Level.sav : jamais backup/, backup_old/, *_old.sav.
            with sftp.open(self.remote, "rb") as f:
                f.prefetch()
                return f.read()


@contextlib.contextmanager
def sftp_connect(host, port, user, key_path):
    import paramiko

    key = load_key(key_path)
    client = paramiko.SSHClient()
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
            # Auth par clé, point. Pas de repli silencieux sur un mot de passe.
            allow_agent=False,
            look_for_keys=False,
            timeout=30,
        )
    except paramiko.AuthenticationException as e:
        raise SystemExit(
            f"clé refusée par {host}:{port} pour {user} ({e}). "
            "Vérifie que la pubkey est autorisée chez l'hébergeur."
        ) from e
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
