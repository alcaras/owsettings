import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, serialize, child, listItems, getText, children, setText, setListItems } from '../xml.js';
import { applyPreset, SECTIONS } from '../apply.js';
import presets from '../presets.js';

const FIX = new URL('./fixtures/', import.meta.url);
const read = (name) => readFileSync(new URL(name, FIX), 'utf8');

const sec = (doc, key) => child(doc.root, SECTIONS[key]);
const opts = (s) => listItems(s, 'defaultGameOptions', 'string');
const mapOpt = (s, list, name) => {
  const m = children(child(s, list), 'MapOption').find((x) => getText(x, 'name') === name);
  return m ? getText(m, 'value') : null;
};
const byTitle = (t) => presets.duel.find((m) => m.title === t && m.aspectLabel === 'Square');

test('duel preset: per-mode crits/undo/ruins and map settings', () => {
  const doc = parse(read('win.xml'));
  const map = byTitle('Jungle DOTA');
  applyPreset(doc, { kind: 'duel', map }, ['hotseat', 'network', 'cloud']);

  for (const key of ['hotseat', 'network', 'cloud']) {
    const s = sec(doc, key);
    const o = opts(s);
    assert.ok(!o.includes('GAMEOPTION_NO_UNDO'), `${key}: undo allowed`);
    assert.ok(o.includes('GAMEOPTION_NO_BONUS_IMPROVEMENTS'), `${key}: no ancient ruins`);
    assert.ok(o.includes('GAMEOPTION_COMPETITIVE_MODE'), `${key}: competitive`);
    assert.ok(!o.includes('GAMEOPTION_NO_STARTING_TECHS'), `${key}: starting techs on`);
    for (const id of ['GAMEOPTION_CUSTOM_LEADER', 'GAMEOPTION_ALLOW_BAD_COGNOMENS', 'GAMEOPTION_ROLE_PLAYING',
      'GAMEOPTION_NO_TEAM_MOVEMENT', 'GAMEOPTION_NO_UNIT_GIFTING', 'GAMEOPTION_NO_CITY_GIFTING', 'GAMEOPTION_LOCKED_SAVE',
      'GAMEOPTION_RANDOMIZE_FAMILIES', 'GAMEOPTION_ALLOW_CITY_RAZING', 'GAMEOPTION_MP_JOIN_AS_ANY_PLAYER']) {
      assert.ok(!o.includes(id), `${key}: ${id} off`);
    }
    assert.equal(getText(s, 'defaultSuccessionGender'), 'SUCCESSIONGENDER_ABSOLUTE_COGNATIC');
    assert.equal(getText(s, 'defaultMortality'), 'MORTALITY_STANDARD');
    assert.equal(getText(s, 'defaultTurnScale'), 'TURNSCALE_YEAR');
    assert.equal(mapOpt(s, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_GOOD_PLAYER_START_RESOURCES'), 'False');
    assert.equal(mapOpt(s, 'defaultMapMultiOptions', 'MAP_OPTIONS_MULTI_RESOURCE_DENSITY'), 'MAP_OPTION_MEDIUM_RESOURCES');
    assert.equal(mapOpt(s, 'defaultMapMultiOptions', 'MAP_OPTIONS_CITY_SITE_DENSITY'), 'MAP_OPTION_CITY_SITE_DENSITY_HIGH');
    assert.equal(mapOpt(s, 'defaultMapMultiOptions', 'MAP_OPTIONS_CITY_SITE_NUMBER'), 'MAP_OPTION_CITY_SITE_NUMBER_HIGH');
    assert.equal(getText(s, 'defaultMapClass'), 'MAPCLASS_MapScriptDota');
    assert.equal(getText(s, 'defaultMapSize'), 'MAPSIZE_SMALLEST');
    assert.equal(getText(s, 'defaultMapAspectRatio'), 'MAPASPECTRATIO_SQUARE');
    assert.equal(getText(s, 'defaultPlayers'), '2');
    assert.equal(getText(s, 'defaultTeams'), '2');
    assert.equal(getText(s, 'defaultVictoryPoint'), 'VICTORYPOINT_MEDIUM_HIGH');
    assert.equal(mapOpt(s, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_MIRROR'), 'True');
    assert.equal(mapOpt(s, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_POINT_SYMMETRY'), 'True');
    assert.equal(mapOpt(s, 'defaultMapMultiOptions', 'MAP_OPTIONS_MULTI_DOTA_INNER_TERRAIN'), 'MAP_OPTION_TERRAIN_INNER_JUNGLE');
    assert.equal(mapOpt(s, 'defaultMapMultiOptions', 'MAP_OPTIONS_MULTI_DOTA_PATH_WIDTH'), 'MAP_OPTION_PATH_NARROW');
    const v = listItems(s, 'defaultVictories', 'string');
    assert.ok(v.includes('VICTORY_POINTS') && v.includes('VICTORY_TIME'));
    assert.ok(!v.includes('VICTORY_DOUBLE') && !v.includes('VICTORY_AMBITION'));
    assert.ok(v.includes('VICTORY_CONQUEST'), 'conquest on');
    assert.deepEqual(listItems(s, 'defaultPlayerNation', 'string').slice(0, 2), ['NONE', 'NONE']);
    assert.deepEqual(listItems(s, 'defaultPlayerTeam', 'int').slice(0, 2), ['0', '1']);
    assert.deepEqual(listItems(s, 'defaultPlayerAIControlled', 'boolean').slice(0, 2), ['false', 'false']);
  }
  assert.ok(!opts(sec(doc, 'network')).includes('GAMEOPTION_CRITICAL_HIT_PREVIEW'), 'network hides crits');
  assert.ok(opts(sec(doc, 'network')).includes('GAMEOPTION_ALLOW_OBSERVE'), 'network observers');
  assert.equal(getText(sec(doc, 'network'), 'defaultTurnStyle'), 'TURNSTYLE_TIGHT');
  assert.equal(getText(sec(doc, 'network'), 'defaultTurnTimer'), 'TURNTIMER_SLOW');
  assert.equal(getText(sec(doc, 'network'), 'defaultSimultaneousTurns'), '5');
  assert.equal(getText(sec(doc, 'cloud'), 'defaultSimultaneousTurns'), '0');
  assert.ok(opts(sec(doc, 'cloud')).includes('GAMEOPTION_CRITICAL_HIT_PREVIEW'), 'cloud shows crits');
  assert.ok(opts(sec(doc, 'hotseat')).includes('GAMEOPTION_CRITICAL_HIT_PREVIEW'), 'hotseat shows crits');
  assert.equal(getText(sec(doc, 'cloud'), 'defaultTurnStyle'), 'TURNSTYLE_STRICT');
});

test('unmanaged settings pass through; untouched sections are byte-identical', () => {
  const src = read('win.xml');
  const before = parse(src);
  const doc = parse(src);
  applyPreset(doc, { kind: 'duel', map: byTitle('Inland Sea') }, ['cloud']);

  // untouched hotseat keeps its custom-leader toggle; cloud keeps stale ids and other
  // options the ruleset doesn't name, but loses the gifting bans (lobby default: off)
  assert.ok(opts(sec(doc, 'hotseat')).includes('GAMEOPTION_CUSTOM_LEADER'));
  assert.ok(opts(sec(doc, 'cloud')).includes('GAMEOPTION_NO_GRAND_VIZIERS'));
  assert.ok(!opts(sec(doc, 'cloud')).includes('GAMEOPTION_NO_UNIT_GIFTING'));
  assert.ok(!opts(sec(doc, 'cloud')).includes('GAMEOPTION_NO_CITY_GIFTING'));
  assert.equal(mapOpt(sec(doc, 'cloud'), 'defaultMapMultiOptions', 'MAP_OPTIONS_MULTI_DOTA_PATH_WIDTH'), 'MAP_OPTION_PATH_NARROW');
  assert.equal(getText(sec(doc, 'cloud'), 'defaultOpponentLevel'), getText(sec(before, 'cloud'), 'defaultOpponentLevel'));

  // every section other than cloud, plus PlayerOptions, serialises identically
  for (const name of ['PlayerOptions', 'GameOptionsSinglePlayerSimple', 'GameOptionsSinglePlayer',
    'GameOptionsNetwork', 'GameOptionsHotseat', 'GameOptionsServer']) {
    const a = serialize({ ...before, root: child(before.root, name) });
    const b = serialize({ ...doc, root: child(doc.root, name) });
    assert.equal(a, b, `${name} untouched`);
  }
  // output keeps BOM + CRLF
  const out = serialize(doc);
  assert.equal(out.charCodeAt(0), 0xfeff);
  assert.ok(out.includes('\r\n') && !/[^\r]\n/.test(out.slice(1)));
});

test('applying the same preset twice is a no-op the second time', () => {
  const doc = parse(read('mac.xml'));
  const p = { kind: 'duel', map: byTitle('Lush Coast Desert') };
  applyPreset(doc, p, ['hotseat', 'network', 'cloud']);
  const once = serialize(doc);
  const { changes } = applyPreset(doc, p, ['hotseat', 'network', 'cloud']);
  assert.deepEqual(changes, []);
  assert.equal(serialize(doc), once);
});

test('FFA preset: ruins on, N seats, no symmetry', () => {
  const doc = parse(read('win.xml'));
  const s0 = sec(doc, 'network');
  const seatsBefore = listItems(s0, 'defaultPlayerNation', 'string').length; // 3 in the fixture
  assert.ok(seatsBefore < 10);
  applyPreset(doc, { kind: 'ffa', mapClass: 'MAPCLASS_MapScriptContinent', size: 'MAPSIZE_HUGE',
    aspect: 'MAPASPECTRATIO_WIDE', players: 10 }, ['network', 'cloud']);
  for (const key of ['network', 'cloud']) {
    const s = sec(doc, key);
    assert.ok(!opts(s).includes('GAMEOPTION_NO_BONUS_IMPROVEMENTS'), `${key}: ruins on`);
    assert.ok(opts(s).includes('GAMEOPTION_COMPETITIVE_MODE'));
    assert.equal(getText(s, 'defaultPlayers'), '10');
    assert.equal(getText(s, 'defaultTeams'), '10');
    assert.equal(getText(s, 'defaultMapSize'), 'MAPSIZE_HUGE');
    assert.equal(mapOpt(s, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_MIRROR'), 'False');
    assert.equal(mapOpt(s, 'defaultMapOptions', 'MAP_OPTIONS_SINGLE_POINT_SYMMETRY'), 'False');
    for (const [k, item] of [['defaultPlayerNation', 'string'], ['defaultPlayerTeam', 'int'],
      ['defaultPlayerDifficulty', 'string'], ['defaultPlayerDevelopment', 'string'],
      ['defaultPlayerDynasty', 'string'], ['defaultPlayerArchetype', 'string'],
      ['defaultPlayerAIControlled', 'boolean']]) {
      assert.ok(listItems(s, k, item).length >= 10, `${key}.${k} has 10 seats`);
    }
    assert.deepEqual(listItems(s, 'defaultPlayerTeam', 'int').slice(0, 10), [...Array(10).keys()].map(String));
    assert.ok(listItems(s, 'defaultPlayerAIControlled', 'boolean').slice(0, 10).every((v) => v === 'false'));
  }
  // untouched hotseat keeps its seat count
  assert.equal(listItems(sec(doc, 'hotseat'), 'defaultPlayerNation', 'string').length, 10);
});

test('DLC all on and mods off in multiplayer; modSelections untouched', () => {
  const doc = parse(read('win.xml'));
  const po = child(doc.root, 'PlayerOptions');
  setText(po, 'useModsInMultiPlayer', 'true');
  setListItems(po, 'modSelections', 'string', ['MOD_X']);
  setListItems(sec(doc, 'network'), 'defaultDisabledContent', 'string', ['CONTENT_WD']);
  const { changes } = applyPreset(doc, { kind: 'duel', map: byTitle('Wetlands') }, ['network']);
  assert.equal(getText(po, 'useModsInMultiPlayer'), 'false');
  assert.deepEqual(listItems(po, 'modSelections', 'string'), ['MOD_X']);
  assert.deepEqual(listItems(sec(doc, 'network'), 'defaultDisabledContent', 'string'), []);
  assert.ok(changes.some((c) => c.setting === 'DLC'));
  assert.ok(changes.some((c) => c.setting === 'Use mods in multiplayer'));
});

test('refuses a file that is not GameOptionsSave.xml', () => {
  const doc = parse('<?xml version="1.0"?>\n<Other>\n  <x>1</x>\n</Other>');
  assert.throws(() => applyPreset(doc, { kind: 'duel', map: presets.duel[0] }, ['cloud']), /GameOptionsSave/);
});

test('every duel preset applies cleanly to both fixtures', () => {
  for (const fx of ['win.xml', 'mac.xml']) {
    for (const map of presets.duel) {
      const doc = parse(read(fx));
      applyPreset(doc, { kind: 'duel', map }, ['hotseat', 'network', 'cloud']);
      assert.doesNotThrow(() => parse(serialize(doc)));
    }
  }
});
