#!/usr/bin/env python3
"""tools/vendor/palcalc/*.json -> site/data/breeding.js

Génère les données de breeding embarquées par le site : la liste des espèces
(nom interne, nom FR officiel, probabilité de genre) et la table COMPLÈTE des
couples parents -> enfant, packée en uint16 triangulaire supérieur + base64.

Pas de formule de breeding côté JS : la table est la vérité terrain extraite du
jeu par palcalc, on la lit telle quelle. ~117 Ko de base64 (54 Ko sur le réseau
une fois gzippée par le serveur).

    python tools/build_breeding_data.py
"""
import base64
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).parent
VENDOR = HERE / "vendor" / "palcalc"
OUT = HERE.parent / "site" / "data" / "breeding.js"

# Le seul couple du jeu dont l'enfant dépend du genre des parents.
# breeding.json le donne en deux entrées FEMALE/MALE ; la cellule correspondante
# de la table packée reste un trou (0xFFFF) et le JS lit cette constante.
GENDERED_PAIR = ("CatMage", "FoxMage")

HOLE = 0xFFFF


def main() -> int:
    db = json.loads((VENDOR / "db.json").read_text(encoding="utf-8"))
    br = json.loads((VENDOR / "breeding.json").read_text(encoding="utf-8"))

    pals = db["Pals"]
    n = len(pals)
    idx = {p["InternalName"]: i for i, p in enumerate(pals)}
    gender_prob = db["BreedingGenderProbability"]
    passive_fr = {p["InternalName"]: (p["LocalizedNames"] or {}).get("fr") or p["Name"]
                  for p in db["PassiveSkills"]}

    # ------------------------------------------------------------- espèces
    species = []
    for p in pals:
        internal = p["InternalName"]
        male = gender_prob.get(internal, {}).get("MALE", 0.5)
        entry = {
            "id": internal,
            "fr": p["LocalizedNames"]["fr"],
            "m": round(male, 3),
        }
        # passives garanties à la naissance (Légende des légendaires, etc.) :
        # toujours présentes sur l'enfant, en plus de l'héritage classique
        if p["GuaranteedPassivesInternalIds"]:
            entry["g"] = [passive_fr[x] for x in p["GuaranteedPassivesInternalIds"]]
        species.append(entry)

    # ------------------------------------------------------------- la table
    # Paires non ordonnées (i <= j), enfant = index d'espèce sur 16 bits.
    pairs: dict[tuple[int, int], int] = {}
    gendered = []
    for e in br["Breeding"]:
        a, b = e["Parent1InternalName"], e["Parent2InternalName"]
        if e["Parent1Gender"] != "WILDCARD" or e["Parent2Gender"] != "WILDCARD":
            gendered.append(e)
            continue
        i, j = idx[a], idx[b]
        key = (min(i, j), max(i, j))
        child = idx[e["ChildInternalName"]]
        if pairs.setdefault(key, child) != child:
            raise SystemExit(f"conflit dans breeding.json pour {a} x {b}")
    pairs[(min(idx[GENDERED_PAIR[0]], idx[GENDERED_PAIR[1]]),
           max(idx[GENDERED_PAIR[0]], idx[GENDERED_PAIR[1]]))] = HOLE

    expected = n * (n + 1) // 2
    if len(pairs) != expected:
        raise SystemExit(f"table incomplète : {len(pairs)} paires, {expected} attendues")

    # Le couple genré : {parent femelle -> enfant} suffit à lever l'ambiguïté.
    special = {}
    for e in gendered:
        female = e["Parent1InternalName"] if e["Parent1Gender"] == "FEMALE" else e["Parent2InternalName"]
        special[female] = e["ChildInternalName"]
    if sorted(special) != sorted(GENDERED_PAIR):
        raise SystemExit(f"couples genrés inattendus : {gendered}")

    buf = bytearray()
    for i in range(n):
        for j in range(i, n):
            buf += struct.pack("<H", pairs[(i, j)])
    b64 = base64.b64encode(bytes(buf)).decode()

    # ------------------------------------------------------------- sortie
    payload = {
        "version": db["Version"],
        "n": n,
        "species": species,
        "special": special,
        "table": b64,
    }
    OUT.write_text(
        "/* Généré par tools/build_breeding_data.py — ne pas éditer.\n"
        "   Source : palcalc (MIT), voir tools/vendor/palcalc/SOURCE.md. */\n"
        "window.BREEDING = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )

    kb = OUT.stat().st_size / 1024
    print(f"{OUT.relative_to(HERE.parent)} : {n} espèces, {len(pairs)} paires, {kb:.0f} Ko")
    return 0


if __name__ == "__main__":
    sys.exit(main())
