# tools/vendor/palsav — code tiers, ne pas éditer

Copie de `src/palsav/` depuis **[deafdudecomputers/PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools)**.

```
commit  a37c9ebb0d294c7d6e88811c4503a59dad4a4c9e   (2026-07-17, release v2.1.2)
licence GPL-3.0-or-later
```

## Pourquoi c'est là

Le `Level.sav` du serveur est au format **`PlM` = compressé Oodle** (Palworld 0.6+/1.0).
`palworld-save-tools` (cheahjs) ne lit que l'ancien format `PlZ`/zlib et est
abandonné depuis octobre 2024 : il refuse le fichier dès l'octet 8. `palsav` en est
un fork API-compatible qui gère l'Oodle via `palooz`.

Vendorisé plutôt qu'installé depuis git parce que :

- ni `palsav-flex` ni `palooz` ne sont publiés sur PyPI ;
- ça ne pèse que 1,9 Mo / 130 fichiers ;
- le script doit continuer à tourner dans 2 ans même si le repo amont disparaît.

## Piège à l'installation

`palsav/pyproject.toml` déclare `palooz` en dépendance, mais ne le résout que via
`[tool.uv.sources]`, que **pip ignore**. Un `pip install ./palsav` direct part donc
chercher `palooz` sur PyPI et échoue. Il faut installer `palooz` d'abord :

```
pip install ./tools/vendor/palsav/palooz    # extension C++, exige MSVC Build Tools
pip install ./tools/vendor/palsav           # palooz est alors déjà satisfait
```

## Licence

GPL-3.0-or-later. `sync_palbox.py` tourne en local et n'est pas distribué, et le
`palbox.json` produit n'est pas une œuvre dérivée — le site public n'est pas
concerné. À reconsidérer seulement si `tools/` est un jour publié.

## Noms de passives en français — source et limites

Les noms FR des passives viennent de **paldb.cc** (`/fr/Passive_Skills`), pas du jeu.
`gen_name_tables.py` scrape les pages EN et FR, les apparie par signature d'effets
(les effets type `ElementBoost`/`ToSelf` ne sont pas traduits ; seuls Attaque/Défense/
Vitesse de travail/PV max le sont) et résout les collisions par l'ordre intra-groupe.

⚠️ **paldb est une traduction de fan, pas le français du jeu.** Validé contre la table
officielle du jeu sur 63 passives : ~28% des noms « créatifs » diffèrent (paldb dit
« Dragon Divin » là où le jeu dit **Shenron**, « Seigneur des Enfers » vs **Hadès**,
« Voile des Ténèbres » vs **Grimoire**). Choix assumé par l'utilisateur : tout-FR cohérent
plutôt que 40% d'anglais. Aucun mapping ne pointe vers un *mauvais* skill (vérifié).

Couverture actuelle : 103/104 (seul `Idiosyncratic` / `MutationPal_Mutant` reste en anglais).

Pour le vrai français du jeu il faudrait `DT_SkillNameText.json` (fr) extrait du `.pak`
Palworld avec FModel — le seul dump public trouvé ([blaynem/paldex]) est incomplet (63/104).

## palooz précompilé (palsav/lib/windows/)

`palooz.cp313-win_amd64.pyd` extrait de l'archive `PST_standalone_v2.1.2.7z` de la
release upstream (2026-07-18) — compiler ici exigeait le SDK Windows, absent de la
machine. `oozlib.py` ajoute `palsav/lib/windows/` au sys.path avant `import palooz`,
c'est l'emplacement prévu par l'upstream. ⚠️ lié à CPython 3.13 : le venv du projet
doit rester en 3.13 (installé via winget, `venv/` recréé le 2026-07-18 avec un
`palsav_vendor.pth` pointant vers ce dossier).

## Mise à jour

Recopier `src/palsav/` depuis un checkout plus récent, mettre à jour le commit
ci-dessus, puis relancer `python tools/gen_name_tables.py --pst <checkout>` pour
rafraîchir les tables de noms.
