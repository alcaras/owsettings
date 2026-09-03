#!/usr/bin/env python3
"""
build_presets.py — regenerate presets.js from the tournament sources.

  duel pool  : POOL (18 slugs) mirrors owtournamentatlas/src/pages/index.astro;
               script + map-option values come from owmapgen-lab/scripts/configs.py
               (the pool's single source of truth) via the slug.
  ffa scripts: every script the FFA atlas sweeps (owmapgen-lab/scripts/ffa_configs.py),
               i.e. the ones that place 10 land starts on Huge.
  map classes: MAPCLASS_ + the C# class name, case-exact — verified against
               Reference/Source/Base/Game/GameCore/MapScripts/*.cs (2026-09-02).

Run:  python3 scripts/build_presets.py
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LAB = ROOT.parent / "owmapgen-lab" / "scripts"
sys.path.insert(0, str(LAB))
from configs import CONFIGS  # noqa: E402
from ffa_configs import SCRIPTS as FFA_SCRIPTS  # noqa: E402

# Display name (as GetName() resolves in-game) -> MAPCLASS_ id
MAP_CLASS = {
    "Archipelago": "MAPCLASS_MapScriptArchipelago",
    "Arid Plateau": "MAPCLASS_AridPlateau",
    "Bay": "MAPCLASS_MapScriptBay",
    "Coastal Rain Basin": "MAPCLASS_CoastalRainBasin",
    "Continent": "MAPCLASS_MapScriptContinent",
    "Deep Jungle": "MAPCLASS_MapscriptJungle",
    "Desert": "MAPCLASS_MapScriptDesert",
    "Desolation": "MAPCLASS_MapScriptDesolation",
    "Donut": "MAPCLASS_MapScriptDonut",
    "Duel of the Ancients": "MAPCLASS_MapScriptDota",
    "Ebbing Sea": "MAPCLASS_MapScriptEbbingSea",
    "Hardwood Forest": "MAPCLASS_MapScriptHardwoodForest",
    "Highlands": "MAPCLASS_MapScriptHighlands",
    "Inland Sea": "MAPCLASS_MapScriptInlandSea2",
    "Lakes and Gulfs": "MAPCLASS_MapScriptLakesAndGulfs",
    "Mediterranean": "MAPCLASS_MapScriptMediterranean",
    "Mountain Pass": "MAPCLASS_MapscriptMountainPass",
    "Multiple Continents": "MAPCLASS_MapScriptContinents",
    "Northern Ocean": "MAPCLASS_MapScriptNorthernOcean",
    "Player Islands": "MAPCLASS_MapScriptPlayerIslands",
    "Seaside": "MAPCLASS_MapScriptSeaside",
    "Wetlands": "MAPCLASS_MapscriptWetlands",
}

# thumbnail file under img/maps/ (from owreference's mapscripts art)
ART = {
    "Duel of the Ancients": "dota",
}

# The finalised 18-map tournament pool, in the atlas's order.
POOL = [
    "archipelago-land-lg-water-sm-smallest-square-sym",
    "archipelago-land-lg-water-sm-smallest-wide-nosym",
    "arid-plateau-small-seas-smallest-square-sym",
    "arid-plateau-large-seas-smallest-square-sym",
    "coastal-rain-basin-smallest-wide-nosym",
    "coastal-rain-basin-smallest-square-sym",
    "continent-smallest-wide-sym",
    "desert-lush-std-tiny-square-nosym",
    "desert-none-std-tiny-square-sym",
    "donut-irreg-low-smallest-square-sym",
    "dota-jungle-smallest-square-sym",
    "dota-sand-smallest-square-sym",
    "dota-water-smallest-square-sym",
    "hardwood-forest-smallest-wide-nosym",
    "inland-sea-smallest-square-sym",
    "inland-sea-smallest-wide-nosym",
    "mountain-pass-smallest-wide-sym",
    "wetlands-smallest-square-sym",
]

SIZE_ID = {"smallest": "MAPSIZE_SMALLEST", "tiny": "MAPSIZE_TINY", "huge": "MAPSIZE_HUGE"}
SIZE_LABEL = {"smallest": "Duel", "tiny": "Tiny", "huge": "Huge"}
ASPECT_ID = {"square": "MAPASPECTRATIO_SQUARE", "wide": "MAPASPECTRATIO_WIDE"}

# In-game labels for the option values we set (mapOptionsMulti text-*.xml).
OPT_LABEL = {
    "MAP_OPTIONS_MULTI_ARID_WATER_SIZE": ("Water Size", {
        "MAP_OPTION_ARID_WATER_SIZE_SMALL": "Small",
        "MAP_OPTION_ARID_WATER_SIZE_LARGE": "Large"}),
    "MAP_OPTIONS_MULTI_CONTINENT_TERRAIN": ("Extreme Terrain", {
        "MAP_OPTION_CONTINENT_TERRAIN_NONE": "None"}),
    "MAP_OPTIONS_ARCHIPELAGO_LANDMASS": ("Islands Size", {
        "MAP_OPTION_ARCHIPELAGO_LANDMASS_LARGE": "Large"}),
    "MAP_OPTIONS_MULTI_ARCHIPELAGO_WATER_SIZE": ("Water Size", {
        "MAP_OPTION_ARCHIPELAGO_WATER_SIZE_MERGED": "Small"}),
    "MAP_OPTIONS_DESERT_COAST": ("Desert Coast", {
        "MAP_OPTION_DESERT_COAST_LUSH": "Lush",
        "MAP_OPTION_DESERT_COAST_NONE": "None",
        "MAP_OPTION_DESERT_COAST_DRY": "Dry"}),
    "MAP_OPTIONS_DESERT_SIZE": ("Desert Size", {
        "MAP_OPTION_DESERT_SIZE_NORMAL": "Standard"}),
    "MAP_OPTIONS_DONUT_IRREGULARITY": ("Donut Irregularity", {
        "MAP_OPTION_DONUT_IRREGULARITY_LOW": "Low"}),
    "MAP_OPTIONS_MULTI_DOTA_INNER_TERRAIN": ("Separating Terrain", {
        "MAP_OPTION_TERRAIN_INNER_JUNGLE": "Jungle",
        "MAP_OPTION_TERRAIN_INNER_SAND": "Sand",
        "MAP_OPTION_TERRAIN_INNER_WATER": "Water",
        "MAP_OPTION_TERRAIN_INNER_MOUNTAINS": "Mountains"}),
    "MAP_OPTIONS_MULTI_DOTA_OUTER_TERRAIN": ("Outer Terrain", {
        "MAP_OPTION_TERRAIN_OUTER_JUNGLE": "Jungle",
        "MAP_OPTION_TERRAIN_OUTER_SAND": "Sand",
        "MAP_OPTION_TERRAIN_OUTER_WATER": "Water",
        "MAP_OPTION_TERRAIN_OUTER_MOUNTAINS": "Mountains"}),
    "MAP_OPTIONS_MULTI_DOTA_PATH_WIDTH": ("Path Width", {
        "MAP_OPTION_PATH_NARROW": "Narrow"}),
}


def art_for(group: str) -> str:
    return ART.get(group) or re.sub(r"[^a-z0-9]+", "-", group.lower()).strip("-")


def duel_maps():
    by_slug = {c["slug"]: c for c in CONFIGS}
    out = []
    for slug in POOL:
        c = by_slug[slug]
        opts = []
        for kv in c["opts"]:
            k, v = kv.split("=", 1)
            label, vals = OPT_LABEL[k]
            opts.append({"name": k, "value": v, "label": label, "valueLabel": vals[v]})
        script = c["script"]
        # Atlas naming: trait only where it varies within the pool (Arid
        # Plateau, Desert, DOTA); Archipelago/Donut have one variant each.
        if c["group"] == "Desert":
            title = f"{c['variant'].split(' · ')[0]} Coast Desert".replace("None Coast", "No Coast")
        elif c["group"] in ("Archipelago", "Donut"):
            title = c["group"]
        else:
            title = " ".join(p for p in (c["variant"], c["group"]) if p)
        out.append({
            "slug": slug,
            "group": c["group"],
            "variant": c["variant"],
            "title": title,
            "script": script,
            "mapClass": MAP_CLASS[script],
            "size": SIZE_ID[c["size"]],
            "sizeLabel": SIZE_LABEL[c["size"]],
            "aspect": ASPECT_ID[c["aspect"]],
            "aspectLabel": c["aspect"].capitalize(),
            "pointSymmetry": bool(c["sym"]),
            "mirror": True,
            "opts": opts,
            "art": f"img/maps/{art_for(c['group'])}.png",
            "atlas": f"https://alcaras.github.io/owtournamentatlas/#cfg-{slug}",
        })
    return out


def ffa_scripts():
    out = []
    for disp, _script in FFA_SCRIPTS:
        out.append({
            "name": disp,
            "mapClass": MAP_CLASS[disp],
            "art": f"img/maps/{art_for(disp)}.png",
            "atlas": f"https://alcaras.github.io/owffaatlas/#cfg-{re.sub(r'[^a-z0-9]+', '-', disp.lower())}-huge-square",
        })
    return out


def main():
    data = {
        "generated": "scripts/build_presets.py — do not hand-edit",
        "duel": duel_maps(),
        "ffa": {
            "scripts": ffa_scripts(),
            "sizes": [
                {"id": "MAPSIZE_SMALL", "label": "Small"},
                {"id": "MAPSIZE_MEDIUM", "label": "Medium"},
                {"id": "MAPSIZE_LARGE", "label": "Large"},
                {"id": "MAPSIZE_HUGE", "label": "Huge"},
            ],
            "aspects": [
                {"id": "MAPASPECTRATIO_SQUARE", "label": "Square"},
                {"id": "MAPASPECTRATIO_WIDE", "label": "Wide"},
            ],
            "defaultSize": "MAPSIZE_HUGE",
            "defaultAspect": "MAPASPECTRATIO_SQUARE",
            "defaultPlayers": 10,
            "minPlayers": 3,
            "maxPlayers": 10,
        },
    }
    js = "// GENERATED by scripts/build_presets.py — do not hand-edit.\n" \
         "export default " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n"
    (ROOT / "presets.js").write_text(js, encoding="utf-8")
    print(f"wrote presets.js: {len(data['duel'])} duel maps, {len(data['ffa']['scripts'])} FFA scripts")


if __name__ == "__main__":
    main()
