# SprintPulse

![Chrome 114+](https://img.shields.io/badge/Chrome-114%2B-0c66e4) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-22a06b) ![Private](https://img.shields.io/badge/data-stays%20in%20your%20browser-8f7ee7)

One-click, evidence-based **Red/Amber/Green (RAG)** sprint status reports from your **Jira Cloud** or **Trello** board,
in a **side panel** that stays beside your board and hides whenever you need the space.

> **Try it without installing:** open [`docs/index.html`](docs/index.html) in your browser for an interactive guide
> with an install checklist, a live RAG-rule calculator, shortcuts and FAQ.

**Private by design:** no server, no database, no analytics. All data stays in your browser.

---

## Quick start

<details open>
<summary><b>1. Install (2 minutes)</b></summary>

- [ ] Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
- [ ] Turn on **Developer mode** (top right).
- [ ] Click **Load unpacked** and select the folder that contains `manifest.json`.
- [ ] Pin SprintPulse from the puzzle-piece menu.
- [ ] Click the icon. The side panel opens on the right.

Requires Chrome / Edge 114 or newer (side panel support).
</details>

<details open>
<summary><b>2. Use the side panel</b></summary>

| Where you are | What to do |
| --- | --- |
| Any page | **Try demo data** to see a full example report. |
| Jira Cloud board (`https://<site>.atlassian.net/.../boards/<id>`) | **Analyze sprint**. Reads the active sprint with your logged-in session. |
| Trello board (`https://trello.com/b/<id>/...`) | Enter sprint start/end dates (remembered per board), then **Analyze sprint**. |

The panel **follows your active tab**: switch to another board and it resets to that board, no need to reopen it.
</details>

<details>
<summary><b>3. Hide and show the panel</b></summary>

| Action | How |
| --- | --- |
| Show | Click the SprintPulse toolbar icon |
| Hide | Hide button in the panel header, `Esc`, or the browser's own close (X) on the panel |
| Settings | Gear icon or the footer link (opens in a tab) |
</details>

<details>
<summary><b>4. Explore the result</b></summary>

- **Overview**: progress ring (work done vs time used), a clickable status bar, and four area cards.
  Click an area card to see the items behind its rating. Expand **Board health** and filter by problem type.
  **Recent checks** shows the last 10 results for the board.
- **Items**: every sprint item with search and status filters. Click a status chip or bar segment on Overview to jump here pre-filtered.
- **Report**: switch **Executive** / **Team**, then **Copy report** or **Save** as `.txt`. Both paste cleanly into email, WhatsApp or Slack.
</details>

<details>
<summary><b>Keyboard shortcuts</b></summary>

| Key | Action |
| --- | --- |
| `1` `2` `3` | Overview / Items / Report |
| `C` | Copy report |
| `D` | Demo data |
| `R` | Run again |
| `/` | Search items |
| `T` | Theme: System, Light, Dark |
| `Esc` | Hide the panel |
</details>

---

## RAG rules

Defaults, all editable in **Settings** (sliders and number fields stay in sync, with a live preview and `Ctrl+S` to save).
The interactive calculator in [`docs/index.html`](docs/index.html) lets you try them.

| Area | Green | Amber | Red |
| --- | --- | --- | --- |
| Schedule (time used % − work done %) | 5 pts or less | 6–15 pts | more than 15 pts |
| Blockers | none | 1–2, all 2 days old or less | 3 or more, or any older than 2 days |
| Scope (items added after sprint start) | 0% | up to 10% | more than 10% |
| Overdue (unfinished, past due date) | none | 1–2 | 3 or more |

The overall status is the **worst** of the four areas, and the report always explains why.

<details>
<summary>Board health checks</summary>

Stale (no update for 3+ days), unassigned, long-blocked (2+ days) and overdue items.
Health score = 100 − (items with an issue ÷ all items × 100).
</details>

## How data is read

<details>
<summary><b>Jira Cloud</b></summary>

Jira Agile REST API (`/rest/agile/1.0/...`), read-only GET requests run inside your Jira tab with your existing login.
Blocked = status name contains "block", label `blocked`, or the item is flagged.
"Added after start" = created after the sprint start date.
</details>

<details>
<summary><b>Trello</b></summary>

The board's JSON export (`/b/<id>.json`), with the Trello API as a fallback. Status comes from list names:
*Done/Complete* = done, *Doing/In progress/Review/Testing/QA* = in progress, *Blocked* (or a "blocked" label) = blocked.
</details>

<details>
<summary><b>Permissions</b></summary>

`sidePanel`, `scripting`, `storage`, and host access to `*.atlassian.net` and `trello.com` only.
Host access lets the panel read the board you are on after you switch tabs, without re-clicking the icon.
Nothing is read from other sites.
</details>

## Develop

```
node tests/engine.test.js     # 24 tests, Node.js 18+
```

<details>
<summary>Project structure</summary>

```
manifest.json             Chrome Manifest V3 (side panel)
background.js             Opens the side panel when the icon is clicked
sidepanel.html/.css/.js   Side panel UI and controller
options.html/.css/.js     Settings page
theme.js                  Light / dark / system theme (shared)
lib/engine.js             RAG rules and health checks (pure functions)
lib/normalize.js          URL detection + Jira/Trello JSON -> common item format
lib/fetchers.js           Read-only functions injected into the board tab
lib/report.js             Executive and Team plain-text reports
lib/sample.js             Demo sprint
docs/index.html           Interactive guide (open in a browser)
tests/engine.test.js      Automated tests
icons/                    Extension icons
```
</details>

## Known limits

- Progress is counted by number of items, not story points.
- Jira Cloud only (not Server/Data Center); Scrum boards with an active sprint.
- Blocker age is measured from the item's last update.
- Read-only: SprintPulse never changes your boards.
- The screenshots in `docs/screenshots/` show the earlier popup layout.

## Publish (optional)

Zip the folder contents and upload them to the Chrome Web Store Developer Dashboard
(a one-time developer registration fee applies). Use the line "No data leaves your browser" in the privacy section.
