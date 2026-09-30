/*
 * The page: choosing texts, training controls, and the views of the model.
 * The model itself runs in a Web Worker (see lda-model.js), so the page
 * stays responsive while it trains.
 */

const FIRST_ITERATIONS = 200;
const MORE_ITERATIONS = 100;
const DOCS_PER_PAGE = 50;
const DOC_SORT_SMOOTHING = 10;   // favors longer documents when ranking by topic

const $ = id => document.getElementById(id);
const percent = x => (100 * x).toFixed(x < 0.1 ? 1 : 0) + '%';
const plural = (n, word) => n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's');

const state = {
  numTopics: clampTopics(Number(new URLSearchParams(location.search).get('topics')) || 25),
  corpusName: '',
  files: [],            // [{name, text}] as read, kept so options can be changed later
  skippedFiles: 0,
  exampleStopwords: null,
  customStoplist: null, // {name, words}
  docs: [],
  labels: null,         // from Corpus.labelKind: how to plot document labels, if at all
  loaded: false,
  training: false,
  iteration: 0,
  target: 0,
  topicWords: [],
  docTopicCounts: null,
  docLengths: null,
  tokensPerTopic: null,
  selectedTopic: -1,
  view: 'docs',
  docsShown: DOCS_PER_PAGE,
  expandedDoc: -1,
};

function clampTopics(k) {
  return Math.max(3, Math.min(100, Math.round(k)));
}

// ---------------------------------------------------------------------------
// The worker

let worker = null;

function send(message) {
  if (!worker) {
    worker = startLDAWorker();
    worker.onmessage = event => onWorkerMessage(event.data);
    worker.onerror = event => showStatus('Something went wrong while training: ' + event.message, true);
  }
  worker.postMessage(message);
}

function onWorkerMessage(msg) {
  switch (msg.type) {
    case 'loaded':
      describeCorpus(msg);
      break;
    case 'iteration':
      state.iteration = msg.iteration;
      state.target = msg.target;
      updateProgress();
      break;
    case 'progress':
    case 'done':
      Object.assign(state, {
        iteration: msg.iteration,
        target: msg.target,
        numTopics: msg.numTopics,
        topicWords: msg.topicWords,
        docTopicCounts: msg.docTopicCounts,
        docLengths: msg.docLengths,
        tokensPerTopic: msg.tokensPerTopic,
      });
      if (msg.type === 'done') { state.training = false; }
      updateProgress();
      renderTopics();
      renderView();
      break;
    case 'vocabulary':
      renderVocabulary(msg.rows);
      break;
    case 'export':
      saveFile(msg.kind, msg.text);
      break;
  }
}

// ---------------------------------------------------------------------------
// Choosing texts

$('folder-input').addEventListener('change', event => {
  const files = Array.from(event.target.files);
  if (files.length === 0) { return; }
  // webkitRelativePath is "chosen-folder/sub/file.txt"; drop the folder name.
  const withNames = files.map(f => ({ file: f, name: f.webkitRelativePath.split('/').slice(1).join('/') || f.name }));
  const folder = files[0].webkitRelativePath.split('/')[0] || 'texts';
  openFiles(withNames, folder);
  event.target.value = '';
});

$('files-input').addEventListener('change', event => {
  const files = Array.from(event.target.files);
  if (files.length === 0) { return; }
  const name = files.length === 1 ? files[0].name : '';
  openFiles(files.map(f => ({ file: f, name: f.name })), name);
  event.target.value = '';
});

async function openFiles(entries, corpusName) {
  const textEntries = entries.filter(e => Corpus.isTextFile(e.name));
  if (textEntries.length === 0) {
    showStatus('No plain-text files found. This page reads .txt files; convert PDFs and Word files to text first.', true);
    return;
  }
  showStatus('Reading ' + plural(textEntries.length, 'file') + '…');
  const files = await Promise.all(textEntries.map(async e => ({ name: e.name, text: await Corpus.readFileText(e.file) })));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  state.files = files;
  state.skippedFiles = entries.length - textEntries.length;
  state.corpusName = corpusName;
  state.exampleStopwords = null;
  startModel();
}

