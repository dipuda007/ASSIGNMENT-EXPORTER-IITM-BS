# Store listing copy — Assignment Copier

## Name
Assignment Copier

## Short description (≤132 chars)
Capture & export your IITM SEEK assignment questions, options, code and test cases as Markdown, JSON, per-question image or PDF.

## Category
Education (secondary: Productivity)

## Detailed description
Assignment Copier saves you from digging through DevTools to read your own IITM
SEEK course assignments. Open an assignment and it's captured automatically into
a clean, all-black side panel — ready to copy or export.

What it does
• MCQ assignments: questions + options, with multi-select, typed-answer and
  has-image detection. Questions whose options are HTML/code snippets are kept
  as readable code blocks.
• Programming assignments: prompt, allowed languages, starter/template code,
  your saved code, and public test cases.
• Image questions: pictures are pulled in and embedded — no broken links.

Export any assignment as:
• Copy MD — Markdown to clipboard.
• Copy Q img — pick a question number and copy just that question (prompt +
  options + images) as a crisp PNG you can paste straight into an AI chat.
• Download PDF — a self-contained PDF with images embedded.
• Download — Markdown + JSON + image files.

Organised by course: switch between courses from the top-right; search and
filter by MCQ / Code.

Privacy first
• Everything stays on your device (local browser storage). No accounts, no
  analytics, no external servers, no remote code.
• It only reads responses your logged-in browser already receives.
• It never reveals hidden grading data: per-choice scores are shown only as a
  status (present / hidden / missing) and are redacted from JSON exports.

Not affiliated with or endorsed by IIT Madras. For personal study use.

## Permission justifications
• storage, unlimitedStorage — cache captured assignments locally so they persist
  between sessions.
• sidePanel — the entire UI is a Chrome side panel.
• downloads — save Markdown / JSON / PDF / image exports to your computer.
• clipboardWrite — "Copy MD" and "Copy image" write to the clipboard.
• host: https://seek.study.iitm.ac.in/* — run the capture script on the course
  site to read the assignment data the page loads.
• host: https://backend.seek.study.iitm.ac.in/* — fetch assignment images so
  they can be embedded into copies and exports.

## Data usage disclosure (Chrome Web Store / Edge)
• Does this item collect user data? No data is collected or transmitted.
• All processing happens locally in the browser. The extension makes no requests
  to any server other than the IITM SEEK site the user is already using.

## Privacy policy blurb (host this at a public URL and paste the link)
Assignment Copier does not collect, store, or transmit any personal data to the
developer or any third party. All captured assignment content is stored only in
your browser's local extension storage on your own device, and is used solely to
display and export that content at your request. The extension communicates only
with the IITM SEEK website you are already logged into (to read assignment data
and fetch assignment images). It contains no analytics, no trackers, and no
remote code. You can delete all stored data at any time with the "Clear data"
button. Contact: <your email>.
