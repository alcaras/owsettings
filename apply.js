// Apply a tournament preset to a parsed GameOptionsSave.xml document.
//
// Policy ("respect everything else in their file"): each section we touch
// has a MANAGED set of keys / list entries defined below. Anything outside
// that set passes through untouched — options the player has toggled for
// themselves, resource density, stale ids from old patches, and of course
// the whole <PlayerOptions> block (name, email, achievements…).
//
// Sources: the organiser's own Cloud/Network sections (2026-09-02) cross-
// checked against Tournament 3 Rules and the game's Reference XML.

import * as X from './xml.js';
import { GAME_OPTION, VICTORY, SETTING, SECTION_LABEL, prettyId } from './labels.js';

export const SECTIONS = {
  hotseat: 'GameOptionsHotseat',
  network: 'GameOptionsNetwork',
  cloud: 'GameOptionsCloud',
};

// Shared tournament core — every chosen lobby gets these.
const CORE_SCALARS = {
  defaultTribeLevel: 'TRIBELEVEL_NORMAL',
  defaultAdvantage: 'ADVANTAGE_NONE',
  defaultTeamNation: 'TEAMNATION_GAME_UNIQUE',
  defaultDevelopment: 'DEVELOPMENT_FLEDGLING',
  defaultHumanDevelopment: 'DEVELOPMENT_NONE',
  defaultForceMarch: 'FORCEMARCH_DOUBLE_FATIGUE',
  defaultEventLevel: 'EVENTLEVEL_MODERATE',
  defaultVictoryPoint: 'VICTORYPOINT_MEDIUM_HIGH', // shows as "High" in-game
  defaultMapFile: '',
};

// Live network games run Tight + Slow timer; cloud/hotseat are strict, untimed.
const MODE_SCALARS = {
  GameOptionsNetwork: { defaultTurnStyle: 'TURNSTYLE_TIGHT', defaultTurnTimer: 'TURNTIMER_SLOW' },
  GameOptionsHotseat: { defaultTurnStyle: 'TURNSTYLE_STRICT', defaultTurnTimer: 'TURNTIMER_NONE' },
  GameOptionsCloud: { defaultTurnStyle: 'TURNSTYLE_STRICT', defaultTurnTimer: 'TURNTIMER_NONE' },
};

const CORE_OPTIONS_ON = [
  'GAMEOPTION_COMPETITIVE_MODE',
  'GAMEOPTION_COMPETITIVE_EVENTS',
  'GAMEOPTION_LOWER_CHARACTER_YIELDS',
  'GAMEOPTION_COMPETITIVE_CITY_GIFTING',
  'GAMEOPTION_NO_DISTANT_RAIDS',
  'GAMEOPTION_FREE_LAW_PREREQS',
  'GAMEOPTION_PLAY_TO_WIN',
  'GAMEOPTION_NO_ORGANIZED_TRIBES',
];
const CORE_OPTIONS_OFF = [
  'GAMEOPTION_NO_UNDO',           // undo allowed (network can't undo anyway; cloud conversions keep it)
  'GAMEOPTION_NO_STARTING_TECHS', // Starting Techs: On
  'GAMEOPTION_NO_EVENTS',
  'GAMEOPTION_NO_CHARACTERS',
  'GAMEOPTION_REVEALED_MAP',
  'GAMEOPTION_NO_FOG_OF_WAR',
  'GAMEOPTION_ONE_CITY_CHALLENGE',
  'GAMEOPTION_RANDOMIZE_TECHS',
  'GAMEOPTION_RANDOMIZE_IMPROVEMENTS',
  'GAMEOPTION_BARBARIANS_ONLY',
  'GAMEOPTION_TRIBES_ONLY',
];
// Network: no crit preview, observers on. Cloud/hotseat: crit preview on.
const MODE_OPTIONS = {
  GameOptionsNetwork: { on: ['GAMEOPTION_ALLOW_OBSERVE'], off: ['GAMEOPTION_CRITICAL_HIT_PREVIEW'] },
  GameOptionsHotseat: { on: ['GAMEOPTION_CRITICAL_HIT_PREVIEW'], off: [] },
  GameOptionsCloud: { on: ['GAMEOPTION_CRITICAL_HIT_PREVIEW'], off: [] },
};

const VICTORIES_ON = ['VICTORY_POINTS', 'VICTORY_TIME'];
const VICTORIES_OFF = ['VICTORY_DOUBLE', 'VICTORY_AMBITION'];

const CALAMITIES = 'OCCURRENCELEVEL_CALAMITIES_VERY_LOW'; // "Very Rare" — as in the organiser's file

// Per-player slots we normalise for seats 0..N-1. Difficulty is left as the
// player had it (padded with Magnificent when new seats are needed).
const SEAT = {
  defaultPlayerNation: ['string', () => 'NONE'],
  defaultPlayerTeam: ['int', (i) => String(i)],
  defaultPlayerDevelopment: ['string', () => 'DEVELOPMENT_DEFAULT'],
  defaultPlayerDynasty: ['string', () => 'DYNASTY_DEFAULT'],
  defaultPlayerArchetype: ['string', () => 'TRAIT_PICK_LATER_ARCHETYPE'],
  defaultPlayerAIControlled: ['boolean', () => 'false'],
};
const SEAT_PAD = { defaultPlayerDifficulty: ['string', 'DIFFICULTY_MAGNIFICENT'] };

