##  jsLDA Variables and Objects
#### 2016-03-27
var documentTopicSmoothing = 0.1; //Theta?
var topicWordSmoothing = 0.01;// Phi?


var wordPattern = XRegExp("\\p{L}[\\p{L}\\p{P}]*\\p{L}", "g"); //pattern for finding tokens
var vocabularySize = 0;
var vocabularyCounts = {};

// We want to find the subset of topics that occur with non-trivial concentration in this document.
// Only consider topics with at least the minimum number of tokens that are at least 5% of the doc.
var correlationMinTokens = 2; // Minimum number of tokens
var correlationMinProportion = 0.05; //Minimum proportion of 5%

var numTopics = QueryString.topics ? parseInt(QueryString.topics) : 25;
var stopwords = {};

var docSortSmoothing = 10.0; // Use a more aggressive smoothing parameter to sort docs by topic.  This prefers longer documents
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

var correlationMatrix = getTopicCorrelations();
var topicProbabilities = zeros(numTopics);
var documentTopics = new Array();
var tokenCutoff = Math.max(correlationMinTokens, correlationMinProportion * d.tokens.length);

#### Related to correlationMatrix
var correlationMatrix = getTopicCorrelations();
var topicProbabilities = zeros(numTopics);
var left = 50;
var right = 500;
var top = 50;
var bottom = 500;
var correlationMatrix = getTopicCorrelations();
var correlationGraph = getCorrelationGraph(correlationMatrix, -100.0);
var topicScale = d3.scale.ordinal().domain(d3.range(numTopics)).rangePoints([left, right]);
var radiusScale = d3.scale.sqrt().domain([0, 1.0]).range([0, 450 / (2 * numTopics)]);
var horizontalTopics = vis.selectAll("text.hor").data(correlationGraph.nodes);
var verticalTopics = vis.selectAll("text.ver").data(correlationGraph.nodes);
var circles = vis.selectAll("circle").data(correlationGraph.links);
var tooltip = d3.select("#tooltip");

###### Related to functions for saving objects
var wordCounts = [];
var docTopicsCSV = "";
var topicWordsCSV = "word," + d3.range(0, numTopics).map(function(t) {return "topic" + t; } ).join(",") + "\n";
var topicProbabilities = zeros(numTopics);
var keysCSV = "Topic,TokenCount,Words\n";
var pmiCSV = "";
var matrix = getTopicCorrelations();
var graphCSV = "Source,Target,Weight,Type\n";
var topicProbabilities = zeros(numTopics);
var state = "DocID,Word,Topic";
