/*
 * Assignment Copier - PDF builder (uses jsPDF, loaded globally as window.jspdf).
 *
 * Produces a self-contained PDF: selectable text for questions/options/code
 * plus embedded images (passed in as a url -> dataURL map). Designed to be
 * uploaded to an LLM, which reads both the text and the pictures.
 *
 * No answer key is ever written — only a score-status note.
 */

function statusWord(s) {
  if (s === "numeric") return "numeric scoring metadata present";
  if (s === "hidden") return "scores hidden by server (null)";
  return "scores missing";
}

export function buildPdfBlob(parsed, imageMap) {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) throw new Error("jsPDF not loaded");
  const doc = new jsPDFCtor({ unit: "pt", format: "a4" });

  const M = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - M * 2;
  let y = M;

  imageMap = imageMap || new Map();

  function need(h) { if (y + h > pageH - M) { doc.addPage(); y = M; } }

  function para(text, size, style, color, gap) {
    size = size || 11;
    doc.setFont("helvetica", style || "normal");
    doc.setFontSize(size);
    const c = color || [25, 25, 28];
    doc.setTextColor(c[0], c[1], c[2]);
    const lines = doc.splitTextToSize(String(text == null ? "" : text), maxW);
    const lh = size * 1.35;
    for (const ln of lines) { need(lh); doc.text(ln, M, y); y += lh; }
    y += (gap == null ? 6 : gap);
  }

  function codePara(text) {
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    const inner = maxW - 16;
    const lines = doc.splitTextToSize(String(text == null ? "" : text).replace(/\t/g, "  "), inner);
    let yy = y;
    const lh = 11.5;
    // Render box per page chunk.
    need(lh + 16);
    let boxTop = yy;
    let boxLines = 0;
    doc.setTextColor(35, 35, 40);
    const drawBox = function (top, count) {
      doc.setFillColor(244, 244, 248);
      doc.setDrawColor(222, 222, 230);
      doc.roundedRect(M, top - 2, maxW, count * lh + 12, 4, 4, "FD");
    };
    // Pre-measure per page is complex; draw incrementally.
    let pending = [];
    yy = y + 12;
    for (const ln of lines) {
      if (yy > pageH - M) {
        drawBox(boxTop, boxLines);
        // redraw text over box
        doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(35, 35, 40);
        let ty = boxTop + 12;
        for (const p of pending) { doc.text(p, M + 8, ty); ty += lh; }
        doc.addPage(); y = M; yy = y + 12; boxTop = y; boxLines = 0; pending = [];
      }
      pending.push(ln); boxLines++; yy += lh;
    }
    drawBox(boxTop, boxLines);
    doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(35, 35, 40);
    let ty = boxTop + 12;
    for (const p of pending) { doc.text(p, M + 8, ty); ty += lh; }
    y = boxTop + boxLines * lh + 16;
  }

  function image(url) {
    const dataUrl = imageMap.get(url);
    if (!dataUrl) { para("[image could not be loaded: " + url + "]", 9, "italic", [150, 90, 90]); return; }
    try {
      const props = doc.getImageProperties(dataUrl);
      let dw = props.width, dh = props.height;
      const scale = Math.min(maxW / dw, 1.5);
      dw *= scale; dh *= scale;
      if (dw > maxW) { const s = maxW / dw; dw *= s; dh *= s; }
      const maxH = pageH - M * 2;
      if (dh > maxH) { const s = maxH / dh; dw *= s; dh *= s; }
      need(dh + 10);
      doc.addImage(dataUrl, props.fileType || "PNG", M, y, dw, dh);
      y += dh + 10;
    } catch (e) {
      para("[image embed failed]", 9, "italic", [150, 90, 90]);
    }
  }

  function divider() {
    need(12);
    doc.setDrawColor(225, 225, 230);
    doc.line(M, y, pageW - M, y);
    y += 12;
  }

  // ---- header ----
  para(parsed.title, 17, "bold", [15, 15, 18], 4);

  if (parsed.kind === "programming") {
    para("Programming · Difficulty: " + (parsed.difficulty || "n/a") +
      " · Public tests: " + parsed.publicTests.length +
      " · Score metadata: " + statusWord(parsed.scoreStatus), 9, "normal", [120, 120, 130]);
    divider();

    para("Question", 13, "bold");
    if (parsed.prompt) para(parsed.prompt, 11);
    parsed.promptImages.forEach(function (im) { image(im.url); });

    parsed.languages.forEach(function (l) {
      para("Starter code — " + l.language + (l.filename ? " (" + l.filename + ")" : ""), 12, "bold");
      codePara(l.prefixed_code || l.code_template || "(empty)");
      if (l.uneditable_code || l.suffixed_invisible_code) {
        para("Fixed / suffix code:", 9.5, "italic", [120, 120, 130], 2);
        codePara((l.uneditable_code || "") + (l.suffixed_invisible_code ? "\n" + l.suffixed_invisible_code : ""));
      }
    });

    const saved = Object.keys(parsed.savedCode || {}).filter(function (k) { return parsed.savedCode[k]; });
    if (saved.length) {
      para("Saved code", 12, "bold");
      saved.forEach(function (k) { para(k + ":", 9.5, "italic", [120, 120, 130], 2); codePara(parsed.savedCode[k]); });
    }

    if (parsed.publicTests.length) {
      para("Public test cases", 12, "bold");
      parsed.publicTests.forEach(function (t, i) {
        para("#" + (i + 1) + "   (weight " + (t.weight == null ? "?" : t.weight) + ")", 9.5, "bold", [80, 80, 90], 2);
        codePara("input:\n" + (t.input == null ? "" : t.input) + "\n\noutput:\n" + (t.output == null ? "" : t.output));
      });
    }
  } else {
    para("MCQ / Assessment · " + (parsed.submitted ? "Submitted" : "Not submitted") +
      " · Score metadata: " + statusWord(parsed.scoreStatus) +
      " · Questions: " + parsed.questions.length, 9, "normal", [120, 120, 130]);
    divider();

    parsed.questions.forEach(function (q, i) {
      para("Q" + (i + 1) + (q.multiple ? "   (select all that apply)" : ""), 12.5, "bold");
      if (q.promptCode) codePara(q.prompt); else if (q.prompt) para(q.prompt, 11);
      q.promptImages.forEach(function (im) { image(im.url); });

      if (!q.isMcq) {
        para("Typed answer — no options.", 10, "italic", [120, 120, 130]);
      } else {
        q.choices.forEach(function (ch) {
          const box = q.multiple ? "[ ] " : "(  ) ";
          if (ch.looksLikeCode) {
            para(box + ch.label + ".", 10.5, "bold", [40, 40, 50], 2);
            codePara(ch.text);
          } else if (ch.images.length && !ch.text) {
            para(box + ch.label + ".  (image below)", 10.5, "normal");
          } else {
            para(box + ch.label + ".  " + (ch.text || ""), 10.5, "normal");
          }
          ch.images.forEach(function (im) { image(im.url); });
        });
      }
      y += 4;
    });
  }

  divider();
  para("Exported by Assignment Copier. No answer key included — " + statusWord(parsed.scoreStatus) + ".",
    8, "italic", [155, 155, 160], 0);

  return doc.output("blob");
}
