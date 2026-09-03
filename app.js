// Old World Tournament Settings — page controller.
// Everything happens in this tab: parse → apply preset → serialize → save.
// There is no server and the CSP forbids fetch/XHR, so the file never leaves
// the device.

import presets from './presets.js';
import { parse, serialize } from './xml.js';
import { applyPreset, describePreset } from './apply.js';

const $ = (id) => document.getElementById(id);
const FILE_NAME = 'GameOptionsSave.xml';

const state = {
  kind: 'duel',
  map: presets.duel[0],
  ffa: {
    script: presets.ffa.scripts[0],
    size: presets.ffa.defaultSize,
    aspect: presets.ffa.defaultAspect,
    players: presets.ffa.defaultPlayers,
  },
  sections: new Set(['network', 'cloud', 'hotseat']),
  os: detectOS(),
  // loaded file
  original: null,     // original text (string)
  fileName: FILE_NAME,
  dirHandle: null,    // FileSystemDirectoryHandle (folder flow)
  fileHandle: null,   // FileSystemFileHandle (folder flow)
  result: null,       // { text, changes }
};

const HAS_FSA = typeof window.showDirectoryPicker === 'function';

// ---------- OS / path ----------

function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'win';
  return /mac/i.test(navigator.userAgent) ? 'mac' : 'win';
}

const PATHS = {
  win: { text: '%USERPROFILE%\\Documents\\My Games\\OldWorld\\GameOptionsSave.xml',
    copy: '%USERPROFILE%\\Documents\\My Games\\OldWorld',
    hint: 'Paste the path into the address bar of the file dialog (or Explorer) and press Enter. Steam, Epic and GOG all write here.' },
  mac: { text: '~/Library/Application Support/OldWorld/GameOptionsSave.xml',
    copy: '~/Library/Application Support/OldWorld',
    hint: 'The Library folder is hidden in Finder: in the file dialog press ⌘⇧G, paste the path and press Enter.' },
};

function renderOS() {
  for (const b of $('os-toggle').querySelectorAll('button')) b.classList.toggle('is-on', b.dataset.os === state.os);
  $('path-text').textContent = PATHS[state.os].text;
  $('path-hint').textContent = PATHS[state.os].hint;
}

// ---------- preset UI ----------

function chip(text, gold = false) {
  const s = document.createElement('span');
  s.className = 'chip' + (gold ? ' chip--gold' : '');
  s.textContent = text;
  return s;
}

function mapCard({ title, art, chips, opts, atlas, selected, onPick }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'map' + (selected ? ' is-on' : '');
  const img = document.createElement('img');
  img.className = 'map__img'; img.src = art; img.alt = ''; img.loading = 'lazy';
  b.appendChild(img);
  const body = document.createElement('div'); body.className = 'map__body';
  const t = document.createElement('div'); t.className = 'map__title'; t.textContent = title;
  body.appendChild(t);
  const cs = document.createElement('div'); cs.className = 'map__chips';
  for (const c of chips) cs.appendChild(chip(c.text, c.gold));
  body.appendChild(cs);
  if (opts && opts.length) {
    const o = document.createElement('div'); o.className = 'map__opts';
    o.innerHTML = opts.map((x) => `<b>${x.label}</b> ${x.valueLabel}`).join(' · ');
    body.appendChild(o);
  }
  b.appendChild(body);
  const chk = document.createElement('span'); chk.className = 'map__check'; chk.textContent = '✓';
  b.appendChild(chk);
  if (atlas) {
    const a = document.createElement('a'); a.className = 'map__link'; a.href = atlas; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'atlas ↗'; a.addEventListener('click', (e) => e.stopPropagation());
    b.appendChild(a);
  }
  b.addEventListener('click', onPick);
  return b;
}

function renderDuel() {
  const host = $('duel-maps');
  host.replaceChildren();
  for (const m of presets.duel) {
    host.appendChild(mapCard({
      title: m.title, art: m.art, atlas: m.atlas, opts: m.opts,
      chips: [
        { text: m.sizeLabel, gold: m.sizeLabel !== 'Duel' },
        { text: m.aspectLabel },
        { text: m.pointSymmetry ? 'Point-sym on' : 'Point-sym off' },
      ],
      selected: state.map === m,
      onPick: () => { state.map = m; renderDuel(); refresh(); },
    }));
  }
}

function renderFFA() {
  const host = $('ffa-maps');
  host.replaceChildren();
  for (const s of presets.ffa.scripts) {
    host.appendChild(mapCard({
      title: s.name, art: s.art, atlas: s.atlas, chips: [],
      selected: state.ffa.script === s,
      onPick: () => { state.ffa.script = s; renderFFA(); refresh(); },
    }));
  }
}

