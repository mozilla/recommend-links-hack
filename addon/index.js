var self = require("sdk/self");
const tabs = require("sdk/tabs");
const { Cu, Cc, Ci } = require("chrome");
const recommenderRegistry = require("./recommender-registry");

let initialized = false;
let Services;
const notificationBarValue = "recommendation-notification-bar";

function getNotificationBox(browser) {
  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  let win = wm.getMostRecentWindow("navigator:browser");
  let gBrowser = win.gBrowser;

  browser = browser || gBrowser.selectedBrowser;
  return gBrowser.getNotificationBox(browser);
}

function showRecommendations(recommendations, tab) {
  var nb = require("./notificationbox");
  if (nb.notificationbox().getNotificationWithValue(notificationBarValue) !== null) {
    hideNotificationBar();
  }
  let thebox = nb.notificationbox();
  let messageNode = thebox.ownerDocument.createElement("span");
  messageNode.style.border = "none";
  messageNode.style.marginLeft = "10px";
  messageNode.style.fontWeight = "normal";
  let message = "Recommendations:";
  if (!recommendations.length) {
    message = "No recommendations available";
  }
  message = `[${recommenderRegistry.current().name}] ${message}`;
  messageNode.appendChild(thebox.ownerDocument.createTextNode(message));
  messageNode.onclick = function() {
    recommenderRegistry.setNext();
    refreshRecommendation(tab);
  };
  let fragment = thebox.ownerDocument.createDocumentFragment();
  fragment.appendChild(messageNode);
  let buttons = [];
  recommendations.forEach(function(recommendation) {
    buttons.push(
      nb.buttonMaker.yes({
        label: recommendation.label,
        callback(notebox, button) {
          try {
            hideNotificationBar();
            tabs.open(recommendation.url);
            // FIXME: do something with the recommendation
          } catch (e) {
            console.error("Error:", e, e.stack);
          }
        }
      })
    );
  });
  buttons.push(
    nb.buttonMaker.no({
      label: "Hide",
      callback(notebox, button) {
        hideNotificationBar();
      }
    })
  );
  nb.banner({
    id: notificationBarValue,
    msg: fragment,
    callback(message) {
      // Only message should be AlertClose
      if (message !== "removed") {
        console.warn("Unexpected message on notificationbox:", message);
        return;
      }
    },
    buttons
  });

  if (!initialized) {
    if (!Services) {
      let importer = {};
      Cu.import("resource://gre/modules/Services.jsm", importer);
      Services = importer.Services;
    }

    initialized = true;
    // Load our stylesheets.
    let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);

    let cssurl = self.data.url("notification-bar.css");

    let styleSheetURI = Services.io.newURI(cssurl, null, null);
    styleSheetService.loadAndRegisterSheet(styleSheetURI,
                                           styleSheetService.AUTHOR_SHEET);
  }
}

function hideNotificationBar(browser) {
  let box = getNotificationBox(browser);
  let notification = box.getNotificationWithValue(notificationBarValue);
  let removed = false;
  if (notification) {
    box.removeNotification(notification);
    removed = true;
  }
  return removed;
}

tabs.on("ready", refreshRecommendation);

function refreshRecommendation(tab) {
  recommenderRegistry.current().findRecommendations(tab).then(recommendations => {
    showRecommendations(recommendations, tab);
  }).catch(error => {
    console.error("Error in findRecommendations:", error);
  });
}

recommenderRegistry.register({
  findRecommendations(tab) {
    return Promise.resolve([
      {
        label: "Reddit",
        url: "https://reddit.com"
      }, {
        label: "Mozilla",
        url: "https://mozilla.org"
      }
    ]);
  },
  name: "Dummy"
});

recommenderRegistry.register({
  findRecommendations(tab) {
    return Promise.resolve([
      {
        label: "HN",
        url: "https://news.ycombinator.com"
      }
    ]);
  },
  name: "Dummy 2"
});

require("./link-intersection/index.js");
require("./similar-next/index.js");

recommenderRegistry.init();

console.log("RECOMMENDER FINISHED LOADING");
