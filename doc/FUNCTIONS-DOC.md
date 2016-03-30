### jsLDA Function Documentation - Original Order

- 115 QueryString
- 146 zeros
- 218 parseLine
- 260 sampleDiscrete
- 271 sweep
- 326 sortTopicWords
- 343 displayTopicWords
- 363 reorderDocuments
- 396 getTopicCorrelations
- 441 getCorrelationGraph
- 456 plotMatrix
- 506 toggleTopicDocuments
- 519 mostFrequentWords
- 531 entropy
- 537 vocabTable
- 550 updateVocabTable
- 590 saveDocTopics
- 601 saveTopicWords
- 614 saveTopicKeys
- 626 saveTopicPMI
- 635 saveGraph
- 650 saveState
- 668 ready

### jsLDA Function Call Tree
window (runs on startup)
  QueryString
  queue(loads files)
    ready
        parseLine
          zeros
          truncate
        sortTopicWords
          byCountDescending
        displayTopicWords
          toggleTopicDocuments
          topNWords
            reorderDocuments
              truncate
        toggleTopicDocuments
          reorderDocuments
        plotMatrix
        vocabTable
          mostFrequentWords
          entropy

saveState (No children?)

sweep (button action)
  sampleDiscrete
  displayTopicWords
  updateVocabTable
      entropy
  plotMatrix
    getCorrelationGraph
      topNWords
    getTopicCorrelations
      zeros
      topNWords
  reorderDocuments
    truncate
saveTopicPMI
  getTopicCorrelations
-   zeros
saveGraph
  zeros
saveTopicWords
  zeros
saveDocTopics
  zeros