/**
 * preset = { kind: 'duel', map }                       (map = entry of presets.duel)
 *        | { kind: 'ffa', mapClass, size, aspect, players }
 * sectionKeys = subset of Object.keys(SECTIONS)
 * Mutates doc; returns { changes, sectionsTouched }.
 */
export function applyPreset(doc, preset, sectionKeys) {
  const root = doc.root;
  if (root.name !== 'AllGameOptionsSave') {
    throw new Error(`This doesn't look like GameOptionsSave.xml (root element is <${root.name}>).`);
  }
  const changes = [];
  for (const key of sectionKeys) {
    const name = SECTIONS[key];
    if (!name) throw new Error(`Unknown section "${key}"`);
    const sec = X.child(root, name);
    if (!sec) throw new Error(`The file has no <${name}> section — has the game written it yet?`);
    applyToSection(sec, name, preset, changes);
  }
  // Mods off for multiplayer. This is the one PlayerOptions key we touch;
  // the player's single-player mod list (modSelections) is left alone.
  const po = X.child(root, 'PlayerOptions');
  if (po) {
    const old = X.getText(po, 'useModsInMultiPlayer');
    if (old !== 'false') {
      X.setText(po, 'useModsInMultiPlayer', 'false');
      changes.push({ section: 'Player options', setting: 'Use mods in multiplayer', from: old === 'true' ? 'On' : prettyId(old), to: 'Off' });
    }
  }
  return { changes };
}

function applyToSection(sec, name, preset, changes) {
  const label = SECTION_LABEL[name] || name;
  const note = (setting, from, to) => {
    if (from !== to) changes.push({ section: label, setting, from, to });
  };

  const isFFA = preset.kind === 'ffa';
  const players = isFFA ? preset.players : 2;

  // --- scalars ---
  const scalars = {
    defaultPlayers: String(players),
    defaultTeams: String(players),
    ...CORE_SCALARS,
    ...MODE_SCALARS[name],
    defaultMapClass: isFFA ? preset.mapClass : preset.map.mapClass,
    defaultMapSize: isFFA ? preset.size : preset.map.size,
    defaultMapAspectRatio: isFFA ? preset.aspect : preset.map.aspect,
  };
  for (const [k, v] of Object.entries(scalars)) {
    const old = X.getText(sec, k);
    X.setText(sec, k, v);
    note(SETTING[k] || k, prettyId(old), prettyId(v));
  }

  // --- game options (managed on/off, rest pass through) ---
  const on = [...CORE_OPTIONS_ON, ...MODE_OPTIONS[name].on, ...(isFFA ? [] : ['GAMEOPTION_NO_BONUS_IMPROVEMENTS'])];
  const off = [...CORE_OPTIONS_OFF, ...MODE_OPTIONS[name].off, ...(isFFA ? ['GAMEOPTION_NO_BONUS_IMPROVEMENTS'] : [])];
  toggleList(sec, 'defaultGameOptions', on, off, (id, was, now) =>
    note(GAME_OPTION[id] || prettyId(id), was ? 'On' : 'Off', now ? 'On' : 'Off'));

  // --- victories ---
  const vOff = isFFA ? VICTORIES_OFF : [...VICTORIES_OFF, 'VICTORY_ALLIANCE'];
  toggleList(sec, 'defaultVictories', VICTORIES_ON, vOff, (id, was, now) =>
    note(`${VICTORY[id] || prettyId(id)} Victory`, was ? 'On' : 'Off', now ? 'On' : 'Off'));

  // --- DLC: everything enabled (defaultDisabledContent emptied) ---
  const disabled = X.listItems(sec, 'defaultDisabledContent', 'string');
  if (disabled.length) {
    X.setListItems(sec, 'defaultDisabledContent', 'string', []);
    note('DLC', `${disabled.length} disabled`, 'All enabled');
  }

  // --- calamities ---
  setTuple(sec, 'defaultOccurrenceLevels', 'OCCURRENCECLASS_CALAMITIES', CALAMITIES, (old) =>
    note('Calamities', prettyId(old), prettyId(CALAMITIES)));

  // --- map options: mirror / point symmetry ---
  const mirror = isFFA ? 'False' : (preset.map.mirror ? 'True' : 'False');
  const sym = isFFA ? 'False' : (preset.map.pointSymmetry ? 'True' : 'False');
  setMapOption(sec, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_MIRROR', mirror, (old) =>
    note('Mirror Map', prettyId(old), prettyId(mirror)));
  setMapOption(sec, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_POINT_SYMMETRY', sym, (old) =>
    note('Point Symmetry', prettyId(old), prettyId(sym)));

  // --- script-specific map options (duel pool only) ---
  if (!isFFA) {
    for (const o of preset.map.opts) {
      setMapOption(sec, 'defaultMapMultiOptions', o.name, o.value, (old) =>
        note(`${o.label} (${preset.map.script})`, prettyId(old), o.valueLabel));
    }
  }

  // --- seats ---
  applySeats(sec, players, note);
}

