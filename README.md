# Assignment Copier

A Chrome (MV3) extension that captures, organizes and exports your IITM **SEEK**
assignment data — MCQ questions/options, programming prompts, starter code and
public test cases — so you can copy them into an LLM or your notes without
digging through DevTools → Network by hand.

It only reads responses your logged-in browser legitimately receives. It does
**not** scrape server-side hidden data and does **not** produce an answer key:
per-choice `score` values are reported only as a *status* (numeric present /
hidden / missing) and are redacted from JSON exports.

## Install (unpacked)

**From the source folder (or a cloned repo):**
1. Open `chrome://extensions` (or `edge://extensions` on Microsoft Edge).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (the one with `manifest.json`).
4. Pin the extension and click its icon to open the **side panel**.

**From the shared `.zip` (for friends):**
1. Unzip it to a normal folder you'll keep (don't delete it — Chrome loads from
   this folder each time).
2. Then follow steps 1–4 above, selecting the unzipped folder.

Requires a Chromium browser that supports MV3 `world: "MAIN"` content scripts
(Chrome/Edge 111+).

## Use

1. Go to your dashboard on `seek.study.iitm.ac.in` and open your course.
2. Click an assignment or programming assignment — it appears in the panel
   automatically. Working across courses? Switch between them from the
   top-right namespace dropdown.
3. Per assignment:
   - **Copy MD** — Markdown to clipboard. Image questions get an `[IMAGE]`
     placeholder + link; in **Preview**, each image has its own **Copy image**
     button.
   - **Copy Q img** — pops a `1 2 3 …` picker; click a number to copy that one
     question (prompt + options + images) as a crisp PNG. Paste straight into
     Gemini/ChatGPT, which import pasted images. (Per-question keeps each image
     small and sharp. Browsers can't put a *PDF* on the clipboard and web LLM
     boxes only accept pasted images/text, so this is the working equivalent.)
     Programming cards show a single **Copy img**.
   - **Download PDF** — a self-contained PDF with images embedded, for the
     upload-a-file workflow.
   - **Download** — Markdown + JSON (scores redacted) + image files.
   - **Preview** — inline view of questions/options/code/tests.
   - **Delete** — removes just that one assignment from the extension.

Status badges per card: question/test count, multi-select, typed answers,
has-images, score status, submitted. **Delete** (on a card) removes one
assignment; **Clear data** (top-right) wipes all of the extension's local
storage. Neither touches anything on SEEK.

## Layout

```
manifest.json
src/inject.js       page-context fetch/XHR hook (MAIN world)
src/content.js      bridge to the background worker (ISOLATED world)
src/background.js    storage, dedup, image fetch
lib/classify.js     classification + score-status (no answer key)
lib/parser.js       HTML cleanup, image extraction, Markdown, JSON redaction
lib/pdf.js          jsPDF-based self-contained PDF
lib/snapshot.js     per-question PNG snapshot (for clipboard "Copy img")
lib/jspdf.umd.min.js
panel/              the all-black side-panel UI
icons/
test/               headless render tests (not part of the extension runtime)
```

## Notes / limits

- Capture is on-demand: only assignments you actually open are recorded (keeps
  the list focused and avoids noise).
- If a server returns `score: null`, that's **hidden by server** — the tool says
  so and never tries to recover it.
- Private/hidden test cases are not fetched or bypassed.

## Contributors

- GitHub: [Ritik650](https://github.com/Ritik650)
- GitHub: [AbhiharRathore](https://github.com/AbhiharRathore)
