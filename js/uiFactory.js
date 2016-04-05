var ui = (function(){
  // 2016-04-04 ui is an IIFE function with UI-related methods/functions
  return {
   /* Declare functions for various tabs and buttons */
    setupPage: function (){
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

    /* SVG functions */
    var w = 650,
      h = 650,
      fill = d3.scale.category20();
    var linkDistance = 150;
    var correlationCutoff = 0.25;

    var vis = d3.select("#corr-page")
      .append("svg:svg")
      .attr("width", w)
      .attr("height", h);

    // 2016-04-03 OD: Moved from lda.js
    d3.select("div#docs-page").append("div")
      .attr("class", "document")
      .text("[" + docID + "] " + truncate(text));

     // 2016-04-03 OD: Put defaults in spin
    var target = document.getElementById('docs-page')
    var spinner = new Spinner().spin(target)
  },
  
  // 2016-04-04 Od: added lda object passed as parameter
  displayTopicWords: function(lda) {
    // access parameters from the lda object:
    numTopics=lda.numTopics;
    topicWordCounts = lda.topicWordCounts;
    selectedTopic = lda.selectedTopic;

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
        toggleTopicDocuments(selectedTopic,i,documents); //2016-04-04 OD: added parameters
      });

    topicLines.transition().text(function(d, i) {
      return "[" + i + "] " + d;
    });

    return topicWordCounts;
  },
 
  // 2016-04-04 OD: Added parameters from lda.js
  sortTopicWords: function(numTopics,wordTopicCounts) {
    
    numTopics=lda.numTopics;
    wordTopicCounts= lda.wordTopicCounts;
    

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
      topicWordCounts[topic].sort(ui.byCountDescending);
    }
  },

  //2016-04-03: This is really UI and not LDA logic
  reorderDocuments:  function(selectedTopic, documents) {
  	var format = d3.format(".2g");

    if (selectedTopic === -1) {
      documents.sort(function(a, b) { return d3.ascending(a.originalOrder, b.originalOrder); });
      d3.selectAll("div.document").data(documents)
        .style("display", "block")
        .text(function(d) { return "[" + d.id + "] " + truncate(d.originalText); });
    }
    else {
  	  var scores = documents.map(function (doc, i) {
  		  return {docID: i, score: (doc.topicCounts[selectedTopic] + docSortSmoothing) / (doc.tokens.length + sumDocSortSmoothing)};
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
        .style("display", function(d) { return documents[d.docID].topicCounts[selectedTopic] > 0 ? "block" : "none"; })
        .text(function(d) { return "[" + documents[d.docID].id + "/" + format(d.score * 100) + "%] " + truncate(documents[d.docID].originalText); });
     }
  },

  // 2016-04-04: Added parameters:
  plotMatrix: function(numTopics, documents) {
    var left = 50;
    var right = 500;
    var top = 50;
    var bottom = 500;

    var correlationMatrix = getTopicCorrelations(numTopics,documents); // 2016-04-04 added parameters
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
  },

 // 2016-04-04 OD: added parameters
 toggleTopicDocuments:  function(selectedTopic, topic. documents) {
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
    ui.reorderDocuments(selectedTopic,documents); //2016-04-04 OD: added parameters
  },


  vocabTable: function() {
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
  },

   
  updateVocabTable: function(numTopics,wordTopicCounts) {
    // 2016-04-04 OD: Added parameters
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
          value: format(1.0 - (entropy(d3.values(wordTopicCounts[row.word])) / Math.log(numTopics))),
          class: "unselectable"
        }];
      })
      .text(function(d) {
        return d.value;
      });
  },

	byCountDescending: function(a, b) {
		return b.count - a.count;
	},

	topNWords: function(wordCounts, n) {
		return wordCounts.slice(0, n).map(function(d) {
			return d.word;
		}).join(" ");
	},
   
  getTopicCorrelations: function(numTopics, correlationMinTokens, correlationMinProportion,tokenCutoff, documents) {
    // 2016-04-04 OD: Added the 5 parameters called from lda.js

    /* Mimno: This function will compute pairwise correlations between topics.
     * Unlike the correlated topic model (CTM) LDA doesn't have parameters
     * that represent topic correlations. But that doesn't mean that topics are
     * not correlated, it just means we have to estimate those values by
     * measuring which topics appear in documents together.
     */
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
  }, // end of getTopicCorrelations

  // 2016-04-04 OD: Moved getCorrelationGraph to ui.js

  getCorrelationGraph: function(correlationMatrix, correlationCutoff ) {
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
    
 }; //end of defining functions
}()); // end of ui IIEF
