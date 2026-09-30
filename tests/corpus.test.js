const test = require('node:test');
const assert = require('node:assert/strict');
const { Corpus } = require('../corpus.js');

test('recognizes the one-document-per-line format', () => {
  const text = 'a\t1900\tfirst text\nb\t1901\tsecond text\nc\t1902\tthird\n';
  assert.ok(Corpus.isLineFormat(text));
  assert.ok(!Corpus.isLineFormat('Call me Ishmael.\n\nSome years ago\tnever mind how long.'));
  const { docs, format } = Corpus.documentsFromFiles([{ name: 'x.txt', text }], 500);
  assert.equal(format, 'lines');
  assert.deepEqual(docs[1], { id: 'b', label: '1901', text: 'second text' });
});

test('splits long texts at paragraph breaks', () => {
  const para = n => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
  const text = [para(3), para(3), para(3), para(8)].join('\n\n');
  const passages = Corpus.splitPassages(text, 6);
  assert.deepEqual(passages.map(Corpus.wordCount), [6, 3, 6, 2]);
  assert.ok(passages[0].includes('\n\n'), 'paragraph breaks are kept inside a passage');
});

test('names passages after their file; short files keep their name', () => {
  const long = Array.from({ length: 12 }, (_, i) => 'word' + i).join(' ');
  const { docs, format } = Corpus.documentsFromFiles([
    { name: 'moby-dick.txt', text: long },
    { name: 'notes/short.txt', text: 'just a few words' },
    { name: 'empty.txt', text: '   ' },
  ], 5);
  assert.equal(format, 'files');
  assert.deepEqual(docs.map(d => d.id),
    ['moby-dick-1.txt', 'moby-dick-2.txt', 'moby-dick-3.txt', 'notes/short.txt']);
});

test('zero passage length keeps files whole', () => {
  const { docs } = Corpus.documentsFromFiles([{ name: 'a.txt', text: 'one two\n\nthree four' }], 0);
  assert.equal(docs.length, 1);
});

test('skips hidden and non-text files', () => {
  assert.ok(Corpus.isTextFile('texts/a.txt'));
  assert.ok(Corpus.isTextFile('B.TXT'));
  assert.ok(!Corpus.isTextFile('texts/.DS_Store'));
  assert.ok(!Corpus.isTextFile('.git/a.txt'));
  assert.ok(!Corpus.isTextFile('paper.pdf'));
});

test('time series only for date-like labels', () => {
  const years = Corpus.dateScale(['1914', '1915', '1916', '1915']);
  assert.ok(years);
  assert.equal(years('1915'), 1915);
  const dates = Corpus.dateScale(['2020-01-15', '2020-03', '2021-12-31']);
  assert.ok(dates('2020-03') < dates('2021-12-31'));
  assert.equal(Corpus.dateScale(['fiction', 'poetry', 'drama']), null);
  assert.equal(Corpus.dateScale(['', '', '']), null);
});

test('labels are plotted as dates, categories, or not at all', () => {
  assert.equal(Corpus.labelKind(['1914', '1915', '1916']).kind, 'dates');
  assert.equal(Corpus.labelKind(['fiction', 'poetry', 'fiction']).kind, 'categories');
  assert.equal(Corpus.labelKind(['1914', '1915']).kind, 'categories', 'two values are too few for a time line');
  assert.equal(Corpus.labelKind(['same', 'same']), null);
  assert.equal(Corpus.labelKind(['', '']), null);
  const ids = Array.from({ length: 100 }, (_, i) => 'id' + i);
  assert.equal(Corpus.labelKind(ids), null, 'a different label on every document is not a category');
});

test('files in subfolders are labeled with the subfolder', () => {
  const { docs } = Corpus.documentsFromFiles([
    { name: 'fiction/a.txt', text: 'one' },
    { name: 'poetry/nested/b.txt', text: 'two' },
    { name: 'c.txt', text: 'three' },
  ], 500);
  assert.deepEqual(docs.map(d => d.label), ['fiction', 'poetry', '']);
});

test('falls back to Windows-1252 for invalid UTF-8', async () => {
  const bytes = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);   // "café" in Windows-1252
  const file = { arrayBuffer: async () => bytes.buffer };
  assert.equal(await Corpus.readFileText(file), 'café');
  const utf8 = new TextEncoder().encode('﻿naïve');
  assert.equal(await Corpus.readFileText({ arrayBuffer: async () => utf8.buffer }), 'naïve');
});
