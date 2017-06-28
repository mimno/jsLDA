
/** This function is copied from stack overflow: http://stackoverflow.com/users/19068/quentin */
var QueryString = function () {
  // This function is anonymous, is executed immediately and
  // the return value is assigned to QueryString!
  var query_string = {};
  var query = window.location.search.substring(1);
  var vars = query.split("&");
  for (var i=0;i<vars.length;i++) {
    var pair = vars[i].split("=");
    // If first entry with this name
    if (typeof query_string[pair[0]] === "undefined") {
      query_string[pair[0]] = pair[1];
    // If second entry with this name
    } else if (typeof query_string[pair[0]] === "string") {
      var arr = [ query_string[pair[0]], pair[1] ];
      query_string[pair[0]] = arr;
    // If third or later entry with this name
    } else {
      query_string[pair[0]].push(pair[1]);
    }
  }
    return query_string;
} ();

// Change the strings at the end of these lines to reset the default filenames!

var documentsURL = "documents.txt";
var stopwordsURL = "stoplist.txt";

var documentsFileArray = [];
function onDocumentFileChange(input) {
  documentsFileArray = input.files;
}
var stoplistFileArray = [];
function onStopwordFileChange(input) {
  stoplistFileArray = input.files;
}

function zeros(n) {
  var x = new Array(n);
  for (var i = 0; i < n; i++) { x[i] = 0.0; }
  return x;
}

//
// Topic model parameters
//

var documentTopicSmoothing = 0.1;
var topicWordSmoothing = 0.01;
var numTopics = QueryString.topics ? parseInt(QueryString.topics) : 25;
if (isNaN(numTopics)) {
  alert("The requested number of topics [" + QueryString.topics + "] couldn't be interpreted as a number");
  numTopics = 25;
}

//
// Vocabulary statistics
//

var vocabularySize = 0;
var vocabularyCounts = {};
var displayingStopwords = false;
var sortVocabByTopic = false;
var specificityScale = d3.scaleLinear().domain([0,1]).range(["#ffffff", "#99d8c9"]);

// Constants for calculating topic correlation. A doc with 5% or more tokens in a topic is "about" that topic.
var correlationMinTokens = 2;
var correlationMinProportion = 0.05;

// Constants for metadata correlation views.
var timeSeriesWidth = 500;
var timeSeriesHeight = 75;

d3.select("#num-topics-input").attr("value", numTopics);

var stopwords = {};
//  ["the", "and", "of", "for", "in", "a", "on", "is", "an", "this", "to", "by", "abstract", "paper", "based", "with", "or", "are", "from", "upon", "we", "us", "our", "can", "be", "using", "which", "that", "d", "n", "as", "it", "show", "these", "such", "s", "t", "i", "j", "have", "one", "new", "one", "has", "learning", "model", "data", "models", "two", "used", "results"].forEach( function(d) { stopwords[d] = 1; } );

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
var timer;
var eightDigits = d3.format(".8")

function reset() {
	vocabularySize = 0;
	vocabularyCounts = {};
	displayingStopwords = false;
	sortVocabByTopic = false;
	specificityScale = d3.scaleLinear().domain([0,1]).range(["#ffffff", "#99d8c9"]);

	d3.select("#num-topics-input").property("value", numTopics);

	stopwords = {};

	completeSweeps = 0;
	requestedSweeps = 0;

	selectedTopic = -1;

	wordTopicCounts = {};
	topicWordCounts = [];
	tokensPerTopic = [];
	tokensPerTopic.length = numTopics;
	for (var topic = 0; topic < numTopics; topic++) {
	  tokensPerTopic[topic] = 0;
	}

	topicWeights = [];
	topicWeights.length = numTopics;
	
	documents = [];
}

/* SVG functions */
var w = 650,
    h = 650;

var vis = d3.select("#corr-page")
    .append("svg:svg")
      .attr("width", w)
      .attr("height", h);

var truncate = function(s) { return s.length > 300 ? s.substring(0, 299) + "..." : s; }

var wordPattern = XRegExp("\\p{L}[\\p{L}\\p{P}]*\\p{L}", "g");

