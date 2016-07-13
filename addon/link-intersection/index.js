const { data } = require("sdk/self");
const { Cu } = require("chrome");
const tabs = require("sdk/tabs");
const { Sqlite } = Cu.import("resource://gre/modules/Sqlite.jsm", {});
const { setTimeout, clearTimeout } = require("sdk/timers");
const pageMod = require("sdk/page-mod");
const { search } = require("sdk/places/history");

const TAB_POLL_TIMEOUT = 20000; // 20 seconds

let sqliteConnection;

Sqlite.openConnection({
  path: "link-intersection.sqlite"
}).then(connection => {
  connection.execute(`
    CREATE TABLE IF NOT EXISTS page_links (
      link_href TEXT NOT NULL,
      link_title TEXT,
      url TEXT NOT NULL,
      url_title TEXT
    );
    CREATE INDEX page_links_href ON page_exists(href);
  `).then(() => {
    sqliteConnection = connection;
  }).catch(error => {
    console.error("Error creating table:", error);
  });
});

tabs.on("ready", tab => {
  let finisher;
  tab.readLinksFinished = new Promise((resolve) => {
    finisher = resolve;
  });
  let tabUrl = tab.url;
  let tabTitle = tab.title;
  let worker = tab.attach({
    contentScriptFile: data.url("link-intersection-reader.js")
  });
  let links = [];
  worker.port.on("link", result => {
    links.push(result);
  });
  worker.port.on("finished", () => {
    sqliteConnection.execute(`
      DELETE FROM page_links WHERE url = ?1
    `, [tabUrl]).then(() => forEachPromise(links, link => sqliteConnection.execute(`
      INSERT INTO page_links (link_href, link_title, url, url_title)
      VALUES (?1, ?2, ?3, ?4)
    `, [link.href, link.title, tabUrl, tabTitle]))).then(() => {
      finisher();
      if (tab.onFinishCall) {
        tab.onFinishCall();
      }
    }).catch(error => {
      console.error("Error executing SQL:", error);
    });
  });
});

function findRecommendations(tab) {
  let tabUrl = tab.url;
  if (!tab.readLinksFinished) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          findRecommendations(tab).then(resolve, reject);
        } catch (e) {
          console.error("Error in delated recommendation:", e);
        }
      }, 50);
    });
  }
  return tab.readLinksFinished.then(() => {
    delete tab.readLinksFinished;
    return getRelated(tabUrl);
  }).then((rowResults) => {
    let distinct = {};
    for (let item of rowResults) {
      distinct[item.url] = true;
    }
    distinct = Object.keys(distinct).length;
    return [{
      label: "Refresh",
      url: data.url("link-intersection-refresher.html")
    }, {
      label: `View ${distinct}...`,
      url: data.url(`link-intersection-viewer.html#url=${encodeURIComponent(tabUrl)}`)
    }];
  });
}

function getRelated(tabUrl) {
  let rowResults = [];
  return sqliteConnection.execute(`
    SELECT p1.url, p1.url_title, p1.link_href, p1.link_title FROM page_links AS p1, page_links AS p2
    WHERE (p1.link_href = p2.link_href
           OR p1.link_href = p2.url)
          AND p1.url <> $1
          AND p2.url = $1
    `,
    [tabUrl],
    function onRow(row) {
      rowResults.push({
        url: row.getResultByIndex(0),
        label: row.getResultByIndex(1),
        fromUrl: row.getResultByIndex(2),
        fromTitle: row.getResultByIndex(3)
      });
    }
  ).then(() => {
    rowResults.sort((a, b) => {
      if (a.url === b.url) {
        return a.fromUrl > b.fromUrl ? -1 : 1;
      }
      return a.url > b.url ? -1 : 1;
    });
    return rowResults;
  });
}

function forEachPromise(list, func) {
  if (!list.length) {
    return Promise.resolve();
  }
  function runOne(index) {
    let promise = Promise.resolve(func(list[index]));
    if (index < list.length - 1) {
      return promise.then(runOne.bind(null, index + 1));
    }
    return promise;
  }
  return runOne(0);
}

require("../recommender-registry").register({
  findRecommendations,
  name: "Link intersections"
});

function startLoadingPages(numberOfTabs, howfar) {
  search({
    string: ""
  }, {
    count: howfar,
    sort: "lastModified",
    descending: true
  }).on("end", (unfilteredResults) => {
    filterOutRecordedSites(unfilteredResults).then((results) => {
      function onReady(tab) {
        tab.onFinishCall = function tryNext() {
          if (tab.tabTimeoutId) {
            clearTimeout(tab.tabTimeoutId);
            delete tab.tabTimeoutId;
          }
          if (!results.length) {
            tab.close();
            setTimeout(() => {
              tabs.off("ready", onReady);
            }, 5000);
          } else {
            console.log(`...${results.length} left (${results[0].url})`);
            let { url } = results.shift();
            tab.url = url;
            let tabTimeoutId = setTimeout(() => {
              delete tab.tabTimeoutId;
              tryNext();
            }, TAB_POLL_TIMEOUT);
            tab.tabTimeoutId = tabTimeoutId;
          }
        };
      }
      tabs.on("ready", onReady);
      for (let i = 0; i < numberOfTabs; i++) {
        tabs.open({ url: "about:blank", inBackground: true });
      }
    });
  });
}

function filterOutRecordedSites(historyItems) {
  return sqliteConnection.execute(`
    SELECT DISTINCT url FROM page_links
  `).then((rows) => {
    let found = {};
    for (let row of rows) {
      found[row.getResultByIndex(0)] = true;
    }
    console.log("found", found);
    let newHistory = [];
    let blacklisted = 0;
    for (let item of historyItems) {
      if (blacklistUrl(item.url)) {
        blacklisted++;
        continue;
      }
      if (item.url.indexOf("news.ycom") != -1) {
        console.log("checker", item.url, item, found[item.url]);
      }
      if (!(found[item.url] || found[item.url.replace(/^http:/, "https:")])) {
        newHistory.push(item);
      }
    }
    console.log(`Filtered ${historyItems.length - newHistory.length} from ${historyItems.length} using base of ${Object.keys(found).length} including ${blacklisted} blacklists`);
    return newHistory;
  });
}

function blacklistUrl(url) {
  if (url.search(/^https?:\/\//i) === -1) {
    return true;
  }
  if (url.search(/irccloud.com/i) !== -1) {
    return true;
  }
  if (url.search(/mail.google.com/i) !== -1) {
    return true;
  }
  if (url.search(/mozilla.okta.com/i) !== -1) {
    return true;
  }
  return false;
}

pageMod.PageMod({
  include: data.url("link-intersection-refresher.html"),
  contentScriptFile: data.url("link-intersection-refresher.js"),
  onAttach: worker => {
    worker.port.on("doit", ({ number, howfar }) => {
      startLoadingPages(number, howfar);
    });
    worker.port.on("reset", () => {
      sqliteConnection.execute("DELETE FROM page_links").then(() => {
        console.log("All items deleted");
      }).catch(e => {
        console.error("Error deleting:", e);
      });
    });
  }
});

pageMod.PageMod({
  include: new RegExp("^" + RegExpEscape(data.url("link-intersection-viewer.html")) + ".*$"),
  contentScriptFile: data.url("link-intersection-viewer.js"),
  onAttach: (worker) => {
    worker.port.on("getResults", ({ url }) => {
      getRelated(url).then((result) => {
        worker.port.emit("data", result);
      });
    });
  }
});

function RegExpEscape(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

require("sdk/system/unload").when(() => {
  sqliteConnection.close();
});

console.log("LINK INTERSECTION FINISHED");