$('example-button').addEventListener('click', async () => {
  showStatus('Loading the example…');
  try {
    const [docs, stops] = await Promise.all(['documents.txt', 'stoplist.txt'].map(async url => {
      const response = await fetch(url);
      if (!response.ok) { throw new Error(url + ': ' + response.status); }
      return response.text();
    }));
    state.files = [{ name: 'documents.txt', text: docs }];
    state.skippedFiles = 0;
    state.corpusName = 'State of the Union addresses';
    state.exampleStopwords = stops.split(/\s+/).filter(Boolean);
    startModel();
  } catch (e) {
    showStatus('The example can only be loaded when this page is served from a web server, not opened from your '
      + 'disk. You can still open your own texts.', true);
  }
});

// Options

$('passage-words').addEventListener('change', () => { if (state.loaded) { startModel(); } });

$('stoplist-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) { return; }
  const text = await Corpus.readFileText(file);
  state.customStoplist = { name: file.name, words: text.toLowerCase().split(/\s+/).filter(Boolean) };
  $('stoplist-name').textContent = file.name + ' (' + plural(state.customStoplist.words.length, 'word') + ')';
  $('stoplist-reset').hidden = false;
  event.target.value = '';
  if (state.loaded) { startModel(); }
});

$('stoplist-reset').addEventListener('click', () => {
  state.customStoplist = null;
  $('stoplist-name').textContent = 'common English words';
  $('stoplist-reset').hidden = true;
  if (state.loaded) { startModel(); }
});

function stopwords() {
  if (state.customStoplist) { return state.customStoplist.words; }
  return ENGLISH_STOPWORDS.concat(state.exampleStopwords || []);
}

/** Build documents from the current files and options, and start training. */
function startModel() {
  const passageWords = Math.max(0, Number($('passage-words').value) || 0);
  const { docs, format } = Corpus.documentsFromFiles(state.files, passageWords);
  if (docs.length === 0) {
    showStatus('The files you chose are empty.', true);
    return;
  }
  state.docs = docs;
  state.format = format;
  state.labels = Corpus.labelKind(docs.map(d => d.label));
  state.loaded = true;
  state.training = true;
  state.iteration = 0;
  state.target = FIRST_ITERATIONS;
  state.selectedTopic = -1;
  state.docsShown = DOCS_PER_PAGE;
  state.expandedDoc = -1;

  $('explorer').hidden = false;
  $('meta-tab').hidden = !state.labels;
  if (state.view === 'meta' && !state.labels) { selectView('docs'); }
  $('vocab-by-topic').checked = false;
  $('vocab-by-topic').disabled = true;
  showStatus('Reading ' + plural(docs.length, 'document') + '…');

  send({
    type: 'load',
    docs: docs.map(d => ({ id: d.id, text: d.text })),
    stopwords: stopwords(),
    numTopics: state.numTopics,
  });
  send({ type: 'train', iterations: FIRST_ITERATIONS });
  updateProgress();
}

function describeCorpus(info) {
  const parts = [];
  const name = state.corpusName ? state.corpusName + ': ' : '';
  if (state.format === 'files') {
    const files = plural(state.files.length, 'file');
    parts.push(info.numDocs === state.files.length
      ? `${name}${files}`
      : `${name}${files}, split into ${plural(info.numDocs, 'passage')}`);
  } else {
    parts.push(`${name}${plural(info.numDocs, 'document')}`);
  }
  parts.push(`${info.tokens.toLocaleString()} words after removing stopwords, ${info.vocabularySize.toLocaleString()} distinct`);
  let message = parts.join(', ') + '.';
  if (state.skippedFiles > 0) {
    message += ` Skipped ${plural(state.skippedFiles, 'file')} that ${state.skippedFiles === 1 ? "isn't" : "aren't"} plain text.`;
  }
  showStatus(message);
}

function showStatus(message, isWarning = false) {
  const status = $('status');
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle('warning', isWarning);
}

// ---------------------------------------------------------------------------
// Training controls

$('num-topics').value = state.numTopics;
$('num-topics-value').textContent = state.numTopics;

$('num-topics').addEventListener('input', event => {
  $('num-topics-value').textContent = event.target.value;
});

$('num-topics').addEventListener('change', event => {
  const k = clampTopics(Number(event.target.value));
  if (k === state.numTopics) { return; }
  state.numTopics = k;
  if (!state.loaded) { return; }
  state.selectedTopic = -1;
  state.training = true;
  send({ type: 'setNumTopics', numTopics: k });
  send({ type: 'train', iterations: FIRST_ITERATIONS });
});