function parseLine ( line ) {
  if (line == "") { return; }
  var docID = documents.length;
  var docDate = "";
  var fields = line.split("\t");
  var text = fields[0];  // Assume there's just one field, the text
  if (fields.length == 3) {  // If it's in [ID]\t[TAG]\t[TEXT] format...
    docID = fields[0];
    docDate = fields[1]; // do not interpret date as anything but a string
    text = fields[2];
  }

  var tokens = [];
  var rawTokens = text.toLowerCase().match(wordPattern);
  if (rawTokens == null) { return; }
  var topicCounts = zeros(numTopics);

  rawTokens.forEach(function (word) {
    if (word !== "") {
      var topic = Math.floor(Math.random() * numTopics);

	  if (word.length <= 2) { stopwords[word] = 1; }

	  var isStopword = stopwords[word];
	  if (isStopword) {
		  // Record counts for stopwords, but nothing else
		  if (! vocabularyCounts[word]) {
			  vocabularyCounts[word] = 1;
		  }
		  else {
		  	vocabularyCounts[word] += 1;
		  }
	  }
	  else {
	      tokensPerTopic[topic]++;
	      if (! wordTopicCounts[word]) {
	        wordTopicCounts[word] = {};
	        vocabularySize++;
	        vocabularyCounts[word] = 0;
	      }
	      if (! wordTopicCounts[word][topic]) {
	        wordTopicCounts[word][topic] = 0;
	      }
	      wordTopicCounts[word][topic] += 1;
	      vocabularyCounts[word] += 1;
	      topicCounts[topic] += 1;
      }
      tokens.push({"word":word, "topic":topic, "isStopword":isStopword });
    }
  });

  documents.push({ "originalOrder" : documents.length, "id" : docID, "date" : docDate, "originalText" : text, "tokens" : tokens, "topicCounts" : topicCounts});
  d3.select("div#docs-page").append("div")
     .attr("class", "document")
     .text("[" + docID + "] " + truncate(text));
}

function addStop(word) {
	stopwords[word] = 1;
	vocabularySize--;
	delete wordTopicCounts[word];

    documents.forEach( function( currentDoc, i ) {
		var docTopicCounts = currentDoc.topicCounts;
		for (var position = 0; position < currentDoc.tokens.length; position++) {
			var token = currentDoc.tokens[position];
			if (token.word === word) {
				token.isStopword = true;
				tokensPerTopic[ token.topic ]--;
				docTopicCounts[ token.topic ]--;
			}
		}
	});

	sortTopicWords();
	displayTopicWords();
	reorderDocuments();
	vocabTable();
}

function removeStop(word) {
	delete stopwords[word];
	vocabularySize++;
	wordTopicCounts[word] = {};
	var currentWordTopicCounts = wordTopicCounts[ word ];

    documents.forEach( function( currentDoc, i ) {
		var docTopicCounts = currentDoc.topicCounts;
		for (var position = 0; position < currentDoc.tokens.length; position++) {
			var token = currentDoc.tokens[position];
			if (token.word === word) {
				token.isStopword = false;
				tokensPerTopic[ token.topic ]++;
				docTopicCounts[ token.topic ]++;
				if (! currentWordTopicCounts[ token.topic ]) {
					currentWordTopicCounts[ token.topic ] = 1;
				}
				else {
					currentWordTopicCounts[ token.topic ] += 1;
				}
			}
		}
	});

	sortTopicWords();
	displayTopicWords();
	reorderDocuments();
	vocabTable();
}

