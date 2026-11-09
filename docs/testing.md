# Testing Adaptive Learning

What to run through, what to check, and what result would count as failure. Usage and setup are in the [README](../README.md).

The claim under test: the adapting is real. Two people with different backgrounds doing this project end up doing different things (different steps, practice and difficulty), and every change can be traced to something the learner did or said about themselves.

## Built-in demo: same work, two learners

The demo project uses real grid data: Bonneville Power Administration load by source, every 5 minutes, Nov 2–8 2026, plus Portland hourly temperatures.

- Open https://adaptive-learning-proto.netlify.app (or http://localhost:5173 when running locally). If a project is open, click **New project**.
- Click **Priya · Python developer**. Before any code, a one-line update should say how the path was shaped from her background (expect side lessons on MW vs MWh and on lost peaks; loading files folded into a quick check).
- Run cell 1. In cell 2 type `hourly = load.resample("1h").mean()` and run it. It fails because the timestamps are still text. Check: a hint appears pinned to the failing line, written for a Python developer, with the fix hidden behind **Reveal the answer**.
- Ask under the notebook: `why average the 5-minute numbers instead of adding them up?` Check: the answer explains MW vs MWh in plain words.
- Fix cell 2 yourself and plot hourly load. Check: the "Turn 5-minute load into hourly load" step is marked done.
- Click **Too easy** on a card. Check: a step is skipped or a harder "stretch" step is added, and no concept jumps to "solid" from the click alone.
- Click **Replay as another learner**, choose **Marcus · Power engineer**, click **Replay**.

**Pass:** Marcus's column differs in ways that fit his background: pandas side lessons instead of energy-units ones, different concept levels from the same actions.
**Fail:** the two columns are basically the same. Then the adapting is cosmetic.

Recorded result, Nov 9 2026: pass. Priya got side lessons on MW vs MWh, lost peaks and fitted slopes; Marcus got "Pandas for an Excel user" and a check of his downsampling against the hourly mean. Video: `media/demo.mp4`.

### Recording the demo run

`app/scripts/record-demo.mjs` drives the steps above in a real browser, adds on-screen captions and saves a video, screenshots, a timeline of every model call and the replay comparison to `test-runs/<timestamp>/` (not committed). It needs the app running locally in live mode and makes about 13 model calls.

- `cd app && node scripts/record-demo.mjs`
- If Playwright can't find a browser, pass one: `--chrome "/path/to/Google Chrome for Testing"`.
- The script stops at the first credentials or API error rather than recording a run with no adapting.

## Bring your own project

A run-through of the "Bring your own" path with a small public dataset: telling penguin species apart by bill shape (344 rows, Palmer Station, Antarctica).

**Set up the project**

- Open https://adaptive-learning-proto.netlify.app. If a project is already open, click **New project** (top right) and confirm.
- In the **Bring your own** card on the right, fill in:
  - **What do you want to make or understand?** `Can you tell the three penguin species apart just from bill length and depth?`
  - **Your background:** your real background, in your own words. Say what you don't know as well as what you do, e.g. `Creative technologist, comfortable with JavaScript, a little Python, not good with pandas or matplotlib, no statistics background.`
  - **Source (URL):** `https://allisonhorst.github.io/palmerpenguins/`
  - **Data (CSV):** paste `https://raw.githubusercontent.com/mwaskom/seaborn-data/master/penguins.csv` into the "…or a CSV URL" box and click **Add**. "Files: penguins.csv" should appear.
- Click **Build my project**. It makes one longer model call.

**Check the setup**

- It builds in under a minute. If it fails, the message under the button says why.
- The goal bar shows your question, sharpened.
- Within a few seconds a one-line update says how the path was shaped from your background. With the background above, expect beginner side lessons (marked DETOUR) on pandas or plotting, and nothing that assumes statistics.
- Hover a concept on the right: its level should cite your background, and only what you actually wrote. If a card or update describes you with a skill you didn't state, that's a bug.

**Work through it**

- **Run cell 1** (▶ Run, or Shift+Enter). It should load `penguins.csv` and show the first rows. If it errors, the generated starter code is wrong; note the error.
- **Cell 2: one scatter plot** of bill length against bill depth, one color per species. Try it yourself first, using only the hint card.
  - Click **Too hard** on the card. The next card should be a smaller, concrete step (one line, naming the function), and the concept should drop to "shaky".
  - If still stuck, click **Reveal the answer**, then **Yes, show me**. Every card asking for code should have this.
  - What a working cell 2 looks like, if the answer isn't revealed:

```python
penguins = penguins.dropna(subset=["bill_length_mm", "bill_depth_mm"])
for species, group in penguins.groupby("species"):
    plt.scatter(group["bill_length_mm"], group["bill_depth_mm"], label=species, alpha=0.7)
plt.xlabel("Bill length (mm)")
plt.ylabel("Bill depth (mm)")
plt.legend()
plt.show()
penguins.groupby("species")[["bill_length_mm", "bill_depth_mm"]].agg(["mean", "std"])
```

  (Assumes cell 1 named the table `penguins`; use whatever name it chose.) Three mostly separate clouds should appear: that's the answer to the question in one picture.
- **Ask a question** in the box under the notebook, e.g. `why do Adelie and Chinstrap overlap?` The answer should be pinned to the cell you were in and written for your background.
- **Write a rule** in a new cell (+ cell), e.g. "bill longer than 45 mm and depth under 16 mm means Gentoo", and count how often it's right. Expect hints toward comparing a rule's guesses with the species column, not the code itself.
- **Click Too easy** on any card once. The path should either skip a step or add a harder "stretch" step, with the reason under it.
- **Click Skip ahead 4 days** (top bar). Practice questions built from your own cells should be due in "Practice from your own work". Answer one; it gets graded.

**What would count as failure**

- The setup call times out or produces a cell 1 that doesn't run.
- The path looks the same whatever background you type. Check by starting again with a very different background (e.g. "Biologist, uses R daily, never used Python") and comparing.
- Hints routinely give away the code, or "Too hard" repeats the same hint in other words.
- You end up revealing every answer: the hints are too thin.
