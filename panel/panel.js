/* Assignment Copier - side panel UI logic */
import {
  parseRecord, toMarkdown, collectImages, slugify, sanitizeForExport
} from "../lib/parser.js";
import { buildPdfBlob } from "../lib/pdf.js";
import { buildSnapshotPngBlob } from "../lib/snapshot.js";

const $ = function (sel) { return document.querySelector(sel); };
const listEl = $("#list");
const emptyEl = $("#empty");
const subtitleEl = $("#subtitle");
const nsSelect = $("#ns-select");
const searchEl = $("#search");
const countEl = $("#count");
const clearBtn = $("#clear-btn");

let state = { captures: {}, courseIndex: {} };
let activeNs = "";
let activeFilter = "all";
let searchTerm = "";
const imageCache = new Map(); // url -> dataUrl|null

/* ---------- storage ---------- */
function getLocal(keys) {
  return new Promise(function (r) { chrome.storage.local.get(keys, function (v) { r(v || {}); }); });
}

async function loadState() {
  const s = await getLocal(["captures", "courseIndex"]);
  state.captures = s.captures || {};
  state.courseIndex = s.courseIndex || {};
}

/* ---------- helpers ---------- */
function recordsForNs(ns) {
  return Object.values(state.captures)
    .filter(function (r) { return (r.classify === "assessment" || r.classify === "programming") && r.namespace === ns; })
    .sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
}

function allNamespaces() {
  const set = new Set();
  Object.values(state.captures).forEach(function (r) { if (r.namespace) set.add(r.namespace); });
  Object.keys(state.courseIndex || {}).forEach(function (ns) { if (ns) set.add(ns); });
  return Array.from(set).sort();
}

function mostRecentNs() {
  let best = "", t = -1;
  Object.values(state.captures).forEach(function (r) {
    if (r.namespace && r.capturedAt > t) { t = r.capturedAt; best = r.namespace; }
  });
  return best;
}

function toast(msg, isErr) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.className = "toast hidden"; }, 2200);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url: url, filename: filename, saveAs: false }, function () {
    void chrome.runtime.lastError;
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  });
}

async function fetchImageDataUrl(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  let dataUrl = null;
  // Try direct fetch first (panel has host permissions); fall back to background.
  try {
    const r = await fetch(url, { credentials: "include" });
    if (r.ok) {
      const blob = await r.blob();
      dataUrl = await new Promise(function (res) {
        const fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(blob);
      });
    }
  } catch (e) { /* fall through */ }
  if (!dataUrl) {
    dataUrl = await new Promise(function (res) {
      chrome.runtime.sendMessage({ type: "AC_FETCH_IMAGE", url: url }, function (resp) {
        void chrome.runtime.lastError;
        res(resp && resp.ok ? resp.dataUrl : null);
      });
    });
  }
  imageCache.set(url, dataUrl);
  return dataUrl;
}

