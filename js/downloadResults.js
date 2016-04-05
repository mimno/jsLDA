 /* Functions for download links */
  function saveDocTopics() {

    var target = document.getElementById('dl-page'); // 2016-03-27 OD: start progress spinner on the downloads page
    var spinner = new Spinner(opts).spin(target);
    var docTopicsCSV = "";
    var topicProbabilities = zeros(numTopics);

    documents.forEach(function(d, i) {
      docTopicsCSV += d.id + "," + d.topicCounts.map(function(x) {
        return d3.round(x / d.tokens.length, 8);
      }).join(",") + "\n";
    });

    d3.select("#doctopics-dl").attr("href",
      "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(
        docTopicsCSV));

    spinner.stop(); // 2016-03-27 OD: stop spinner after processing
  }

  function saveTopicWords() {
    var topicWordsCSV = "word," + d3.range(0, numTopics).map(function(t) {
      return "topic" + t;
    }).join(",") + "\n";
    for (var word in wordTopicCounts) {
      var topicProbabilities = zeros(numTopics);
      for (var topic in wordTopicCounts[word]) {
        topicProbabilities[topic] = d3.round(wordTopicCounts[word][topic] /
          tokensPerTopic[topic], 8);
      }
      topicWordsCSV += word + "," + topicProbabilities.join(",") + "\n";
    }

    d3.select("#topicwords-dl").attr("href",
      "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(
        topicWordsCSV));
  }
  // 2016-03-27 Renamed export file to match function
  function saveTopicKeys() {
    var topicKeysCSV = "Topic,TokenCount,Words\n";

    if (topicWordCounts.length == 0) {
      sortTopicWords();
    }

    for (var topic = 0; topic < numTopics; topic++) {
      topicKeysCSV += topic + "," + tokensPerTopic[topic] + ",\"" + topNWords(
        topicWordCounts[topic], 10) + "\"\n";
    }
    // 2016-03-28 OD: Use download.js
    var data = topicKeysCSV;
    var strFileName = 'TopicKeys.csv';
    var strMimeType = 'text/csv';

    download(data, strFileName, strMimeType);
    //	d3.select("#keys-dl").attr("href", "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(topicKeysCSV));
  }

  function saveTopicPMI() {
    var topicPMICSV = "";
    var matrix = getTopicCorrelations();

    matrix.forEach(function(row) {
      topicPMICSV += row.map(function(x) {
        return d3.round(x, 8);
      }).join(",") + "\n";
    });

    d3.select("#topictopic-dl").attr("href",
      "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(
        topicPMICSV));
  }

  function saveGraph() {
    var graphCSV = "Source,Target,Weight,Type\n";
    var topicProbabilities = zeros(numTopics);

    documents.forEach(function(d, i) {
      d.topicCounts.forEach(function(x, topic) {
        if (x > 0.0) {
          graphCSV += d.id + "," + topic + "," + d3.round(x / d.tokens.length,
            8) + ",undirected\n";
        }
      });
    });

    d3.select("#graph-dl").attr("href",
      "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(
        graphCSV));
  }
  // 2016-03-27 Renamed from "saveState"  and renamed export file to samplingStateCSV
  function saveSamplingState() {
    var samplingStateCSV = "DocID,Word,Topic";
    documents.forEach(function(d, docID) {
      d.tokens.forEach(function(token, position) {
        samplingStateCSV += docID + ",\"" + token.word + "\"," + token.topic +
          "\n";
      });
    });

    d3.select("#state-dl").attr("href",
      "data:Content-type:text/csv;charset=UTF-8," + encodeURIComponent(
        samplingStateCSV));
  }
