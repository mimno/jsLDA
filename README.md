Topic Modeling in Your Browser (jsLDA)
======================================

Topic modeling that runs entirely in a web browser: nothing to install, and
your texts never leave your computer. Try it at
[mimno.infosci.cornell.edu/jsLDA](http://mimno.infosci.cornell.edu/jsLDA/).

Using it
--------

1. **Choose your texts.** Open a folder of plain-text (`.txt`) files, or a
   single file with one document per line (see below). Or try the example
   collection of State of the Union addresses.
2. **Find topics.** Training starts automatically and runs in the background.
   Watch the topics sharpen, then click **Train more** if they are still
   changing.
3. **Explore.** Click a topic to rank documents by it. The other tabs show
   which topics appear together, the vocabulary (where you can remove
   unhelpful words), topics by metadata (for labeled documents), and
   spreadsheets you can save.

Long texts are split into passages of about 500 words, named
`moby-dick-1.txt`, `moby-dick-2.txt`, and so on, because topic models work
best on passages of a paragraph or a few pages. Change or turn this off under
**Options**.

### One document per line

A single file where each line is

    [doc ID] [tab] [label] [tab] [text...]

is read as one document per line (this is MALLET's format).

### Metadata

Documents can carry a label: the second column of a one-document-per-line
file, or the subfolder a file is in (`fiction/moby-dick.txt` is labeled
`fiction`). With labels, the **By metadata** tab compares topics across them:
as a time line if the labels are years or dates such as `1914` or
`2020-03-15`, and otherwise as bar charts, one per topic.

### Stopwords

Common English words are removed by default. Under **Options** you can choose
your own list (one word per line). Words of two letters or fewer are always
ignored.

Running your own copy
---------------------

Copy this folder to any web server, or open `index.html` directly from your
disk. (Opened from disk, everything works except loading the built-in
example.) There is no build step.

| File | Contents |
|------|----------|
| `index.html`, `jslda.css` | The page |
| `jslda.js` | Page behavior and visualizations |
| `lda-model.js` | The topic model (Gibbs sampling), run in a Web Worker |
| `corpus.js` | Reading files and splitting texts into passages |
| `stopwords-en.js` | MALLET's English stoplist |
| `documents.txt`, `stoplist.txt` | The example collection |
| `vendor/d3.v7.min.js` | [D3](https://d3js.org) for charts |

Run the tests with Node 18 or later:

    npm test

Saving results
--------------

The **Save results** tab creates CSV files in the browser: document-topic
proportions, topic summaries, topic-word probabilities, topic correlations,
a document-topic edge list for network tools such as Gephi, and the full
sampling state.

Topic correlations are pointwise mutual information scores: whether two
topics occur in the same documents more often than expected by chance.
