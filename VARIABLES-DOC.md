##  jsLDA Variable list
- 2016-03-27
var documentTopicSmoothing = 0.1
var topicWordSmoothing = 0.01

var vocabularySize = 0;
var vocabularyCounts = {};
var correlationMinTokens = 2;
var correlationMinProportion = 0.05;
var numTopics = QueryString.topics ? parseInt(QueryString.topics) : 25;
var stopwords = {};

var docSortSmoothing = 10.0; // Use a more aggressive smoothing parameter to sort docs by topic.  this has the effect of preferring longer documents
var sumDocSortSmoothing = docSortSmoothing * numTopics;

var completeSweeps = 0;
var requestedSweeps = 0;
var selectedTopic = -1;
var wordTopicCounts = {};
var topicWordCounts = [];
var tokensPerTopic = [];
var topicWeights = [];
var documents = [];

var w = 650, h = 650;
var linkDistance = 150;
var correlationCutoff = 0.25;
var tokens = [];
var rawTokens = text.toLowerCase().match(wordPattern);
var topicCounts = zeros(numTopics);
completeSweeps += 1;
correlationMatrix = new Array(numTopics);
var topicProbabilities = zeros(numTopics);
var documentTopics = new Array();
var tokenCutoff = Math.max(correlationMinTokens, correlationMinProportion * d.tokens.length);
correlationMatrix[t1][t2]
