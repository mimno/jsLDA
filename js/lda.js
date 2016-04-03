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
}();


var lda = function lda() {

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

		var numTopics = 25; //default number if not specified
		var dataDir = "../data/";
		var documentsURL = dataDir + "projects.txt";
		var stopwordsURL = dataDir + "stop_words.txt";

		var stopwords = {};

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
			d3.timer(sweep);
		});


		var numTopics = QueryString.topics ? parseInt(QueryString.topics) : numTopics;
		if (isNaN(numTopics)) {
			alert("The requested number of topics [" + QueryString.topics +
				"] couldn't be interpreted as a number");
			numTopics = 25;
		}

		d3.select("#docs-url-input").attr("value", documentsURL);
		d3.select("#stops-url-input").attr("value", stopwordsURL);
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
			.await(processFiles); // 2016-04-03 OD: Changed name from "ready" to "dataLoaded" and changed to use ".awaitALL"

		function processFiles(error, stops, lines) {
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

				//	sortTopicWords();
				//	displayTopicWords();
				//toggleTopicDocuments(0);
				//plotGraph();
				//	plotMatrix();
				//	vocabTable();
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
			//var docID = documents.length;
			var docDate = "";
			var fields = line.split("\t");
			var docID = fields[0];
			var text = [fields[1], fields[2], fields[3]];
			var text = text.join(" "); // 2016-03-04 OD: changed to use second field

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
				// 2016-04-03 OD: Need to move the functions below to ui.js
				//	reorderDocuments();
				//	sortTopicWords();
				//	displayTopicWords();
				//plotGraph();
				//		plotMatrix();
				//		updateVocabTable();
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

		// 2016-04-03 OD: Move all functions for downloading results to downloadResults.js

	} // end of "lda"