function initFFAControls() {
  const sz = $('ffa-size'), asp = $('ffa-aspect'), pl = $('ffa-players');
  for (const s of presets.ffa.sizes) sz.add(new Option(s.label, s.id, false, s.id === state.ffa.size));
  for (const a of presets.ffa.aspects) asp.add(new Option(a.label, a.id, false, a.id === state.ffa.aspect));
  pl.min = presets.ffa.minPlayers; pl.max = presets.ffa.maxPlayers; pl.value = state.ffa.players;
  sz.addEventListener('change', () => { state.ffa.size = sz.value; refresh(); });
  asp.addEventListener('change', () => { state.ffa.aspect = asp.value; refresh(); });
  pl.addEventListener('input', () => { state.ffa.players = Number(pl.value); $('ffa-players-val').textContent = pl.value; refresh(); });
}

function currentPreset() {
  if (state.kind === 'duel') return { kind: 'duel', map: state.map };
  const f = state.ffa;
  return { kind: 'ffa', mapClass: f.script.mapClass, scriptName: f.script.name, size: f.size, aspect: f.aspect, players: f.players };
}

function presetHint() {
  if (state.kind === 'duel') {
    const m = state.map;
    return `${m.title} · ${m.sizeLabel} · ${m.aspectLabel}`;
  }
  const f = state.ffa;
  const size = presets.ffa.sizes.find((s) => s.id === f.size)?.label;
  const asp = presets.ffa.aspects.find((a) => a.id === f.aspect)?.label;
  return `${f.script.name} · ${size} · ${asp} · ${f.players} players`;
}

// ---------- summary + diff ----------

function renderSummary() {
  const { rows, per } = describePreset(currentPreset(), [...state.sections]);
  const t = $('summary');
  t.replaceChildren();
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.textContent = v;
    tr.append(a, b); t.appendChild(tr);
  }
  const ul = $('summary-per');
  ul.replaceChildren();
  for (const p of per) { const li = document.createElement('li'); li.textContent = p; ul.appendChild(li); }
}

function renderDiff() {
  const box = $('diff');
  if (!state.result) { box.hidden = true; return; }
  box.hidden = false;
  const body = $('diff-body');
  body.replaceChildren();
  const { changes } = state.result;
  $('diff-count').textContent = changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : 'already set';
  if (!changes.length) {
    const d = document.createElement('div'); d.className = 'diff__none';
    d.textContent = 'Your file already has these settings in the selected lobbies — nothing to write.';
    body.appendChild(d);
  }
  const bySec = new Map();
  for (const c of changes) (bySec.get(c.section) ?? bySec.set(c.section, []).get(c.section)).push(c);
  for (const [sec, list] of bySec) {
    const h = document.createElement('div'); h.className = 'diff__sec'; h.textContent = sec; body.appendChild(h);
    const table = document.createElement('table');
    for (const c of list) {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = c.setting;
      const b = document.createElement('td');
      const from = document.createElement('span'); from.className = 'from'; from.textContent = c.from;
      const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '→';
      const to = document.createElement('span'); to.className = 'to'; to.textContent = c.to;
      b.append(from, ar, to);
      tr.append(a, b); table.appendChild(tr);
    }
    body.appendChild(table);
  }
  const has = changes.length > 0;
  $('save-dir').hidden = !(state.dirHandle && has);
  $('save-dl').hidden = !( !state.dirHandle && has);
  $('dl-backup').hidden = !!state.dirHandle;
  $('done').hidden = true;
}

function status(kind, html) {
  const s = $('file-status');
  s.hidden = false;
  s.className = `status status--${kind}`;
  s.innerHTML = html;
}

