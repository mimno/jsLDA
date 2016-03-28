// 2016-03-07 OD: Moved from HTML file
var parseLine = function(line) {
  if (line == "") {
    return;
  }
  var docID = documents.length;
  var docDate = "";
  var fields = line.split("\t");
  var text = fields[1]; // 2016-03-04 OD: changed to use second field
  if (fields.length == 3) { // If it's in [ID]\t[TAG]\t[TEXT] format...
    docID = fields[0];
    docDate = +fields[1]; // interpret as a number
    text = fields[2];
  }

  var tokens = [];
  var rawTokens = text.toLowerCase().match(wordPattern);
  if (rawTokens == null) {
    return;
  }
  var topicCounts = zeros(numTopics);

  rawTokens.forEach(function(word) {
    if (word !== "" && !stopwords[word] && word.length > 2) {
      var topic = Math.floor(Math.random() * numTopics);
      tokensPerTopic[topic]++;
      if (!wordTopicCounts[word]) {
        wordTopicCounts[word] = {};
        vocabularySize++;
        vocabularyCounts[word] = 0;
      }
      if (!wordTopicCounts[word][topic]) {
        wordTopicCounts[word][topic] = 0;
      }
      wordTopicCounts[word][topic] += 1;
      vocabularyCounts[word] += 1;
      topicCounts[topic] += 1;
      tokens.push({
        "word": word,
        "topic": topic
      });
    }
  });

  documents.push({
    "originalOrder": documents.length,
    "id": docID,
    "date": docDate,
    "originalText": text,
    "tokens": tokens,
    "topicCounts": topicCounts
  });
  d3.select("div#docs-page").append("div")
    .attr("class", "document")
    .text("[" + docID + "] " + truncate(text));
};
