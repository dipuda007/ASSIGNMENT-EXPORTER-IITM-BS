/*
 * Assignment Copier - page-context network hook (MAIN world).
 *
 * Runs in the page's own JS context so it can wrap window.fetch and
 * XMLHttpRequest BEFORE the Angular app uses them. It only reads responses the
 * logged-in user's browser already receives, and forwards the ones that look
 * like assignment/course data to the isolated content script via postMessage.
 *
 * It does not read auth tokens, does not make any requests of its own, and does
 * not bypass any server-side hidden data.
 */
(function () {
  if (window.__AC_HOOKED__) return;
  window.__AC_HOOKED__ = true;

  var API_HINTS = [
    "/api/v2/user/assessments/",
    "/api/v2/user/course",
    "/api/v2/user/student-progress"
  ];

  function interesting(url) {
    if (!url) return false;
    try {
      if (API_HINTS.some(function (h) { return url.indexOf(h) !== -1; })) return true;
      // short assignment paths like 84/?namespace=...
      return /\/\d+\/?\?namespace=/.test(url);
    } catch (e) { return false; }
  }

  function absolute(u) {
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  }

  function post(obj) {
    try {
      obj.__ACSOURCE = "inject";
      window.postMessage(obj, "*");
    } catch (e) { /* ignore */ }
  }

  /* ---- fetch ---- */
  var origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input) {
      var url = (typeof input === "string") ? input
        : (input && input.url) ? input.url : "";
      var p = origFetch.apply(this, arguments);
      try {
        p.then(function (resp) {
          try {
            if (resp && resp.ok && interesting(url)) {
              resp.clone().text().then(function (text) {
                post({ type: "capture", url: absolute(url), status: resp.status, body: text });
              }).catch(function () {});
            }
          } catch (e) { /* ignore */ }
          return resp;
        }).catch(function () {});
      } catch (e) { /* ignore */ }
      return p;
    };
  }

  /* ---- XMLHttpRequest ---- */
  var XP = XMLHttpRequest.prototype;
  var origOpen = XP.open;
  var origSend = XP.send;

  XP.open = function (method, url) {
    this.__ac_url = url;
    return origOpen.apply(this, arguments);
  };

  XP.send = function () {
    var self = this;
    try {
      self.addEventListener("load", function () {
        try {
          var url = self.__ac_url || self.responseURL || "";
          if (!interesting(url)) return;
          if (self.status < 200 || self.status >= 300) return;
          var text = null;
          if (self.responseType === "" || self.responseType === "text") text = self.responseText;
          else if (self.responseType === "json") text = JSON.stringify(self.response);
          if (text != null) post({ type: "capture", url: absolute(url), status: self.status, body: text });
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
    return origSend.apply(this, arguments);
  };
})();
