// Minimal XML model for Old World's GameOptionsSave.xml.
//
// The file is written by .NET's XmlSerializer: a BOM, one declaration line,
// 2-space indentation, ` />` self-closing tags, CRLF on Windows / LF on Mac,
// no trailing newline, no comments, no mixed content. We parse into a tiny
// tree and serialize back in exactly that shape, so an untouched document
// round-trips byte-for-byte (see test/xml.test.mjs) and an edited one only
// differs where we changed a value. Works in the browser and in Node.

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

export function unescapeText(s) {
  return s.replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENT[m])
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
export function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

/** Element node. `text` is null when the element has children or is empty. */
export function el(name, text = null, children = []) {
  return { name, attrs: [], children, text };
}

export class XmlError extends Error {}

/**
 * Parse an XML string (BOM optional) into { bom, decl, eol, root }.
 * Whitespace-only text between tags is formatting and is dropped.
 */
export function parse(input) {
  let s = input;
  const bom = s.charCodeAt(0) === 0xfeff;
  if (bom) s = s.slice(1);
  const eol = s.includes('\r\n') ? '\r\n' : '\n';

  let i = 0;
  let decl = null;
  const stack = [];
  let root = null;
  let pendingText = '';

  const fail = (msg) => { throw new XmlError(`${msg} (offset ${i})`); };

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) {
      if (s.slice(i).trim() !== '') fail('Text outside the root element');
      break;
    }
    if (lt > i) {
      pendingText += s.slice(i, lt);
      i = lt;
    }
    if (s.startsWith('<?', i)) {
      const end = s.indexOf('?>', i);
      if (end === -1) fail('Unterminated declaration');
      if (decl !== null || root !== null) fail('Unexpected processing instruction');
      decl = s.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (s.startsWith('<!--', i) || s.startsWith('<![CDATA[', i) || s.startsWith('<!', i)) {
      fail('Comments, CDATA and doctypes are not supported');
    }
    if (s.startsWith('</', i)) {
      const end = s.indexOf('>', i);
      if (end === -1) fail('Unterminated closing tag');
      const name = s.slice(i + 2, end).trim();
      const node = stack.pop();
      if (!node || node.name !== name) fail(`Mismatched closing tag </${name}>`);
      if (node.children.length === 0) {
        node.text = unescapeText(pendingText);
      } else if (pendingText.trim() !== '') {
        fail(`Mixed content in <${name}>`);
      }
      pendingText = '';
      i = end + 1;
      continue;
    }
    // opening tag
    const end = findTagEnd(s, i);
    if (end === -1) fail('Unterminated tag');
    let tag = s.slice(i + 1, end);
    const selfClosing = tag.endsWith('/');
    if (selfClosing) tag = tag.slice(0, -1);
    const m = /^([A-Za-z_][\w.:-]*)\s*([\s\S]*)$/.exec(tag);
    if (!m) fail('Bad tag');
    const node = { name: m[1], attrs: [], children: [], text: null };
    const attrRe = /([\w.:-]+)\s*=\s*"([^"]*)"|([\w.:-]+)\s*=\s*'([^']*)'/g;
    let a;
    while ((a = attrRe.exec(m[2])) !== null) {
      node.attrs.push([a[1] ?? a[3], unescapeText(a[2] ?? a[4])]);
    }
    if (pendingText.trim() !== '') fail(`Mixed content before <${node.name}>`);
    pendingText = '';
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root === null) root = node;
    else fail('Multiple root elements');
    if (!selfClosing) stack.push(node);
    i = end + 1;
  }
  if (stack.length) fail(`Unclosed <${stack[stack.length - 1].name}>`);
  if (!root) fail('No root element');
  return { bom, decl, eol, root };
}

function findTagEnd(s, i) {
  let q = null;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
  }
  return -1;
}

/** Serialize a parsed document back to the .NET XmlSerializer layout. */
export function serialize(doc) {
  const lines = [];
  if (doc.decl) lines.push(doc.decl);
  writeNode(doc.root, 0, lines);
  return (doc.bom ? '\uFEFF' : '') + lines.join(doc.eol);
}

function writeNode(node, depth, lines) {
  const pad = '  '.repeat(depth);
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  if (node.children.length) {
    lines.push(`${pad}<${node.name}${attrs}>`);
    for (const c of node.children) writeNode(c, depth + 1, lines);
    lines.push(`${pad}</${node.name}>`);
  } else if (node.text === null || node.text === '') {
    lines.push(`${pad}<${node.name}${attrs} />`);
  } else {
    lines.push(`${pad}<${node.name}${attrs}>${escapeText(node.text)}</${node.name}>`);
  }
}

// ---- tree helpers -------------------------------------------------------

export function child(node, name) {
  return node.children.find((c) => c.name === name) ?? null;
}
export function children(node, name) {
  return node.children.filter((c) => c.name === name);
}
/** Get (or create, appended) the named child element. */
export function ensureChild(node, name) {
  let c = child(node, name);
  if (!c) { c = el(name); node.children.push(c); }
  return c;
}
export function getText(node, name) {
  const c = child(node, name);
  return c ? (c.text ?? '') : null;
}
/** Set a scalar child's text; creates the child if missing. Returns [old, new]. */
export function setText(node, name, value) {
  const c = ensureChild(node, name);
  const old = c.children.length ? null : (c.text ?? '');
  c.children = [];
  c.text = value === '' ? null : value;
  return old;
}
/** Read a list element's item texts (e.g. <defaultGameOptions><string>…). */
export function listItems(node, name, itemName) {
  const c = child(node, name);
  return c ? children(c, itemName).map((x) => x.text ?? '') : [];
}
/** Replace a list element's items wholesale. */
export function setListItems(node, name, itemName, values) {
  const c = ensureChild(node, name);
  c.text = null;
  c.children = values.map((v) => el(itemName, v));
}
export function clone(node) {
  return {
    name: node.name,
    attrs: node.attrs.map((a) => [...a]),
    children: node.children.map(clone),
    text: node.text,
  };
}
