/*
 * Assignment Copier - parsing + export helpers (DOM-dependent, UI only).
 *
 * Turns captured JSON into clean structured objects, Markdown, and the data
 * the PDF builder needs. Handles: <br> -> newline, tag stripping, entity
 * decoding, <gcb-math> -> backticks, and image extraction (replaces <img>
 * with an [IMAGE n] placeholder and returns the list of URLs).
 */

/* Decode HTML, pull out images, and produce clean text + a code flag. */
export function cleanHtml(html) {
  if (html == null) return { text: "", images: [], looksLikeCode: false };
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  const images = [];

  doc.querySelectorAll("img").forEach(function (img) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (src) {
      images.push({ url: src, alt: img.getAttribute("alt") || "" });
      img.replaceWith(doc.createTextNode(" [IMAGE " + images.length + "] "));
    } else {
      img.remove();
    }
  });

  doc.querySelectorAll("gcb-math, .gcb-math").forEach(function (m) {
    const tex = (m.textContent || "").trim();
    m.replaceWith(doc.createTextNode(tex ? " `" + tex + "` " : ""));
  });

  doc.querySelectorAll("br").forEach(function (b) { b.replaceWith(doc.createTextNode("\n")); });
  doc.querySelectorAll("div, p, li, tr, h1, h2, h3, h4, pre").forEach(function (el) {
    el.appendChild(doc.createTextNode("\n"));
  });

  let text = doc.body.textContent || "";
  // Option/prompt content that is really literal markup shown as code,
  // e.g. an HTML-snippet question whose choices are <tag> source lines.
  const looksLikeCode = /<\/?[a-zA-Z!][^>]*>/.test(text) && /\n/.test(text);

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { text: text, images: images, looksLikeCode: looksLikeCode };
}

function optionLabel(i) {
  return String.fromCharCode(65 + i); // A, B, C ...
}

/* ----- structured parse ----- */

export function parseAssessment(rec) {
  const data = rec.data || {};
  const questions = [];
  for (const s of data.sections || []) {
    for (const it of s.items || []) {
      if (!it || it.kind !== "question" || !it.question) continue;
      const q = it.question;
      const prompt = cleanHtml(q.prompt);
      const isMcq = q.type === "mcq" && Array.isArray(q.choices) && q.choices.length > 0;
      const choices = [];
      if (Array.isArray(q.choices)) {
        q.choices.forEach(function (c, i) {
          const cc = cleanHtml(c && c.text);
          choices.push({ label: optionLabel(i), text: cc.text, images: cc.images, looksLikeCode: cc.looksLikeCode });
        });
      }
      questions.push({
        prompt: prompt.text,
        promptImages: prompt.images,
        promptCode: prompt.looksLikeCode,
        type: q.type || (isMcq ? "mcq" : "typed"),
        isMcq: isMcq,
        multiple: !!q.multiple_selections,
        weight: it.weight,
        choices: choices
      });
    }
  }
  return {
    kind: "assessment",
    title: rec.title,
    namespace: rec.namespace,
    submitted: !!data.is_submitted,
    scoreStatus: (rec.flags && rec.flags.scoreStatus) || "missing",
    questions: questions
  };
}

export function parseProgramming(rec) {
  const data = rec.data || {};
  const c = data.content || {};
  const prompt = cleanHtml(c.question);
  const langs = (c.allowed_languages || []).map(function (l) {
    return {
      language: l.language || "",
      prefixed_code: l.prefixed_code || "",
      code_template: l.code_template || "",
      uneditable_code: l.uneditable_code || "",
      suffixed_invisible_code: l.suffixed_invisible_code || "",
      filename: l.filename || ""
    };
  });
  return {
    kind: "programming",
    title: rec.title || data.title || ("Programming " + rec.id),
    namespace: rec.namespace,
    difficulty: c.difficulty || "",
    prompt: prompt.text,
    promptImages: prompt.images,
    languages: langs,
    savedCode: data.saved_code || {},
    publicTests: c.public_testcase || [],
    scoreStatus: (rec.flags && rec.flags.scoreStatus) || "hidden"
  };
}

export function parseRecord(rec) {
  return rec.classify === "programming" ? parseProgramming(rec) : parseAssessment(rec);
}

/* Collect every image URL in a record, with a stable label for filenames. */
export function collectImages(parsed) {
  const list = [];
  if (parsed.kind === "assessment") {
    parsed.questions.forEach(function (q, qi) {
      q.promptImages.forEach(function (im, k) { list.push({ url: im.url, label: "Q" + (qi + 1) + "-prompt-" + (k + 1) }); });
      q.choices.forEach(function (ch) {
        ch.images.forEach(function (im, k) { list.push({ url: im.url, label: "Q" + (qi + 1) + "-opt" + ch.label + "-" + (k + 1) }); });
      });
    });
  } else {
    parsed.promptImages.forEach(function (im, k) { list.push({ url: im.url, label: "prompt-" + (k + 1) }); });
  }
  return list;
}

/* ----- Markdown ----- */

const FENCE = "```";

function codeBlock(lang, code) {
  return FENCE + (lang || "") + "\n" + (code || "").replace(/\r/g, "") + "\n" + FENCE;
}