async function dataUrlToPngBlob(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.type === "image/png") return blob;
  // Convert to png via canvas for clipboard compatibility.
  const img = await new Promise(function (res, rej) {
    const im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return await new Promise(function (res) { c.toBlob(res, "image/png"); });
}

/* ---------- rendering ---------- */
function statusBadge(s) {
  if (s === "numeric") return { cls: "warn", text: "scores: numeric" };
  if (s === "hidden") return { cls: "info", text: "scores: hidden" };
  return { cls: "", text: "scores: missing" };
}

function render() {
  // namespace selector
  const namespaces = allNamespaces();
  if (!activeNs || namespaces.indexOf(activeNs) === -1) activeNs = mostRecentNs() || namespaces[0] || "";
  nsSelect.innerHTML = "";
  if (namespaces.length === 0) {
    const o = document.createElement("option"); o.textContent = "— no course —"; nsSelect.appendChild(o);
  } else {
    namespaces.forEach(function (ns) {
      const o = document.createElement("option");
      o.value = ns; o.textContent = ns; if (ns === activeNs) o.selected = true;
      nsSelect.appendChild(o);
    });
  }

  let recs = activeNs ? recordsForNs(activeNs) : [];
  const totalCaptured = Object.values(state.captures).filter(function (r) {
    return r.classify === "assessment" || r.classify === "programming";
  }).length;
  countEl.textContent = totalCaptured + " captured" + (namespaces.length > 1 ? " · " + namespaces.length + " courses" : "");

  // filters
  if (activeFilter !== "all") recs = recs.filter(function (r) { return r.classify === activeFilter; });
  if (searchTerm) {
    const t = searchTerm.toLowerCase();
    recs = recs.filter(function (r) { return (r.title || "").toLowerCase().indexOf(t) !== -1; });
  }

  subtitleEl.textContent = activeNs ? (activeNs + " · " + recs.length + " shown") : "Waiting for a SEEK course…";
  clearBtn.disabled = Object.keys(state.captures).length === 0;

  listEl.innerHTML = "";
  if (recs.length === 0) {
    emptyEl.classList.toggle("show", totalCaptured === 0);
    if (totalCaptured > 0) {
      const note = document.createElement("div");
      note.className = "q-prompt"; note.style.color = "var(--muted)"; note.style.textAlign = "center"; note.style.padding = "24px";
      note.textContent = "No assignments match this filter/search.";
      listEl.appendChild(note);
    }
    return;
  }
  emptyEl.classList.remove("show");

  recs.forEach(function (rec) { listEl.appendChild(renderCard(rec)); });
}

function renderCard(rec) {
  const f = rec.flags || {};
  const isCode = rec.classify === "programming";
  const card = document.createElement("div");
  card.className = "card" + (isCode ? " code-card" : "");

  const top = document.createElement("div");
  top.className = "card-top";
  const titleWrap = document.createElement("div");
  titleWrap.style.minWidth = "0";
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = rec.title;
  title.title = "Click to preview";
  title.addEventListener("click", function () { openDetail(rec); });
  const idLine = document.createElement("div");
  idLine.className = "id-line";
  idLine.textContent = "#" + rec.id + " · " + rec.namespace;
  titleWrap.appendChild(title); titleWrap.appendChild(idLine);

  const tag = document.createElement("span");
  tag.className = "kind-tag " + (isCode ? "kind-code" : "kind-mcq");
  tag.textContent = isCode ? "Code" : "MCQ";
  top.appendChild(titleWrap); top.appendChild(tag);

  // badges
  const badges = document.createElement("div");
  badges.className = "badges";
  function addBadge(cls, text) { const b = document.createElement("span"); b.className = "badge " + (cls || ""); b.innerHTML = '<span class="dot"></span>' + text; badges.appendChild(b); }

  if (isCode) {
    if (f.languages && f.languages.length) addBadge("", f.languages.join(", "));
    if (f.difficulty) addBadge("", f.difficulty);
    addBadge(f.hasPublicTests ? "good" : "", (f.publicTestCount || 0) + " public test" + ((f.publicTestCount || 0) === 1 ? "" : "s"));
  } else {
    addBadge("", (f.questionCount || 0) + " question" + ((f.questionCount || 0) === 1 ? "" : "s"));
    if (f.multipleAny) addBadge("info", "multi-select");
    if (f.hasTyped) addBadge("warn", "typed answers");
  }
  if (f.hasImages) addBadge("info", "has images");
  const sb = statusBadge(f.scoreStatus); addBadge(sb.cls, sb.text);
  addBadge(f.submitted ? "good" : "", f.submitted ? "submitted" : "not submitted");

  // actions
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.appendChild(makeAct("Copy MD", function () { actCopyMd(rec); }));

  let qpick = null;
  if (isCode) {
    // single prompt -> copy directly as one image
    actions.appendChild(makeAct("Copy img", function (btn) { actCopyQuestionImage(rec, 0, btn); }));
  } else {
    const n = f.questionCount || 0;
    const qbtn = makeAct("Copy Q img", function () { if (qpick) qpick.classList.toggle("show"); });
    actions.appendChild(qbtn);
    qpick = document.createElement("div");
    qpick.className = "qpick";
    const label = document.createElement("span");
    label.className = "qpick-label";
    label.textContent = n ? "Copy a question as an image:" : "No questions to copy.";
    qpick.appendChild(label);
    for (let i = 0; i < n; i++) {
      const num = document.createElement("button");
      num.className = "qnum"; num.textContent = String(i + 1);
      (function (idx) { num.addEventListener("click", function () { actCopyQuestionImage(rec, idx, num); }); })(i);
      qpick.appendChild(num);
    }
  }

  actions.appendChild(makeAct("Download PDF", function (btn) { actPdf(rec, "download", btn); }));
  actions.appendChild(makeAct("Download", function (btn) { actDownload(rec, btn); }));
  actions.appendChild(makeAct("Preview", function () { openDetail(rec); }));
  const del = makeAct("Delete", function (btn) { actDeleteRecord(rec, btn); });
  del.classList.add("danger");
  actions.appendChild(del);

  card.appendChild(top); card.appendChild(badges); card.appendChild(actions);
  if (qpick) card.appendChild(qpick);
  return card;
}

function makeAct(label, fn) {
  const b = document.createElement("button");
  b.className = "act"; b.textContent = label;
  b.addEventListener("click", function () { fn(b); });
  return b;
}

/* ---------- actions ---------- */
function actDeleteRecord(rec, btn) {
  if (!confirm('Delete "' + rec.title + '" from Assignment Copier?\n(Only removes it from this extension — your SEEK data is untouched.)')) return;
  chrome.storage.local.get(["captures"], function (s) {
    const caps = (s && s.captures) || {};
    delete caps[rec.key];
    chrome.storage.local.set({ captures: caps }, function () {
      void chrome.runtime.lastError;
      state.captures = caps;
      render();
      toast("Deleted ✓");
    });
  });
}

async function actCopyMd(rec) {
  try {
    const md = toMarkdown(parseRecord(rec));
    await navigator.clipboard.writeText(md);
    toast("Markdown copied ✓");
  } catch (e) { toast("Copy failed: " + e.message, true); }
}

async function preloadImages(parsed) {
  const imgs = collectImages(parsed);
  const map = new Map();
  for (const im of imgs) { map.set(im.url, await fetchImageDataUrl(im.url)); }
  return map;
}

async function actPdf(rec, mode, btn) {
  const orig = btn.textContent; btn.textContent = "…"; btn.disabled = true;
  try {
    const parsed = parseRecord(rec);
    const map = await preloadImages(parsed);
    const blob = buildPdfBlob(parsed, map);
    downloadBlob(blob, "assignment-copier/" + slugify(rec.title) + ".pdf");
    toast("PDF downloaded ✓");
  } catch (e) {
    toast("PDF failed: " + e.message, true);
  } finally { btn.textContent = orig; btn.disabled = false; }
}

// Copy ONE question (prompt + options + images) as a crisp PNG to the
// clipboard — pastes straight into Gemini/ChatGPT. Per-question keeps each
// image small and sharp (no tall-image clipping). For programming, qIndex 0
// is the whole prompt. Browsers can't put a PDF on the clipboard, so this is
// the working "copy as image" path.
async function actCopyQuestionImage(rec, qIndex, btn) {
  const orig = btn.textContent; btn.textContent = "…"; btn.disabled = true;
  try {
    const parsed = parseRecord(rec);
    let snap;
    if (parsed.kind === "assessment") {
      const q = parsed.questions[qIndex];
      if (!q) throw new Error("question not found");
      snap = Object.assign({}, parsed, {
        title: parsed.title + " — Q" + (qIndex + 1),
        questions: [q]
      });
    } else {
      snap = parsed; // single programming prompt
    }
    const map = await preloadImages(snap);
    const blob = await buildSnapshotPngBlob(snap, map);
    let copied = false;
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      }
    } catch (e) { copied = false; }
    if (copied) {
      toast((parsed.kind === "assessment" ? "Q" + (qIndex + 1) : "Image") + " copied — paste into your LLM ✓");
    } else {
      downloadBlob(blob, "assignment-copier/" + slugify(snap.title) + ".png");
      toast("Couldn't reach clipboard — saved PNG instead", true);
    }
  } catch (e) {
    toast("Copy image failed: " + e.message, true);
  } finally { btn.textContent = orig; btn.disabled = false; }
}

