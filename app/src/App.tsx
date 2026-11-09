import { useEffect, useState } from "react";
import { DEMO_PROFILES, DEMO_SCENARIO } from "../shared/demo";
import { fetchUrl, getConfig, setupCall } from "./api";
import { loadSession, newSession, saveSession, type Session } from "./session";
import { Workspace } from "./Workspace";

export function App() {
  const [config, setConfig] = useState<{ live: boolean; model: string | null } | null>(null);
  const [session, setSessionState] = useState<Session | null>(() => loadSession());

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig({ live: false, model: null }));
  }, []);
  useEffect(() => saveSession(session), [session]);

  if (!config) return <div className="loading">Connecting to the local server…</div>;
  if (!session) return <Start live={config.live} onStart={setSessionState} />;
  return (
    <Workspace
      session={session}
      setSession={(fn) => setSessionState((s) => (s ? fn(s) : s))}
      live={config.live}
      model={config.model}
      onNewProject={() => confirm("Leave this project? Its progress will be cleared.") && setSessionState(null)}
    />
  );
}

function Start({ live, onStart }: { live: boolean; onStart: (s: Session) => void }) {
  const [customBg, setCustomBg] = useState("");
  return (
    <div className="start">
      <h1>Adaptive Learning</h1>
      <p className="lede">
        A notebook that watches how you work — runs, errors, questions, what you skip — and changes the path, the help and the practice to fit you. Based on Andy
        Matuschak's <a href="https://andymatuschak.org/hmwl/">How Might We Learn?</a>
      </p>
      {!live && (
        <div className="notice">
          Mock mode: the server is returning canned, rule-based responses. Restart it with <code>LIVE=1</code> to use Claude.
        </div>
      )}

      <div className="start-cols">
        <section className="card">
          <div className="eyebrow">DEMO · real data</div>
          <h2>{DEMO_SCENARIO.title}</h2>
          <p>{DEMO_SCENARIO.goal}</p>
          <p className="muted">BPA grid load by source at 5-minute intervals and Portland hourly temperatures, Nov 2–8 2026.</p>
          <div className="eyebrow">Start as</div>
          {DEMO_PROFILES.map((p) => (
            <button key={p.id} className="profile" onClick={() => onStart(newSession(DEMO_SCENARIO, p))}>
              <b>{p.name}</b>
              <span>{p.background}</span>
            </button>
          ))}
          <textarea rows={2} placeholder="…or describe your own background" value={customBg} onChange={(e) => setCustomBg(e.target.value)} />
          <button className="primary" disabled={!customBg.trim()} onClick={() => onStart(newSession(DEMO_SCENARIO, { id: "custom", name: "You", background: customBg }))}>
            Start with my background
          </button>
        </section>
        <BringYourOwn live={live} onStart={onStart} />
      </div>
    </div>
  );
}

function BringYourOwn({ live, onStart }: { live: boolean; onStart: (s: Session) => void }) {
  const [goal, setGoal] = useState("");
  const [background, setBackground] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [dataUrl, setDataUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFile = async (f: File) => {
    const t = await f.text();
    setFiles((x) => ({ ...x, [f.name]: t }));
  };
  const addUrl = async () => {
    setError(null);
    try {
      const { text } = await fetchUrl(dataUrl, "raw");
      const name = new URL(dataUrl).pathname.split("/").pop() || "data.csv";
      setFiles((x) => ({ ...x, [name.endsWith(".csv") ? name : `${name}.csv`]: text }));
      setDataUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const build = async () => {
    setError(null);
    try {
      let text = sourceText;
      if (sourceUrl && !text) {
        setStatus("Reading the source…");
        const r = await fetchUrl(sourceUrl, "text");
        text = r.text;
        if (r.truncated) setError(`Source was ${r.chars.toLocaleString()} characters; only the first 300,000 were used.`);
      }
      setStatus("Designing the project (one model call)…");
      const datasets = Object.entries(files).map(([name, t]) => {
        const lines = t.split(/\r?\n/);
        return { name, columns: (lines[0] ?? "").split(","), head: lines.slice(0, 6).join("\n") };
      });
      const { result } = await setupCall({ goal, background, sourceText: text, sourceUrl, datasets });
      onStart(newSession(result, { id: "custom", name: "You", background }, files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  return (
    <section className="card">
      <div className="eyebrow">BRING YOUR OWN</div>
      <h2>Start from your goal</h2>
      <label>
        What do you want to make or understand?
        <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Reproduce Figure 2 of this paper with the public data" />
      </label>
      <label>
        Your background
        <textarea rows={2} value={background} onChange={(e) => setBackground(e.target.value)} placeholder="What you already know, and what you don't" />
      </label>
      <label>
        Source — a paper, article or docs page (URL or pasted text)
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        <textarea rows={3} value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="…or paste the text" />
      </label>
      <label>
        Data (CSV)
        <input type="file" accept=".csv,text/csv" multiple onChange={(e) => Array.from(e.target.files ?? []).forEach(addFile)} />
      </label>
      <div className="row">
        <input value={dataUrl} onChange={(e) => setDataUrl(e.target.value)} placeholder="…or a CSV URL" />
        <button className="ghost" disabled={!dataUrl} onClick={addUrl}>
          Add
        </button>
      </div>
      {Object.keys(files).length > 0 && <div className="muted">Files: {Object.keys(files).join(", ")}</div>}
      <button className="primary" disabled={!live || !goal.trim() || !background.trim() || !!status} onClick={build}>
        {live ? status ?? "Build my project" : "Needs live mode"}
      </button>
      {error && <div className="log-error">{error}</div>}
    </section>
  );
}
