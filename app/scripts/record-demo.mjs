// Scripted run of the demo, recorded to video, with on-screen captions.
// Needs the app running (npm run dev, or vite + a live server on 8787).
// Live mode makes real model calls (~10–12 per run).
//
//   node scripts/record-demo.mjs [--url http://localhost:5173] [--chrome /path/to/chrome]
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const URL = arg("url", "http://localhost:5173");
const CHROME = arg("chrome", process.env.CHROME_PATH);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.resolve("../test-runs", stamp);
fs.mkdirSync(OUT, { recursive: true });

const VIEW = { width: 1440, height: 960 };
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
const page = await context.newPage();
const notes = [];
const t0 = Date.now();
const clock = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s`;

async function caption(text) {
  notes.push(`${clock()}  ${text}`);
  console.log(`${clock()}  ${text}`);
  await page.evaluate((t) => {
    let el = document.getElementById("__caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__caption";
      el.style.cssText =
        "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;background:rgba(20,30,30,.92);color:#fff;font:500 17px Inter,system-ui;padding:12px 20px;border-radius:10px;max-width:900px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

const currentSession = () =>
  page.evaluate(() => {
    const id = new URLSearchParams(location.hash.slice(1)).get("p");
    const raw = id && localStorage.getItem("al-project:" + id);
    return raw ? JSON.parse(raw).session : null;
  });
const logCount = async () => (await currentSession())?.log?.length ?? 0;
async function waitForAdapt(before, label) {
  const start = Date.now();
  while ((await logCount()) <= before) {
    if (Date.now() - start > 120_000) throw new Error(`Timed out waiting for the adapter after: ${label}`);
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => !document.querySelector(".headline.pending"), null, { timeout: 120_000 });
  const s = await currentSession();
  const latest = s.log[s.log.length - 1];
  notes.push(`        → ${latest.summary || "(no summary — nothing worth showing)"}${latest.usage ? `  [${(latest.usage.ms / 1000).toFixed(1)}s, ${latest.usage.input} in / ${latest.usage.output} out]` : ""}`);
  if (latest.error) {
    notes.push(`        ✗ ${latest.error}`);
    // A credentials or API failure makes the rest of the recording meaningless.
    if (/credentials|API error|rejected/i.test(latest.error)) throw new Error(`Adapter failed: ${latest.error}`);
  }
}

async function act(label, fn) {
  const before = await logCount();
  await fn();
  await waitForAdapt(before, label);
}

const cell = (n) => page.locator(".cell").nth(n);
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const live = await page.evaluate(() => fetch("/api/config").then((r) => r.json()));
  notes.push(`Mode: ${live.live ? `LIVE (${live.model})` : "MOCK"}`);

  await caption("Priya: Python developer, comfortable with pandas, no signal-processing or energy background.");
  await page.waitForTimeout(2500);
  await page.getByText("Priya · Python developer").click();
  await caption("Before she writes any code, the path is shaped from her background.");
  await waitForAdapt(0, "session start");
  await page.getByText("Python ready").waitFor({ timeout: 90_000 });
  await page.waitForTimeout(4000);
  await shot("00-start");

  await caption("She runs the starter cell as given.");
  await act("run c1", () => cell(0).locator("button.run").click());
  await page.waitForTimeout(3000);

  await caption("She tries hourly averages the obvious way. It fails: the timestamps are still text.");
  await cell(1).locator("textarea").fill("");
  await cell(1).locator("textarea").pressSequentially('# Step 2: one load value per hour\nhourly = load.resample("1h").mean()', { delay: 18 });
  await act("run c2 (error)", () => cell(1).locator("button.run").click());
  await caption("A hint appears on the failing line, written for a Python developer. The answer stays hidden.");
  await page.waitForTimeout(5000);
  await shot("01-error-hint");

  await caption("She asks why the hourly value should be an average, not a sum.");
  await page.locator(".ask input").pressSequentially("why average the 5-minute numbers instead of adding them up?", { delay: 14 });
  await act("ask", () => page.locator(".ask button").click());
  await page.waitForTimeout(6000);
  await shot("02-question");

  await caption("She fixes the index herself and plots hourly load.");
  await cell(1).locator("textarea").fill("");
  await cell(1)
    .locator("textarea")
    .pressSequentially(
      '# Step 2: one load value per hour\nload["timestamp"] = pd.to_datetime(load["timestamp"])\nhourly = load.set_index("timestamp").resample("1h").mean()\nhourly["load_mw"].plot(title="Hourly load (MW)")\nplt.show()',
      { delay: 12 },
    );
  await act("run c2 (fixed)", () => cell(1).locator("button.run").click());
  await caption("Watch the path on the left and the concept levels on the right.");
  await page.waitForTimeout(6000);
  await shot("03-fixed");

  const tooEasy = page.locator(".intervention button", { hasText: "Too easy" }).last();
  if (await tooEasy.count()) {
    await caption('She marks the latest help "Too easy". The system should back off.');
    await act("too easy", () => tooEasy.click());
    await page.waitForTimeout(5000);
    await shot("04-too-easy");
  }

  await caption("Four days later (simulated clock): practice built from her own work.");
  await page.getByText("Skip ahead 4 days").click();
  await page.waitForTimeout(2500);
  // The scripted answer is about MW vs MWh, so prefer a question on that topic.
  const onTopic = page.locator(".recall-item", { hasText: /sum|MWh|average/i }).first();
  const item = (await onTopic.count()) ? onTopic : page.locator(".recall-item").first();
  if (await item.count()) {
    await item.click();
    await page.waitForTimeout(1500);
    await page.locator(".recall-active textarea").pressSequentially(
      "The readings are power in MW, so averaging an hour of them gives the energy for that hour in MWh. Adding twelve readings would overcount.",
      { delay: 10 },
    );
    await act("recall answer", () => page.locator(".recall-active button.primary").click());
    await page.waitForTimeout(5000);
    await shot("05-recall");
  } else {
    notes.push("        (no recall questions were scheduled)");
  }

  await caption("History: every update, what triggered it, and what it changed.");
  await page.getByRole("button", { name: /^History/ }).click();
  await page.waitForTimeout(4500);
  await shot("06-history");
  await page.locator(".modal .ghost", { hasText: "Close" }).click();

  await caption("The real test: replay the same actions as Marcus, a power engineer new to pandas.");
  await page.getByText("Replay as another learner").click();
  await page.waitForTimeout(2000);
  await page.locator(".replay-form button.primary").click();
  await page.waitForFunction(() => !!document.querySelector(".compare-cols") && !document.querySelector(".modal .adapting"), null, { timeout: 300_000 });
  await caption("Same work, two backgrounds. If these columns match, the adaptation is cosmetic.");
  await page.waitForTimeout(8000);
  await shot("07-replay");
  fs.writeFileSync(path.join(OUT, "replay.txt"), await page.locator(".compare-cols").innerText());
} catch (err) {
  notes.push(`FAILED: ${err.message}`);
  console.error(err);
  await shot("failure").catch(() => {});
} finally {
  const session = await currentSession().catch(() => null);
  if (session) fs.writeFileSync(path.join(OUT, "session.json"), JSON.stringify(session));
  fs.writeFileSync(path.join(OUT, "timeline.txt"), notes.join("\n") + "\n");
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = video ? await video.path() : null;
  if (webm) {
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", path.join(OUT, "demo.mp4")]);
      console.log(`Video: ${path.join(OUT, "demo.mp4")}`);
    } catch {
      console.log(`Video (webm): ${webm}`);
    }
  }
  console.log(`Output: ${OUT}`);
}
