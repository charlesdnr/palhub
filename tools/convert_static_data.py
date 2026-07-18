#!/usr/bin/env python3
"""Convertit les données statiques de l'ancien site (palworld_site) en JSON propres.

Les fichiers source sont des scripts `window.XXX = {...};` chargés par <script>.
Ce script extrait le littéral JSON, le valide, et l'écrit dans game-assets/data/.
Rejouable à volonté ; ne modifie JAMAIS palworld_site (lecture seule).

Usage : python tools/convert_static_data.py [--source ../palworld_site]
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PALHUB = HERE.parent
OUT_DIR = PALHUB / "apps" / "web" / "public" / "game-assets" / "data"

# (fichier source relatif à palworld_site, nom de sortie)
JS_FILES = [
    ("site/data/map-objects.js", "map-objects.json"),
    ("site/data/map-pals.js", "map-pals.json"),
    ("site/data/breeding.js", "breeding.json"),
]
COPY_FILES = [
    ("tools/pal_names.json", "pal-names.json"),
    ("tools/passive_names.json", "passive-names.json"),
]


def extract_json(text: str) -> object:
    """Extrait le littéral objet d'un fichier `window.X = {...};` (commentaires tolérés)."""
    eq = text.index("=")
    start = text.index("{", eq)
    end = text.rindex("}")
    return json.loads(text[start : end + 1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--source",
        default=str(PALHUB.parent / "palworld_site"),
        help="racine du projet palworld_site (lecture seule)",
    )
    args = ap.parse_args()
    src_root = Path(args.source)
    if not src_root.is_dir():
        print(f"Source introuvable : {src_root}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for rel, out_name in JS_FILES:
        src = src_root / rel
        data = extract_json(src.read_text(encoding="utf-8"))
        out = OUT_DIR / out_name
        out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{out_name}: {out.stat().st_size:,} octets")

    for rel, out_name in COPY_FILES:
        src = src_root / rel
        out = OUT_DIR / out_name
        # validation au passage
        json.loads(src.read_text(encoding="utf-8"))
        shutil.copyfile(src, out)
        print(f"{out_name}: copié ({out.stat().st_size:,} octets)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
