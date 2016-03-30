jsLDA
=====

### An implementation of latent Dirichlet allocation (JDA) in javaScript.

##### Source code reorganized, UI functionality enhanced, and additional documentation provide by Owen Dall in 2016 from the original by David Mimno:

* JavaScript extracted and moved to JS Files from the original HTML.
* CSS extracted and moved to CSS files from the original HTML.
* Added progress spinner
* Documented all functions and objects (see "docs" folder)
* Changed default corpus of documents
* Planning additional visualizations
*   Original code renamed "jslda-original.html" and moved to the "archive" folder for future reference and validation of changes.



Instructions:
------------

1. To run locally you will need a simple HTTP Server.  You can find "rubyHTTPServer.rb" in the main folder.  If you have Ruby installed (Mac OS X machines have both Ruby and Python installed by default), open your terminal window, go the directory containing the code, and type:

    $ ruby rubyHTTPServer.rb

Then launch your browser and enter "localhost:9090" as the URL.

2. When you first load the page, it will first load a file containing documents and a file containing stopwords from URLs specified in the box on the top right. The default is a small corpus of USDA research projects, including Title, Keywords, and Objectives.  You can change this by specifying file that is accessible from a URL. When you first load the page, all words have been assigned randomly to topics.
We train a model by cycling through every word token in the documents and sampling a topic for that word.
An "iteration" corresponds to one pass through the documents.

3. Click the "Run 50 iterations" button to start training. You will see the progress spinner during this process. The topics on the right side of the page should now look more interesting. Run more iterations if you would like -- there's probably still a lot of room for improvement after only 50 iterations.

4. Once you're satisfied with the model, you can click on a topic from the list on the right to sort documents in descending order by their use of that topic. Proportions are weighted so that longer documents will come first.

5. You can also explore correlations between topics by clicking the "Topic Correlations" tab. This view shows a force directed layout with connections between topics that have correlations above a certain threshold. You can control this threshold with the slider: a low cutoff will display more edges, while a high cutoff will remove all but the strongest correlations.

6. Topic correlations are actually pointwise mutual information scores. This score measures whether two topics occur
in the same document more often than we would expect by chance. Previous versions of this script calculated correlations
on logratios. This implementation uses PMI, which is simpler to calculate.

Using your own corpus:
---------------------

Are you ready to run your own corpus? The format for the documents file is one document per line (with a linefeed (LF) character at the end) with each line consisting of

    [doc ID] [tab] [label] [tab] [text...]

(this is the default format for Mallet). The "label" field is currently unused, but Mimno had planned  to support timestamps, labels, etc.

The format for stopwords is one word per line. The "Vocabulary" tab may be useful in customizing a stoplist. Unicode is supported, so most languages that have meaningful whitespace (i.e., not CJK) should work.

The page works best in Chrome. Safari and Firefox work too, but may be considerably slower. It doesn't seem to work in IE.
