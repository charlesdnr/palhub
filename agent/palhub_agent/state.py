"""Sidecar d'idempotence : mémorise taille/date/hash du dernier save poussé.

Permet de court-circuiter un run sans re-télécharger le save (stat SFTP suffit),
et de ne pas re-pousser un contenu identique vers l'API.
"""
from __future__ import annotations

import json
from pathlib import Path


def load_state(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_state(path: Path, world_id: str, stat: tuple, digest: str) -> None:
    size, mtime = stat
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"world_id": world_id, "size": size, "mtime": mtime, "hash": digest}),
        encoding="utf-8",
    )