function sweep() {
	var startTime = Date.now();

	var topicNormalizers = zeros(numTopics);
	for (var topic = 0; topic < numTopics; topic++) {
		topicNormalizers[topic] = 1.0 / (vocabularySize * topicWordSmoothing + tokensPerTopic[topic]);
	}

	for (var doc = 0; doc < documents.length; doc++) {
		var currentDoc = documents[doc];
		var docTopicCounts = currentDoc.topicCounts;

		for (var position = 0; position < currentDoc.tokens.length; position++) {
			var token = currentDoc.tokens[position];
			if (token.isStopword) { continue; }

			tokensPerTopic[ token.topic ]--;
			var currentWordTopicCounts = wordTopicCounts[ token.word ];
			currentWordTopicCounts[ token.topic ]--;
			if (currentWordTopicCounts[ token.topic ] == 0) {
			  //delete(currentWordTopicCounts[ token.topic ]);
			}
			docTopicCounts[ token.topic ]--;
			topicNormalizers[ token.topic ] = 1.0 / (vocabularySize * topicWordSmoothing + tokensPerTopic[ token.topic ]);

			var sum = 0.0;
			for (var topic = 0; topic < numTopics; topic++) {
				if (currentWordTopicCounts[ topic ]) {
				  topicWeights[topic] =
				    (documentTopicSmoothing + docTopicCounts[topic]) *
				    (topicWordSmoothing + currentWordTopicCounts[ topic ]) *
					topicNormalizers[topic];
				}
				else {
				  topicWeights[topic] =
				    (documentTopicSmoothing + docTopicCounts[topic]) *
					topicWordSmoothing *
					topicNormalizers[topic];
				}
				sum += topicWeights[topic];
			}

			// Sample from an unnormalized discrete distribution
			var sample = sum * Math.random();
		    var i = 0;
		    sample -= topicWeights[i];
		    while (sample > 0.0) {
		      i++;
		      sample -= topicWeights[i];
		 	}
			token.topic = i;

			tokensPerTopic[ token.topic ]++;
			if (! currentWordTopicCounts[ token.topic ]) {
				currentWordTopicCounts[ token.topic ] = 1;
			}
			else {
				currentWordTopicCounts[ token.topic ] += 1;
			}
			docTopicCounts[ token.topic ]++;

			topicNormalizers[ token.topic ] = 1.0 / (vocabularySize * topicWordSmoothing + tokensPerTopic[ token.topic ]);
		}
	}

	//console.log("sweep in " + (Date.now() - startTime) + " ms");
	completeSweeps += 1;
	d3.select("#iters").text(completeSweeps);
	if (completeSweeps >= requestedSweeps) {
	  reorderDocuments();
	  sortTopicWords();
	  displayTopicWords();
	  plotMatrix();
	  vocabTable();
	  timeSeries();
	  timer.stop();
	}
}

var byCountDescending = function (a,b) { return b.count - a.count; };
var topNWords = function(wordCounts, n) { return wordCounts.slice(0,n).map( function(d) { return d.word; }).join(" "); };

function sortTopicWords() {
  topicWordCounts = [];
  for (var topic = 0; topic < numTopics; topic++) {
    topicWordCounts[topic] = [];
  }

  for (var word in wordTopicCounts) {
    for (var topic in wordTopicCounts[word]) {
      topicWordCounts[topic].push({"word":word, "count":wordTopicCounts[word][topic]});
    }
  }

  for (var topic = 0; topic < numTopics; topic++) {
    topicWordCounts[topic].sort(byCountDescending);
  }
}

function displayTopicWords() {
	var topicTopWords = [];

	for (var topic = 0; topic < numTopics; topic++) {
		topicTopWords.push(topNWords(topicWordCounts[topic], 10));
	}

	var topicLines = d3.select("div#topics").selectAll("div.topicwords")
		.data(topicTopWords);

	topicLines = topicLines
	.enter().append("div")
	.attr("class", "topicwords")
	.on("click", function(d, i) { toggleTopicDocuments(i); })
	.merge(topicLines);

	topicLines.transition().text(function(d, i) { return "[" + i + "] " + d; });

	return topicWordCounts;
}

function reorderDocuments() {
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
}

//
// Metadata plots
//

var topicTimeGroups = new Array();

function createTimeSVGs () {
	var tsPage = d3.select("#ts-page");
	var tsSVG = tsPage.append("svg").attr("height", timeSeriesHeight * numTopics).attr("width", timeSeriesWidth);

	for (var topic = 0; topic < numTopics; topic++) {
		topicTimeGroups.push(tsSVG.append("g").attr("transform", "translate(0," + (timeSeriesHeight * topic) + ")"));
		topicTimeGroups[topic].append("path").style("fill", "#ccc");
		topicTimeGroups[topic].append("text").attr("y", 40);
	}

}

function timeSeries() {
	var tsPage = d3.select("#ts-page");

	for (var topic = 0; topic < numTopics; topic++) {
		var topicProportions = documents.map(function (d) { return {date: d.date, p: d.topicCounts[topic] / d.tokens.length}; })
		var topicMeans = d3.nest().key(function (d) {return d.date; }).rollup(function (d) {return d3.mean(d, function (x) {return x.p}); }).entries(topicProportions);

		var xScale = d3.scaleLinear().domain([0, topicMeans.length]).range([0, timeSeriesWidth]);
		var yScale = d3.scaleLinear().domain([0, 0.2]).range([timeSeriesHeight, 0]);
		var area = d3.area()
		.x(function (d, i) { return xScale(i); })
		.y1(function (d) { return yScale(d.value); })
		.y0(yScale(0));

		topicTimeGroups[topic].select("path").attr("d", area(topicMeans));
		topicTimeGroups[topic].select("text").text(topNWords(topicWordCounts[topic], 3))
	}

}