async function actDownload(rec, btn) {
  const orig = btn.textContent; btn.textContent = "…"; btn.disabled = true;
  try {
    const parsed = parseRecord(rec);
    const slug = slugify(rec.title);
    const folder = "assignment-copier/" + slug + "/";
    // markdown
    downloadBlob(new Blob([toMarkdown(parsed)], { type: "text/markdown" }), folder + slug + ".md");
    // json (raw captured payload)
    downloadBlob(new Blob([JSON.stringify(sanitizeForExport(rec.data), null, 2)], { type: "application/json" }), folder + slug + ".json");
    // images
    const imgs = collectImages(parsed);
    let n = 0;
    for (const im of imgs) {
      const dataUrl = await fetchImageDataUrl(im.url);
      if (!dataUrl) continue;
      const m = /^data:([^;]+)/.exec(dataUrl);
      const ext = m && /png/.test(m[1]) ? "png" : (m && /jpe?g/.test(m[1]) ? "jpg" : (m && /gif/.test(m[1]) ? "gif" : "img"));
      const blob = await (await fetch(dataUrl)).blob();
      downloadBlob(blob, folder + "images/" + im.label + "." + ext);
      n++;
    }
    toast("Downloaded MD + JSON" + (n ? " + " + n + " image" + (n === 1 ? "" : "s") : "") + " ✓");
  } catch (e) {
    toast("Download failed: " + e.message, true);
  } finally { btn.textContent = orig; btn.disabled = false; }
}

