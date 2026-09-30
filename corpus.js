/*
 * Turning files into documents: reading text in the right encoding,
 * recognizing the one-document-per-line format, and splitting long texts
 * into passages. No DOM dependencies except readFileText, which takes a
 * browser File object.
 */

const Corpus = {

  /** File extensions read as text. Everything else (PDF, Word, images) is skipped. */
  TEXT_EXTENSIONS: ['.txt', '.text', '.tsv', '.md'],

  /** Read a File as UTF-8, falling back to Windows-1252 for older files. */
  async readFileText(file) {
    const bytes = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    return text.replace(/^﻿/, '');
  },

  /** Should this file be read? Returns false for hidden files and non-text formats. */
  isTextFile(path) {
    if (path.split('/').some(part => part.startsWith('.'))) { return false; }
    const lower = path.toLowerCase();
    return Corpus.TEXT_EXTENSIONS.some(ext => lower.endsWith(ext));
  },

  /**
   * True if most lines look like "id <tab> label <tab> text", the format
   * used by earlier versions of this page and by MALLET.
   */
  isLineFormat(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) { return false; }
    const tabbed = lines.filter(line => line.split('\t').length >= 3).length;
    return tabbed / lines.length >= 0.9;
  },

  /** Documents from a file in "id <tab> label <tab> text" format, one per line. */
  parseLines(text) {
    const docs = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') { continue; }
      const fields = line.split('\t');
      if (fields.length >= 3) {
        docs.push({ id: fields[0], label: fields[1], text: fields.slice(2).join(' ') });
      } else {
        docs.push({ id: String(docs.length), label: '', text: line });
      }
    }
    return docs;
  },

  /** Number of whitespace-separated words. */
  wordCount(text) {
    const m = text.match(/\S+/g);
    return m ? m.length : 0;
  },

  /**
   * Split a text into passages of at most about maxWords words, breaking
   * between paragraphs where possible. Paragraphs longer than maxWords are
   * split between words.
   */
  splitPassages(text, maxWords) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p !== '');
    const passages = [];
    let current = [];
    let currentWords = 0;

    const flush = () => {
      if (current.length > 0) { passages.push(current.join('\n\n')); }
      current = [];
      currentWords = 0;
    };

    for (const paragraph of paragraphs) {
      const n = Corpus.wordCount(paragraph);
      if (n > maxWords) {
        flush();
        const words = paragraph.split(/\s+/);
        for (let i = 0; i < words.length; i += maxWords) {
          passages.push(words.slice(i, i + maxWords).join(' '));
        }
      } else {
        if (currentWords + n > maxWords) { flush(); }
        current.push(paragraph);
        currentWords += n;
      }
    }
    flush();
    return passages;
  },

  /** "moby-dick.txt", 3 -> "moby-dick-3.txt" */
  passageName(name, number) {
    const dot = name.lastIndexOf('.');
    const slash = name.lastIndexOf('/');
    return dot > slash + 1
      ? name.slice(0, dot) + '-' + number + name.slice(dot)
      : name + '-' + number;
  },

  /**
   * Build documents from files.
   * @param {Array<{name: string, text: string}>} files
   * @param {number} passageWords split texts longer than this; 0 keeps them whole
   * @returns {{docs: Array<{id, label, text}>, format: 'lines'|'files'}}
   */
  documentsFromFiles(files, passageWords) {
    if (files.length === 1 && Corpus.isLineFormat(files[0].text)) {
      return { docs: Corpus.parseLines(files[0].text), format: 'lines' };
    }

    const docs = [];
    for (const file of files) {
      // Files in subfolders ("fiction/moby-dick.txt") are labeled with the subfolder.
      const slash = file.name.indexOf('/');
      const label = slash > 0 ? file.name.slice(0, slash) : '';
      const passages = passageWords > 0 ? Corpus.splitPassages(file.text, passageWords) : [file.text.trim()];
      if (passages.length === 1) {
        docs.push({ id: file.name, label, text: passages[0] });
      } else {
        passages.forEach((text, i) => {
          docs.push({ id: Corpus.passageName(file.name, i + 1), label, text });
        });
      }
    }
    return { docs: docs.filter(d => d.text !== ''), format: 'files' };
  },

  /**
   * How document labels should be plotted:
   *   {kind: 'dates', toNumber}  labels are years or dates: a time line
   *   {kind: 'categories'}       a manageable set of categories: bar charts
   *   null                       no labels, all the same, or nearly one per document
   */
  labelKind(labels) {
    const unique = new Set(labels.filter(l => l !== ''));
    if (unique.size < 2) { return null; }
    const toNumber = Corpus.dateScale(labels);
    if (toNumber) { return { kind: 'dates', toNumber }; }
    if (unique.size > 50 && unique.size > labels.length / 2) { return null; }
    return { kind: 'categories' };
  },

  /**
   * If nearly every label is a year or a date, return a function mapping a
   * label to a number for plotting; otherwise return null, since plotting
   * arbitrary labels as a time line suggests a chronology that isn't there.
   */
  dateScale(labels) {
    const unique = [...new Set(labels.filter(l => l !== ''))];
    if (unique.length < 3) { return null; }
    const toNumber = label => {
      const s = label.trim();
      if (/^-?\d{1,4}$/.test(s)) { return Number(s); }
      if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return y + (m - 1) / 12 + ((d || 1) - 1) / 365;
      }
      return NaN;
    };
    const parsed = unique.filter(l => Number.isFinite(toNumber(l))).length;
    return parsed / unique.length >= 0.9 ? toNumber : null;
  },
};

if (typeof module !== 'undefined') {
  module.exports = { Corpus };
}
