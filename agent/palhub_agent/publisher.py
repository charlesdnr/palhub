"""Publication vers l'API PalHub : POST JSON gzippé, clé API en Bearer.

Remplace la publication SFTP de l'ancien sync_palbox.py. Utilise urllib
(stdlib) : pas de dépendance requests pour deux POST.
"""
from __future__ import annotations

import gzip
import json
import logging
import time
import urllib.error
import urllib.request

log = logging.getLogger("palhub-agent")

RETRIES = 3
RETRY_WAIT_S = 5


class PublishError(RuntimeError):
    pass


def publish(api_url: str, api_key: str, kind: str, payload: dict) -> dict:
    """POST /api/ingest/<kind>. Renvoie la réponse JSON de l'API.

    Un 409 (snapshot déjà connu) est un succès : l'API a déjà ces données.
    Retry uniquement sur 5xx / erreurs réseau.
    """
    url = f"{api_url.rstrip('/')}/api/ingest/{kind}"
    body = gzip.compress(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        mtime=0,
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                out = json.loads(res.read().decode("utf-8"))
                log.info("%s -> %s (%s)", kind, res.status, out)
                return out
        except urllib.error.HTTPError as e:
            if e.code == 409:
                log.info("%s -> 409 : snapshot déjà connu de l'API, rien à faire", kind)
                return {"stored": False, "kind": kind}
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:500]
            except OSError:
                pass
            if e.code < 500:
                # 400/401/422 : réessayer ne changera rien — remonter tout de suite.
                raise PublishError(f"{kind} -> HTTP {e.code} : {detail}") from e
            last_error = PublishError(f"{kind} -> HTTP {e.code} : {detail}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_error = PublishError(f"{kind} -> API injoignable : {e}")

        if attempt < RETRIES:
            log.warning("essai %d/%d échoué (%s), retry dans %ds", attempt, RETRIES, last_error, RETRY_WAIT_S)
            time.sleep(RETRY_WAIT_S)

    raise last_error if last_error else PublishError(f"{kind} : échec inexpliqué")
