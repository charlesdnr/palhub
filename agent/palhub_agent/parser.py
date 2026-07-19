"""Décodage du Level.sav et extraction des payloads palbox / live.

Repris de palworld_site/tools/sync_palbox.py — seule différence : les tables de
noms sont embarquées dans le package (palhub_agent/data/) et le payload live
porte aussi le source_hash pour l'idempotence côté API.
"""
from __future__ import annotations

import gc
import json
import logging
import time
from datetime import datetime, timezone
from importlib import resources

log = logging.getLogger("palhub-agent")

# On ne décode que les blobs utiles. Tout le reste du save (objets, foliage...)
# reste des octets opaques : c'est ce qui tient le parsing sous 1s.
CHARACTER_RAWDATA = ".worldSaveData.CharacterSaveParameterMap.Value.RawData"
BASECAMP_RAWDATA = ".worldSaveData.BaseCampSaveData.Value.RawData"
GROUP_MAP = ".worldSaveData.GroupSaveDataMap"

# Version du contrat de payload (côté API : champ optionnel schema_version).
SCHEMA_VERSION = 1

# au-delà de 5 min sans « dernière connexion » rafraîchie, un joueur est hors ligne
ONLINE_WINDOW_TICKS = 300 * 10_000_000  # FDateTime : 100 ns par tick


def load_table(name: str) -> dict:
    ref = resources.files("palhub_agent.data").joinpath(name)
    if not ref.is_file():
        log.warning("%s absent -> les IDs internes seront sortis bruts", name)
        return {}
    return json.loads(ref.read_text(encoding="utf-8"))


def prop(node, *keys, default=None):
    """Déballe les enveloppes {'value': ...} du GVAS."""
    for k in keys:
        if not isinstance(node, dict) or k not in node:
            return default
        node = node[k]
    return node


def byte_prop(save_param, key, default):
    """Level, Rank et Talent_* sont des ByteProperty : le scalaire est en .value.value.

    Un champ absent veut dire « valeur par défaut », pas « pal à ignorer ».
    """
    node = save_param.get(key)
    if node is None:
        return default
    return prop(node, "value", "value", default=default)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def extract(gvas, names, passive_names, world_id, source_hash):
    entries = prop(gvas.properties, "worldSaveData", "value", "CharacterSaveParameterMap", "value")
    if entries is None:
        raise ValueError("CharacterSaveParameterMap absent — format de save inattendu")

    players, pals, live_players = [], [], []
    for e in entries:
        raw = prop(e["value"], "RawData", "value")
        if not isinstance(raw, dict) or "object" not in raw:
            log.warning("entrée non décodée, ignorée")
            continue
        sp = prop(raw, "object", "SaveParameter", "value")
        if sp is None:
            continue
        if prop(sp, "IsPlayer", "value"):
            players.append(as_player(e, sp))
            live_players.append(as_live_player(e, sp))
        else:
            pals.append(as_pal(e, sp, names, passive_names))

    players.sort(key=lambda p: (-(p["level"] or 0), p["name"] or ""))
    pals.sort(key=lambda p: (-p["level"], -sum(p["ivs"].values())))

    # Rang des passives (-3..4) pour la coloration côté site — en table à part.
    used = {name for p in pals for name in p["passives"]}
    rank_by_name = {v["name"]: v.get("rank", 0) for v in passive_names.values()}
    ranks = {name: rank_by_name[name] for name in sorted(used) if name in rank_by_name}

    payload = {
        "generated_at": now_iso(),
        "source_hash": f"sha256:{source_hash}",
        "schema_version": SCHEMA_VERSION,
        "world_id": world_id,
        "passive_ranks": ranks,
        "players": players,
        "pals": pals,
    }
    return payload, extract_live(gvas, live_players, world_id, source_hash)


