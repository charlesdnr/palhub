#!/usr/bin/env python3
"""Regenerate tools/pal_names.json and tools/passive_names.json.

Run this again whenever Palworld ships new pals/passives.

- Species names / assets come from the game data shipped with PalworldSaveTools.
- Passive RANKS come from that same data.
- Passive FRENCH names come from paldb.cc (--fr, default on). paldb is a fan site,
  not the game: its French differs from the in-game French for ~1/4 of the
  "creative" skill names (it says "Dragon Divin" where the game says "Shenron").
  This was a deliberate choice — see the conversation / PROVENANCE. English is
  kept as a fallback for anything paldb can't map.

Nothing is invented: an ID with no known name falls back to the raw ID so
sync_palbox.py surfaces it instead of guessing.

Usage:
    python tools/gen_name_tables.py --pst <path to PalworldSaveTools checkout>
    python tools/gen_name_tables.py --pst <...> --no-fr   # passives stay English
"""
import argparse
import html as H
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"

# Un bloc paldb = infobulle d'effets + rang + nom.
_BLOCK = re.compile(
    r'data-bs-title="(?P<tip>[^"]*)"\s*>\s*'
    r'<div class="passive-rank(?P<rank>-?\d+)[^"]*">(?P<name>[^<]+)</div>',
    re.S,
)
# Seuls 4 tokens d'effet sont traduits ; tout le reste de l'infobulle est
# identique EN/FR (ElementBoost, ToSelf, Weight...). On normalise ces 4 pour que
# la signature d'effets soit la même dans les deux langues.
_FR2EN = {"Défense": "Defense", "Attaque": "Attack",
          "Vitesse de travail": "Work Speed", "PV max": "Max Health"}


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def _sig(tip, rank):
    t = re.sub(r"<[^>]+>", " ", H.unescape(H.unescape(tip)))
    for fr, en in _FR2EN.items():
        t = t.replace(fr, en)
    return f"r{rank}|" + re.sub(r"\s+", " ", t).strip()


def _blocks(lang):
    """(signature, nom) dans l'ordre du DOM pour la page passives d'une langue."""
    html = _fetch(f"https://paldb.cc/{lang}/Passive_Skills")
    return [(_sig(m.group("tip"), m.group("rank")), m.group("name").strip())
            for m in _BLOCK.finditer(html)]


def build_en_to_fr():
    """nom EN paldb -> nom FR paldb.

    Les deux pages listent les mêmes passives mais dans un ordre global
    différent. On les regroupe par signature d'effets : dans un groupe de même
    signature (ex. les "Emperor" élémentaires), l'ordre interne est le même des
    deux côtés, donc on apparie par position. Validé contre la table officielle
    du jeu : 0 mapping vers un mauvais skill sur les 63 vérifiables.
    """
    gen, gfr = defaultdict(list), defaultdict(list)
    for s, n in _blocks("en"):
        gen[s].append(n)
    for s, n in _blocks("fr"):
        gfr[s].append(n)
    en2fr = {}
    for s, en_names in gen.items():
        fr_names = gfr.get(s, [])
        if len(fr_names) == len(en_names):  # groupes alignés -> appariement sûr
            en2fr.update(zip(en_names, fr_names))
    return en2fr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pst", required=True, type=Path,
                    help="PalworldSaveTools checkout (needs resources/game_data/)")
    ap.add_argument("--no-fr", action="store_true", help="passives en anglais (pas de scrape paldb)")
    args = ap.parse_args()

    game_data = args.pst / "resources" / "game_data"
    if not game_data.is_dir():
        raise SystemExit(f"no resources/game_data under {args.pst}")

    characters = json.loads((game_data / "characters.json").read_text(encoding="utf-8"))
    skills = json.loads((game_data / "skills.json").read_text(encoding="utf-8"))

    # asset = le CharacterID du save, name = ce que le jeu affiche. Casse du save
    # incohérente (SheepBall / Sheepball) -> clé en minuscules. On garde l'asset
    # canonique : le CDN des portraits est sensible à la casse.
    pals = {}
    for p in characters["pals"]:
        asset, name = p.get("asset"), p.get("name")
        if asset and name:
            pals[asset.lower()] = {"name": name, "asset": asset}

    en2fr = {}
    if not args.no_fr:
        try:
            en2fr = build_en_to_fr()
            print(f"paldb FR : {len(en2fr)} passives EN->FR")
        except Exception as e:
            print(f"⚠️ scrape paldb FR échoué ({e}) -> passives en anglais")

    passives = {}
    fr_hits = 0
    for p in skills["passives"]:
        asset, name = p.get("asset"), p.get("name")
        if not (asset and name):
            continue
        fr = en2fr.get(name)
        if fr:
            fr_hits += 1
        passives[asset.lower()] = {
            "name": fr or name,   # affiché : FR si dispo, sinon EN
            "en": name,           # gardé pour debug / re-génération
            "rank": p.get("rank", 0),
        }

    for path, data, label in (
        (HERE / "pal_names.json", pals, "pals"),
        (HERE / "passive_names.json", passives, "passives"),
    ):
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"{label:<9} {len(data):>5} entries -> {path.name} ({path.stat().st_size:,} bytes)")
    if not args.no_fr:
        print(f"passives en français : {fr_hits}/{len(passives)} (le reste en anglais)")


if __name__ == "__main__":
    main()
