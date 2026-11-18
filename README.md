# SprintPulse

One-click, evidence-based **Red/Amber/Green (RAG)** sprint status reports from your **Jira Cloud** or **Trello** board.

SprintPulse reads the active sprint, rates four areas (Schedule, Blockers, Scope, Overdue), checks board health,
and writes two reports: a short **Executive summary** for management and a detailed **Team report**.
Both paste cleanly into email, WhatsApp or Slack.

**Private by design:** no server, no database, no analytics. All data stays in your browser.

---

## Install (2 minutes)

1. Unzip `sprintpulse.zip`.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `sprintpulse` folder (the one that contains `manifest.json`).
5. Pin SprintPulse from the puzzle-piece menu so the icon is always visible.

## Use

| Where you are | What to do |
| --- | --- |
| Any page | Click the icon, then **Try demo data** to see a full example report. |
| Jira Cloud board (`https://<site>.atlassian.net/.../boards/<id>`) | Click the icon, then **Analyze sprint**. The active sprint is read using your logged-in session. |
| Trello board (`https://trello.com/b/<id>/...`) | Click the icon, enter the sprint start and end dates (remembered per board), then **Analyze sprint**. |

Then explore the result:

- **Overview** tab: progress ring (work done vs time used), a clickable status bar, and four area cards.
  Click an area card to see the items behind its rating. Expand **Board health** and filter by problem type.
  **Recent checks** shows the last 10 results for the board.
- **Items** tab: every sprint item with search and status filters. Click a status chip or bar segment on the
  Overview tab to jump here already filtered.
- **Report** tab: switch between **Executive** and **Team**, then **Copy report** or **Save** it as a .txt file.

Keyboard shortcuts in the popup: `1` `2` `3` switch tabs, `C` copy, `D` demo, `R` run again, `/` search, `T` theme.
The theme button cycles System → Light → Dark.

Open **Settings** (popup footer or the gear icon) to change any threshold. Sliders and number fields stay in sync,
a live preview shows the resulting Green/Amber/Red rule, and a save bar appears when you have unsaved changes (`Ctrl+S` saves).

## RAG rules (defaults, editable in Settings)

| Area | Green | Amber | Red |
| --- | --- | --- | --- |
| Schedule (time used % − work done %) | 5 pts or less | 6–15 pts | more than 15 pts |
| Blockers | none | 1–2, all 2 days old or less | 3 or more, or any older than 2 days |
| Scope (items added after sprint start) | 0% | up to 10% | more than 10% |
| Overdue (unfinished, past due date) | none | 1–2 | 3 or more |

The overall status is the **worst** of the four areas, and the report always explains why.

Board health checks: stale (no update for 3+ days), unassigned, long-blocked (2+ days) and overdue items.
Health score = 100 − (items with an issue ÷ all items × 100).

## How data is read

- **Jira Cloud:** Jira Agile REST API (`/rest/agile/1.0/...`), read-only GET requests, run inside your Jira tab with your
  existing login. Blocked = status name contains "block", label `blocked`, or the item is flagged.
  "Added after start" = created after the sprint start date.
- **Trello:** the board's JSON export (`/b/<id>.json`), with the Trello API as a fallback. Status comes from list names:
  *Done/Complete* = done, *Doing/In progress/Review/Testing/QA* = in progress, *Blocked* (or a "blocked" label) = blocked.
- Permissions: `activeTab`, `scripting`, `storage` only. The extension can read a tab only after you click its icon.

## Run the tests

```
node tests/engine.test.js
```

24 tests cover every RAG rule, the health checks, both normalizers, the reports, the demo data and the data
fetchers (with a mocked browser). Requires Node.js 18+.

## Project structure

```
manifest.json        Chrome Manifest V3
popup.html/.css/.js  Popup UI and controller
options.html/.css/.js Settings page
theme.js             Light / dark / system theme (shared)
lib/engine.js        RAG rules and health checks (pure functions)
lib/normalize.js     URL detection + Jira/Trello JSON -> common item format
lib/fetchers.js      Read-only functions injected into the board tab
lib/report.js        Executive and Team plain-text reports
lib/sample.js        Demo sprint
tests/engine.test.js Automated tests
icons/               Extension icons
```

## Known limits (v1.0)

- Progress is counted by number of items, not story points.
- Jira Cloud only (not Jira Server/Data Center); Scrum boards with an active sprint.
- Blocker age is measured from the item's last update.
- Read-only: SprintPulse never changes your boards.

## Publish (optional)

Zip the folder contents and upload them to the Chrome Web Store Developer Dashboard
(a one-time developer registration fee applies). Use the line "No data leaves your browser" in the privacy section.