function statusWord(s) {
  if (s === "numeric") return "numeric scoring metadata present";
  if (s === "hidden") return "scores hidden by server (null)";
  return "scores missing";
}

export function assessmentToMarkdown(parsed) {
  const lines = [];
  lines.push("# " + parsed.title);
  lines.push("");
  lines.push("> Status: " + (parsed.submitted ? "Submitted" : "Not submitted") +
    " · Score metadata: " + statusWord(parsed.scoreStatus) +
    " · Questions: " + parsed.questions.length);
  lines.push("");

  parsed.questions.forEach(function (q, i) {
    lines.push("## Q" + (i + 1) + (q.multiple ? "  _(select all that apply)_" : ""));
    if (q.promptCode) {
      lines.push(codeBlock("html", q.prompt));
    } else {
      lines.push(q.prompt || "_(no prompt text)_");
    }
    q.promptImages.forEach(function (im, k) {
      lines.push("");
      lines.push("![Q" + (i + 1) + " image " + (k + 1) + "](" + im.url + ")");
    });
    lines.push("");

    if (!q.isMcq) {
      lines.push("_Typed answer — no options._");
    } else {
      q.choices.forEach(function (ch) {
        const box = q.multiple ? "- [ ] " : "- ( ) ";
        if (ch.images.length && !ch.text) {
          lines.push(box + ch.label + ". [IMAGE] " + ch.images.map(function (im) { return im.url; }).join(" "));
        } else if (ch.looksLikeCode) {
          lines.push(box + ch.label + ".");
          lines.push(codeBlock("html", ch.text));
          ch.images.forEach(function (im) { lines.push("  ![option " + ch.label + " image](" + im.url + ")"); });
        } else {
          let line = box + ch.label + ". " + (ch.text || "");
          lines.push(line);
          ch.images.forEach(function (im) { lines.push("  ![option " + ch.label + " image](" + im.url + ")"); });
        }
      });
    }
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

export function programmingToMarkdown(parsed) {
  const lines = [];
  lines.push("# " + parsed.title);
  lines.push("");
  lines.push("> Type: Programming · Difficulty: " + (parsed.difficulty || "n/a") +
    " · Public tests: " + parsed.publicTests.length +
    " · Score metadata: " + statusWord(parsed.scoreStatus));
  lines.push("");
  lines.push("## Question");
  lines.push(parsed.prompt || "_(no prompt text)_");
  parsed.promptImages.forEach(function (im, k) {
    lines.push("");
    lines.push("![image " + (k + 1) + "](" + im.url + ")");
  });
  lines.push("");

  parsed.languages.forEach(function (l) {
    lines.push("## Starter code — " + l.language + (l.filename ? " (" + l.filename + ")" : ""));
    const starter = l.prefixed_code || l.code_template || "";
    lines.push(codeBlock(l.language, starter || "// (empty)"));
    if (l.uneditable_code || l.suffixed_invisible_code) {
      lines.push("");
      lines.push("_Fixed/suffix code:_");
      lines.push(codeBlock(l.language, (l.uneditable_code || "") + (l.suffixed_invisible_code ? "\n" + l.suffixed_invisible_code : "")));
    }
    lines.push("");
  });

  const savedLangs = Object.keys(parsed.savedCode || {}).filter(function (k) { return parsed.savedCode[k]; });
  if (savedLangs.length) {
    lines.push("## Saved code");
    savedLangs.forEach(function (k) { lines.push(codeBlock(k, parsed.savedCode[k])); lines.push(""); });
  }

  if (parsed.publicTests.length) {
    lines.push("## Public test cases");
    lines.push("");
    lines.push("| # | Input | Expected output | Weight |");
    lines.push("| - | ----- | --------------- | ------ |");
    parsed.publicTests.forEach(function (t, i) {
      const inp = String(t.input == null ? "" : t.input).replace(/\n/g, "\\n").replace(/\|/g, "\\|");
      const out = String(t.output == null ? "" : t.output).replace(/\n/g, "\\n").replace(/\|/g, "\\|");
      lines.push("| " + (i + 1) + " | `" + inp + "` | `" + out + "` | " + (t.weight == null ? "" : t.weight) + " |");
    });
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function toMarkdown(parsed) {
  return parsed.kind === "programming" ? programmingToMarkdown(parsed) : assessmentToMarkdown(parsed);
}

/*
 * SAFETY: redact per-choice numeric scores from raw JSON exports so the tool
 * never hands over a derived answer key. The score *status* is still surfaced
 * as a badge; null/missing scores are left untouched (already "hidden").
 */
export function sanitizeForExport(data) {
  let clone;
  try { clone = JSON.parse(JSON.stringify(data)); } catch (e) { return data; }
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Array.isArray(node.choices)) {
      node.choices.forEach(function (c) {
        if (c && typeof c.score === "number") c.score = "[redacted: not exported as answer key]";
      });
    }
    Object.keys(node).forEach(function (k) { walk(node[k]); });
  })(clone);
  return clone;
}

export function slugify(s) {
  return String(s || "assignment").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assignment";
}
