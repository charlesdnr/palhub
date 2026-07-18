#!/usr/bin/env python3
"""Découpe la texture de la carte du monde en pyramide de tuiles pour Leaflet.

La texture source (8192×8192, extraite du jeu — voir assets_map/) est déclinée
en niveaux de zoom 0..5 : au niveau z l'image fait 256·2^z pixels de côté,
découpée en tuiles de 256×256 nommées {z}/{x}/{y}.webp (x colonne, y ligne,
origine en haut à gauche — le schéma standard de L.TileLayer).

    python tools/build_map_tiles.py            # assets_map/t_worldmap.webp -> site/map-tiles/
    python tools/build_map_tiles.py --source autre.png --out dossier/
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
DEFAULT_SOURCE = HERE.parent / "assets_map" / "t_worldmap.webp"
DEFAULT_OUT = HERE.parent / "site" / "map-tiles"

TILE = 256
QUALITY = 82  # webp : net sur les reliefs sans exploser le poids


def build(source: Path, out: Path) -> None:
    Image.MAX_IMAGE_PIXELS = None  # la source 8192² dépasse la limite anti-bombe par défaut
    im = Image.open(source).convert("RGB")
    if im.width != im.height:
        sys.exit(f"image non carrée : {im.width}x{im.height}")

    # zoom max = celui où l'image tient à sa résolution native
    max_zoom = max((im.width // TILE - 1).bit_length(), 0)
    if TILE * (2**max_zoom) != im.width:
        sys.exit(f"largeur {im.width} n'est pas 256·2^z (z entier)")

    total = 0
    for z in range(max_zoom + 1):
        side_px = TILE * (2**z)
        level = im if side_px == im.width else im.resize((side_px, side_px), Image.LANCZOS)
        n = side_px // TILE
        for x in range(n):
            for y in range(n):
                tile = level.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE))
                dest = out / str(z) / str(x)
                dest.mkdir(parents=True, exist_ok=True)
                tile.save(dest / f"{y}.webp", "WEBP", quality=QUALITY)
                total += 1
        print(f"zoom {z} : {n}×{n} tuiles")

    size_mb = sum(f.stat().st_size for f in out.rglob("*.webp")) / 1e6
    print(f"{total} tuiles, {size_mb:.1f} Mo -> {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    if not args.source.is_file():
        sys.exit(f"source introuvable : {args.source}")
    build(args.source, args.out)


if __name__ == "__main__":
    main()
