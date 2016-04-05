// Get parameters from URL, if available
var QueryString = function() {
	// This function is copied from stack overflow: http://stackoverflow.com/users/19068/quentin
	// This function is anonymous, is executed immediately and the return value is assigned to QueryString!
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
};


var main = function main() {

	/////////////////////// Setup Variables ////////////////////////////////////////////////
	var wordPattern = XRegExp("\\p{L}[\\p{L}\\p{P}]*\\p{L}", "g"); //uses the XRegExp.js plugin
	var documentTopicSmoothing = 0.1;
	var topicWordSmoothing = 0.01;
	var vocabularySize = 0;
	var vocabularyCounts = {};
	var selectedTopic = -1; //initialize to no selected topic

	// Constants for calculating topic correlation.
	var correlationMinTokens = 2;
	var correlationMinProportion = 0.05; // A doc with 5% or more tokens in a topic is "about" that topic.
    var linkDistance = 150;
	var correlationCutoff = 0.25; //2016-04-04 OD: original code: "function var getCorrelationGraph = function(correlationMatrix, cutoff)" 
	var numTopics = 25; //default number if not specified
	var dataDir = "../data/";
	var documentsURL = dataDir + "documents.txt";
	var stopwordsURL = dataDir + "stopwords.txt";

	var stopwords = [];

	//  Mimno: Use a more agressive smoothing parameter to sort documents by topic. This has the effect of preferring longer documents.
	var docSortSmoothing = 10.0;
	var sumDocSortSmoothing = docSortSmoothing * numTopics;
	//
	var completeSweeps = 0;
	var requestedSweeps = 0;
	var selectedTopic = -1;

	var documents = [];
	var wordTopicCounts = {};
	var topicWordCounts = [];
	var tokensPerTopic = [];
	var topicWeights = [];
	var truncateLength = 400; //2016-04-03 OD: Added this variable. Truncate document text for viewing at this number of characters.
   
    var lda = {}; // 2016-04-04 OD: Array of objects to be passed to functions to avold global variables. Objects are passed by reference.


	////////////////////////////////////////////////////////////////////////////////////////////

	// Get parameters from the URL if avaiilable

	// file URLs in the QueryString will override the defaults
	documentsURL = QueryString.docs ? QueryString.docs : documentsURL;
	stopwordsURL = QueryString.stoplist ? QueryString.stoplist : stopwordsURL;
	documentsURL = decodeURIComponent(documentsURL);
	stopwordsURL = decodeURIComponent(stopwordsURL);

	var target = document.getElementById('docs-page')
	var spinner = new Spinner().spin(target); //using defaults in spin.js

	d3.select("#sweep").on("click", function() {
		requestedSweeps += 50;
		d3.timer(sweep); // use the timer to allow interruption?
	});


	var numTopics = QueryString.topics ? parseInt(QueryString.topics) : numTopics;
	if (isNaN(numTopics)) {
		alert("The requested number of topics [" + QueryString.topics +
			"] couldn't be interpreted as a number");
		numTopics = 25;
	}

	d3.select("#docs-url-input").attr("value", documentsURL);
	d3.select("#stopWords-url-input").attr("value", stopwordsURL);
	d3.select("#num-topics-input").attr("value", numTopics);

	topicWeights.length = numTopics;
	tokensPerTopic.length = numTopics;
	for (var topic = 0; topic < numTopics; topic++) {
		tokensPerTopic[topic] = 0;
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// 2016-04-03 OD: Use queue for async loading of files, then calling processFiles when complete
	queue()
		.defer(d3.text, stopwordsURL)
		.defer(d3.text, documentsURL)
		.await(processDocs); // 2016-04-03 OD: Changed name from "ready" to "dataLoaded" and changed to use ".awaitALL"

	function processDocs(error, stopwords, lines) {
		if (error) {
			alert("One of these URLs didn't work:\n " + stopwordsURL + "\n " + 	documentsURL);
		} else {
			// Create the stoplist
			stopwords.split("\n").forEach(function(w) {
				stopwords[w] = 1;
			});

			// Load documents and populate the vocabulary
			//Excel tab delimited files are exported with carriage returns (\r) rather than the unix linefeeds (\n) at the end of each line.
			lines.split("\r").forEach(parseLine); // 2016-03-04 OD: changed from LF to CR
			// 2016-04-04 OD: Need to pass parameters to exteral fuinctions
			var thisTopic = selectedTopic = 0; // 2016-04-04 OD: by default select the first topic (zero based array)
            // Pass the ldaObjects object with all that will be needed for parameters
            setupLDA(); // 2016-04-04 New function to set all objects into object "lda"
			
			ui.sortTopicWords(lda);
			ui.displayTopicWords(lda);
			ui.toggleTopicDocuments(lda);
			//plotGraph();
			ui.plotMatrix(lda);
			ui.vocabTable(lda);
			// 2016-03-27 OD: stop spinner after processing
			spinner.stop();

		}
	}; // end of processFiles

	////////////////////////////////////////////////////////////////////////////////
	//////////// 2016-04-03 OD: Start of all function definitions /////////////////

	var parseLine = function(line) {
		if (line == "") {
			return;
		}
	  
	  var docID = documents.length; // use automatic incrementing if there is no docID provided
	  var docDate = "";
	  var fields = line.split("\t");
	  var text = fields[0];  // Assume there's just one field, the text

	  if (fields.length === 2) {  // If it's in [ID]\t[TEXT] format...
	    docID = fields[0];
	    text = fields[1];
	  }
	  if (fields.length === 3) {  // If it's in [ID]\t[TAG]\t[TEXT] format...
	    docID = fields[0];
	    docDate = +fields[1]; // interpret as a number
	    text = fields[2];
	  }
	 

		var tokens = {}; // Reset for each document (line)
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
        // 2016-04-04 OD: Build the documents nested object, which includes all woird/topic combinations in the object "tokens"
		documents.push({
			"originalOrder": documents.length,
			"id": docID,
			"date": docDate,
			"originalText": text,
			"tokens": tokens,
			"topicCounts": topicCounts
		});
		/* 2016-04-03 OD: The following d3 code should be moved to ui.js
			d3.select("div#docs-page").append("div")
				.attr("class", "document")
				.text("[" + docID + "] " + truncate(text));
     */
	}; // end of "parseLine"

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
			
			// 2016-04-04 OD: pass object lda, which has all objects nested within
			setupLDA();
			ui.reorderDocuments(lda);
			ui.sortTopicWords(lda);
			ui.displayTopicWords(lda);
			//plotGraph();
			ui.plotMatrix(lda);
			ui.updateVocabTable(lda);
			
			return true;
		} else {
			return false;
		}

	}; // end of "sweep"

	var byCountDescending = function(a, b) {
		return b.count - a.count;
	};
	var topNWords = function(wordCounts, n) {
		return wordCounts.slice(0, n).map(function(d) {
			return d.word;
		}).join(" ");
	};

    // 2016-04-04 OD: Moved function getTopicCorrelations to ui.js 



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

	var zeros = function(n) {
		var x = new Array(n);
		for (var i = 0; i < n; i++) {
			x[i] = 0.0;
		}
		return x;
	};
	// 2016-04-03 OD: replaced the value "300" with the variable "truncateLegth"
	var truncate = function(s) {
		return s.length > truncateLength ? s.substring(0, truncateLength - 1) +
			"..." :
			s;
	}
    var setupLDA= function(){
    	// 2016-04-04 OD: setup lda object which inlcudes nested objects, passing information to other modules via reference
    	lda.documents = documents;
    	lda.numTopics = numTopics;
    	ldaO.wordPattern = wordPattern;
    	lda.documentTopicSmoothing = documentTopicSmoothing
    	lda.topicWordSmoothing = topicWordSmoothing
		lda.vocabularySize = vocabularySize;
		lda.vocabularyCounts = vocabularyCounts;
		lda.selectedTopic = selectedTopic; 
		lda.correlationMinTokens = correlationMinTokens;
		lda.linkDistance = linkDistance;
		lda.correlationCutoff = correlationCutoff;
		lda.docSortSmoothing = docSortSmoothing;
		lda.sumDocSortSmoothing = sumDocSortSmoothing;
		lda.completeSweeps = completeSweeps;
		lda.requestedSweeps = requestedSweeps;
		lda.selectedTopic = selectedTopic;
		lda.wordTopicCounts = wordTopicCounts;
		lda.topicWordCounts = topicWordCounts;
		lda.tokensPerTopic = tokensPerTopic;
		lda.topicWeights = topicWeights;
		lda.truncateLength = truncateLength;
    }
	// 2016-04-03 OD: Move all functions for downloading results to downloadResults.js

}; // end of "lda"
