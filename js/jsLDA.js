function start() {

  /** This function is copied from stack overflow: http://stackoverflow.com/users/19068/quentin */
  var QueryString = function() {
    // This function is anonymous, is executed immediately and
    // the return value is assigned to QueryString!
    var query_string = {};
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split("=");
      // If first entry with this name
      if (typeof query_string[pair[0]] === "undefined") {
        query_string[pair[0]] = pair[1];
        // If second entry with this name
      } else if (typeof query_string[pair[0]] === "string") {
        var arr = [query_string[pair[0]], pair[1]];
        query_string[pair[0]] = arr;
        // If third or later entry with this name
      } else {
        query_string[pair[0]].push(pair[1]);
      }
    }
    return query_string;
  }();

  // - 2016-03-27 OD: Spinner Options
  var opts = {
    lines: 12 // The number of lines to draw
      ,
    length: 10 // The length of each line
      ,
    width: 5 // The line thickness
      ,
    radius: 10 // The radius of the inner circle
      ,
    scale: 2.0 // Scales overall size of the spinner
      ,
    corners: 1 // Roundness (0..1)
      ,
    color: '#19A3D1' // #rgb or #rrggbb (#19A3D1 is a shade of blue)
      ,
    opacity: 1 / 4 // Opacity of the lines
      ,
    rotate: 0 // Rotation offset
      ,
    direction: 1 // 1: clockwise, -1: counterclockwise
      ,
    speed: 1 // Rounds per second
      ,
    trail: 100 // Afterglow percentage
      ,
    fps: 20 // Frames per second when using setTimeout()
      ,
    zIndex: 2e9 // Use a high z-index by default
      ,
    className: 'spinner' // CSS class to assign to the element
      ,
    top: '50%' // center vertically
      ,
    left: '50%' // center horizontally
      ,
    shadow: false // Whether to render a shadow
      ,
    hwaccel: false // Whether to use hardware acceleration (might be buggy)
      ,
    position: 'absolute' // Element positioning
  }
  var target = document.getElementById('docs-page')
  var spinner = new Spinner(opts).spin(target)
  var data_dir = "../data/"; //2016-03-30 OD
  // Change the strings at the end of these lines to reset the default filenames!
  // 2016-03-04 OD: changed to use NIFA projects
  var documentsURL = QueryString.docs ? QueryString.docs : data_dir +
    "projects.txt";
  var stopwordsURL = QueryString.stoplist ? QueryString.stoplist : data_dir +
    "stop_words.txt";

  documentsURL = decodeURIComponent(documentsURL);
  stopwordsURL = decodeURIComponent(stopwordsURL);

  var zeros = function(n) {
    var x = new Array(n);
    for (var i = 0; i < n; i++) {
      x[i] = 0.0;
    }
    return x;
  };

  var documentTopicSmoothing = 0.1;
  var topicWordSmoothing = 0.01;

  var vocabularySize = 0;

  var vocabularyCounts = {};

  // Constants for calculating topic correlation. A doc with 5% or more tokens in a topic is "about" that topic.
  var correlationMinTokens = 2;
  var correlationMinProportion = 0.05;

  var numTopics = QueryString.topics ? parseInt(QueryString.topics) : 25;
  if (isNaN(numTopics)) {
    alert("The requested number of topics [" + QueryString.topics +
      "] couldn't be interpreted as a number");
    numTopics = 25;
  }

  d3.select("#docs-url-input").attr("value", documentsURL);
  d3.select("#stops-url-input").attr("value", stopwordsURL);
  d3.select("#num-topics-input").attr("value", numTopics);

  var stopwords = {};
  // Use a more agressive smoothing parameter to sort
  //  documents by topic. This has the effect of preferring
  //  longer documents.
  var docSortSmoothing = 10.0;
  var sumDocSortSmoothing = docSortSmoothing * numTopics;

  var completeSweeps = 0;
  var requestedSweeps = 0;

  var selectedTopic = -1;

  var wordTopicCounts = {};
  var topicWordCounts = [];
  var tokensPerTopic = [];
  tokensPerTopic.length = numTopics;
  for (var topic = 0; topic < numTopics; topic++) {
    tokensPerTopic[topic] = 0;
  }

  var topicWeights = [];
  topicWeights.length = numTopics;

  var documents = [];

  /* SVG functions */
  var w = 650,
    h = 650,
    fill = d3.scale.category20();

  var vis = d3.select("#corr-page")
    .append("svg:svg")
    .attr("width", w)
    .attr("height", h);

  var linkDistance = 150;
  var correlationCutoff = 0.25;

  var truncate = function(s) {
    return s.length > 300 ? s.substring(0, 299) + "..." : s;
  }

  var wordPattern = XRegExp("\\p{L}[\\p{L}\\p{P}]*\\p{L}", "g");


  var parseLine = function(line) {
    if (line == "") {
      return;
    }
    var docID = documents.length;
    var docDate = "";
    var fields = line.split("\t");
    var text = [fields[1], fields[2], fields[3]]
    var text = text.join(" "); // 2016-03-04 OD: changed to use second field
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

  var sampleDiscrete = function(weights) {
    var sample = d3.sum(weights) * Math.random();
    var i = 0;
    sample -= weights[i];
    while (sample > 0.0) {
      i++;
      sample -= weights[i];
    }
    return i;
  }

  var sweep = function() {
    documents.forEach(function(currentDoc, i) {
      var docTopicCounts = currentDoc.topicCounts;
      for (var position = 0; position < currentDoc.tokens.length; position++) {
        var token = currentDoc.tokens[position];
        tokensPerTopic[token.topic]--;
        var currentWordTopicCounts = wordTopicCounts[token.word];
        currentWordTopicCounts[token.topic]--;
        docTopicCounts[token.topic]--;

        for (var topic = 0; topic < numTopics; topic++) {
          if (currentWordTopicCounts[topic]) {
            topicWeights[topic] =
              (documentTopicSmoothing + docTopicCounts[topic]) *
              (topicWordSmoothing + currentWordTopicCounts[topic]) /
              (vocabularySize * topicWordSmoothing + tokensPerTopic[topic]);
          } else {
            topicWeights[topic] =
              (documentTopicSmoothing + docTopicCounts[topic]) *
              topicWordSmoothing /
              (vocabularySize * topicWordSmoothing + tokensPerTopic[topic]);
          }
        }

        token.topic = sampleDiscrete(topicWeights);
        tokensPerTopic[token.topic]++;
        if (!currentWordTopicCounts[token.topic]) {
          currentWordTopicCounts[token.topic] = 1;
        } else {
          currentWordTopicCounts[token.topic] += 1;
        }
        docTopicCounts[token.topic]++;
      }
    });

    completeSweeps += 1;
    d3.select("#iters").text(completeSweeps);
    if (completeSweeps >= requestedSweeps) {
      reorderDocuments();
      sortTopicWords();
      displayTopicWords();
      //plotGraph();
      plotMatrix();
      updateVocabTable();
      return true;
    } else {
      return false;
    }
  }

  var byCountDescending = function(a, b) {
    return b.count - a.count;
  };
  var topNWords = function(wordCounts, n) {
    return wordCounts.slice(0, n).map(function(d) {
      return d.word;
    }).join(" ");
  };

  var sortTopicWords = function() {
    topicWordCounts = [];
    for (var topic = 0; topic < numTopics; topic++) {
      topicWordCounts[topic] = [];
    }

    for (var word in wordTopicCounts) {
      for (var topic in wordTopicCounts[word]) {
        topicWordCounts[topic].push({
          "word": word,
          "count": wordTopicCounts[word][topic]
        });
      }
    }

    for (var topic = 0; topic < numTopics; topic++) {
      topicWordCounts[topic].sort(byCountDescending);
    }
  };

  var displayTopicWords = function() {
    var topicTopWords = [];

    for (var topic = 0; topic < numTopics; topic++) {
      topicTopWords.push(topNWords(topicWordCounts[topic], 10));
    }

    var topicLines = d3.select("div#topics").selectAll("div.topicwords")
      .data(topicTopWords);

    topicLines
      .enter().append("div")
      .attr("class", "topicwords")
      .on("click", function(d, i) {
        toggleTopicDocuments(i);
      });

    topicLines.transition().text(function(d, i) {
      return "[" + i + "] " + d;
    });

    return topicWordCounts;
  };

  var reorderDocuments = function() {
    var format = d3.format(".2g");

    if (selectedTopic === -1) {
      documents.sort(function(a, b) {
        return d3.ascending(a.originalOrder, b.originalOrder);
      });
      d3.selectAll("div.document").data(documents)
        .style("display", "block")
        .text(function(d) {
          return "[" + d.id + "] " + truncate(d.originalText);
        });
    } else {
      var scores = documents.map(function(doc, i) {
        return {
          docID: i,
          score: (doc.topicCounts[selectedTopic] + docSortSmoothing) / (
            doc.tokens.length + sumDocSortSmoothing)
        };
      });
      scores.sort(function(a, b) {
        return b.score - a.score;
      });
      /*documents.sort(function(a, b) {
          var score1 = (a.topicCounts[selectedTopic] + docSortSmoothing) / (a.tokens.length + sumDocSortSmoothing);
          var score2 = (b.topicCounts[selectedTopic] + docSortSmoothing) / (b.tokens.length + sumDocSortSmoothing);
          return d3.descending(score1, score2);
      }); */
      d3.selectAll("div.document").data(scores)
        .style("display", function(d) {
          return documents[d.docID].topicCounts[selectedTopic] > 0 ?
            "block" : "none";
        })
        .text(function(d) {
          return "[" + documents[d.docID].id + "/" + format(d.score * 100) +
            "%] " + truncate(documents[d.docID].originalText);
        });
    }
  }

  /* This function will compute pairwise correlations between topics.
   * Unlike the correlated topic model (CTM) LDA doesn't have parameters
   * that represent topic correlations. But that doesn't mean that topics are
   * not correlated, it just means we have to estimate those values by
   * measuring which topics appear in documents together.
   */
  var getTopicCorrelations = function() {

    // initialize the matrix
    correlationMatrix = new Array(numTopics);
    for (var t1 = 0; t1 < numTopics; t1++) {
      correlationMatrix[t1] = zeros(numTopics);
    }

    var topicProbabilities = zeros(numTopics);

    // iterate once to get mean log topic proportions
    documents.forEach(function(d, i) {

      // We want to find the subset of topics that occur with non-trivial concentration in this document.
      // Only consider topics with at least the minimum number of tokens that are at least 5% of the doc.
      var documentTopics = new Array();
      var tokenCutoff = Math.max(correlationMinTokens,
        correlationMinProportion * d.tokens.length);

      for (var topic = 0; topic < numTopics; topic++) {
        if (d.topicCounts[topic] >= tokenCutoff) {
          documentTopics.push(topic);
          topicProbabilities[topic]++; // Count the number of docs with this topic
        }
      }

      // Look at all pairs of topics that occur in the document.
      for (var i = 0; i < documentTopics.length - 1; i++) {
        for (var j = i + 1; j < documentTopics.length; j++) {
          correlationMatrix[documentTopics[i]][documentTopics[j]]++;
          correlationMatrix[documentTopics[j]][documentTopics[i]]++;
        }
      }
    });
    for (var t1 = 0; t1 < numTopics - 1; t1++) {
      for (var t2 = t1 + 1; t2 < numTopics; t2++) {
        correlationMatrix[t1][t2] = Math.log((documents.length *
            correlationMatrix[t1][t2]) /
          (topicProbabilities[t1] * topicProbabilities[t2]));
        correlationMatrix[t2][t1] = Math.log((documents.length *
            correlationMatrix[t2][t1]) /
          (topicProbabilities[t1] * topicProbabilities[t2]));
      }
    }

    return correlationMatrix;
  }; // end of getTopicCorrelations

  var getCorrelationGraph = function(correlationMatrix, cutoff) {
    var graph = {
      "nodes": [],
      "links": []
    };
    for (var topic = 0; topic < numTopics; topic++) {
      graph.nodes.push({
        "name": topic,
        "group": 1,
        "words": topNWords(topicWordCounts[topic], 3)
      });
    }
    for (var t1 = 0; t1 < numTopics; t1++) {
      for (var t2 = 0; t2 < numTopics; t2++) {
        if (t1 !== t2 && correlationMatrix[t1][t2] > cutoff) {
          graph.links.push({
            "source": t1,
            "target": t2,
            "value": correlationMatrix[t1][t2]
          });
        }
      }
    }
    return graph;
  }; // end of getCorrelationGraph

  var plotMatrix = function() {
    var left = 50;
    var right = 500;
    var top = 50;
    var bottom = 500;

    var correlationMatrix = getTopicCorrelations();
    var correlationGraph = getCorrelationGraph(correlationMatrix, -100.0);

    var topicScale = d3.scale.ordinal().domain(d3.range(numTopics)).rangePoints(
      [left, right]);
    var radiusScale = d3.scale.sqrt().domain([0, 1.0]).range([0, 450 / (2 *
      numTopics)]);

    var horizontalTopics = vis.selectAll("text.hor").data(correlationGraph.nodes);
    horizontalTopics.enter().append("text")
      .attr("class", "hor")
      .attr("x", right + 10)
      .attr("y", function(node) {
        return topicScale(node.name);
      });

    horizontalTopics
      .text(function(node) {
        return node.words;
      });

    var verticalTopics = vis.selectAll("text.ver").data(correlationGraph.nodes);
    verticalTopics.enter().append("text")
      .attr("class", "ver")
      .attr("x", function(node) {
        return topicScale(node.name);
      })
      .attr("y", bottom + 10)
      .attr("transform", function(node) {
        return "rotate(90," + topicScale(node.name) + "," + (bottom + 10) +
          ")";
      });

    verticalTopics
      .text(function(node) {
        return node.words;
      });

    var circles = vis.selectAll("circle").data(correlationGraph.links);
    circles.enter().append("circle");

    circles.attr("cx", function(link) {
        return topicScale(link.source);
      })
      .attr("cy", function(link) {
        return topicScale(link.target);
      })
      .attr("r", function(link) {
        return radiusScale(Math.abs(link.value));
      })
      .style("fill", function(link) {
        return link.value > 0.0 ? "#88f" : "#f88";
      })
      .on("mouseover", function(link) {
        var tooltip = d3.select("#tooltip");
        tooltip.style("visibility", "visible")
          .style("top", (event.pageY - 10) + "px").style("left", (event.pageX +
            20) + "px")
          .text(correlationGraph.nodes[link.target].words + " / " +
            correlationGraph.nodes[link.source].words);
      })
      .on("mouseout", function() {
        var tooltip = d3.select("#tooltip");
        tooltip.style("visibility", "hidden");
      });
  }; // end of plotMatrix

  var toggleTopicDocuments = function(topic) {
    if (topic === selectedTopic) {
      // unselect the topic
      d3.selectAll("div.topicwords").attr("class", "topicwords");
      selectedTopic = -1;
    } else {
      d3.selectAll("div.topicwords").attr("class", function(d, i) {
        return i === topic ? "topicwords selected" : "topicwords";
      });
      selectedTopic = topic;
    }
    reorderDocuments();
  };

  var mostFrequentWords = function() {
    // Convert the random-access map to a list of word:count pairs that
    //  we can then sort.
    var wordCounts = [];
    for (var word in vocabularyCounts) {
      wordCounts.push({
        "word": word,
        "count": vocabularyCounts[word]
      });
    }

    wordCounts.sort(byCountDescending);
    return wordCounts;
  };

  var entropy = function(counts) {
    counts = counts.filter(function(x) {
      return x > 0.0;
    });
    var sum = d3.sum(counts);
    return Math.log(sum) - (1.0 / sum) * d3.sum(counts, function(x) {
      return x * Math.log(x);
    });
  }

  var vocabTable = function() {
    var format = d3.format(".2g");
    var wordFrequencies = mostFrequentWords().slice(0, 499);
    var rows = d3.select("#vocab-table tbody").selectAll("tr")
      .data(wordFrequencies)
      .enter().append("tr");
    var cells = rows.selectAll("td")
      .data(function(row) {
        return [{
          column: "word",
          value: row.word,
          class: ""
        }, {
          column: "count",
          value: row.count,
          class: "unselectable"
        }, {
          column: "entropy",
          value: format(1.0 - (entropy(d3.values(wordTopicCounts[row.word])) /
            Math.log(numTopics))),
          class: "unselectable"
        }];
      })
      .enter().append("td")
      .attr("class", function(d) {
        return d.class;
      })
      .text(function(d) {
        return d.value;
      });
  };

  var updateVocabTable = function() {
    var format = d3.format(".2g");
    var rows = d3.select("#vocab-table tbody").selectAll("tr");
    rows.selectAll("td")
      .data(function(row) {
        return [{
          column: "word",
          value: row.word,
          class: ""
        }, {
          column: "count",
          value: row.count,
          class: "unselectable"
        }, {
          column: "entropy",
          value: format(1.0 - (entropy(d3.values(wordTopicCounts[row.word])) /
            Math.log(numTopics))),
          class: "unselectable"
        }];
      })
      .text(function(d) {
        return d.value;
      });

  }

  /* Declare functions for various tabs and buttons */
  d3.select("#docs-tab").on("click", function() {
    d3.selectAll(".page").style("display", "none");
    d3.selectAll("ul li").attr("class", "");
    d3.select("#docs-page").style("display", "block");
    d3.select("#docs-tab").attr("class", "selected");
  });
  d3.select("#vocab-tab").on("click", function() {
    d3.selectAll(".page").style("display", "none");
    d3.selectAll("ul li").attr("class", "");
    d3.select("#vocab-page").style("display", "block");
    d3.select("#vocab-tab").attr("class", "selected");
  });
  d3.select("#corr-tab").on("click", function() {
    d3.selectAll(".page").style("display", "none");
    d3.selectAll("ul li").attr("class", "");
    d3.select("#corr-page").style("display", "block");
    d3.select("#corr-tab").attr("class", "selected");
  });
  d3.select("#dl-tab").on("click", function() {
    d3.selectAll(".page").style("display", "none");
    d3.selectAll("ul li").attr("class", "");
    d3.select("#dl-page").style("display", "block");
    d3.select("#dl-tab").attr("class", "selected");
  });
  d3.select("#sweep").on("click", function() {
    requestedSweeps += 50;
    d3.timer(sweep);
  });

  /* Functions for download links */
  function saveDocTopics() {
    debugger;
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



  queue()
    .defer(d3.text, stopwordsURL)
    .defer(d3.text, documentsURL)
    .await(ready);

  function ready(error, stops, lines) {


    if (error) {
      alert("One of these URLs didn't work:\n " + stopwordsURL + "\n " +
        documentsURL);
    } else {
      // Create the stoplist
      stops.split("\n").forEach(function(w) {
        stopwords[w] = 1;
      });

      // Load documents and populate the vocabulary
      //Excel tab delimited files are exported with carriage returns (\r) rather than the unix linefeeds (\n) at the end of each line.
      lines.split("\r").forEach(parseLine); // 2016-03-04 OD: changed from LF to CR

      sortTopicWords();
      displayTopicWords();
      toggleTopicDocuments(0);
      //plotGraph();
      plotMatrix();
      vocabTable();
      var target = document.getElementById('docs-page')
        // 2016-03-27 OD: stop spinner after processing
      spinner.stop();

    }
  }

}