$('train-button').addEventListener('click', () => {
  if (state.training) {
    send({ type: 'pause' });
  } else {
    state.training = true;
    send({ type: 'train', iterations: state.iteration === 0 ? FIRST_ITERATIONS : MORE_ITERATIONS });
  }
  updateProgress();
});

function updateProgress() {
  const button = $('train-button');
  button.disabled = !state.loaded;
  button.textContent = state.training ? 'Pause' : state.iteration === 0 ? 'Train' : 'Train more';

  let text;
  let fraction = 0;
  if (!state.loaded) {
    text = 'Choose texts first.';
  } else if (state.training) {
    fraction = state.target > 0 ? state.iteration / state.target : 0;
    text = `Training… pass ${state.iteration} of ${state.target}`;
  } else {
    fraction = 1;
    text = state.iteration === 0
      ? 'Ready to train.'
      : `Done: ${state.iteration} passes. Train more if the topics are still changing.`;
  }
  $('progress-bar').style.width = (100 * fraction) + '%';
  $('progress-text').textContent = text;
}

// ---------------------------------------------------------------------------
// Topics

function topicLabel(topic, n = 8) {
  const words = state.topicWords[topic] || [];
  return words.slice(0, n).map(w => w.word).join(' ');
}

function renderTopics() {
  const list = $('topic-list');
  const max = Math.max(1, ...state.tokensPerTopic);
  const items = [];
  for (let t = 0; t < state.numTopics; t++) {
    const li = document.createElement('li');
    li.className = t === state.selectedTopic ? 'selected' : '';
    li.dataset.topic = t;
    li.title = 'Click to rank documents by this topic';
    const id = document.createElement('span');
    id.className = 'topic-id';
    id.textContent = t;
    const share = document.createElement('span');
    share.className = 'share';
    share.style.width = (100 * state.tokensPerTopic[t] / max) + '%';
    li.append(id, topicLabel(t) || '…', share);
    items.push(li);
  }
  list.replaceChildren(...items);
}

$('topic-list').addEventListener('click', event => {
  const li = event.target.closest('li');
  if (li) { selectTopic(Number(li.dataset.topic)); }
});

function selectTopic(topic) {
  state.selectedTopic = topic === state.selectedTopic ? -1 : topic;
  state.docsShown = DOCS_PER_PAGE;
  $('vocab-by-topic').disabled = state.selectedTopic < 0;
  if (state.selectedTopic < 0) { $('vocab-by-topic').checked = false; }
  renderTopics();
  if (state.view === 'corr' || state.view === 'save') { selectView('docs'); }
  renderView();
}

// ---------------------------------------------------------------------------
// Views

document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) { selectView(button.dataset.view); }
});

