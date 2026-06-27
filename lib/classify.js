/*
 * Assignment Copier - pure classification & status helpers.
 * No DOM usage here, so this module is safe to import in the service worker.
 *
 * SAFETY: score helpers only ever report a *status* (numeric present / hidden /
 * missing). They never extract or expose which choice is correct.
 */

export function classify(obj) {
  if (!obj || typeof obj !== "object") return "unknown";

  if (Array.isArray(obj.sections) && obj.sections.some(function (s) { return Array.isArray(s.items); })) {
    return "assessment";
  }
  if (obj.content && (obj.content.question != null || Array.isArray(obj.content.allowed_languages))) {
    return "programming";
  }
  if (Array.isArray(obj.units) && obj.units.length &&
      obj.units[0] && ("answer_count" in obj.units[0] || "test_results" in obj.units[0])) {
    return "progress";
  }
  if (Array.isArray(obj.units) || obj.course || obj.children || Array.isArray(obj.weeks) || Array.isArray(obj.lessons)) {
    return "course";
  }
  return "unknown";
}

/* Returns "numeric" | "hidden" | "missing" — never the answer key itself. */
export function getScoreStatus(assessment) {
  let sawKey = false, sawNumber = false;
  for (const s of assessment.sections || []) {
    for (const it of s.items || []) {
      const q = it && it.question;
      if (!q || !Array.isArray(q.choices)) continue;
      for (const c of q.choices) {
        if (c && Object.prototype.hasOwnProperty.call(c, "score")) {
          sawKey = true;
          if (typeof c.score === "number") sawNumber = true;
        }
      }
    }
  }
  if (!sawKey) return "missing";
  if (sawNumber) return "numeric";
  return "hidden";
}

export function questionCount(assessment) {
  let n = 0;
  for (const s of assessment.sections || []) {
    for (const it of s.items || []) {
      if (it && it.kind === "question" && it.question) n++;
    }
  }
  return n;
}

/* Lightweight flags used by the list UI (no heavy parsing). */
export function deriveFlags(kind, data) {
  if (kind === "assessment") {
    let multipleAny = false, hasImages = false, hasTyped = false;
    for (const s of data.sections || []) {
      for (const it of s.items || []) {
        const q = it && it.question;
        if (!q) continue;
        if (q.multiple_selections) multipleAny = true;
        if (q.type && q.type !== "mcq") hasTyped = true;
        if (!Array.isArray(q.choices) || q.choices.length === 0) hasTyped = true;
        if (typeof q.prompt === "string" && /<img/i.test(q.prompt)) hasImages = true;
        for (const c of q.choices || []) {
          if (c && typeof c.text === "string" && /<img/i.test(c.text)) hasImages = true;
        }
      }
    }
    return {
      questionCount: questionCount(data),
      multipleAny: multipleAny,
      hasImages: hasImages,
      hasTyped: hasTyped,
      scoreStatus: getScoreStatus(data),
      submitted: !!data.is_submitted,
      readonly: !!data.is_readonly
    };
  }
  if (kind === "programming") {
    const c = data.content || {};
    const langs = (c.allowed_languages || []).map(function (l) { return l.language; }).filter(Boolean);
    const hasImages = typeof c.question === "string" && /<img/i.test(c.question);
    return {
      languages: langs,
      hasPublicTests: Array.isArray(c.public_testcase) && c.public_testcase.length > 0,
      publicTestCount: (c.public_testcase || []).length,
      difficulty: c.difficulty || "",
      hasImages: hasImages,
      scoreStatus: (data.score == null) ? "hidden" : "numeric",
      submitted: (data.score != null) || !!data.private_submission
    };
  }
  return {};
}

/*
 * Walk an arbitrary course-structure object and collect candidate units
 * { id, title, type }. We don't know the exact schema, so we recurse and
 * pick any node that has a numeric id plus a human title. The scanner then
 * fetches each and classifies the result, keeping only real assignments.
 */
export function extractUnits(courseObj) {
  const out = [];
  const seen = new Set();

  function isId(v) {
    return (typeof v === "number" && Number.isFinite(v)) ||
           (typeof v === "string" && /^\d+$/.test(v));
  }

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }

    const id = node.id != null ? node.id : (node.unit_id != null ? node.unit_id : node.lesson_id);
    const title = node.title || node.name || node.label;
    const type = node.type || node.component || node.kind || node.unit_type || "";
    if (isId(id) && title) {
      const key = String(id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: Number(id), title: String(title), type: String(type) });
      }
    }
    for (const k of Object.keys(node)) visit(node[k]);
  }

  visit(courseObj);
  return out;
}
