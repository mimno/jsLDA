/*
 * Latent Dirichlet allocation trained by collapsed Gibbs sampling.
 *
 * This file has no DOM dependencies. The page runs it inside a Web Worker
 * (see startLDAWorker below) so that training never freezes the browser,
 * and the tests run it directly in Node.
 */

class LDAModel {

  /**
   * @param {number} numTopics
   * @param {object} [options] alpha (document-topic smoothing),
   *   beta (topic-word smoothing), seed (for reproducible runs)
   */
  constructor(numTopics, options = {}) {
    this.numTopics = numTopics;
    this.alpha = options.alpha ?? 0.1;
    this.beta = options.beta ?? 0.01;
    this.random = options.seed === undefined ? Math.random : LDAModel.seededRandom(options.seed);
    this.iterations = 0;
  }

  /** Mulberry32: a small, fast seedable random number generator. */
  static seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Lower-case words of at least two letters, allowing internal punctuation (don't, well-known). */
  static tokenize(text) {
    return text.toLowerCase().match(/\p{L}[\p{L}\p{P}]*\p{L}/gu) || [];
  }

  /**
   * Read documents into the model and assign every word a random topic.
   * @param {Array<{id: string, text: string}>} docs
   * @param {Iterable<string>} stopwords
   */
  load(docs, stopwords) {
    const stops = new Set(stopwords);
    this.vocab = new Map();
    this.words = [];
    this.wordCounts = [];   // occurrences of each word type, including stopwords
    this.docIds = [];
    this.docWords = [];     // per document: Int32Array of word ids

    for (const doc of docs) {
      const tokens = LDAModel.tokenize(doc.text);
      const ids = new Int32Array(tokens.length);
      tokens.forEach((word, i) => {
        let id = this.vocab.get(word);
        if (id === undefined) {
          id = this.words.length;
          this.vocab.set(word, id);
          this.words.push(word);
          this.wordCounts.push(0);
        }
        this.wordCounts[id]++;
        ids[i] = id;
      });
      this.docIds.push(doc.id);
      this.docWords.push(ids);
    }

    // Two-letter words ("of", "us") are almost never useful topic words.
    this.isStop = new Uint8Array(this.words.length);
    this.words.forEach((word, id) => {
      if (stops.has(word) || word.length <= 2) { this.isStop[id] = 1; }
    });

    this.docTopics = this.docWords.map(ids => new Int32Array(ids.length));
    this.initializeTopics();
  }

  get numDocs() { return this.docWords.length; }

  /** Number of word types that are not stopwords; the "V" in beta * V. */
  get activeVocabularySize() {
    let n = 0;
    for (let w = 0; w < this.isStop.length; w++) { if (!this.isStop[w]) { n++; } }
    return n;
  }

  /** Random topic for every token, then build all count tables. */
  initializeTopics() {
    const K = this.numTopics;
    for (const topics of this.docTopics) {
      for (let i = 0; i < topics.length; i++) {
        topics[i] = Math.floor(this.random() * K);
      }
    }
    this.iterations = 0;
    this.rebuildCounts();
  }

  /** Recompute counts from the current topic assignments, skipping stopwords. */
  rebuildCounts() {
    const K = this.numTopics;
    this.wordTopicCounts = new Int32Array(this.words.length * K);
    this.docTopicCounts = new Int32Array(this.numDocs * K);
    this.tokensPerTopic = new Int32Array(K);
    this.docLengths = new Int32Array(this.numDocs);

    for (let d = 0; d < this.numDocs; d++) {
      const words = this.docWords[d];
      const topics = this.docTopics[d];
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (this.isStop[w]) { continue; }
        const t = topics[i];
        this.wordTopicCounts[w * K + t]++;
        this.docTopicCounts[d * K + t]++;
        this.tokensPerTopic[t]++;
        this.docLengths[d]++;
      }
    }
  }

