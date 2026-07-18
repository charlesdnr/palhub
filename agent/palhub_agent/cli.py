"""CLI de l'agent PalHub.

    palhub-agent --once                     # un run (source et clé via .env)
    palhub-agent --once --source ./save/    # save local (tests)
    palhub-agent --loop --interval 300      # boucle toutes les 5 min

Config par variables d'environnement (chargées depuis ./.env si présent) :
    PALHUB_API_URL   ex: https://palhub.example.com
    PALHUB_API_KEY   clé du serveur (pal_xxxxxxxx_...)
    PALHUB_SOURCE    chemin local ou sftp:// (alors PALHUB_SRC_HOST/PORT/USER/KEY/PATH)
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import time
from pathlib import Path

from .parser import load_table, parse_save
from .publisher import PublishError, publish
from .sources import build_source, env
from .state import load_state, save_state

log = logging.getLogger("palhub-agent")

PARSE_RETRIES = 3
PARSE_RETRY_WAIT_S = 20


def load_dotenv(path: Path) -> None:
    """Charge le .env sans dépendance. L'environnement réel gagne toujours."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def run_once(args, api_url: str, api_key: str, state_file: Path) -> int:
    source = build_source(args.source or env("PALHUB_SOURCE"), args.world_id)
    if args.world_id:
        source.world_id = args.world_id
    names = load_table("pal_names.json")
    passive_names = load_table("passive_names.json")
    state = load_state(state_file)

    # Court-circuit : même taille+date qu'au dernier push -> rien à faire,
    # sans télécharger le save.
    fresh_stat = None
    if not args.force and state and state.get("world_id") == source.world_id:
        try:
            fresh_stat = source.stat()
        except Exception as e:  # noqa: BLE001 — stat best-effort, on télécharge si ça rate
            log.warning("stat impossible (%s) — on télécharge", e)
        else:
            if (state.get("size"), state.get("mtime")) == tuple(fresh_stat):
                log.info("save inchangé (stat : %s o) — rien à faire", f"{fresh_stat[0]:,}")
                return 0

    payload = live = digest = None
    for attempt in range(1, PARSE_RETRIES + 1):
        raw = source.fetch()
        digest = hashlib.sha256(raw).hexdigest()
        if fresh_stat is None:
            try:
                fresh_stat = source.stat()
            except Exception:  # noqa: BLE001
                fresh_stat = (len(raw), 0)

        if not args.force and state and state.get("hash") == digest:
            save_state(state_file, source.world_id, fresh_stat, digest)
            log.info("save inchangé (%s…) — rien à faire", digest[:12])
            return 0

        try:
            payload, live = parse_save(raw, source.world_id, digest, names, passive_names)
            break
        except Exception as e:  # noqa: BLE001 — lecture « torn » attendue de temps en temps
            log.warning("essai %d/%d échoué : %s", attempt, PARSE_RETRIES, e)
            if attempt == PARSE_RETRIES:
                log.error("abandon après %d essais", PARSE_RETRIES)
                return 1
            log.info("nouvelle tentative dans %ds…", PARSE_RETRY_WAIT_S)
            time.sleep(PARSE_RETRY_WAIT_S)
            fresh_stat = None

    try:
        publish(api_url, api_key, "palbox", payload)
        publish(api_url, api_key, "live", live)
    except PublishError as e:
        log.error("%s", e)
        return 1

    save_state(state_file, source.world_id, fresh_stat, digest)
    base_pals = sum(1 for p in payload["pals"] if p["owner"] is None)
    log.info(
        "OK — %d joueurs, %d pals (dont %d en base), %d bases, %d guildes poussés vers %s",
        len(payload["players"]), len(payload["pals"]), base_pals,
        len(live["bases"]), len(live["guilds"]), api_url,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Agent PalHub : Level.sav -> API")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true", help="un seul run")
    mode.add_argument("--loop", action="store_true", help="boucle infinie")
    ap.add_argument("--interval", type=int, default=300, help="secondes entre deux runs en --loop")
    ap.add_argument("--source", help="chemin local du save, ou sftp:// (défaut : PALHUB_SOURCE)")
    ap.add_argument("--world-id", help="force le world_id (sinon déduit du chemin)")
    ap.add_argument("--force", action="store_true", help="pousse même si le save n'a pas changé")
    ap.add_argument("--state-file", type=Path, default=Path("palhub-agent.state.json"))
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        stream=sys.stdout,
    )
    load_dotenv(Path.cwd() / ".env")

    api_url = env("PALHUB_API_URL", required=True)
    api_key = env("PALHUB_API_KEY", required=True)

    if args.once:
        return run_once(args, api_url, api_key, args.state_file)

    log.info("boucle : un run toutes les %ds (Ctrl+C pour arrêter)", args.interval)
    while True:
        try:
            run_once(args, api_url, api_key, args.state_file)
        except SystemExit as e:
            # config manquante : inutile de boucler
            raise
        except Exception as e:  # noqa: BLE001 — la boucle survit à un run raté
            log.error("run en échec : %s", e)
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