/* ---------- detail preview ---------- */
async function openDetail(rec) {
  const parsed = parseRecord(rec);
  $("#detail-title").textContent = rec.title;
  const body = $("#detail-body");
  body.innerHTML = "";

  if (parsed.kind === "assessment") {
    parsed.questions.forEach(function (q, i) {
      const block = document.createElement("div"); block.className = "q-block";
      const head = document.createElement("div"); head.className = "q-head";
      head.textContent = "Q" + (i + 1) + (q.multiple ? "  (select all that apply)" : "");
      block.appendChild(head);
      block.appendChild(promptNode(q.prompt, q.promptCode));
      q.promptImages.forEach(function (im) { block.appendChild(imageRow(im.url)); });
      if (!q.isMcq) {
        const t = document.createElement("div"); t.className = "typed-tag"; t.textContent = "Typed answer — no options."; block.appendChild(t);
      } else {
        q.choices.forEach(function (ch) {
          const row = document.createElement("div"); row.className = "opt";
          const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = ch.label + ".";
          row.appendChild(lbl);
          if (ch.looksLikeCode) { const pre = document.createElement("pre"); pre.className = "q-code opt-code"; pre.textContent = ch.text; row.appendChild(pre); }
          else { const span = document.createElement("span"); span.className = "opt-code"; span.textContent = ch.text || (ch.images.length ? "(image)" : ""); row.appendChild(span); }
          block.appendChild(row);
          ch.images.forEach(function (im) { block.appendChild(imageRow(im.url)); });
        });
      }
      body.appendChild(block);
    });
  } else {
    const block = document.createElement("div"); block.className = "q-block";
    const head = document.createElement("div"); head.className = "q-head"; head.textContent = "Question";
    block.appendChild(head);
    block.appendChild(promptNode(parsed.prompt, false));
    parsed.promptImages.forEach(function (im) { block.appendChild(imageRow(im.url)); });
    body.appendChild(block);

    parsed.languages.forEach(function (l) {
      const b = document.createElement("div"); b.className = "q-block";
      const h = document.createElement("div"); h.className = "q-head"; h.textContent = "Starter code — " + l.language;
      b.appendChild(h);
      const pre = document.createElement("pre"); pre.className = "q-code"; pre.textContent = l.prefixed_code || l.code_template || "(empty)";
      b.appendChild(pre); body.appendChild(b);
    });
    if (parsed.publicTests.length) {
      const b = document.createElement("div"); b.className = "q-block";
      const h = document.createElement("div"); h.className = "q-head"; h.textContent = "Public test cases (" + parsed.publicTests.length + ")";
      b.appendChild(h);
      parsed.publicTests.forEach(function (t, i) {
        const pre = document.createElement("pre"); pre.className = "q-code";
        pre.textContent = "#" + (i + 1) + "  weight " + (t.weight == null ? "?" : t.weight) + "\ninput:  " + (t.input == null ? "" : t.input) + "\noutput: " + (t.output == null ? "" : t.output);
        b.appendChild(pre);
      });
      body.appendChild(b);
    }
  }
  $("#detail").classList.remove("hidden");
}

