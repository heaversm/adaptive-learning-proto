// The built-in demo: real BPA grid data + real Portland temperatures.
// Hand-written so the app can run with no API calls. In live mode the adapter
// works against this scenario exactly as it would against a generated one.
import type { Profile, Scenario } from "./schema";

export const DEMO_PROFILES: Profile[] = [
  {
    id: "dev",
    name: "Priya · Python developer",
    background:
      "Backend developer, five years of Python, comfortable with pandas for reporting. No signal-processing, statistics beyond averages, or energy-systems background.",
  },
  {
    id: "eng",
    name: "Marcus · Power engineer",
    background:
      "Electrical engineer at a utility. Knows power systems, MW vs MWh, load curves, and sampling theory from DSP courses. Works in Excel; has written very little Python and never used pandas.",
  },
];

export const DEMO_SCENARIO: Scenario = {
  title: "Cold mornings and the Northwest grid",
  goal: "Find out how much a cold hour pushes up electricity demand on the Bonneville grid, and which power sources cover the extra.",
  datasets: [
    {
      name: "bpa_load_5min.csv",
      description:
        "BPA Balancing Authority load and generation by source at 5-minute intervals, Nov 2–8 2026, in MW. Columns: timestamp, load_mw, wind_solar_mw, hydro_mw, fossil_biomass_mw, nuclear_mw.",
    },
    {
      name: "portland_temp_hourly.csv",
      description: "Hourly air temperature at 2 m for Portland, OR (Open-Meteo), Nov 2–8 2026, °C. Columns: timestamp, temp_c.",
    },
  ],
  concepts: [
    { id: "time-index", name: "Timestamps as an index", why: "Both files are time series; nothing lines up until timestamps are real datetimes." },
    { id: "resampling", name: "Resampling to a coarser interval", why: "Load is every 5 minutes, temperature every hour. They have to match." },
    { id: "power-vs-energy", name: "Power (MW) vs energy (MWh)", why: "Averaging MW over an hour gives MWh for that hour; summing 5-minute MW readings does not." },
    { id: "sampling", name: "Sampling and lost peaks", why: "Keeping every 12th reading instead of averaging can miss short demand spikes." },
    { id: "joining", name: "Joining two series on time", why: "The question needs load and temperature in the same row." },
    { id: "fitting", name: "Fitting a line and reading its slope", why: "The slope is the answer: MW per degree." },
    { id: "fuel-mix", name: "Which sources follow load", why: "The second half of the goal: who covers the extra demand." },
  ],
  steps: [
    { id: "load", title: "Load both files", detail: "Read the two CSVs with timestamps parsed as datetimes and set as the index.", conceptIds: ["time-index"], kind: "core" },
    { id: "hourly", title: "Turn 5-minute load into hourly load", detail: "Get one load value per hour so it can sit next to temperature.", conceptIds: ["resampling", "power-vs-energy", "sampling"], kind: "core" },
    { id: "join", title: "Line up load with temperature", detail: "Put hourly load and temperature in one table, one row per hour.", conceptIds: ["joining"], kind: "core" },
    { id: "fit", title: "Fit demand against temperature", detail: "Scatter load against temperature, fit a line, and read the MW-per-degree slope.", conceptIds: ["fitting"], kind: "core" },
    { id: "mix", title: "See who covers the peaks", detail: "Compare how hydro, wind, fossil and nuclear move when load rises.", conceptIds: ["fuel-mix"], kind: "core" },
    { id: "claim", title: "Write the claim", detail: "One sentence the data supports, and what result would show it wrong.", conceptIds: [], kind: "core" },
  ],
  sources: [
    {
      id: "bpa-readme",
      title: "BPA Balancing Authority Load & Total Wind Generation — file header",
      kind: "dataset-readme",
      url: "https://transmission.bpa.gov/Business/Operations/Wind/baltwg.txt",
      excerpt:
        "Verbatim from the file: \"This represents loads and resources in BPA's Balancing Authority (BA) including some that are not BPA's. It does not include BPA loads served by transfer, scheduled out of region, or scheduled to customers with their own BAs such as Seattle and Tacoma.\"",
    },
    {
      id: "pandas-resample",
      title: "pandas documentation — DataFrame.resample",
      kind: "docs",
      url: "https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.resample.html",
      excerpt: "Summary: resample groups a time-indexed frame into fixed intervals (e.g. '1h'); you then choose how to combine each group — mean, sum, max, first.",
    },
    {
      id: "wiki-aliasing",
      title: "Wikipedia — Aliasing",
      kind: "article",
      url: "https://en.wikipedia.org/wiki/Aliasing",
      excerpt: "Summary: when a signal is sampled too slowly, fast changes can be misread as slower ones or lost; filtering before downsampling avoids it.",
    },
    {
      id: "scipy-decimate",
      title: "SciPy documentation — scipy.signal.decimate",
      kind: "docs",
      url: "https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.decimate.html",
      excerpt: "Summary: downsamples a signal after applying a low-pass filter, which is the signal-processing way to reduce sample rate without aliasing.",
    },
    {
      id: "open-meteo",
      title: "Open-Meteo Historical Weather API",
      kind: "docs",
      url: "https://open-meteo.com/en/docs/historical-weather-api",
      excerpt: "Summary: hourly reanalysis weather by coordinate; temperature_2m is air temperature two meters above ground, in local time when a timezone is requested.",
    },
  ],
  people: [
    { id: "mentor", name: "A grid modeler at a regional utility", role: "mentor", blurb: "Works on winter peak planning. Could explain why the slope changes below freezing." },
    { id: "peer", name: "Someone who finished this notebook last month", role: "peer", blurb: "Hit the same timezone mismatch when joining the two files." },
    { id: "video", name: "Short clip: resample vs. taking every Nth row", role: "video", blurb: "Two minutes, shows peaks disappearing on a real load curve." },
  ],
  starterCells: [
    {
      id: "c1",
      code: `import pandas as pd
import matplotlib.pyplot as plt

load = pd.read_csv("bpa_load_5min.csv")
temp = pd.read_csv("portland_temp_hourly.csv")
load.head()`,
    },
    {
      id: "c2",
      code: `# Step 2: one load value per hour
`,
    },
  ],
};
