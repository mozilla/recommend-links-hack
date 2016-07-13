/**
 * Find links with text that are similar to titles of pages previously visited.
 */

const { data } = require("sdk/self");

const { Cu } = require("chrome");
const { PlacesUtils } = Cu.import("resource://gre/modules/PlacesUtils.jsm", {});

/**
 * Extract all "words" without punctuation from some text.
 */
function tokenize(text) {
  return (text || "").trim().toLowerCase().replace(/[^\s\w]+/g, "").split(/\s+/)
    // XXX: Ignore short words.
    .filter(word => word.length > 4);
}

/**
 * Create a recommendation label for a link.
 */
function makeLabel(title, reason, score) {
  let topReasons = [...reason.keys()].sort((a, b) => b.length - a.length).slice(0, 2);
  return `${score} (${topReasons}): ${title.slice(0, 30)}`;
}

/**
 * Generate recommendations for a given tab.
 */
function findRecommendations(tab) {
  // Keep track of words found in titles of next pages.
  let nextWords = new Map();

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

    // Load a script to extract links from the tab.
    let worker = tab.attach({
      contentScriptFile: data.url("link-intersection-reader.js")
    });

    // Process each link from the page.
    let pageLinks = new Map();
    worker.port.on("link", link => {
      let score = 0;
      let reason = new Set();
      tokenize(link.title).forEach(word => {
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
