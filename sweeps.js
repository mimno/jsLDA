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