function selectView(view) {
  state.view = view;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('selected', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
  renderView();
}

function renderView() {
  if (!state.docTopicCounts) { return; }
  switch (state.view) {
    case 'docs': renderDocuments(); break;
    case 'corr': renderCorrelations(); break;
    case 'vocab': requestVocabulary(); break;
    case 'meta': renderMetadata(); break;
  }
}

// Documents

function docShare(d, topic) {
  const n = state.docLengths[d];
  return n > 0 ? state.docTopicCounts[d * state.numTopics + topic] / n : 0;
}

function renderDocuments() {
  const K = state.numTopics;
  const topic = state.selectedTopic;
  let order;
  if (topic >= 0) {
    const score = d => (state.docTopicCounts[d * K + topic] + DOC_SORT_SMOOTHING)
      / (state.docLengths[d] + DOC_SORT_SMOOTHING * K);
    order = state.docs.map((_, d) => d)
      .filter(d => state.docTopicCounts[d * K + topic] > 0)
      .map(d => ({ d, s: score(d) }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.d);
    $('docs-heading').textContent = `${plural(order.length, 'document')} use topic ${topic} (${topicLabel(topic, 5)}), `
      + 'most first. Click a document to read it.';
  } else {
    order = state.docs.map((_, d) => d);
    $('docs-heading').textContent = `${plural(order.length, 'document')} in their original order. `
      + 'Click a topic on the left to rank documents by it, or click a document to read it.';
  }

  const shown = order.slice(0, state.docsShown).map(d => documentCard(d, topic));
  $('doc-list').replaceChildren(...shown);
  $('more-docs').hidden = order.length <= state.docsShown;
  $('more-docs').textContent = `Show more (${(order.length - state.docsShown).toLocaleString()} left)`;
}

function documentCard(d, topic) {
  const doc = state.docs[d];
  const expanded = d === state.expandedDoc;
  const card = document.createElement('div');
  card.className = 'doc' + (expanded ? ' expanded' : '');
  card.dataset.doc = d;

  const head = document.createElement('div');
  head.className = 'doc-head';
  const id = document.createElement('span');
  id.className = 'doc-id';
  id.textContent = doc.id;
  head.append(id);
  if (doc.label) {
    const label = document.createElement('span');
    label.className = 'doc-label';
    label.textContent = doc.label;
    head.append(label);
  }
  if (topic >= 0) {
    const share = docShare(d, topic);
    const el = document.createElement('span');
    el.className = 'doc-share';
    el.innerHTML = `<span class="bar"><span style="width:${100 * share}%"></span></span>`;
    el.append(percent(share) + ' of words');
    head.append(el);
  }

  const text = document.createElement('p');
  text.className = 'doc-text';
  text.textContent = expanded || doc.text.length <= 300 ? doc.text : doc.text.slice(0, 297) + '…';
  card.append(head, text);

  if (expanded) {
    const topics = document.createElement('ul');
    topics.className = 'doc-topics';
    const ranked = Array.from({ length: state.numTopics }, (_, t) => t)
      .sort((a, b) => docShare(d, b) - docShare(d, a))
      .filter(t => docShare(d, t) >= 0.05)
      .slice(0, 6);
    for (const t of ranked) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="pct">${percent(docShare(d, t))}</span>`;
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'link';
      link.dataset.topic = t;
      link.textContent = `${t}: ${topicLabel(t, 6)}`;
      li.append(link);
      topics.append(li);
    }
    card.append(topics);
  }
  return card;
}

$('doc-list').addEventListener('click', event => {
  const topicLink = event.target.closest('button[data-topic]');
  if (topicLink) {
    selectTopic(Number(topicLink.dataset.topic));
    return;
  }
  if (window.getSelection().toString()) { return; }   // let people select text
  const card = event.target.closest('.doc');
  if (!card) { return; }
  const d = Number(card.dataset.doc);
  state.expandedDoc = state.expandedDoc === d ? -1 : d;
  card.replaceWith(documentCard(d, state.selectedTopic));
});

$('more-docs').addEventListener('click', () => {
  state.docsShown += DOCS_PER_PAGE;
  renderDocuments();
});

// Topic correlations

function renderCorrelations() {
  const K = state.numTopics;
  const pmi = topicCorrelations(state.docTopicCounts, state.docLengths, K);
  const cell = Math.max(12, Math.min(28, 560 / K));
  const plot = cell * K;
  const labelSpace = 190;
  const width = plot + labelSpace + 20;
  const height = plot + labelSpace + 20;
  const pos = t => 10 + cell * (t + 0.5);
  const radius = d3.scaleSqrt().domain([0, 2]).range([0, cell / 2]).clamp(true);

  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', width);
  const tooltip = d3.select('#tooltip');

  const links = [];
  for (let a = 0; a < K; a++) {
    for (let b = 0; b < K; b++) {
      if (a !== b && Number.isFinite(pmi[a][b])) { links.push({ a, b, value: pmi[a][b] }); }
    }
  }

  svg.append('g').selectAll('circle').data(links).join('circle')
    .attr('cx', d => pos(d.a))
    .attr('cy', d => pos(d.b))
    .attr('r', d => radius(Math.abs(d.value)))
    .style('fill', d => d.value > 0 ? 'var(--pos)' : 'var(--neg)')
    .on('mouseover', (event, d) => {
      tooltip.style('visibility', 'visible')
        .text(`${d.a}: ${topicLabel(d.a, 4)}  /  ${d.b}: ${topicLabel(d.b, 4)}`);
    })
    .on('mousemove', event => {
      tooltip.style('top', (event.pageY - 10) + 'px').style('left', (event.pageX + 16) + 'px');
    })
    .on('mouseout', () => tooltip.style('visibility', 'hidden'));

  const labels = d3.range(K).map(t => `${t} ${topicLabel(t, 3)}`);
  svg.append('g').selectAll('text').data(labels).join('text')
    .attr('x', plot + 18)
    .attr('y', (d, t) => pos(t))
    .text(d => d);
  svg.append('g').selectAll('text').data(labels).join('text')
    .attr('transform', (d, t) => `translate(${pos(t)},${plot + 18}) rotate(90)`)
    .text(d => d);

  $('corr-plot').replaceChildren(svg.node());
}

// Vocabulary

function requestVocabulary() {
  const byTopic = $('vocab-by-topic').checked && state.selectedTopic >= 0;
  send({
    type: 'vocabulary',
    options: {
      limit: 500,
      includeStopwords: $('show-stopwords').checked,
      topic: byTopic ? state.selectedTopic : -1,
    },
  });
}

$('show-stopwords').addEventListener('change', requestVocabulary);
$('vocab-by-topic').addEventListener('change', requestVocabulary);

function renderVocabulary(rows) {
  const tbody = document.querySelector('#vocab-table tbody');
  const trs = rows.map(row => {
    const tr = document.createElement('tr');
    if (row.isStop) { tr.className = 'stop'; }
    const spec = row.specificity === null ? '' :
      `<span class="spec"><span style="width:${100 * row.specificity}%"></span></span>${row.specificity.toFixed(2)}`;
    tr.innerHTML = `<td></td><td class="num">${row.count.toLocaleString()}</td><td>${spec}</td>`
      + `<td><button type="button" class="button small"></button></td>`;
    tr.cells[0].textContent = row.word;
    const button = tr.querySelector('button');
    button.textContent = row.isStop ? 'Restore' : 'Remove';
    button.title = row.isStop ? 'Use this word in topics again' : 'Treat this word as a stopword';
    button.addEventListener('click', () => {
      send({ type: 'setStopword', word: row.word, isStop: !row.isStop });
    });
    return tr;
  });
  tbody.replaceChildren(...trs);
}

// By metadata

const MAX_CATEGORIES = 30;

/** Group documents by label: [{label, docs: [document indices]}]. */
function groupByLabel() {
  const groups = new Map();
  state.docs.forEach((doc, d) => {
    if (!groups.has(doc.label)) { groups.set(doc.label, []); }
    groups.get(doc.label).push(d);
  });
  return [...groups.entries()].map(([label, docs]) => ({ label, docs }));
}

function renderMetadata() {
  if (!state.labels) { return; }
  const source = state.format === 'files' ? 'the subfolder each file is in' : 'the second column of your file';
  let groups = groupByLabel();
  let hint;
  let chart;

  if (state.labels.kind === 'dates') {
    groups = groups
      .map(g => ({ ...g, x: state.labels.toNumber(g.label) }))
      .filter(g => Number.isFinite(g.x))
      .sort((a, b) => a.x - b.x);
    hint = `Each chart shows a topic's average share of the words in documents from each date, taken from ${source}.`;
    chart = timeChart;
  } else {
    let note = '';
    if (groups.length > MAX_CATEGORIES) {
      note = ` Showing the ${MAX_CATEGORIES} labels with the most documents, out of ${groups.length}.`;
      groups = groups.sort((a, b) => b.docs.length - a.docs.length).slice(0, MAX_CATEGORIES);
    }
    groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    hint = `Each chart shows a topic's average share of the words in documents with each label, taken from ${source}.`
      + note;
    chart = barChart;
  }
  $('meta-hint').textContent = hint + ' Click a topic on the left to highlight it.';

  const K = state.numTopics;
  const means = d3.range(K).map(t => groups.map(g => d3.mean(g.docs, d => docShare(d, t))));
  const yMax = d3.max(means.flat()) || 1;
  $('meta-plots').replaceChildren(chart(groups, means, yMax));
}

/**
 * Rows of small charts, one per topic, sharing a y scale, with the same
 * x axis above the first row and below the last.
 * @param makeAxis   (d3.axisTop or d3.axisBottom) => configured axis
 * @param rotate     slant axis labels, for long category names
 * @param labelRoom  space for the (possibly slanted) axis labels
 */
function smallMultiples(means, yMax, drawRow, makeAxis, { rotate = false, labelRoom = 0 } = {}) {
  const K = state.numTopics;
  const width = 640;
  const rowHeight = 48;
  const labelHeight = 16;
  const gap = 14;
  const rowStep = labelHeight + rowHeight + gap;
  const axisHeight = rotate ? 20 + labelRoom : 24;
  // Slanted labels run up and to the right above the chart, down and to the left below it.
  const side = rotate ? Math.round(0.77 * labelRoom) : 0;
  const y = d3.scaleLinear().domain([0, yMax]).range([rowHeight, 0]);

  const height = axisHeight + K * rowStep - gap + axisHeight;
  const svg = d3.create('svg')
    .attr('viewBox', `${-side} 0 ${width + 2 * side} ${height}`)
    .attr('width', width + 2 * side);

  const top = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${axisHeight})`)
    .call(makeAxis(d3.axisTop));
  const bottom = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - axisHeight})`)
    .call(makeAxis(d3.axisBottom));
  if (rotate) {
    top.selectAll('text').attr('text-anchor', 'start').attr('dx', '0.6em').attr('dy', '0.2em')
      .attr('transform', 'rotate(-40)');
    bottom.selectAll('text').attr('text-anchor', 'end').attr('dx', '-0.6em').attr('dy', '0.2em')
      .attr('transform', 'rotate(-40)');
  }

  const rows = svg.selectAll('g.row').data(means).join('g')
    .attr('class', (m, t) => t === state.selectedTopic ? 'row selected' : 'row')
    .attr('transform', (m, t) => `translate(0,${axisHeight + 4 + t * rowStep})`);
  rows.append('text').attr('y', 12).text((m, t) => `${t}: ${topicLabel(t, 5)}`);
  const charts = rows.append('g').attr('transform', `translate(0,${labelHeight})`);
  drawRow(charts, width, rowHeight, y);
  charts.append('line').attr('class', 'baseline').attr('x2', width).attr('y1', rowHeight).attr('y2', rowHeight);
  return svg.node();
}

