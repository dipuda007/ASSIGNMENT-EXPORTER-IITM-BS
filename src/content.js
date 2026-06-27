/*
 * Assignment Copier - isolated content script bridge.
 *
 * Receives postMessages from the page-context hook (inject.js) and relays
 * them to the background service worker, which has chrome.storage access.
 */
(function () {
  function relay(msg) {
    try {
      chrome.runtime.sendMessage(msg, function () {
        // swallow "receiving end does not exist" when SW is asleep; it will wake.
        void chrome.runtime.lastError;
      });
    } catch (e) { /* extension context invalidated on reload */ }
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d || d.__ACSOURCE !== "inject") return;

    if (d.type === "capture") {
      relay({ type: "AC_CAPTURE", url: d.url, status: d.status, body: d.body });
    }
  });
})();
