try {
  let seen = {};
  let baseLink = location.href.replace(/\#.*/, "");
  let links = document.querySelectorAll("a");
  for (let link of links) {
    let href = link.href;
    href = href.replace(/\#.*/, "");
    if (!href || href.indexOf(baseLink) === 0) {
      continue;
    }
    if (seen[href]) {
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