  /** One pass of Gibbs sampling over every non-stopword token. */
  sweep() {
    const K = this.numTopics;
    const alpha = this.alpha;
    const beta = this.beta;
    const betaSum = beta * this.activeVocabularySize;
    const wordTopicCounts = this.wordTopicCounts;
    const docTopicCounts = this.docTopicCounts;
    const tokensPerTopic = this.tokensPerTopic;
    const weights = new Float64Array(K);

    for (let d = 0; d < this.numDocs; d++) {
      const words = this.docWords[d];
      const topics = this.docTopics[d];
      const docOffset = d * K;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (this.isStop[w]) { continue; }
        const wordOffset = w * K;
        let t = topics[i];

        wordTopicCounts[wordOffset + t]--;
        docTopicCounts[docOffset + t]--;
        tokensPerTopic[t]--;

        let sum = 0;
        for (let k = 0; k < K; k++) {
          const weight = (alpha + docTopicCounts[docOffset + k])
            * (beta + wordTopicCounts[wordOffset + k])
            / (betaSum + tokensPerTopic[k]);
          weights[k] = weight;
          sum += weight;
        }

        let sample = sum * this.random();
        t = 0;
        sample -= weights[0];
        while (sample > 0 && t < K - 1) {
          t++;
          sample -= weights[t];
        }

        topics[i] = t;
        wordTopicCounts[wordOffset + t]++;
        docTopicCounts[docOffset + t]++;
        tokensPerTopic[t]++;
      }
    }
    this.iterations++;
  }

  /** Mark a word as a stopword (or not) without losing the rest of the model. */
  setStopword(word, isStop) {
    const id = this.vocab.get(word);
    if (id === undefined || !!this.isStop[id] === isStop) { return; }
    this.isStop[id] = isStop ? 1 : 0;
    this.rebuildCounts();
  }

  /** Start over with a different number of topics. */
  setNumTopics(numTopics) {
    this.numTopics = numTopics;
    this.initializeTopics();
  }

  // Summaries

  /** The n most frequent words in each topic: [[{word, count}], ...]. */
  topicWords(n) {
    const K = this.numTopics;
    const result = [];
    for (let t = 0; t < K; t++) {
      const top = [];
      for (let w = 0; w < this.words.length; w++) {
        const count = this.wordTopicCounts[w * K + t];
        if (count === 0) { continue; }
        if (top.length < n || count > top[top.length - 1].count) {
          top.push({ word: this.words[w], count });
          top.sort((a, b) => b.count - a.count);
          if (top.length > n) { top.pop(); }
        }
      }
      result.push(top);
    }
    return result;
  }

  /**
   * How concentrated a word is in a few topics: 1 means it appears in only
   * one topic, 0 means it is spread evenly across all topics.
   */
  specificity(wordId) {
    const K = this.numTopics;
    let sum = 0;
    let weighted = 0;
    for (let t = 0; t < K; t++) {
      const c = this.wordTopicCounts[wordId * K + t];
      if (c > 0) { sum += c; weighted += c * Math.log(c); }
    }
    if (sum === 0 || K < 2) { return 0; }
    const entropy = Math.log(sum) - weighted / sum;
    return 1 - entropy / Math.log(K);
  }

  /**
   * Rows for the vocabulary table, most frequent first.
   * With a topic, rank words by their count in that topic instead.
   */
  vocabulary({ limit = 500, includeStopwords = false, topic = -1 } = {}) {
    const K = this.numTopics;
    const rows = [];
    for (let w = 0; w < this.words.length; w++) {
      const isStop = !!this.isStop[w];
      if (topic >= 0) {
        const count = this.wordTopicCounts[w * K + topic];
        if (count > 0) { rows.push({ word: this.words[w], count, isStop }); }
      } else if (includeStopwords || !isStop) {
        rows.push({ word: this.words[w], count: this.wordCounts[w], isStop });
      }
    }
    rows.sort((a, b) => b.count - a.count);
    const top = rows.slice(0, limit);
    for (const row of top) {
      row.specificity = row.isStop ? null : this.specificity(this.vocab.get(row.word));
    }
    return top;
  }

  // Exports (all CSV)

  static csvCell(value) {
    const s = String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  static format(x) {
    return Number.isFinite(x) ? x.toPrecision(8).replace(/\.?0+$/, '') : String(x);
  }

  docTopicsCSV() {
    const K = this.numTopics;
    const header = ['id'].concat(Array.from({ length: K }, (_, t) => 'topic' + t));
    const lines = [header.join(',')];
    for (let d = 0; d < this.numDocs; d++) {
      const n = this.docLengths[d] || 1;
      const row = [LDAModel.csvCell(this.docIds[d])];
      for (let t = 0; t < K; t++) { row.push(LDAModel.format(this.docTopicCounts[d * K + t] / n)); }
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  topicWordsCSV() {
    const K = this.numTopics;
    const header = ['word'].concat(Array.from({ length: K }, (_, t) => 'topic' + t));
    const lines = [header.join(',')];
    for (let w = 0; w < this.words.length; w++) {
      if (this.isStop[w]) { continue; }
      const row = [LDAModel.csvCell(this.words[w])];
      for (let t = 0; t < K; t++) {
        const total = this.tokensPerTopic[t] || 1;
        row.push(LDAModel.format(this.wordTopicCounts[w * K + t] / total));
      }
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  topicKeysCSV() {
    const lines = ['topic,tokens,words'];
    this.topicWords(10).forEach((words, t) => {
      lines.push([t, this.tokensPerTopic[t], LDAModel.csvCell(words.map(x => x.word).join(' '))].join(','));
    });
    return lines.join('\n') + '\n';
  }

  gephiCSV() {
    const K = this.numTopics;
    const lines = ['Source,Target,Weight,Type'];
    for (let d = 0; d < this.numDocs; d++) {
      const n = this.docLengths[d] || 1;
      for (let t = 0; t < K; t++) {
        const c = this.docTopicCounts[d * K + t];
        if (c > 0) {
          lines.push([LDAModel.csvCell(this.docIds[d]), 'topic' + t, LDAModel.format(c / n), 'Undirected'].join(','));
        }
      }
    }
    return lines.join('\n') + '\n';
  }

  stateCSV() {
    const lines = ['doc,word,topic'];
    for (let d = 0; d < this.numDocs; d++) {
      const words = this.docWords[d];
      const topics = this.docTopics[d];
      for (let i = 0; i < words.length; i++) {
        if (!this.isStop[words[i]]) {
          lines.push([d, LDAModel.csvCell(this.words[words[i]]), topics[i]].join(','));
        }
      }
    }
    return lines.join('\n') + '\n';
  }
}

/**
 * Pointwise mutual information between topics, from how often they appear
 * in the same documents. A document "contains" a topic if at least
 * minTokens tokens and minProportion of its tokens are assigned to it.
 * Pairs that never co-occur get -Infinity.
 */
function topicCorrelations(docTopicCounts, docLengths, numTopics, minTokens = 2, minProportion = 0.05) {
  const K = numTopics;
  const D = docLengths.length;
  const docsWith = new Float64Array(K);
  const together = Array.from({ length: K }, () => new Float64Array(K));
  const present = [];

  for (let d = 0; d < D; d++) {
    const cutoff = Math.max(minTokens, minProportion * docLengths[d]);
    present.length = 0;
    for (let t = 0; t < K; t++) {
      if (docTopicCounts[d * K + t] >= cutoff) { present.push(t); docsWith[t]++; }
    }
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        together[present[i]][present[j]]++;
        together[present[j]][present[i]]++;
      }
    }
  }

  return together.map((row, a) => Array.from(row, (n, b) =>
    a === b ? 0 : Math.log((D * n) / (docsWith[a] * docsWith[b]))));
}

/**
 * The code that runs inside the worker. It is turned into a string with
 * toString(), so it may only refer to LDAModel and to its own arguments.
 */
function ldaWorkerMain(self) {
  let model = null;
  let target = 0;
  let running = false;
  let lastSnapshot = 0;
  // Incremented whenever training is stopped, so that a step scheduled
  // before the stop never resumes alongside a newer one.
  let generation = 0;

  function snapshot(type) {
    self.postMessage({
      type,
      iteration: model.iterations,
      target,
      numTopics: model.numTopics,
      topicWords: model.topicWords(20),
      docTopicCounts: model.docTopicCounts.slice(),
      docLengths: model.docLengths.slice(),
      tokensPerTopic: model.tokensPerTopic.slice(),
    });
    lastSnapshot = Date.now();
  }

  // One iteration per task, so that pause and stopword messages are
  // handled between iterations.
  function step(gen) {
    if (!running || gen !== generation) { return; }
    if (model.iterations >= target) {
      running = false;
      snapshot('done');
      return;
    }
    model.sweep();
    if (model.iterations % 10 === 0 || Date.now() - lastSnapshot > 500) {
      snapshot('progress');
    } else {
      self.postMessage({ type: 'iteration', iteration: model.iterations, target });
    }
    setTimeout(step, 0, gen);
  }

  function stop() {
    running = false;
    generation++;
  }

  self.onmessage = function (event) {
    const msg = event.data;
    switch (msg.type) {
      case 'load':
        stop();
        target = 0;
        model = new LDAModel(msg.numTopics, { seed: msg.seed });
        model.load(msg.docs, msg.stopwords);
        self.postMessage({
          type: 'loaded',
          numDocs: model.numDocs,
          vocabularySize: model.activeVocabularySize,
          tokens: model.docLengths.reduce((a, b) => a + b, 0),
        });
        snapshot('progress');
        break;
      case 'train':
        target = model.iterations + msg.iterations;
        if (!running) { running = true; step(generation); }
        break;
      case 'pause':
        stop();
        target = model.iterations;
        snapshot('done');
        break;
      case 'setNumTopics':
        stop();
        model.setNumTopics(msg.numTopics);
        target = 0;
        snapshot('progress');
        break;
      case 'setStopword':
        model.setStopword(msg.word, msg.isStop);
        snapshot(running ? 'progress' : 'done');
        break;
      case 'vocabulary':
        self.postMessage({ type: 'vocabulary', rows: model.vocabulary(msg.options) });
        break;
      case 'export':
        self.postMessage({ type: 'export', kind: msg.kind, text: model[msg.kind + 'CSV']() });
        break;
    }
  };
}

/** Start the model in a Web Worker built from this file's own source. */
function startLDAWorker() {
  const source = LDAModel.toString() + '\n(' + ldaWorkerMain.toString() + ')(self);\n';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  return new Worker(url);
}

if (typeof module !== 'undefined') {
  module.exports = { LDAModel, topicCorrelations };
}