function promptNode(text, isCode) {
  if (isCode) { const pre = document.createElement("pre"); pre.className = "q-code"; pre.textContent = text; return pre; }
  const d = document.createElement("div"); d.className = "q-prompt"; d.textContent = text || "(no prompt text)"; return d;
}

function imageRow(url) {
  const row = document.createElement("div"); row.className = "img-row";
  const img = document.createElement("img"); img.alt = "image"; img.src = url; img.loading = "lazy";
  const meta = document.createElement("div"); meta.className = "img-meta";
  const u = document.createElement("div"); u.className = "img-url"; u.textContent = url;
  const btn = document.createElement("button"); btn.className = "act"; btn.textContent = "Copy image";
  btn.style.marginTop = "6px";
  btn.addEventListener("click", async function () {
    btn.textContent = "…";
    try {
      const dataUrl = await fetchImageDataUrl(url);
      if (!dataUrl) throw new Error("could not load");
      const pngBlob = await dataUrlToPngBlob(dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      toast("Image copied — paste into your LLM ✓");
    } catch (e) { toast("Image copy failed: " + e.message, true); }
    finally { btn.textContent = "Copy image"; }
  });
  meta.appendChild(u); meta.appendChild(btn);
  row.appendChild(img); row.appendChild(meta);
  return row;
}

/* ---------- wiring ---------- */
nsSelect.addEventListener("change", function () { activeNs = nsSelect.value; render(); });
searchEl.addEventListener("input", function () { searchTerm = searchEl.value.trim(); render(); });
$("#filters").addEventListener("click", function (e) {
  const chip = e.target.closest(".chip"); if (!chip) return;
  document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
  chip.classList.add("active"); activeFilter = chip.dataset.filter; render();
});
$("#detail-close").addEventListener("click", function () { $("#detail").classList.add("hidden"); });
$("#detail").addEventListener("click", function (e) { if (e.target === $("#detail")) $("#detail").classList.add("hidden"); });
$("#clear-btn").addEventListener("click", function () {
  if (!confirm("Clear all captured assignment data? This only affects this extension's storage.")) return;
  chrome.storage.local.clear(function () { imageCache.clear(); loadState().then(render); toast("Cleared"); });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local") return;
  if (changes.captures) state.captures = changes.captures.newValue || {};
  if (changes.courseIndex) state.courseIndex = changes.courseIndex.newValue || {};
  render();
});

loadState().then(render);
