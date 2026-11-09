# Adaptive Learning — prototype

A Python notebook that watches how you work (runs, errors, questions, what you skip or call too easy) and changes the path, the help and the practice to fit you. Based on Andy Matuschak, [How Might We Learn?](https://andymatuschak.org/hmwl/) (May 2024), the article the Figma mockup in `reference-screens/` came from.

**What it tests:** whether the adaptation is real, meaning two learners doing the same work get different paths and help, and each change can be traced to something the learner did.

**What would end it:** "Replay as another learner" gives roughly the same path and help for very different backgrounds, or the help is no better than Colab Learn Mode (Gemini as a tutor inside a Colab notebook) on the same notebook.

## Where it lives

- **Try it:** https://adaptive-learning-proto.netlify.app (live, Claude on; capped at 60 model calls per visitor per hour and 400 per day for the whole site)
- **Showcase page** (video, walkthrough, link): https://futureoftheweb.org/p/4qwnjehafya9gqae, in the "FOTW prototypes" folder on futureoftheweb.org
- **Code:** github.com/heaversm/adaptive-learning-proto (private)

## Run locally

From `app/`:

- `npm install` (first time)
- **Mock mode** (no model calls, canned responses, not adaptive): `npm run dev`
- **Live mode** (Claude, billed to your key): `LIVE=1 npm run dev`. The key is read from `app/.env` (one line: `ANTHROPIC_API_KEY=...`) if that file exists, otherwise from the shell or an `ant auth login` profile. Keep `LIVE`, `MODEL` and other settings on the command line, not in `.env`.
- Open http://localhost:5173

Optional settings on the same command line: `MODEL=claude-opus-5-5` (default), `ADAPT_EFFORT=low` (default; per adapter call), `SETUP_EFFORT=medium` (default; building a project from your own goal).

## What's on screen

| Area | What it shows |
|---|---|
| Your path (left) | Project steps. Detours added for this learner, skips, and the reason for each. |
| Notebook (center) | Real Python in the browser (Pyodide). Help appears under the cell it's about, pinned to a line. |
| What the system thinks you know | Each concept's level and the evidence behind it (click a concept). |
| Practice from your own work | Recall questions built from your code and questions. "Skip ahead 4 days" moves the simulated clock so they come due. |
| One-line update (under the goal) | The latest meaningful change and its cause, e.g. "Added a detour on time indexes because resample failed on row numbers." Fades after 20 seconds; × closes it. |
| History (n) | Every model call: what triggered it, what changed, tokens and time. |
| Help cards | Hints pinned to a cell and line. – shrinks a card to a one-line chip, × closes it. Helpful, Too hard, Too easy, Not now feed back into the next update. "Reveal the answer" asks twice. |
| Hints only when I'm stuck | Top bar. Help appears only after an error, a minute stuck, or a question. |
| Replay as another learner | Re-runs the same events and notebook contents with a different background, side by side. |

## Demo data

- `app/public/data/bpa_load_5min.csv`: BPA Balancing Authority load and generation by source, 5-minute readings, Nov 2–8 2026. From https://transmission.bpa.gov/Business/Operations/Wind/baltwg.txt (rolling last 7 days).
- `app/public/data/portland_temp_hourly.csv`: Portland hourly 2 m temperature, same dates, from the Open-Meteo archive and forecast APIs.

## How it works

- The browser records events and sends a batch to `/api/adapt` after each run, error, question, "too easy", or a minute stuck after an error.
- The server makes one Claude call with structured output. It returns concept-level updates (each with evidence), path changes (each with a reason), at most one piece of help or none, and new recall questions.
- The demo project (`app/shared/demo.ts`) is hand-written. "Bring your own" makes one setup call that turns a goal, a background, a source and CSVs into a project.
- The learner profile and session stay in browser local storage.

## Known limits

- People in the "talk to someone" cards are made up and labeled that way. Matching to real people isn't built.
- Mock mode exercises the interface only. Its replay columns come out identical by design.
- One person per browser, no accounts. Progress lives in that browser's local storage; clearing it or switching browsers starts over.
- "Bring your own" has had less testing than the built-in demo.

## Testing

Test scripts, what to check and what counts as failure: [docs/testing.md](docs/testing.md).
