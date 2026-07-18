#!/usr/bin/env python3
"""Assemble les données de la carte : marqueurs (site/data/map-objects.js)
et icônes du jeu (site/map-icons/).

Deux sources, complémentaires (voir assets_map/PROVENANCE.md) :
  - paldb.cc (assets_map/paldb_map_data_en.js + paldb_treemap_data_en.js,
    un fichier par carte) : ~13 800 acteurs placés du jeu — œufs, pêche,
    coffres, minerais, effigies, donjons, PNJ… ;
  - palworld-save-pal (assets_map/*.json) : points de voyage rapide nommés,
    boss avec niveau (nom français via l10n), prédateurs — et les objets de
    la zone de l'Arbre-Monde, absents du jeu de données paldb.

Chaque marqueur est rangé par couche puis par carte (main / tree) selon le
rectangle de texture auquel il appartient. Coordonnées : monde Unreal (cm).

Marqueur : [x, y] ou [x, y, libellé] ou [x, y, libellé, niveau, clé_pal].
"""
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
ASSETS = HERE.parent / "assets_map"
ICON_CACHE = ASSETS / "icons"
OUT_DATA = HERE.parent / "site" / "data" / "map-objects.js"
OUT_ICONS = HERE.parent / "site" / "map-icons"

# rectangles couverts par les deux textures (DT_WorldMapUIData du jeu)
AREAS = {
    "main": ((-1099400.0, -724400.0), (349400.0, 724400.0)),
    "tree": ((347351.5, -818197.0), (689148.5, -476400.0)),
}
# l'Arbre est prioritaire là où les rectangles se recouvrent (règle du jeu)
AREA_ORDER = ("tree", "main")

CDN = "https://cdn.paldb.cc/image/"

# ---------------------------------------------------------------- couches --
# (groupe, clé, libellé FR, types paldb agrégés, icône, taille)
# icône : nom de fichier dans ICON_CACHE, ou URL cdn complète à télécharger.
# Les couches "psp" (types vides) sont remplies plus bas depuis les JSON psp.
LAYERS = [
    ("lieux", "fastTravel", "Voyage rapide", [], "t_icon_compass_fttower.webp", 26),
    ("lieux", "cities", "Villes & villages", ["City"], f"{CDN}Pal/Texture/UI/InGame/T_icon_compass_07.webp", 24),
    ("lieux", "dungeons", "Donjons", ["Dungeon"], "t_icon_compass_dungeon.webp", 24),
    ("lieux", "camps", "Camps ennemis", ["Enemy Camp"], f"{CDN}Pal/Texture/UI/InGame/T_icon_compass_EnemyCamp.webp", 24),
    ("lieux", "ruins", "Ruines anciennes", ["Ancient Ruin"], f"{CDN}Pal/Texture/UI/InGame/T_prt_pal_skill_lock.webp", 22),
    ("lieux", "warpAltar", "Autels célestes", ["Skyland Warp Altar"], f"{CDN}Pal/Texture/UI/InGame/T_icon_compass_Teleport.webp", 24),

    ("ennemis", "bosses", "Boss alpha", [], "t_icon_compass_06.webp", 30),
    ("ennemis", "towers", "Tours de faction", ["Tower"], "t_icon_compass_tower.webp", 28),
    ("ennemis", "predators", "Prédateurs", [], "t_icon_compass_01.webp", 24),
    ("ennemis", "incidents", "Incidents", ["Incident"], f"{CDN}Pal/Texture/UI/Main_Menu/T_icon_unknown.webp", 20),

    ("pnj", "npc", "PNJ", ["NPC"], f"{CDN}Pal/Texture/PalIcon/Normal/T_CommonHuman_icon_normal.webp", 22),
    ("pnj", "merchants", "Marchands ambulants", ["Wandering Merchant"], f"{CDN}Others/InventoryItemIcon/Texture/T_itemicon_Material_Money.webp", 22),
    ("pnj", "blackMarket", "Marché noir", ["Black Marketeer"], f"{CDN}Others/InventoryItemIcon/Texture/T_itemicon_PalSphere_Legend.webp", 22),

    ("oeufs", "eggGrass", "Œufs (plaines)", ["Grass Egg"], None, 22),
    ("oeufs", "eggDesert", "Œufs (désert)", ["Desert Egg"], None, 22),
    ("oeufs", "eggFrozen", "Œufs (glace)", ["Frozen Egg"], None, 22),
    ("oeufs", "eggVolcano", "Œufs (volcan)", ["Volcano Egg"], None, 22),
    ("oeufs", "eggSakura", "Œufs (Sakurajima)", ["Sakura Egg"], None, 22),
    ("oeufs", "eggSunreach", "Œufs (Sunreach)", ["Sunreach Egg"], None, 22),
    ("oeufs", "eggFeybreak", "Œufs (Feybreak)", ["Feybreak Egg"], None, 22),
    ("oeufs", "eggTree", "Œufs (Arbre-Monde)", ["World Tree Egg"], None, 22),

    ("peche", "fishing", "Spots de pêche", ["Fishing Spot"], None, 24),
    ("peche", "salvage1", "Épaves (rang 1)", ["Salvage Rank1"], "t_icon_compass_02.webp", 20),
    ("peche", "salvage2", "Épaves (rang 2)", ["Salvage Rank2"], "t_icon_compass_02.webp", 20),

    ("coffres", "treasure", "Coffres au trésor", ["Treasure"], "t_icon_compass_12.webp", 20),
    ("coffres", "treasureElement", "Coffres élémentaires", ["Treasure Element"], "t_icon_compass_04.webp", 22),
    ("coffres", "oilrigTreasure", "Coffres (pétrolière)", ["Oilrig Treasure", "Oilrig Treasure Goal"], "t_icon_compass_oilrig.webp", 22),
    ("coffres", "supply", "Largages", ["Supply"], "t_icon_compass_16.webp", 22),
    ("coffres", "treasureMaps", "Cartes au trésor", ["Treasure Map"], f"{CDN}Pal/Texture/UI/InGame/T_icon_compass_TreasureMap_01.webp", 24),

    ("collection", "effigies", "Effigies Lifmunk", ["Lifmunk Effigy"], "t_icon_compass_relic.webp", 22),
    ("collection", "palEffigies", "Statues de pals", [
        "Lamball Effigy", "Pengullet Effigy", "Munchill Effigy", "Rooby Effigy", "Herbil Effigy",
        "Tanzee Effigy", "Depresso Effigy", "Relaxaurus Effigy", "Lunaris Effigy", "Yakumo Effigy",
        "Cattiva Effigy",
    ], None, 22),
    ("collection", "journals", "Journaux", ["Journals"], f"{CDN}ui/memo.webp", 22),
    ("collection", "memos", "Mémos", ["Memo Planner"], None, 22),
    ("collection", "fruitTrees", "Arbres à fruits", ["Fruit Tree"], None, 24),
    ("collection", "flowers", "Belles fleurs", ["Beautiful Flower"], None, 22),
    ("collection", "peaches", "Pêches de parenté", ["Kinship Peach"], None, 22),

    ("ressources", "ore", "Minerai", ["Ore", "Ore Cluster"], None, 20),
    ("ressources", "coal", "Charbon", ["Coal", "Coal Cluster"], None, 20),
    ("ressources", "quartz", "Quartz pur", ["Pure Quartz", "Pure Quartz Cluster"], None, 20),
    ("ressources", "hexolite", "Quartz hexolite", ["Hexolite Quartz"], None, 20),
    ("ressources", "sulfur", "Soufre", ["Sulfur", "Sulfur Cluster"], None, 20),
    ("ressources", "chromite", "Chromite", ["Chromite"], None, 20),
    ("ressources", "soralite", "Soralite", ["Soralite"], None, 20),
    ("ressources", "nightstar", "Sable stellaire", ["Nightstar Sand"], None, 20),
    ("ressources", "oil", "Pétrole brut", ["Crude Oil"], None, 22),
    ("ressources", "paloxite", "Paloxite", ["Paloxite"], None, 20),
    ("ressources", "ancientMats", "Matériaux anciens", ["Ancient Lava", "Ancient Bark", "Ancient Bone"], None, 20),
    ("ressources", "junk", "Débris (bois)", ["Junk"], None, 20),
]

