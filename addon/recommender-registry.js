/* Every recommendation algorithm should work like:

require("./recommender-registry").register({
  findRecommendations: function (tab) {
    return Promise.resolve([
      {label: "button label", url: "url to open"}
    ]);
  },
  name: "My recommender"
});
*/

const { prefs } = require("sdk/simple-prefs");

const allStrategies = [];
let strategyIndex = 0;

exports.current = function () {
  console.log("selecting", allStrategies, strategyIndex);
  return allStrategies[strategyIndex];
};

exports.register = function (value) {
  allStrategies.push(value);
};

exports.setNext = function () {
  strategyIndex = (strategyIndex+1) % allStrategies.length;
  prefs.searchStrategy = exports.current().name;
};

exports.init = function () {
  let preferred = prefs.searchStrategy || "";
  for (let i=0; i<allStrategies.length; i++) {
    if (allStrategies[i].name == preferred) {
      strategyIndex = i;
      break;
    }
  }
};
