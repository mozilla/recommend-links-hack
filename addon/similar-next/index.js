/**
 * Find links with text that are similar to titles of pages previously visited.
 */

const { data } = require("sdk/self");

const { Cu } = require("chrome");
const { PlacesUtils } = Cu.import("resource://gre/modules/PlacesUtils.jsm", {});

const MAX_LABEL_LENGTH = 60;

/**
 * Extract all "words" without punctuation from some text.
 */
function tokenize(text) {
  return (text || "").trim().toLowerCase().replace(/[^\s\w]+/g, "").split(/\s+/)
    // XXX: Ignore short words.
    .filter(word => word.length > 4);
}

/**
 * Generate recommendations for a given tab.
 */
function findRecommendations(tab) {
  // Keep track of words found in titles of next pages.
  let nextWords = new Map();

  // Create a recommendation label for a link.
  let makeLabel = (title, reason) => {
    // Show the words with highest weight.
    let topReasons = [...reason.keys()].sort((a, b) =>
      nextWords.get(b) - nextWords.get(a)).slice(0, 2);
    let label = `(${topReasons}) ${title}`;
    return label.length > MAX_LABEL_LENGTH ?
      label.slice(0, MAX_LABEL_LENGTH) + "…" : label;
  };

  // Get all page titles of pages previously visited from the current tab's url.
  return PlacesUtils.promiseDBConnection().then(db => db.executeCached(`
    SELECT title
    FROM moz_places
    WHERE id IN (
      SELECT place_id
      FROM moz_historyvisits
      WHERE from_visit IN (
        SELECT id
        FROM moz_historyvisits
        WHERE place_id = (
          SELECT id
          FROM moz_places
          WHERE url = :url
        )
      )
    )
  `, { url: tab.url })).then(rows => {
    rows.forEach(row => {
      // Increase a word's score for each time it has ever been seen.
      tokenize(row.getResultByName("title")).forEach(word => {
        nextWords.set(word, (nextWords.get(word) || 0) + 1);
      });
    });

    // XXX: Ignore words from the current page's title.
    tokenize(tab.title).forEach(word => nextWords.delete(word));

    // XXX: Ignore common words that appear in more than half of the pages.
    let threshold = Math.ceil(rows.length / 2);
    nextWords.forEach((count, word) => {
      if (count > threshold) {
        nextWords.delete(word);
      }
    });

    // Load a script to extract links from the tab.
    let worker = tab.attach({
      contentScriptFile: data.url("link-intersection-reader.js"),
      contentScriptOptions: {
        duplicates: true
      }
    });

    // Process each link from the page.
    let pageLinks = new Map();
    worker.port.on("link", link => {
      // XXX: Skip links that don't have many words.
      let words = tokenize(link.title);
      if (words.length < 3) {
        return;
      }

      let score = 0;
      let reason = new Set();
      words.forEach(word => {
        // Ignore words that we haven't seen before.
        let wordWeight = nextWords.get(word);
        if (!wordWeight) {
          return;
        }

        // Increase the score by the next word's weight.
        score += wordWeight;

        // Remember what word increased the score.
        reason.add(word);
      });

      // Only add links that have scored.
      if (score > 0) {
        pageLinks.set(link, { score, reason });
      }
    });

    // Give recommendations when all links have been processed.
    return new Promise(resolve => {
      worker.port.on("finished", () => {
        // Select the top 5 highest ranked page links.
        resolve([...pageLinks.entries()].sort((a, b) => b[1].score - a[1].score)
          .slice(0, 5).map(([{ href, title }, { reason, score }]) => ({
            // Include the score, two longest words, and some of the title.
            label: makeLabel(title, reason, score),
            url: href
          })));
      });
    });
  });
}

// Register this algorithm as a recommender.
require("../recommender-registry").register({
  findRecommendations,
  name: "Similar next"
});