def extract_live(gvas, live_players, world_id, source_hash):
    """Bases, guildes et joueurs pour la couche « Serveur » de la carte."""
    wsd = prop(gvas.properties, "worldSaveData", "value", default={})

    guilds, base_guild, last_seen = [], {}, {}
    for g in prop(wsd, "GroupSaveDataMap", "value", default=[]) or []:
        raw = prop(g, "value", "RawData", "value", default={})
        if not isinstance(raw, dict) or raw.get("group_type") != "EPalGroupType::Guild":
            continue
        name = raw.get("guild_name") or raw.get("group_name") or "Guilde"
        members = []
        for pl in raw.get("players") or []:
            uid = short_uid(pl["player_uid"])
            members.append(uid)
            last_seen[uid] = prop(pl, "player_info", "last_online_real_time", default=0) or 0
        for bid in raw.get("base_ids") or []:
            base_guild[str(bid)] = name
        guilds.append({"name": name, "level": raw.get("base_camp_level"), "members": members})

    bases = []
    for b in prop(wsd, "BaseCampSaveData", "value", default=[]) or []:
        raw = prop(b, "value", "RawData", "value", default={})
        tr = (raw.get("transform") or {}).get("translation") or {}
        if "x" not in tr:
            continue
        bases.append({
            "x": round(tr["x"]),
            "y": round(tr["y"]),
            "guild": base_guild.get(str(raw.get("id"))),
        })

    newest = max(last_seen.values(), default=0)
    for p in live_players:
        ticks = last_seen.get(p["uid"])
        if ticks:
            p["offline_s"] = max(0, (newest - ticks) // 10_000_000)
            p["online"] = (newest - ticks) < ONLINE_WINDOW_TICKS
        else:
            p["offline_s"] = None
            p["online"] = False

    return {
        "generated_at": now_iso(),
        "source_hash": f"sha256:{source_hash}",
        "schema_version": SCHEMA_VERSION,
        "world_id": world_id,
        "guilds": guilds,
        "bases": bases,
        "players": live_players,
    }


def short_uid(uuid_obj) -> str:
    return str(uuid_obj).split("-")[0].upper()


def as_player(entry, sp):
    return {
        "uid": short_uid(prop(entry, "key", "PlayerUId", "value")),
        "name": prop(sp, "NickName", "value"),
        "level": byte_prop(sp, "Level", 1),
    }


def as_live_player(entry, sp):
    # LastJumpedLocation : la seule position joueur présente dans Level.sav.
    loc = prop(sp, "LastJumpedLocation", "value", default=None)
    if not isinstance(loc, dict) or "x" not in loc:
        loc = prop(sp, "LastJumpedLocation", default=None)
    ok = isinstance(loc, dict) and "x" in loc
    return {
        "uid": short_uid(prop(entry, "key", "PlayerUId", "value")),
        "name": prop(sp, "NickName", "value"),
        "level": byte_prop(sp, "Level", 1),
        "x": round(loc["x"]) if ok else None,
        "y": round(loc["y"]) if ok else None,
    }


def as_pal(entry, sp, names, passive_names):
    character_id = str(prop(sp, "CharacterID", "value", default=""))
    alpha = character_id.startswith("BOSS_")
    species_id = character_id[5:] if alpha else character_id

    owner = sp.get("OwnerPlayerUId")
    gender = prop(sp, "Gender", "value", "value", default="")
    slot = prop(sp, "SlotId", "value", default={})
    container = prop(slot, "ContainerId", "value", "ID", "value")

    passives = []
    for pid in prop(sp, "PassiveSkillList", "value", "values", default=[]):
        entry_ = passive_names.get(str(pid).lower())
        passives.append(entry_["name"] if entry_ else str(pid))

    # Lookup en minuscules (casse du save incohérente), repli sur l'ID brut.
    known = names.get(species_id.lower())

    return {
        "id": str(prop(entry, "key", "InstanceId", "value")),
        # Pas d'OwnerPlayerUId => pal de base/guilde.
        "owner": short_uid(prop(owner, "value")) if owner else None,
        "species": known["name"] if known else species_id,
        # Asset canonique : le CDN des portraits est sensible à la casse.
        "species_id": known["asset"] if known else species_id,
        "nickname": prop(sp, "NickName", "value"),
        "level": byte_prop(sp, "Level", 1),
        "rank": byte_prop(sp, "Rank", 1),
        "gender": gender.split("::")[-1].lower() if gender else None,
        "lucky": bool(prop(sp, "IsRarePal", "value", default=False)),
        "alpha": alpha,
        "ivs": {
            "hp": byte_prop(sp, "Talent_HP", 0),
            "shot": byte_prop(sp, "Talent_Shot", 0),
            "defense": byte_prop(sp, "Talent_Defense", 0),
        },
        "passives": passives,
        "container": str(container) if container else None,
        "slot": prop(slot, "SlotIndex", "value", default=0),
    }


def parse_save(raw: bytes, world_id: str, digest: str, names, passive_names):
    from palsav.core import decompress_sav_to_gvas
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    t0 = time.perf_counter()
    gvas_bytes, _ = decompress_sav_to_gvas(raw)
    log.info(
        "décompressé : %s -> %s octets (%.2fs)",
        f"{len(raw):,}", f"{len(gvas_bytes):,}", time.perf_counter() - t0,
    )

    t1 = time.perf_counter()
    gc.disable()
    try:
        gvas = GvasFile.read(
            gvas_bytes,
            PALWORLD_TYPE_HINTS,
            {k: PALWORLD_CUSTOM_PROPERTIES[k] for k in (CHARACTER_RAWDATA, BASECAMP_RAWDATA, GROUP_MAP)},
            allow_nan=True,
        )
    finally:
        gc.enable()
    log.info("GVAS parsé en %.2fs", time.perf_counter() - t1)

    return extract(gvas, names, passive_names, world_id, digest)