# icônes servies telles quelles pour les couches construites côté client
# (bases et joueurs du serveur, données live hors de ce script)
EXTRA_ICONS = ("t_icon_compass_camp.webp", "t_icon_compass_11.webp")

GROUP_LABELS = {
    "lieux": "Lieux",
    "ennemis": "Ennemis",
    "pnj": "PNJ",
    "oeufs": "Œufs",
    "peche": "Pêche",
    "coffres": "Coffres",
    "collection": "Collection",
    "ressources": "Ressources",
}


def area_of(x: float, y: float) -> str | None:
    for a in AREA_ORDER:
        (x0, y0), (x1, y1) = AREAS[a]
        if x0 <= x <= x1 and y0 <= y <= y1:
            return a
    return None


def grab_var(src: str, name: str):
    """Extrait `var name = <json>` du js paldb en équilibrant les crochets."""
    start = re.search(rf"var {name} = ", src).end()
    depth = 0
    for i in range(start, len(src)):
        c = src[i]
        if c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                return json.loads(src[start:i + 1])
    raise ValueError(f"var {name} : json non terminé")


def load_json(name: str):
    return json.loads((ASSETS / name).read_text(encoding="utf-8"))


def fetch_icon(url: str) -> str:
    """Télécharge (avec cache) une icône cdn.paldb.cc ; renvoie son nom local."""
    fname = url.rsplit("/", 1)[-1].lower()
    cached = ICON_CACHE / fname
    if not cached.is_file():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        cached.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        print(f"  icône téléchargée : {fname}")
    return fname