/** Ensure `on` ids are present and `off` ids absent in <list><string>… */
function toggleList(sec, listName, on, off, cb) {
  const items = X.listItems(sec, listName, 'string');
  const set = new Set(items);
  const out = items.filter((id) => !off.includes(id));
  for (const id of off) if (set.has(id)) cb(id, true, false);
  for (const id of on) {
    if (!set.has(id)) { out.push(id); cb(id, false, true); }
  }
  X.setListItems(sec, listName, 'string', out);
}

function setTuple(sec, listName, item1, item2, cb) {
  const list = X.ensureChild(sec, listName);
  list.text = null;
  let hit = X.children(list, 'ValueTupleOfStringString').find((t) => X.getText(t, 'Item1') === item1);
  if (!hit) {
    hit = X.el('ValueTupleOfStringString', null, [X.el('Item1', item1), X.el('Item2', item2)]);
    list.children.push(hit);
    cb(null);
    return;
  }
  const old = X.getText(hit, 'Item2');
  X.setText(hit, 'Item2', item2);
  cb(old);
}

function setMapOption(sec, listName, optName, value, cb) {
  const list = X.ensureChild(sec, listName);
  list.text = null;
  let hit = X.children(list, 'MapOption').find((m) => X.getText(m, 'name') === optName);
  if (!hit) {
    hit = X.el('MapOption', null, [X.el('name', optName), X.el('value', value)]);
    list.children.push(hit);
    cb(null);
    return;
  }
  const old = X.getText(hit, 'value');
  X.setText(hit, 'value', value);
  cb(old);
}

function applySeats(sec, n, note) {
  const summary = [];
  for (const [key, [itemName, valueFor]] of Object.entries(SEAT)) {
    const items = X.listItems(sec, key, itemName);
    let changed = false;
    for (let i = 0; i < n; i++) {
      const want = valueFor(i);
      if (items[i] !== want) { changed = true; items[i] = want; }
    }
    if (changed) {
      X.setListItems(sec, key, itemName, items);
      summary.push(key.replace('defaultPlayer', ''));
    }
  }
  for (const [key, [itemName, pad]] of Object.entries(SEAT_PAD)) {
    const items = X.listItems(sec, key, itemName);
    if (items.length < n) {
      while (items.length < n) items.push(pad);
      X.setListItems(sec, key, itemName, items);
      summary.push(key.replace('defaultPlayer', ''));
    }
  }
  if (summary.length) {
    note(`Seats 1–${n}`, 'as saved', `Nation: Pick Later · Leader: Default · Archetype: Pick Later · one team each · human`);
  }
}

/** Plain-English summary of what a preset sets, for the UI. */
export function describePreset(preset, sectionKeys) {
  const isFFA = preset.kind === 'ffa';
  const rows = [];
  if (isFFA) {
    rows.push(['Map Script', prettyId(preset.mapClass)], ['Map Size', prettyId(preset.size)],
      ['Map Aspect Ratio', prettyId(preset.aspect)], ['Players / Teams', `${preset.players} / ${preset.players}`],
      ['Mirror Map · Point Symmetry', 'Off · Off'], ['Ancient Ruins', 'On']);
  } else {
    const m = preset.map;
    rows.push(['Map Script', m.script], ['Map Size', m.sizeLabel], ['Map Aspect Ratio', m.aspectLabel],
      ['Players / Teams', '2 / 2'],
      ['Mirror Map · Point Symmetry', `On · ${m.pointSymmetry ? 'On' : 'Off'}`]);
    for (const o of m.opts) rows.push([o.label, o.valueLabel]);
    rows.push(['Ancient Ruins', 'Off']);
  }
  rows.push(['Nation · Leader · Archetype', 'Pick Later · Default · Pick Later'],
    ['Victories', isFFA ? 'Points, Time (Double & Ambition off)' : 'Points, Time (Double, Ambition & Alliance off)'],
    ['Points to Win', 'High'], ['Tribal Strength', 'Normal'], ['Forced March', 'Double Fatigue'],
    ['Nations', 'Unique'], ['Prosperity', 'Fledgling'], ['Events', 'Moderate'], ['Calamities', 'Very Rare'],
    ['Competitive Mode', 'On (+ events, city gifting, lower character yields, no distant raids, free law prereqs)'],
    ['Ruthless AI · No Organized Tribes', 'On · On'], ['Starting Techs', 'On'], ['Undo', 'Allowed'],
    ['DLC', 'All enabled'], ['Mods in multiplayer', 'Off']);
  const per = [];
  if (sectionKeys.includes('network')) per.push('Network: crits hidden, Tight turns, Slow timer, observers on');
  if (sectionKeys.includes('cloud')) per.push('Cloud: crits shown, Strict turns, no timer');
  if (sectionKeys.includes('hotseat')) per.push('Hotseat: crits shown, Strict turns, no timer');
  return { rows, per };
}
