/*
 * Assignment Copier - render an assignment to a PNG the clipboard accepts.
 *
 * Browsers can't put a PDF on the clipboard for web paste (only text/plain,
 * text/html and image/png are allowed, and web LLM inputs only import pasted
 * images/text). So "Copy image" rasterizes the assignment to a PNG via the
 * SVG <foreignObject> trick — dependency-free, and images are embedded as
 * data URLs so the canvas is not tainted and toBlob() works.
 */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function statusWord(s) {
  if (s === "numeric") return "numeric scoring metadata present";
  if (s === "hidden") return "scores hidden by server (null)";
  return "scores missing";
}

function buildContent(parsed, imageMap) {
  const root = el("div", "ac-snap");
  root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

  const style = document.createElement("style");
  style.textContent =
    ".ac-snap{box-sizing:border-box;width:720px;background:#ffffff;color:#111111;" +
    "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;padding:26px;}" +
    ".ac-snap h1{font-size:20px;margin:0 0 6px;}" +
    ".ac-snap .meta{font-size:11px;color:#666;margin:0 0 16px;border-bottom:1px solid #dddddd;padding-bottom:10px;}" +
    ".ac-snap .q{margin:16px 0 0;padding-top:14px;border-top:1px solid #eeeeee;}" +
    ".ac-snap .q:first-of-type{border-top:none;padding-top:0;}" +
    ".ac-snap .qh{font-weight:700;margin-bottom:6px;color:#000;}" +
    ".ac-snap .prompt{white-space:pre-wrap;}" +
    ".ac-snap pre{background:#f5f5f7;border:1px solid #e3e3e9;border-radius:6px;padding:9px 11px;" +
    "font-family:Consolas,'Courier New',monospace;font-size:12px;white-space:pre-wrap;margin:7px 0;overflow:hidden;}" +
    ".ac-snap .opt{margin:6px 0;}" +
    ".ac-snap .lbl{font-weight:700;}" +
    ".ac-snap img{max-width:600px;border:1px solid #ddd;margin:9px 0;display:block;}" +
    ".ac-snap .typed{color:#b26a00;font-style:italic;}" +
    ".ac-snap .foot{margin-top:18px;border-top:1px solid #eee;padding-top:8px;font-size:10px;color:#999;font-style:italic;}";
  root.appendChild(style);

  root.appendChild(el("h1", null, parsed.title));

  function imgNode(url) {
    const data = imageMap.get(url);
    if (data) { const im = document.createElement("img"); im.setAttribute("src", data); return im; }
    return el("div", "typed", "[image could not be loaded]");
  }

  if (parsed.kind === "assessment") {
    root.appendChild(el("div", "meta",
      (parsed.submitted ? "Submitted" : "Not submitted") + " · " + statusWord(parsed.scoreStatus) +
      " · " + parsed.questions.length + " questions"));
    parsed.questions.forEach(function (q, i) {
      const block = el("div", "q");
      block.appendChild(el("div", "qh", "Q" + (i + 1) + (q.multiple ? "  (select all that apply)" : "")));
      if (q.promptCode) block.appendChild(el("pre", null, q.prompt));
      else block.appendChild(el("div", "prompt", q.prompt || "(no prompt text)"));
      q.promptImages.forEach(function (im) { block.appendChild(imgNode(im.url)); });
      if (!q.isMcq) {
        block.appendChild(el("div", "typed", "Typed answer — no options."));
      } else {
        q.choices.forEach(function (ch) {
          const box = q.multiple ? "[ ] " : "(  ) ";
          if (ch.looksLikeCode) {
            const o = el("div", "opt"); o.appendChild(el("span", "lbl", box + ch.label + ".")); block.appendChild(o);
            block.appendChild(el("pre", null, ch.text));
          } else {
            const o = el("div", "opt");
            const lbl = el("span", "lbl", box + ch.label + ". ");
            o.appendChild(lbl); o.appendChild(document.createTextNode(ch.text || (ch.images.length ? "(image)" : "")));
            block.appendChild(o);
          }
          ch.images.forEach(function (im) { block.appendChild(imgNode(im.url)); });
        });
      }
      root.appendChild(block);
    });
  } else {
    root.appendChild(el("div", "meta",
      "Programming · " + (parsed.difficulty || "n/a") + " · " + statusWord(parsed.scoreStatus) +
      " · " + parsed.publicTests.length + " public tests"));
    const qb = el("div", "q"); qb.appendChild(el("div", "qh", "Question"));
    qb.appendChild(el("div", "prompt", parsed.prompt || "(no prompt text)"));
    parsed.promptImages.forEach(function (im) { qb.appendChild(imgNode(im.url)); });
    root.appendChild(qb);
    parsed.languages.forEach(function (l) {
      const b = el("div", "q"); b.appendChild(el("div", "qh", "Starter code — " + l.language));
      b.appendChild(el("pre", null, l.prefixed_code || l.code_template || "(empty)"));
      root.appendChild(b);
    });
    if (parsed.publicTests.length) {
      const b = el("div", "q"); b.appendChild(el("div", "qh", "Public test cases"));
      parsed.publicTests.forEach(function (t, i) {
        b.appendChild(el("pre", null, "#" + (i + 1) + "  weight " + (t.weight == null ? "?" : t.weight) +
          "\ninput:  " + (t.input == null ? "" : t.input) + "\noutput: " + (t.output == null ? "" : t.output)));
      });
      root.appendChild(b);
    }
  }
  root.appendChild(el("div", "foot", "Assignment Copier — no answer key included; " + statusWord(parsed.scoreStatus) + "."));
  return root;
}

export async function buildSnapshotPngBlob(parsed, imageMap) {
  imageMap = imageMap || new Map();
  const node = buildContent(parsed, imageMap);

  // Measure off-screen.
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-100000px;top:0;width:720px;";
  holder.appendChild(node);
  document.body.appendChild(holder);
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width) || 720;
  const height = Math.ceil(rect.height) + 2;

  const xml = new XMLSerializer().serializeToString(node);
  document.body.removeChild(holder);

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + xml + "</foreignObject></svg>";

  const img = await new Promise(function (resolve, reject) {
    const i = new Image();
    i.onload = function () { resolve(i); };
    i.onerror = function (e) { reject(new Error("render failed")); };
    i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  const scale = Math.min((window.devicePixelRatio || 1) * 1.5, 3);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, 0, 0);

  return await new Promise(function (resolve, reject) {
    canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("toBlob failed")); }, "image/png");
  });
}
