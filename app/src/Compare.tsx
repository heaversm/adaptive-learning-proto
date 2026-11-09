// Replay this session's exact events and notebook states as a different learner.
// Same actions, different background: if the paths come out the same, the
// adaptation is cosmetic.
import { useState } from "react";
import { DEMO_PROFILES } from "../shared/demo";
import type { Profile } from "../shared/schema";
import { adaptCall } from "./api";
import { applyResponse, buildRequest, newSession, type Session } from "./session";

export function Compare({ session, live, onClose }: { session: Session; live: boolean; onClose: () => void }) {
  const others = DEMO_PROFILES.filter((p) => p.id !== session.profile.id);
  const [background, setBackground] = useState(others[0]?.background ?? "");
  const [name, setName] = useState(others[0]?.name ?? "Another learner");
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const batches = session.batches.map((b) => ({ ...b, events: b.events.filter((e) => e.kind !== "recall_answer") })).filter((b) => b.events.length);

  const replay = async () => {
    setError(null);
    const profile: Profile = { id: "replay", name, background };
    let s = newSession(session.scenario, profile, session.datasets);
    try {
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Replaying ${i + 1} of ${batches.length}…`);
        const { result: r } = await adaptCall(buildRequest(s, batches[i].events, batches[i].cells, null));
        const { session: next, changes } = applyResponse(s, r);
        s = {
          ...next,
          log: [...next.log, { summary: r.summary, id: String(i), t: Date.now(), trigger: batches[i].events.map((e) => e.summary), changes, intervention: r.intervention ? `${r.intervention.kind}: ${r.intervention.title}` : null, usage: null, mock: !live }],
        };
        setResult(s);
      }
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Same work, different learner</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          Replays your {batches.length} adapter calls (same events, same notebook contents) with a different background. If the two columns come out the same,
          the adaptation is cosmetic.{live && ` This makes ${batches.length} live model calls.`}
        </p>
        {!result && (
          <div className="replay-form">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Background
              <textarea rows={3} value={background} onChange={(e) => setBackground(e.target.value)} />
            </label>
            <div className="row">
              {others.map((p) => (
                <button key={p.id} className="ghost" onClick={() => (setName(p.name), setBackground(p.background))}>
                  Use {p.name}
                </button>
              ))}
              <button className="primary" onClick={replay} disabled={!!progress || !background.trim()}>
                Replay
              </button>
            </div>
          </div>
        )}
        {progress && <div className="adapting">{progress}</div>}
        {error && <div className="log-error">{error}</div>}
        {result && (
          <div className="compare-cols">
            <Column title={session.profile.name} s={session} />
            <Column title={name} s={result} />
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ title, s }: { title: string; s: Session }) {
  return (
    <div className="compare-col">
      <h3>{title}</h3>
      <h4>Path</h4>
      <ol className="mini-path">
        {s.steps.map((st) => (
          <li key={st.id} className={`${st.kind} ${s.skipped.includes(st.id) ? "skipped" : ""} ${s.completed.includes(st.id) ? "done" : ""}`}>
            {st.kind === "detour" && <span className="tag">detour</span>} {st.title}
          </li>
        ))}
      </ol>
      <h4>Concepts</h4>
      <ul className="mini-concepts">
        {s.scenario.concepts.map((c) => (
          <li key={c.id}>
            {c.name} <span className={`level l-${s.concepts[c.id]?.level}`}>{s.concepts[c.id]?.level}</span>
          </li>
        ))}
      </ul>
      <h4>What it showed</h4>
      <ul className="mini-log">
        {s.log.map((l) => (
          <li key={l.id}>{l.intervention ?? <span className="muted">nothing — left alone</span>}</li>
        ))}
      </ul>
    </div>
  );
}
