"""Runner de synchro hébergée : synchronise TOUS les serveurs configurés sur le site.

Tourne dans GitHub Actions (cron) ou n'importe où :
    PALHUB_API_URL=... PALHUB_WORKER_SECRET=... palhub-hosted-sync

Pour chaque serveur dont l'admin a rempli sa config SFTP sur le site :
stat (skip si inchangé) -> pull Level.sav -> décodage -> ingestion -> rapport.
Un serveur en échec n'empêche pas les autres.
"""
from __future__ import annotations

import hashlib
import json
import logging
import sys
import urllib.error
import urllib.request

from .parser import load_table, parse_save
from .publisher import PublishError, publish_gzip_json
from .sources import SftpSource, env

log = logging.getLogger("palhub-hosted")


def api_request(api: str, secret: str, path: str, payload: dict | None = None):
    req = urllib.request.Request(
        f"{api}/api{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method="POST" if payload is not None else "GET",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def report(api, secret, server_id, status, error=None, stat=None, host_key_fp=None):
    payload = {"status": status, "error": error}
    if stat:
        payload["statSize"], payload["statMtime"] = stat
    if host_key_fp:
        payload["hostKeyFp"] = host_key_fp
    try:
        api_request(api, secret, f"/internal/sync-jobs/{server_id}/report", payload)
    except (urllib.error.URLError, OSError) as e:
        log.warning("rapport impossible pour %s : %s", server_id, e)


def run_job(api: str, secret: str, job: dict, names: dict, passives: dict) -> str:
    source = SftpSource(
        host=job["host"],
        port=job["port"],
        user=job["username"],
        key=None,
        world_path=job["remotePath"],
        password=job["secret"] if job["authType"] == "password" else None,
        key_data=job["secret"] if job["authType"] == "key" else None,
        host_key_fp=job.get("hostKeyFp"),
    )

    stat = source.stat()
    fp = source.observed_host_key_fp
    if (job.get("lastStatSize"), job.get("lastStatMtime")) == tuple(stat):
        report(api, secret, job["serverId"], "unchanged", stat=stat, host_key_fp=fp)
        return "unchanged"

    raw = source.fetch()
    digest = hashlib.sha256(raw).hexdigest()
    payload, live = parse_save(raw, source.world_id, digest, names, passives)

    for kind, body in (("palbox", payload), ("live", live)):
        publish_gzip_json(
            f"{api}/api/internal/ingest/{job['serverId']}/{kind}", secret, kind, body
        )

    report(api, secret, job["serverId"], "ok", stat=stat, host_key_fp=fp)
    return "ok"


# Filet de sécurité : borne le nombre de jobs réclamés par run (évite une
# boucle infinie si un report échoue et que le verrou expire pendant le run).
MAX_JOBS_PER_RUN = 200


def main() -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)-7s %(message)s", stream=sys.stdout
    )
    api = env("PALHUB_API_URL", required=True).rstrip("/")
    secret = env("PALHUB_WORKER_SECRET", required=True)

    names = load_table("pal_names.json")
    passives = load_table("passive_names.json")

    # Boucle de « claim » : on réclame un job à la fois (l'API n'expose ainsi
    # qu'un secret par requête) jusqu'à épuisement.
    total = failures = 0
    for _ in range(MAX_JOBS_PER_RUN):
        job = api_request(api, secret, "/internal/sync-jobs/claim", payload={})
        if not job:
            break
        total += 1
        sid = job["serverId"]
        try:
            outcome = run_job(api, secret, job, names, passives)
            log.info("%s -> %s", sid, outcome)
        except PublishError as e:
            failures += 1
            log.error("%s -> ingestion en échec : %s", sid, e)
            report(api, secret, sid, "error", error=str(e)[:1000])
        except Exception as e:  # noqa: BLE001 — un serveur en panne n'arrête pas la boucle
            failures += 1
            log.error("%s -> %s", sid, e)
            report(api, secret, sid, "error", error=str(e)[:1000])

    if total == 0:
        log.info("aucun serveur en sync hébergée")
        return 0

    log.info("terminé : %d serveur(s), %d en échec", total, failures)
    # le run est « vert » si au moins un serveur passe : les échecs sont visibles
    # dans le statut par-serveur côté site, pas besoin d'alerter tout GitHub
    return 0 if failures < total else 1


if __name__ == "__main__":
    sys.exit(main())
