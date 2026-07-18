# Provenance des assets de la carte

## paldb.cc

`paldb_distribution.json` (récupéré le 2026-07-18 sur
https://paldb.cc/DataTable/UI/DT_PaldexDistributionData.json) : la table
DT_PaldexDistributionData du jeu — les points de spawn jour/nuit de chaque pal
(365 entrées, ~126 000 points), celle qui dessine l'habitat dans le Paldex.
build_pal_spawns.py fusionne jour/nuit et décime sur une grille de 80 m
-> site/data/map-pals.js.

`paldb_map_data_en.js` (récupéré le 2026-07-18 sur https://paldb.cc/js/map_data_en.js) :
~13 400 acteurs placés extraits des données du jeu — œufs, spots de pêche, coffres,
minerais, effigies, donjons, PNJ… La variable `fixedDungeon` porte tout le jeu de
données ; `iconLookup` associe chaque type à son icône (cdn.paldb.cc), téléchargée
en local par build_map_data.py dans site/map-icons/ (cache : assets_map/icons/).
Les icônes elles-mêmes sont des textures du jeu, © Pocketpair.

## palworld-save-pal

Le reste vient du projet open-source [palworld-save-pal](https://github.com/oMaN-Rod/palworld-save-pal)
(récupéré le 2026-07-18, branche `main`), qui les extrait des données du jeu :

| fichier | origine | contenu |
|---|---|---|
| `t_worldmap.webp` | `ui/src/lib/assets/img/` | texture 8192×8192 de la carte du monde (asset du jeu, © Pocketpair) |
| `map_objects.json` | `data/json/` | donjons, pals alpha, prédateurs (coordonnées monde) |
| `fast_travel_points.json` | `data/json/` | 141 points de voyage rapide, noms anglais du jeu |
| `bosses.json` | `data/json/` | 159 boss avec `character_id` et niveau |
| `relics.json` | `data/json/` | reliques à collecter |
| `l10n_fr_pals.json` | `data/json/l10n/fr/pals.json` | noms français des pals (pour nommer les boss) |

Repères (constantes reprises de `ui/src/lib/components/map/utils.ts`, elles-mêmes
tirées du `DT_WorldMapUIData` du jeu) :

- la texture couvre le rectangle monde Unreal min **(-1099400, -724400)** →
  max **(349400, 724400)** (cm) ; axe horizontal carte = +Y monde, vertical = -X ;
- coordonnées « boussole » affichées en jeu :
  `x = (worldY - 157935) / 459`, `y = (worldX + 123930) / 459` ;
- la zone de l'Arbre-Monde a sa propre texture (`t_treemap.webp`, 8192×8192)
  couvrant (347351, -818197) → (689148, -476400), prioritaire sur le recouvrement.

Chaîne de fabrication locale :

    build_map_tiles.py                        t_worldmap.webp -> site/map-tiles/main/{z}/{x}/{y}.webp
    build_map_tiles.py --source t_treemap...  t_treemap.webp  -> site/map-tiles/tree/{z}/{x}/{y}.webp
    build_map_data.py                         paldb + psp     -> site/data/map-objects.js + site/map-icons/