//
// Topic correlations
//

/* This function will compute pairwise correlations between topics.
 * Unlike the correlated topic model (CTM) LDA doesn't have parameters
 * that represent topic correlations. But that doesn't mean that topics are
 * not correlated, it just means we have to estimate those values by
 * measuring which topics appear in documents together.
 */
function getTopicCorrelations() {

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
    var tokenCutoff = Math.max(correlationMinTokens, correlationMinProportion * d.tokens.length);

    for (var topic = 0; topic < numTopics; topic++) {
      if (d.topicCounts[topic] >= tokenCutoff) {
        documentTopics.push(topic);
        topicProbabilities[topic]++; // Count the number of docs with this topic
      }
    }

    // Look at all pairs of topics that occur in the document.
    for (var i = 0; i < documentTopics.length - 1; i++) {
      for (var j = i + 1; j < documentTopics.length; j++) {
        correlationMatrix[ documentTopics[i] ][ documentTopics[j] ]++;
        correlationMatrix[ documentTopics[j] ][ documentTopics[i] ]++;
      }
    }
  });
  for (var t1 = 0; t1 < numTopics - 1; t1++) {
    for (var t2 = t1 + 1; t2 < numTopics; t2++) {
      correlationMatrix[t1][t2] = Math.log((documents.length * correlationMatrix[t1][t2]) /
                                           (topicProbabilities[t1] * topicProbabilities[t2]));
      correlationMatrix[t2][t1] = Math.log((documents.length * correlationMatrix[t2][t1]) /
                                           (topicProbabilities[t1] * topicProbabilities[t2]));
    }
  }

  return correlationMatrix;
}

function getCorrelationGraph(correlationMatrix, cutoff) {
  var graph = {"nodes": [], "links": []};
  for (var topic = 0; topic < numTopics; topic++) {
    graph.nodes.push({"name": topic, "group": 1, "words": topNWords(topicWordCounts[topic], 3)});
  }
  for (var t1 = 0; t1 < numTopics; t1++) {
    for (var t2 = 0; t2 < numTopics; t2++) {
      if (t1 !== t2 && correlationMatrix[t1][t2] > cutoff) {
        graph.links.push({"source": t1, "target": t2, "value": correlationMatrix[t1][t2]});
      }
    }
  }
  return graph;
}

function plotMatrix() {
	var left = 50;
	var right = 500;
	var top = 50;
	var bottom = 500;

	var correlationMatrix = getTopicCorrelations();
	var correlationGraph = getCorrelationGraph(correlationMatrix, -100.0);

	var topicScale = d3.scalePoint().domain(d3.range(numTopics)).range([left, right]);
	var radiusScale = d3.scaleSqrt().domain([0, 1.0]).range([0, 450 / (2 * numTopics)]);

	var horizontalTopics = vis.selectAll("text.hor").data(correlationGraph.nodes);
	horizontalTopics = horizontalTopics.enter().append("text")
		.attr("class", "hor")
		.attr("x", right + 10)
		.attr("y", function(node) { return topicScale(node.name); })
	.merge(horizontalTopics);

	horizontalTopics
		.text(function(node) { return node.words; });

	var verticalTopics = vis.selectAll("text.ver").data(correlationGraph.nodes);
	verticalTopics = verticalTopics.enter().append("text")
		.attr("class", "ver")
		.attr("x", function(node) { return topicScale(node.name); })
		.attr("y", bottom + 10)
		.attr("transform", function(node) { return "rotate(90," + topicScale(node.name) + "," + (bottom + 10) + ")"; })
	.merge(verticalTopics);

	verticalTopics
		.text(function(node) { return node.words; });

	var circles = vis.selectAll("circle").data(correlationGraph.links);
	circles = circles.enter().append("circle").merge(circles);

	circles.attr("cx", function(link) { return topicScale(link.source); })
	.attr("cy", function(link) { return topicScale(link.target); })
	.attr("r", function (link) { return radiusScale(Math.abs(link.value)); })
	.style("fill", function (link) { return link.value > 0.0 ? "#88f" : "#f88"; })
	.on("mouseover", function (link) {
		var tooltip = d3.select("#tooltip");
		tooltip.style("visibility", "visible")
		.style("top", (event.pageY-10)+"px").style("left",(event.pageX+20)+"px")
		.text(correlationGraph.nodes[link.target].words + " / " + correlationGraph.nodes[link.source].words);
	})
	.on("mouseout", function () {
		var tooltip = d3.select("#tooltip");
		tooltip.style("visibility", "hidden");
	});
}

