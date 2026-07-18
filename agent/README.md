# Agent PalHub

Petit programme à installer près de ton serveur Palworld. Il lit le `Level.sav`
(en local ou par SFTP), en extrait les joueurs/pals/bases/guildes, et pousse le
résultat vers l'API PalHub avec la clé de ton serveur. Lecture seule : il ne
modifie jamais le save.

## Installation (Windows)

Prérequis : Python 3.13 (https://www.python.org/downloads/ ou `winget install Python.Python.3.13`).

```powershell
cd agent
py -3.13 -m venv .venv
# rend la lib de décodage vendored importable (palooz précompilé inclus pour Windows x64)
Set-Content .venv\Lib\site-packages\palsav_vendor.pth (Resolve-Path .\vendor\palsav).Path
.venv\Scripts\pip install .           # + « .[sftp] » si la source est en SFTP
copy .env.example .env                # puis remplir
.venv\Scripts\palhub-agent --once
```

Linux : pareil (`python3.13 -m venv`…), mais `palooz` doit être compilé
(`pip install ./vendor/palsav/palooz`, nécessite un compilateur C++). Une wheel
manylinux est prévue.

## Configuration (.env)

Voir `.env.example`. L'essentiel :

- `PALHUB_API_URL` — l'URL du site PalHub.
- `PALHUB_API_KEY` — la clé générée dans « Mes serveurs » (format `pal_xxxxxxxx_…`).
- `PALHUB_SOURCE` — dossier du save (`…/SaveGames/0/<WorldID>`) ou `sftp://`
  (alors renseigner `PALHUB_SRC_HOST/PORT/USER/KEY/PATH` ; auth par clé SSH uniquement).

## Lancement périodique

- Un run : `palhub-agent --once`
- En boucle : `palhub-agent --loop --interval 300`
- Windows, tâche planifiée : programme `<chemin>\.venv\Scripts\palhub-agent.exe`,
  arguments `--once`, démarrer dans le dossier de l'agent, toutes les 5 min.
- Linux, systemd timer ou cron : `*/5 * * * * cd /opt/palhub-agent && .venv/bin/palhub-agent --once`

L'agent est économe : si le save n'a pas changé (taille/date puis sha256), il ne
télécharge rien et ne pousse rien ; l'API refuse de toute façon les doublons (409).
