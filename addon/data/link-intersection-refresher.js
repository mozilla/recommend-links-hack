document.getElementById("doit").addEventListener("click", function() {
  let number = parseInt(document.getElementById("number").value, 10);
  let howfar = parseInt(document.getElementById("howfar").value, 10);
  self.port.emit("doit", {
    number,
    howfar
  });
}, false);
document.getElementById("reset").addEventListener("click", function() {
  self.port.emit("reset");
}, false);