function timeChart(points, means, yMax) {
  const x = d3.scaleLinear().domain(d3.extent(points, p => p.x)).range([0, 640]);
  return smallMultiples(means, yMax,
    (charts, width, rowHeight, y) => {
      const area = d3.area().x((m, i) => x(points[i].x)).y0(rowHeight).y1(m => y(m));
      charts.append('path').attr('class', 'area').attr('d', area);
    },
    axis => axis(x).ticks(8).tickFormat(d3.format('d')));
}

function barChart(groups, means, yMax) {
  const names = groups.map(g => g.label || '(no label)');
  const x = d3.scaleBand().domain(d3.range(groups.length)).range([0, 640]).padding(0.2);
  const longest = d3.max(names, n => n.length);
  const rotate = 7 * longest > x.step();   // labels wider than their bars
  const tooltip = d3.select('#tooltip');

  return smallMultiples(means, yMax,
    (charts, width, rowHeight, y) => {
      charts.selectAll('rect').data((m, t) => m.map((value, i) => ({ value, i, t }))).join('rect')
        .attr('class', 'bar')
        .attr('x', b => x(b.i))
        .attr('width', x.bandwidth())
        .attr('y', b => y(b.value))
        .attr('height', b => rowHeight - y(b.value))
        .on('mouseover', (event, b) => {
          tooltip.style('visibility', 'visible').text(`${names[b.i]}: topic ${b.t} is ${percent(b.value)} of the `
            + `words, on average, in ${plural(groups[b.i].docs.length, 'document')}`);
        })
        .on('mousemove', event => {
          tooltip.style('top', (event.pageY - 10) + 'px').style('left', (event.pageX + 16) + 'px');
        })
        .on('mouseout', () => tooltip.style('visibility', 'hidden'));
    },
    axis => axis(x).tickFormat(i => names[i]).tickSizeOuter(0),
    { rotate, labelRoom: Math.min(140, 6 * longest) });
}

// Saving results

document.querySelector('.exports').addEventListener('click', event => {
  const button = event.target.closest('button[data-export]');
  if (!button || !state.docTopicCounts) { return; }
  const kind = button.dataset.export;
  if (kind === 'correlations') {
    const K = state.numTopics;
    const pmi = topicCorrelations(state.docTopicCounts, state.docLengths, K);
    const header = ['topic'].concat(d3.range(K).map(t => 'topic' + t)).join(',');
    const rows = pmi.map((row, t) => ['topic' + t].concat(row.map(v => Number.isFinite(v) ? v.toFixed(6) : '')).join(','));
    saveFile(kind, [header].concat(rows).join('\n') + '\n');
  } else {
    send({ type: 'export', kind });
  }
});

function saveFile(kind, text) {
  const slug = state.corpusName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'topics';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-${state.numTopics}-topics-${kind}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

updateProgress();
