#!/usr/bin/env python3
"""Zones de spawn des pals -> site/data/map-pals.js.

Source : assets_map/paldb_distribution.json, la table DT_PaldexDistributionData
du jeu (via paldb.cc) — celle qui dessine l'habitat de chaque pal dans le
Paldex. 365 pals × des centaines de points jour/nuit = ~18 Mo brut : on fusionne
jour et nuit puis on décime sur une grille (un point par cellule) pour garder
le nuage d'habitat lisible sans exploser le poids de la page.

Sortie : window.MAP_PALS = {pals: [{key, name, n}], points: {key: {main, tree}}}
— noms français (l10n palworld-save-pal), coordonnées monde arrondies,
rangées par carte comme dans map-objects.js.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
ASSETS = HERE.parent / "assets_map"
OUT = HERE.parent / "site" / "data" / "map-pals.js"

GRID = 8000  # cm — ~45 px au zoom natif : le nuage reste dense, le fichier léger

AREAS = {
    "main": ((-1099400.0, -724400.0), (349400.0, 724400.0)),
    "tree": ((347351.5, -818197.0), (689148.5, -476400.0)),
}
AREA_ORDER = ("tree", "main")


def area_of(x: float, y: float) -> str | None:
    for a in AREA_ORDER:
        (x0, y0), (x1, y1) = AREAS[a]
        if x0 <= x <= x1 and y0 <= y <= y1:
            return a
    return None


def main():
    rows = json.loads((ASSETS / "paldb_distribution.json").read_text(encoding="utf-8"))[0]["Rows"]
    fr_pals = json.loads((ASSETS / "l10n_fr_pals.json").read_text(encoding="utf-8"))
    # la table du jeu et la l10n ne s'accordent pas sur la casse (SheepBall/Sheepball)
    fr_lower = {k.lower(): v for k, v in fr_pals.items()}

    pals = []
    points = {}
    skipped = []
    raw_total = 0

    for key, row in rows.items():
        entry = fr_lower.get(key.lower())
        # variantes de quêtes/donjons sans fiche : pas affichables proprement
        if not entry or re.search(r"_Quest_|_Oilrig|GYM_", key, re.I):
            skipped.append(key)
            continue
        cells = {}
        for slot in ("dayTimeLocations", "nightTimeLocations"):
            for p in (row.get(slot) or {}).get("Locations") or []:
                raw_total += 1
                a = area_of(p["X"], p["Y"])
                if not a:
                    continue
                cell = (a, int(p["X"] // GRID), int(p["Y"] // GRID))
                if cell not in cells:
                    cells[cell] = (a, round(p["X"]), round(p["Y"]))
        if not cells:
            skipped.append(key)
            continue
        by_area = defaultdict(list)
        for a, x, y in cells.values():
            by_area[a].append([x, y])
        n = sum(len(v) for v in by_area.values())
        pals.append({"key": key, "name": entry["localized_name"], "n": n})
        points[key] = dict(by_area)

    pals.sort(key=lambda p: p["name"])
    out = {"pals": pals, "points": points}
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(f"window.MAP_PALS={body};\n", encoding="utf-8")

    kept = sum(p["n"] for p in pals)
    tree_n = sum(len(v.get("tree", [])) for v in points.values())
    print(f"{len(pals)} pals, {kept} points gardés sur {raw_total} bruts "
          f"({tree_n} sur l'Arbre-Monde) -> {OUT.name} ({OUT.stat().st_size / 1024:.0f} Ko)")
    if skipped:
        print(f"{len(skipped)} entrées écartées (variantes sans fiche) : {', '.join(skipped[:8])}…")


if __name__ == "__main__":
    main()
