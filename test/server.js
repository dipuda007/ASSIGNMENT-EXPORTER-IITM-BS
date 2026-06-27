const http = require("http"), fs = require("fs"), path = require("path");
const root = process.argv[2];
const port = Number(process.argv[3] || 8123);
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".css": "text/css" };
http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/test/run-parser-test.html";
  const fp = path.join(root, p);
  fs.readFile(fp, function (e, d) {
    if (e) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(fp)] || "text/plain" });
    res.end(d);
  });
}).listen(port, function () { console.log("server up on " + port); });
