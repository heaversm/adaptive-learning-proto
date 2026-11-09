import { useState } from "react";
import type { Level } from "../shared/schema";
import { simNow, DAY, type ScheduledRecall, type Session } from "./session";

const LEVELS: Level[] = ["unseen", "shaky", "working", "solid"];

export function PathPanel({ session, onDone }: { session: Session; onDone: (id: string) => void }) {
  const firstOpen = session.steps.find((s) => !session.completed.includes(s.id) && !session.skipped.includes(s.id));
  const reasonFor = (stepId: string) =>
    session.log
      .flatMap((l) => l.changes)
      .filter((c) => c.includes(`"${session.steps.find((s) => s.id === stepId)?.title}"`))
      .pop();
  return (
    <aside className="path">
      <h3>Your path</h3>
      <ol>
        {session.steps.map((s) => {
          const done = session.completed.includes(s.id);
          const skipped = session.skipped.includes(s.id);
          const current = s.id === firstOpen?.id;
          const why = reasonFor(s.id);
          return (
            <li key={s.id} className={`step ${s.kind} ${done ? "done" : ""} ${skipped ? "skipped" : ""} ${current ? "current" : ""}`}>
              <div className="step-title">
                {s.kind === "detour" && <span className="tag">detour</span>}
                {s.title}
              </div>
              {current && <div className="step-detail">{s.detail}</div>}
              {why && (s.kind === "detour" || skipped) && <div className="step-why">{why.replace(/^[^—]*— /, "")}</div>}
              {current && (
                <button className="link" onClick={() => onDone(s.id)}>
                  Mark done
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function LearnerPanel({ session }: { session: Session }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [folded, setFolded] = useState(false);
  const latest = session.log[session.log.length - 1];
  return (
    <section className="panel learner">
      <h3 className="fold" onClick={() => setFolded(!folded)}>
        What the system thinks you know <span className="caret">{folded ? "▸" : "▾"}</span>
      </h3>
      {!folded && <div className="bg">Background: {session.profile.background}</div>}
      {!folded && session.scenario.concepts.map((c) => {
        const st = session.concepts[c.id] ?? { level: "unseen", evidence: [] };
        const last = st.evidence[st.evidence.length - 1];
        const justChanged = !!latest?.changes.some((ch) => ch.startsWith(`${c.name}:`));
        return (
          <div key={c.id} className="concept" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
            <div className="concept-row" title={last ? `${last.level} ← ${last.text}` : c.why}>
              <span className="concept-name">{c.name}</span>
              <span key={justChanged ? latest!.id : "steady"} className={`level l-${st.level} ${justChanged ? "pulse" : ""}`}>
                {st.level}
              </span>
            </div>
            <div className="meter">
              {LEVELS.slice(1).map((l, i) => (
                <span key={l} className={LEVELS.indexOf(st.level) > i ? "on" : ""} />
              ))}
            </div>
            {openId === c.id && (
              <ul className="evidence">
                {st.evidence.length === 0 && <li className="muted">No evidence yet. {c.why}</li>}
                {st.evidence.map((e, i) => (
                  <li key={i}>
                    <b>{e.level}</b> — {e.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function PracticePanel(p: {
  due: ScheduledRecall[];
  total: number;
  active: ScheduledRecall | null;
  feedback: { correct: boolean; feedback: string } | null;
  busy: boolean;
  onStart: (r: ScheduledRecall) => void;
  onAnswer: (a: string) => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [folded, setFolded] = useState(false);
  return (
    <section className="panel practice">
      <h3 className="fold" onClick={() => setFolded(!folded)}>
        Practice from your own work {p.due.length > 0 && <span className="due-pill">{p.due.length} due</span>} <span className="caret">{folded ? "▸" : "▾"}</span>
      </h3>
      {!folded && !p.active && (
        <>
          <div className="muted">
            {p.total === 0 ? "Questions appear here once you've worked through something." : `${p.due.length} due now · ${p.total} scheduled`}
          </div>
          {p.due.map((r) => (
            <button key={r.id} className="recall-item" onClick={() => p.onStart(r)}>
              {r.question}
              <span className="based">from {r.basedOn}</span>
            </button>
          ))}
        </>
      )}
      {!folded && p.active && (
        <div className="recall-active">
          <div className="q">{p.active.question}</div>
          <div className="based">from {p.active.basedOn}</div>
          {!p.feedback ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                p.onAnswer(answer);
                setAnswer("");
              }}
            >
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Your answer, in your own words" />
              <button className="primary" disabled={!answer.trim() || p.busy}>
                {p.busy ? "Checking…" : "Submit"}
              </button>
            </form>
          ) : (
            <div className={`grade ${p.feedback.correct ? "ok" : "miss"}`}>
              <b>{p.feedback.correct ? "Got it." : "Not quite."}</b> {p.feedback.feedback}
            </div>
          )}
          <button className="link" onClick={p.onClose}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}

export function LogPanel({ session, adapting }: { session: Session; adapting: string | null }) {
  const now = simNow(session);
  const totals = session.log.reduce((a, l) => ({ input: a.input + (l.usage?.input ?? 0), output: a.output + (l.usage?.output ?? 0) }), { input: 0, output: 0 });
  return (
    <section className="panel log">

      {totals.input > 0 && (
        <div className="muted">
          {session.log.length} adapter calls · {totals.input.toLocaleString()} in / {totals.output.toLocaleString()} out tokens
        </div>
      )}
      {adapting && <div className="log-entry pending">Adapting to: {adapting}</div>}
      {[...session.log].reverse().map((l) => (
        <div key={l.id} className={`log-entry ${l.error ? "err" : ""}`}>
          <div className="log-when">{Math.round((now - l.t) / 60000) < 1 ? "just now" : `${Math.floor((now - l.t) / DAY) > 0 ? `${Math.floor((now - l.t) / DAY)}d` : `${Math.round((now - l.t) / 60000)}m`} ago`}{l.mock ? " · mock" : ""}{l.usage ? ` · ${(l.usage.ms / 1000).toFixed(1)}s` : ""}</div>
          {l.summary && <div className="log-summary">{l.summary}</div>}
          <div className="log-trigger">{l.trigger.join(" · ")}</div>
          {l.error && <div className="log-error">{l.error}</div>}
          {l.changes.map((c, i) => (
            <div key={i} className="log-change">→ {c}</div>
          ))}
          {l.intervention && <div className="log-change">→ Showed {l.intervention}</div>}
          {!l.error && l.changes.length === 0 && !l.intervention && <div className="log-change muted">→ No change: left you to work</div>}
        </div>
      ))}
    </section>
  );
}
