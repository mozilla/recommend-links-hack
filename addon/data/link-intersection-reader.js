try {
  let options = self.options || {};

  let seen = {};
  let baseLink = location.href.replace(/#.*/, "");
  let siteBase = location.protocol + "//" + location.host + "/";
  let links = document.querySelectorAll("a");
  for (let link of links) {
    let href = link.href;
    href = href.replace(/#.*/, "");
    if (!href) {
      continue;
    }
    if (!options.selfLink && href.indexOf(baseLink) === 0) {
      continue;
    }
    if (!options.rootLink && href === siteBase) {
      continue;
    }
    if (!options.allProtocols && href.search(/^https?:\/\//i) === -1) {
      continue;
    }
    if (!options.duplicates && seen[href]) {
      continue;
    }
    seen[href] = true;
    self.port.emit("link", {
      href,
      title: link.innerText
    });
  }
  self.port.emit("finished");
} catch (e) {
  console.error("Error in reader:", e);
}
