// 2016-04-03 OD: Moved all User Interface related code to "ui.js"
var ui = function() {
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

  // 2016-03-27 OD: Spinner Options
  var opts = {
      lines: 12 // The number of lines to draw
        ,
      length: 10 // The length of each line
        ,
      width: 5 // The line thickness
        ,
      radius: 10 // The radius of the inner circle
        ,
      scale: 1.0 // Scales overall size of the spinner
        ,
      corners: 1 // Roundness (0..1)
        ,
      color: '#19A3D1' // #rgb or #rrggbb
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
    // 2016-04-03 OD: Put defaults in spin
  var target = document.getElementById('docs-page')
  var spinner = new Spinner(opts).spin(target)

  //2016-04-03: This is really UI and not LDA logic
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
          score: (doc.topicCounts[selectedTopic] + docSortSmoothing) /
            (
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

  // 2016-04-03: USe D3.js to plot this matrix
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

}