/** Recompute the result from the loaded file + current choices. */
function refresh() {
  $('preset-hint').textContent = presetHint();
  renderSummary();
  if (!state.original) { state.result = null; renderDiff(); return; }
  if (!state.sections.size) {
    state.result = null; renderDiff();
    status('bad', '<b>Pick at least one lobby</b> in step 2.');
    return;
  }
  try {
    const doc = parse(state.original);
    const { changes } = applyPreset(doc, currentPreset(), [...state.sections]);
    state.result = { text: serialize(doc), changes };
    status('ok', `<b>Loaded</b> ${escapeHtml(state.fileName)} — ${(state.original.length / 1024).toFixed(0)} KB, ${state.original.includes('\r\n') ? 'Windows' : 'Mac'} line endings. Review the preview below.`);
    renderDiff();
  } catch (e) {
    state.result = null; renderDiff();
    status('bad', `<b>Couldn't use this file.</b> ${escapeHtml(e.message)}`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- file flows ----------

async function pickDirectory() {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'oldworld', mode: 'readwrite', startIn: 'documents' });
  } catch (e) {
    if (e.name !== 'AbortError') status('bad', `<b>Couldn't open the folder.</b> ${escapeHtml(e.message)}`);
    return;
  }
  let fh;
  try {
    fh = await dir.getFileHandle(FILE_NAME);
  } catch {
    status('bad', `<b>No ${FILE_NAME} in “${escapeHtml(dir.name)}”.</b> Choose the <code>OldWorld</code> folder itself (the one that also holds <code>Saves</code>, <code>Logs</code> and <code>Mods</code>). If it isn't there, Old World hasn't written its settings yet — launch the game once and quit.`);
    return;
  }
  const file = await fh.getFile();
  state.original = await file.text();
  state.fileName = file.name;
  state.dirHandle = dir;
  state.fileHandle = fh;
  refresh();
  $('diff').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function pickFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  state.original = await file.text();
  state.fileName = file.name;
  state.dirHandle = null; state.fileHandle = null;
  input.value = '';
  refresh();
  $('diff').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function writeHandle(handle, text) {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

async function saveToFolder() {
  if (!state.result || !state.dirHandle) return;
  const btn = $('save-dir');
  btn.disabled = true;
  try {
    const backupName = `GameOptionsSave.backup-${stamp()}.xml`;
    const bh = await state.dirHandle.getFileHandle(backupName, { create: true });
    await writeHandle(bh, state.original);
    await writeHandle(state.fileHandle, state.result.text);
    // read back to be sure
    const check = await (await state.fileHandle.getFile()).text();
    if (check !== state.result.text) throw new Error('The file on disk does not match what was written.');
    finish(`Saved <b>${escapeHtml(state.fileName)}</b> and kept a backup as <b>${escapeHtml(backupName)}</b> in the same folder. Launch Old World, open the lobby you updated, and the tournament settings will already be selected.`);
  } catch (e) {
    status('bad', `<b>Save failed.</b> ${escapeHtml(e.message)} Your original file was not changed unless the message says otherwise — use “Download updated file” as a fallback.`);
    $('save-dl').hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadResult() {
  if (!state.result) return;
  download(FILE_NAME, state.result.text);
  finish(`Downloaded <b>${FILE_NAME}</b>. Quit Old World if it's running, then move the downloaded file into <code>${escapeHtml(PATHS[state.os].copy)}</code>, replacing the one there (keep your backup copy). Launch the game and the updated lobby will have the tournament settings selected.`);
}

function downloadBackup() {
  if (!state.original) return;
  download(`GameOptionsSave.backup-${stamp()}.xml`, state.original);
}

function finish(html) {
  $('done').hidden = false;
  $('done-text').innerHTML = html;
  $('done').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function startOver() {
  state.original = null; state.result = null; state.dirHandle = null; state.fileHandle = null;
  $('file-status').hidden = true;
  $('done').hidden = true;
  renderDiff();
  $('step-file').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- wiring ----------

function init() {
  renderOS();
  $('os-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-os]');
    if (!b) return;
    state.os = b.dataset.os; renderOS();
  });
  $('copy-path').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PATHS[state.os].copy);
      $('copy-path').textContent = 'Copied';
      setTimeout(() => { $('copy-path').textContent = 'Copy'; }, 1500);
    } catch { /* clipboard blocked: the path is visible to select anyway */ }
  });

  for (const b of document.querySelectorAll('.seg__btn')) {
    b.addEventListener('click', () => {
      state.kind = b.dataset.kind;
      for (const x of document.querySelectorAll('.seg__btn')) x.classList.toggle('is-on', x === b);
      $('duel-pane').hidden = state.kind !== 'duel';
      $('ffa-pane').hidden = state.kind !== 'ffa';
      refresh();
    });
  }
  renderDuel();
  renderFFA();
  initFFAControls();

  for (const cb of document.querySelectorAll('input[data-section]')) {
    cb.addEventListener('change', () => {
      if (cb.checked) state.sections.add(cb.dataset.section); else state.sections.delete(cb.dataset.section);
      refresh();
    });
  }

  $('flow-fsa').hidden = !HAS_FSA;
  $('flow-file').hidden = HAS_FSA;
  $('pick-dir').addEventListener('click', pickDirectory);
  $('pick-file').addEventListener('change', (e) => pickFile(e.target));
  $('save-dir').addEventListener('click', saveToFolder);
  $('save-dl').addEventListener('click', downloadResult);
  $('dl-backup').addEventListener('click', downloadBackup);
  $('start-over').addEventListener('click', startOver);

  refresh();
}

init();