function toggleTopicDocuments(topic) {
  if (topic === selectedTopic) {
    // unselect the topic
    d3.selectAll("div.topicwords").attr("class", "topicwords");
    selectedTopic = -1;

	sortVocabByTopic = false;
	d3.select("#sortVocabByTopic").text("Sort by topic")
  }
  else {
    d3.selectAll("div.topicwords").attr("class", function(d, i) { return i === topic ? "topicwords selected" : "topicwords"; });
    selectedTopic = topic;
  }
  reorderDocuments();
  vocabTable();
}

//
// Vocabulary
//

function mostFrequentWords(includeStops, sortByTopic) {
  // Convert the random-access map to a list of word:count pairs that
  //  we can then sort.
  var wordCounts = [];

  if (sortByTopic) {
	  for (var word in vocabularyCounts) {
		  if (wordTopicCounts[word] &&
			  wordTopicCounts[word][selectedTopic]) {
			  wordCounts.push({"word":word,
			  	 			"count":wordTopicCounts[word][selectedTopic]});
		  }
	  }
  }
  else {
	  for (var word in vocabularyCounts) {
		  if (includeStops || ! stopwords[word]) {
			  wordCounts.push({"word":word,
			  	 			"count":vocabularyCounts[word]});
		  }
	  }
  }

  wordCounts.sort(byCountDescending);
  return wordCounts;
}

function entropy(counts) {
	counts = counts.filter(function (x) { return x > 0.0; });
	var sum = d3.sum(counts);
	return Math.log(sum) - (1.0 / sum) * d3.sum(counts, function (x) { return x * Math.log(x); });
}

function specificity(word) {
	return 1.0 - (entropy(d3.values(wordTopicCounts[word])) / Math.log(numTopics));
}

