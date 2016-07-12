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

self.port.on("data", (results) => {
  let container = getElement("result-container");
  container.innerHTML = "";
  for (let item of results) {
    let li = document.createElement("li");
    let a = document.createElement("a");
    a.href = item.url;
    a.textContent = item.title || item.label || item.url;
    li.appendChild(a);
    let f = document.createElement("a");
    f.href = item.fromUrl;
    f.textContent = item.fromTitle || item.fromUrl;
    li.appendChild(document.createTextNode(" (colinks: "));
    li.append(f);
    li.appendChild(document.createTextNode(")"));
    container.appendChild(li);
  }
});