def main():
    fr_pals = load_json("l10n_fr_pals.json")

    # un fichier paldb par carte ; même structure, on fusionne tout
    by_type = defaultdict(list)
    icon_lookup = {}
    seen = set()                              # les deux fichiers partagent des entrées
    for fname, only_area in (("paldb_map_data_en.js", None), ("paldb_treemap_data_en.js", "tree")):
        src = (ASSETS / fname).read_text(encoding="utf-8")
        icon_lookup.update(grab_var(src, "iconLookup"))
        for o in grab_var(src, "fixedDungeon"):
            if "pos" not in o and "ipos" in o:
                # coordonnées "boussole" -> monde (inverse de worldToMap)
                o["pos"] = {"X": o["ipos"]["Y"] * 459 - 123930, "Y": o["ipos"]["X"] * 459 + 157935}
            if "pos" not in o:
                continue
            # le fichier de l'Arbre recopie des objets de la carte principale
            # avec des ipos exprimés dans un autre repère : on ne garde que ce
            # qui tombe vraiment dans les bornes de sa carte
            if only_area and area_of(o["pos"]["X"], o["pos"]["Y"]) != only_area:
                continue
            key = (o.get("type"), round(o["pos"]["X"]), round(o["pos"]["Y"]))
            if key in seen:
                continue
            seen.add(key)
            by_type[o.get("type", "?")].append(o)

    markers = defaultdict(lambda: {"main": [], "tree": []})
    layer_meta = []
    OUT_ICONS.mkdir(exist_ok=True)
    ICON_CACHE.mkdir(exist_ok=True)

    for group, key, label, types, icon, size in LAYERS:
        # icône : fichier du cache, URL cdn, ou celle du premier type paldb
        if icon is None and types:
            icon = icon_lookup.get(types[0], {}).get("fixed_icon")
        if icon and icon.startswith("http"):
            icon = fetch_icon(icon)
        if icon:
            data = (ICON_CACHE / icon).read_bytes()
            (OUT_ICONS / icon).write_bytes(data)
        layer_meta.append({"group": group, "key": key, "label": label, "icon": icon, "size": size})

        for t in types:
            for o in by_type.pop(t, []):
                x, y = o["pos"]["X"], o["pos"]["Y"]
                a = area_of(x, y)
                if not a:
                    continue
                m = [round(x), round(y)]
                name = o.get("item")
                if name and name != t:            # "Ore" sur une couche Minerai n'apporte rien
                    m.append(name)
                markers[key][a].append(m)

    for icon in EXTRA_ICONS:
        (OUT_ICONS / icon).write_bytes((ICON_CACHE / icon).read_bytes())

    ignored = {t: len(v) for t, v in by_type.items()}

    # ---- couches issues de palworld-save-pal ----
    for p in load_json("fast_travel_points.json").values():
        a = area_of(p["x"], p["y"])
        if a:
            markers["fastTravel"][a].append([round(p["x"]), round(p["y"]), p["localized_name"]])

    def pal_key(character_id: str) -> str | None:
        key = re.sub(r"^boss_", "", character_id or "", flags=re.I)
        return key if key and key != "None" else None

    def humanize(spawner_id: str) -> str:
        name = re.sub(r"^(BOSS|REGION)_", "", spawner_id, flags=re.I).replace("_", " ")
        name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
        name = re.sub(r"([A-Za-z])(\d)", r"\1 \2", name)
        return re.sub(r"\s+", " ", name).strip() or "Boss"

    for b in load_json("bosses.json").values():
        a = area_of(b["x"], b["y"])
        if not a:
            continue
        k = pal_key(b["character_id"])
        entry = fr_pals.get(k) if k else None
        name = entry["localized_name"] if entry else humanize(b["spawner_id"])
        markers["bosses"][a].append([round(b["x"]), round(b["y"]), name, b["level"], k or ""])

    for o in load_json("map_objects.json"):
        if o["type"] == "predator_pal":
            a = area_of(o["x"], o["y"])
            if a:
                markers["predators"][a].append([round(o["x"]), round(o["y"])])

    # ---- sortie ----
    groups = []
    for gkey, glabel in GROUP_LABELS.items():
        layers = [
            {"key": m["key"], "label": m["label"], "icon": m["icon"], "size": m["size"],
             "n": sum(len(v) for v in markers[m["key"]].values())}
            for m in layer_meta if m["group"] == gkey
        ]
        groups.append({"key": gkey, "label": glabel, "layers": layers})

    out = {"groups": groups, "markers": {k: dict(v) for k, v in markers.items()}}
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT_DATA.write_text(f"window.MAP_DATA={body};\n", encoding="utf-8")

    total = sum(len(v) for lay in markers.values() for v in lay.values())
    tree_n = sum(len(lay["tree"]) for lay in markers.values())
    print(f"{total} marqueurs ({tree_n} sur l'Arbre-Monde), {len(layer_meta)} couches "
          f"-> {OUT_DATA.name} ({OUT_DATA.stat().st_size / 1024:.0f} Ko)")
    print(f"icônes locales : {len(list(OUT_ICONS.glob('*.webp')))} dans {OUT_ICONS.name}/")
    if ignored:
        print("types paldb non repris :", ", ".join(f"{t} ({n})" for t, n in sorted(ignored.items())))


if __name__ == "__main__":
    main()