function vocabTable() {
	var format = d3.format(".2g");
	var wordFrequencies = mostFrequentWords(displayingStopwords, sortVocabByTopic).slice(0, 499);
	var table = d3.select("#vocab-table tbody");
	table.selectAll("tr").remove();

	wordFrequencies.forEach(function (d) {
		var isStopword = stopwords[d.word];
		var score = specificity(d.word);
		var row = table.append("tr");
		row.append("td").text(d.word).style("color", isStopword ? "#444444" : "#000000");
		row.append("td").text(d.count);
		row.append("td").text(isStopword ? "NA" : format(score))
		.style("background-color", specificityScale(score));
		row.append("td").append("button").text(stopwords[d.word] ? "unstop" : "stop")
		.on("click", function () {
			console.log(d.word);
			if (! isStopword) { addStop(d.word); }
			else { removeStop(d.word); }
		});
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
d3.select("#ts-tab").on("click", function() {
  d3.selectAll(".page").style("display", "none");
  d3.selectAll("ul li").attr("class", "");
  d3.select("#ts-page").style("display", "block");
  d3.select("#ts-tab").attr("class", "selected");
});
d3.select("#dl-tab").on("click", function() {
  d3.selectAll(".page").style("display", "none");
  d3.selectAll("ul li").attr("class", "");
  d3.select("#dl-page").style("display", "block");
  d3.select("#dl-tab").attr("class", "selected");
});
d3.select("#sweep").on("click", function() {
  requestedSweeps += 50;
  timer = d3.timer(sweep);
});
d3.select("#showStops").on("click", function () {
	if (displayingStopwords) {
		displayingStopwords = false;
		this.innerText = "Show stopwords";
		vocabTable();
	}
	else {
		displayingStopwords = true;
		this.innerText = "Hide stopwords";
		vocabTable();
	}
});
d3.select("#sortVocabByTopic").on("click", function () {
	if (sortVocabByTopic) {
		sortVocabByTopic = false;
		this.innerText = "Sort by topic";
		vocabTable();
	}
	else {
		sortVocabByTopic = true;
		this.innerText = "Sort by frequency";
		vocabTable();
	}
});


//
// Functions for download links
//

function toURL(s, type) {
	// Chrome will not process data URIs larger than 2M
	if (s.length < 1500000) {
		return "data:Content-type:" + type + ";charset=UTF-8," + encodeURIComponent(s);
	}
	else {
		var blob = new Blob([s], {type: type});
		return window.URL.createObjectURL(blob);
	}
}

function saveDocTopics() {
	var docTopicsCSV = "";
    var topicProbabilities = zeros(numTopics);

    documents.forEach(function(d, i) {
		docTopicsCSV += d.id + "," + d.topicCounts.map(function (x) { return eightDigits(x / d.tokens.length); }).join(",") + "\n";
	});

	d3.select("#doctopics-dl").attr("href", toURL(docTopicsCSV, "text/csv"));
}

function saveTopicWords() {
	var topicWordsCSV = "word," + d3.range(0, numTopics).map(function(t) {return "topic" + t; } ).join(",") + "\n";
    for (var word in wordTopicCounts) {
      var topicProbabilities = zeros(numTopics);
      for (var topic in wordTopicCounts[word]) {
        topicProbabilities[topic] = eightDigits(wordTopicCounts[word][topic] / tokensPerTopic[topic]);
      }
	  topicWordsCSV += word + "," + topicProbabilities.join(",") + "\n";
    }

	d3.select("#topicwords-dl").attr("href", toURL(topicWordsCSV, "text/csv"));
}

function saveTopicKeys() {
	var keysCSV = "Topic,TokenCount,Words\n";

	if (topicWordCounts.length == 0) { sortTopicWords(); }

    for (var topic = 0; topic < numTopics; topic++) {
		keysCSV += topic + "," + tokensPerTopic[topic] + ",\"" + topNWords(topicWordCounts[topic], 10) + "\"\n";
    }

	d3.select("#keys-dl").attr("href", toURL(keysCSV, "text/csv"));
}

function saveTopicPMI() {
	var pmiCSV = "";
	var matrix = getTopicCorrelations();

    matrix.forEach(function(row) { pmiCSV += row.map(function (x) { return eightDigits(x); }).join(",") + "\n"; });

	d3.select("#topictopic-dl").attr("href", toURL(pmiCSV, "text/csv"));
}

function saveGraph() {
	var graphCSV = "Source,Target,Weight,Type\n";
    var topicProbabilities = zeros(numTopics);

    documents.forEach(function(d, i) {
		d.topicCounts.forEach(function(x, topic) {
			if (x > 0.0) {
				graphCSV += d.id + "," + topic + "," + eightDigits(x / d.tokens.length) + ",undirected\n";
			}
		});
	});

	d3.select("#graph-dl").attr("href", toURL(graphCSV, "text/csv"));
}

function saveState() {
	var state = "DocID,Word,Topic";
	documents.forEach(function(d, docID) {
		d.tokens.forEach(function(token, position) {
			if (! token.isStopword) {
				state += docID + ",\"" + token.word + "\"," + token.topic + "\n";
			}
		});
	});

	d3.select("#state-dl").attr("href", toURL(state, "text/csv"));
}

function getStoplistUpload(callback) {
  if (stoplistFileArray.length === 0) {
      d3.text(stopwordsURL, callback);
    } else {
      var fileSelection = stoplistFileArray[0];
      var reader = new FileReader();
      reader.onload = function() {
        var text = reader.result;
        callback(null, text);
      };
      reader.readAsText(fileSelection);
    }
}

function getDocsUpload(callback) {
  if (documentsFileArray.length === 0) {
      d3.text(documentsURL, callback);
  } else {
      var fileSelection = documentsFileArray[0];
      var reader = new FileReader();
      reader.onload = function() {
        var text = reader.result;
        callback(null, text);
      };
      reader.readAsText(fileSelection);
  }
}

function queueLoad() {
  reset();
  d3.queue()
    .defer(getStoplistUpload)
    .defer(getDocsUpload)
    .await(ready);
}

queueLoad();

function ready(error, stops, lines) {
	if (error) { alert("File upload failed. Please try again."); throw error;}
	else {
		// Create the stoplist
		stops.split("\n").forEach(function (w) { stopwords[w] = 1; });

		// Load documents and populate the vocabulary
		lines.split("\n").forEach(parseLine);

		sortTopicWords();
		displayTopicWords();
		toggleTopicDocuments(0);
		//plotGraph();

		plotMatrix();
		vocabTable();
		createTimeSVGs();
		timeSeries();
	}
}
