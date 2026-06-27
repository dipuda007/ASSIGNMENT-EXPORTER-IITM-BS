/*
 * Assignment Copier - background service worker.
 *
 * Stores captured assignment/course responses (deduplicated) in
 * chrome.storage.local, and fetches assignment images on request (with the
 * extension's host permissions) so the panel can embed them in copies/exports.
 * It never bypasses server-side hidden data.
 */

import { classify, deriveFlags, extractUnits } from "../lib/classify.js";

const STORE = {
  captures: "captures",       // { key: record }
  courseIndex: "courseIndex"  // { namespace: { id: { title, type } } }
};

function getLocal(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, function (r) { resolve(r || {}); });
  });
}
function setLocal(obj) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(obj, function () { resolve(); });
  });
}

function namespaceOf(url) {
  try { return new URL(url).searchParams.get("namespace") || ""; } catch (e) { return ""; }
}

function idFromUrl(url) {
  const m = String(url).match(/(?:assessments\/)?(\d+)\/?\?/) || String(url).match(/\/(\d+)\/?(?:$|\?)/);
  return m ? Number(m[1]) : null;
}

function titleFor(kind, data, id, namespace, courseIndex) {
  if (data && data.title) return String(data.title);
  const ci = courseIndex && courseIndex[namespace];
  if (ci && ci[id] && ci[id].title) return ci[id].title;
  if (kind === "assessment") return "Assessment " + id;
  if (kind === "programming") return "Programming " + id;
  return (kind || "item") + " " + id;
}

async function storeCapture(url, body) {
  let data;
  try { data = JSON.parse(body); } catch (e) { return; }
  const kind = classify(data);
  const namespace = namespaceOf(url);

  const state = await getLocal([STORE.captures, STORE.courseIndex]);
  const captures = state.captures || {};
  const courseIndex = state.courseIndex || {};

  if (kind === "course") {
    // Build/refresh the id -> title index for this namespace (nice titles).
    const units = extractUnits(data);
    courseIndex[namespace] = courseIndex[namespace] || {};
    for (const u of units) courseIndex[namespace][u.id] = { title: u.title, type: u.type };
    // Backfill titles on any already-captured assignments in this namespace.
    Object.values(captures).forEach(function (r) {
      if (r.namespace === namespace && r.id != null && courseIndex[namespace][r.id] &&
          (!r.data || !r.data.title)) {
        r.title = courseIndex[namespace][r.id].title;
      }
    });
    await setLocal({ [STORE.captures]: captures, [STORE.courseIndex]: courseIndex });
    return;
  }

  // progress / unknown are not exportable question data.
  if (kind === "progress" || kind === "unknown") return;

  const id = (data.id != null ? Number(data.id) : idFromUrl(url));
  if (id == null) return;
  const key = kind + ":" + namespace + ":" + id;

  captures[key] = {
    key: key,
    classify: kind,
    id: id,
    namespace: namespace,
    title: titleFor(kind, data, id, namespace, courseIndex),
    url: url,
    capturedAt: Date.now(),
    data: data,
    flags: deriveFlags(kind, data)
  };
  await setLocal({ [STORE.captures]: captures });
}

/* ---------------- messaging ---------------- */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === "AC_CAPTURE") {
    storeCapture(msg.url, msg.body);
    return;
  }

  if (msg.type === "AC_FETCH_IMAGE") {
    // Fetch an image with the extension's host permissions and return a data URL.
    fetch(msg.url, { credentials: "include" })
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          const fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = function () { resolve(null); };
          fr.readAsDataURL(blob);
        });
      })
      .then(function (dataUrl) { sendResponse({ ok: !!dataUrl, dataUrl: dataUrl }); })
      .catch(function () { sendResponse({ ok: false }); });
    return true;
  }
});

/* Open the side panel when the toolbar icon is clicked. */
chrome.runtime.onInstalled.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  }
});
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
}
chrome.action.onClicked.addListener(function (tab) {
  if (chrome.sidePanel && chrome.sidePanel.open && tab) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(function () {});
  }
});
