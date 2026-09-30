const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LDAModel, topicCorrelations } = require('../lda-model.js');
const { Corpus } = require('../corpus.js');

const toyDocs = [
  'whale ship harpoon sea sailor whale ship',
  'sea sailor whale harpoon ship ocean captain',
  'bread butter flour oven baking bread',
  'oven flour butter baking recipe bread',
  'whale sea ocean ship captain sailor',
  'baking bread recipe flour oven butter',
].map((text, i) => ({ id: 'doc' + i, text }));

function checkCounts(model) {
  const K = model.numTopics;
  const wordTotals = new Int32Array(K);
  const docTotals = new Int32Array(K);
  for (let w = 0; w < model.words.length; w++) {
    for (let t = 0; t < K; t++) { wordTotals[t] += model.wordTopicCounts[w * K + t]; }
  }
  for (let d = 0; d < model.numDocs; d++) {
    let len = 0;
    for (let t = 0; t < K; t++) {
      docTotals[t] += model.docTopicCounts[d * K + t];
      len += model.docTopicCounts[d * K + t];
    }
    assert.equal(len, model.docLengths[d]);
  }
  assert.deepEqual(wordTotals, model.tokensPerTopic);
  assert.deepEqual(docTotals, model.tokensPerTopic);
  for (const x of model.wordTopicCounts) { assert.ok(x >= 0); }
}

test('tokenize keeps letters and internal punctuation', () => {
  assert.deepEqual(LDAModel.tokenize("Don't stop the well-known Café, 1999!"),
    ["don't", 'stop', 'the', 'well-known', 'café']);
});

test('counts stay consistent through training and stopword changes', () => {
  const model = new LDAModel(2, { seed: 1 });
  model.load(toyDocs, ['the']);
  checkCounts(model);
  for (let i = 0; i < 20; i++) { model.sweep(); }
  checkCounts(model);
  assert.equal(model.iterations, 20);

  model.setStopword('bread', true);
  checkCounts(model);
  assert.ok(!model.topicWords(10).flat().some(x => x.word === 'bread'));
  model.setStopword('bread', false);
  checkCounts(model);

  model.setNumTopics(3);
  checkCounts(model);
  assert.equal(model.iterations, 0);
});

test('separates two obvious themes', () => {
  const model = new LDAModel(2, { seed: 7 });
  model.load(toyDocs, []);
  for (let i = 0; i < 200; i++) { model.sweep(); }
  const tops = model.topicWords(3).map(ws => ws.map(x => x.word));
  const sea = tops.findIndex(ws => ws.includes('whale'));
  assert.ok(sea >= 0, JSON.stringify(tops));
  assert.ok(!tops[sea].includes('bread'), JSON.stringify(tops));
  assert.ok(tops[1 - sea].includes('bread') || tops[1 - sea].includes('oven'), JSON.stringify(tops));
});

test('same seed gives the same model', () => {
  const run = () => {
    const m = new LDAModel(3, { seed: 42 });
    m.load(toyDocs, []);
    for (let i = 0; i < 10; i++) { m.sweep(); }
    return Array.from(m.docTopicCounts);
  };
  assert.deepEqual(run(), run());
});

test('short words are stopwords', () => {
  const model = new LDAModel(2, { seed: 1 });
  model.load([{ id: 'a', text: 'we go to sea' }], []);
  assert.deepEqual(model.vocabulary({ includeStopwords: false }).map(r => r.word), ['sea']);
});

test('exports have one row per document or word', () => {
  const model = new LDAModel(2, { seed: 1 });
  model.load(toyDocs, []);
  model.sweep();
  assert.equal(model.docTopicsCSV().trim().split('\n').length, 1 + toyDocs.length);
  const rows = model.docTopicsCSV().trim().split('\n').slice(1);
  for (const row of rows) {
    const sum = row.split(',').slice(1).map(Number).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6);
  }
  assert.equal(model.topicWordsCSV().trim().split('\n').length, 1 + model.activeVocabularySize);
  assert.equal(model.topicKeysCSV().trim().split('\n').length, 3);
  assert.match(model.stateCSV(), /^doc,word,topic\n0,whale,\d/);
});

test('correlations are symmetric with zero diagonal', () => {
  const model = new LDAModel(3, { seed: 3 });
  model.load(toyDocs, []);
  for (let i = 0; i < 20; i++) { model.sweep(); }
  const pmi = topicCorrelations(model.docTopicCounts, model.docLengths, 3);
  for (let a = 0; a < 3; a++) {
    assert.equal(pmi[a][a], 0);
    for (let b = 0; b < 3; b++) { assert.equal(pmi[a][b], pmi[b][a]); }
  }
});

test('example corpus trains quickly', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'documents.txt'), 'utf8');
  const stops = fs.readFileSync(path.join(__dirname, '..', 'stoplist.txt'), 'utf8').split(/\s+/);
  const { docs, format } = Corpus.documentsFromFiles([{ name: 'documents.txt', text }], 500);
  assert.equal(format, 'lines');
  assert.equal(docs.length, 9743);

  const model = new LDAModel(25, { seed: 1 });
  model.load(docs, stops);
  const start = Date.now();
  for (let i = 0; i < 10; i++) { model.sweep(); }
  const perSweep = (Date.now() - start) / 10;
  checkCounts(model);
  assert.ok(perSweep < 500, `sweep took ${perSweep} ms`);
});
