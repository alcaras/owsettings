import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, serialize, XmlError } from '../xml.js';

const FIX = new URL('./fixtures/', import.meta.url);
const read = (name) => readFileSync(new URL(name, FIX), 'utf8');

test('Windows file (BOM + CRLF) round-trips byte-for-byte', () => {
  const src = read('win.xml');
  assert.equal(src.charCodeAt(0), 0xfeff);
  assert.ok(src.includes('\r\n'));
  assert.equal(serialize(parse(src)), src);
});

test('Mac file (BOM + LF) round-trips byte-for-byte', () => {
  const src = read('mac.xml');
  assert.ok(!src.includes('\r\n'));
  assert.equal(serialize(parse(src)), src);
});

test('root attributes and self-closing tags survive', () => {
  const src = '<?xml version="1.0" encoding="utf-8"?>\n<A x="1" y="a&amp;b">\n  <b />\n  <c>t&lt;x</c>\n</A>';
  const doc = parse(src);
  assert.deepEqual(doc.root.attrs, [['x', '1'], ['y', 'a&b']]);
  assert.equal(doc.root.children[1].text, 't<x');
  assert.equal(serialize(doc), src);
});

test('rejects things that are not this file', () => {
  assert.throws(() => parse('<a><b></a>'), XmlError);
  assert.throws(() => parse('<a>x<b /></a>'), XmlError);
  assert.throws(() => parse('<!-- c --><a />'), XmlError);
  assert.throws(() => parse('hello'), XmlError);
});
