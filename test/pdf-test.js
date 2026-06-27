import { buildPdfBlob } from "../lib/pdf.js";

const out = [];
try {
  const parsed = {
    kind: "assessment", title: "CSP MCQ", submitted: false, scoreStatus: "hidden",
    questions: [{
      prompt: "Pick the correct snippet.", promptImages: [], promptCode: false,
      isMcq: true, multiple: true,
      choices: [
        { label: "A", text: "<!DOCTYPE html>\n<html>\n</html>", images: [], looksLikeCode: true },
        { label: "B", text: "plain text option", images: [], looksLikeCode: false }
      ]
    }]
  };
  const blob = buildPdfBlob(parsed, new Map());
  out.push("pdf blob under strict CSP: " + blob.size + " bytes, type=" + blob.type);
  out.push("RESULT: " + (blob.size > 800 ? "PASS" : "SUSPICIOUS"));
} catch (e) {
  out.push("ERROR: " + (e && e.stack ? e.stack : e));
}
document.getElementById("out").textContent = out.join("\n");
