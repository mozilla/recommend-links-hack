/* globals self */
let hash = location.hash.replace(/^#/, "");
hash = hash.split(/&/g);
let hashVars = {};
for (let part of hash) {
  let splitted = part.split(/[=]/);
  hashVars[splitted[0]] = decodeURIComponent(splitted[1]);
}
self.port.emit("getResults", hashVars);
function getElement(id) {
  return document.getElementById(id);
}
getElement("page_title").textContent = hashVars.title || "?";
getElement("page_url").textContent = hashVars.url;

function makeLink(url, title) {
  let a = document.createElement("a");
  a.href = url;
  a.textContent = title || (url.replace(/^https?:\/\//i, ""));
  return a;
}

self.port.on("data", (results) => {
  let container = getElement("result-container");
  container.innerHTML = "";
  for (let i = 0; i < results.length; i++) {
    let item = results[i];
    if (item.url.startsWith("about:")) {
      continue;
    }
    let li = document.createElement("li");
    let a = makeLink(item.url, item.label);
    li.appendChild(a);
    li.appendChild(document.createTextNode(" (colinks:"));
    for (;;) {
      let f = makeLink(item.fromUrl, item.fromTitle);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(f);
      if (results[i + 1] && results[i + 1].url === item.url) {
        i++;
        item = results[i];
      } else {
        break;
      }
    }
    li.appendChild(document.createTextNode(")"));
    container.appendChild(li);
  }
});
