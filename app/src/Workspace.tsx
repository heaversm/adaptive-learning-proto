import { useCallback, useEffect, useRef, useState } from "react";
import type { LearnerEvent, LearnerEventKind } from "../shared/schema";
import { adaptCall } from "./api";
import { Notebook } from "./Notebook";
import { LearnerPanel, LogPanel, PathPanel, PracticePanel } from "./Panels";
import { Compare } from "./Compare";
import { loadPython, resetKernel, runCell, writeFile } from "./python";
import {
  applyResponse,
  buildRequest,
  gradeRecall,
  newCell,
  simNow,
  snapshotCells,
  uid,
  type ScheduledRecall,
  type Session,
} from "./session";

// Which events make the adapter run now, vs. wait to ride along with the next trigger.
const TRIGGERS: LearnerEventKind[] = ["session_start", "run_ok", "run_error", "stuck", "question", "too_easy", "too_hard", "recall_answer", "step_done"];
const STUCK_MS = 60_000;

type Props = {
  session: Session;
  setSession: (fn: (s: Session) => Session) => void;
  live: boolean;
  model: string | null;
  onNewProject: () => void;
};

export function Workspace({ session, setSession, live, model, onNewProject }: Props) {
  const [pyStatus, setPyStatus] = useState("starting");
  const [adapting, setAdapting] = useState<string | null>(null);
  const [activeRecall, setActiveRecall] = useState<ScheduledRecall | null>(null);
  const [recallFeedback, setRecallFeedback] = useState<{ correct: boolean; feedback: string } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pending = useRef<LearnerEvent[]>([]);
  const inFlight = useRef(false);
  const pendingRecallRef = useRef<ScheduledRecall | null>(null);
  const stuckTimer = useRef<number | null>(null);

  // Boot Python and write the datasets into its file system.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPython((s) => !cancelled && setPyStatus(s));
      resetKernel();
      for (const d of session.scenario.datasets) {
        const text = session.datasets[d.name] ?? (await fetch(`/data/${d.name}`).then((r) => (r.ok ? r.text() : "")));
        if (text) writeFile(d.name, text);
      }
      if (!cancelled) setPyStatus("ready");
    })().catch((e) => setPyStatus(`failed: ${e}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.scenario.title, session.profile.id]);

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current.length === 0) return;
    if (!pending.current.some((e) => TRIGGERS.includes(e.kind))) return;
    inFlight.current = true;
    const events = pending.current.splice(0);
    const s = sessionRef.current;
    const cells = snapshotCells(s.cells);
    const pr = pendingRecallRef.current;
    pendingRecallRef.current = null;
    setAdapting(events.map((e) => e.summary).join(" · "));
    const logId = uid();
    try {
      const { result, usage, mock } = await adaptCall(
        buildRequest(s, events, cells, pr ? { question: pr.question, answer: pr.answer, conceptId: pr.conceptId } : null),
      );
      setSession((cur) => {
        const { session: next, changes } = applyResponse(cur, result);
        let out = next;
        if (result.recallGrade && pr) {
          out = gradeRecall(out, pr.id, result.recallGrade.correct);
          changes.push(`Recall ${result.recallGrade.correct ? "correct — next review pushed out" : "missed — back tomorrow"}`);
        }
        return {
          ...out,
          batches: [...out.batches, { events, cells }],
          log: [
            ...out.log,
            { summary: result.summary, id: logId, t: simNow(cur), trigger: events.map((e) => e.summary), changes, intervention: result.intervention ? `${result.intervention.kind}: ${result.intervention.title}` : null, usage, mock },
          ],
        };
      });
      if (result.recallGrade) setRecallFeedback(result.recallGrade);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSession((cur) => ({ ...cur, log: [...cur.log, { summary: `Couldn't update: ${message}`, id: logId, t: simNow(cur), trigger: events.map((e) => e.summary), changes: [], intervention: null, usage: null, mock: false, error: message }] }));
    } finally {
      inFlight.current = false;
      setAdapting(null);
      // Anything that arrived while we were waiting goes next.
      if (pending.current.some((e) => TRIGGERS.includes(e.kind))) void flush();
    }
  }, [setSession]);

  const record = useCallback(
    (e: Omit<LearnerEvent, "t">) => {
      pending.current.push({ ...e, t: simNow(sessionRef.current) });
      void flush();
    },
    [flush],
  );

  // First update: shape the path from the learner's background before any code is written.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || sessionRef.current.batches.length > 0 || sessionRef.current.log.length > 0) return;
    started.current = true;
    record({ kind: "session_start", summary: "Started the project" });
  }, [record]);

  // ---------- notebook actions ----------

  const run = (cellId: string) => {
    if (pyStatus !== "ready") return;
    const cell = sessionRef.current.cells.find((c) => c.id === cellId);
    if (!cell) return;
    const r = runCell(cell.code);
    setSession((s) => ({
      ...s,
      cells: s.cells.map((c) =>
        c.id === cellId ? { ...c, stdout: r.stdout, html: r.html, text: r.text, images: r.images, error: r.error, errorLine: r.line, ran: true } : c,
      ),
    }));
    if (stuckTimer.current) window.clearTimeout(stuckTimer.current);
    if (r.error) {
      record({ kind: "run_error", cellId, code: cell.code, output: `line ${r.line ?? "?"}: ${r.error}`, summary: `Error in ${cellId}, line ${r.line ?? "?"}: ${r.error.split("\n").pop()}` });
      stuckTimer.current = window.setTimeout(
        () => record({ kind: "stuck", cellId, summary: `No new run for ${STUCK_MS / 1000}s after the error in ${cellId}` }),
        STUCK_MS,
      );
    } else {
      // The cell now runs cleanly, so open help about it is out of date: close it.
      setSession((s) => ({
        ...s,
        interventions: s.interventions.map((i) => (i.status === "open" && i.cellId === cellId ? { ...i, status: "resolved" as const } : i)),
      }));
      const what = [r.images.length ? `${r.images.length} plot(s)` : "", r.html ? "a table" : "", r.text ? "a value" : "", r.stdout ? "printed output" : ""].filter(Boolean).join(", ");
      record({ kind: "run_ok", cellId, code: cell.code, summary: `Ran ${cellId} cleanly${what ? ` → ${what}` : ""}` });
    }
  };

  const editCell = (cellId: string, code: string) => setSession((s) => ({ ...s, cells: s.cells.map((c) => (c.id === cellId ? { ...c, code } : c)) }));

  const addCell = (afterId: string | null, code = "") => {
    const id = `c${sessionRef.current.cells.length + 1}-${uid().slice(0, 3)}`;
    setSession((s) => {
      const cells = [...s.cells];
      const idx = afterId ? cells.findIndex((c) => c.id === afterId) : cells.length - 1;
      cells.splice(idx + 1, 0, newCell(id, code));
      return { ...s, cells };
    });
    return id;
  };

  const ask = (question: string, cellId: string | null) =>
    record({ kind: "question", cellId: cellId ?? undefined, summary: `Asked: "${question}"` });

  const feedback = (interventionId: string, kind: "helpful" | "too_easy" | "too_hard" | "dismiss" | "used") => {
    const i = sessionRef.current.interventions.find((x) => x.id === interventionId);
    if (!i) return;
    const status = kind === "dismiss" ? "dismissed" : kind;
    setSession((s) => ({ ...s, interventions: s.interventions.map((x) => (x.id === interventionId ? { ...x, status } : x)) }));
    if (kind === "used") return;
    const label = { helpful: "Marked helpful", too_easy: "Said too easy", too_hard: "Said too hard", dismiss: "Dismissed" }[kind];
    record({ kind, cellId: i.cellId ?? undefined, summary: `${label}: "${i.title}"` });
  };

  const revealAnswer = (interventionId: string) => {
    const i = sessionRef.current.interventions.find((x) => x.id === interventionId);
    if (!i) return;
    // Not a trigger: rides along with the next run so the model can count it as evidence.
    record({ kind: "revealed", cellId: i.cellId ?? undefined, summary: `Revealed the answer to "${i.title}"` });
  };

  const insertTryCell = (interventionId: string) => {
    const i = sessionRef.current.interventions.find((x) => x.id === interventionId);
    if (!i?.code) return;
    addCell(i.cellId, i.code);
    feedback(interventionId, "used");
  };

  const markStepDone = (stepId: string) => {
    const st = sessionRef.current.steps.find((x) => x.id === stepId);
    setSession((s) => ({ ...s, completed: s.completed.includes(stepId) ? s.completed : [...s.completed, stepId] }));
    record({ kind: "step_done", summary: `Marked "${st?.title}" done` });
  };

  // ---------- practice ----------

  const startRecall = (r: ScheduledRecall) => {
    setActiveRecall(r);
    setRecallFeedback(null);
  };
  const answerRecall = (answer: string) => {
    if (!activeRecall) return;
    pendingRecallRef.current = activeRecall;
    record({ kind: "recall_answer", summary: `Answered recall "${activeRecall.question}": "${answer}"` });
  };

  const due = session.recall.filter((r) => r.dueAt <= simNow(session));

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">AL</div>
          <div>
            <div className="title">Adaptive Learning</div>
            <div className="subtitle">Learn by building the thing you actually want to build.</div>
          </div>
        </div>
        <div className="top-actions">
          <span className={`badge ${live ? "live" : "mock"}`} title={live ? "Real model calls, billed to your API key" : "Canned rule-based responses; not adaptive"}>
            {live ? `LIVE · ${model}` : "MOCK · not adaptive"}
          </span>
          <span className="badge">{session.profile.name}</span>
          <label className="quiet-toggle" title="When on, help appears only after an error, after a minute stuck, or when you ask">
            <input type="checkbox" checked={!!session.quiet} onChange={(e) => setSession((s) => ({ ...s, quiet: e.target.checked }))} />
            Hints only when I'm stuck
          </label>
          <span className="badge" title="Simulated clock for spaced practice">
            day +{session.dayOffset}
          </span>
          <button className="ghost" onClick={() => setSession((s) => ({ ...s, dayOffset: s.dayOffset + 4 }))}>
            Skip ahead 4 days
          </button>
          <button className="ghost" onClick={() => setShowCompare(true)} disabled={session.batches.length === 0}>
            Replay as another learner
          </button>
          <button className="ghost" onClick={onNewProject}>
            New project
          </button>
        </div>
      </header>

      <section className="goal">
        <span className="goal-label">GOAL</span>
        <span className="goal-text">{session.scenario.goal}</span>
        <span className="goal-meta">
          {session.completed.length} / {session.steps.filter((s) => !session.skipped.includes(s.id)).length} steps
        </span>
      </section>

      <Headline session={session} adapting={adapting} onClose={(id) => setSession((s) => ({ ...s, headlineDismissed: id }))} onHistory={() => setShowHistory(true)} />

      <main className="cols">
        <PathPanel session={session} onDone={markStepDone} />
        <Notebook
          session={session}
          pyStatus={pyStatus}
          adapting={adapting}
          onRun={run}
          onEdit={editCell}
          onAdd={(after) => addCell(after)}
          onAsk={ask}
          onFeedback={feedback}
          onInsertTry={insertTryCell}
          onReveal={revealAnswer}
          onMinimize={(id, minimized) => setSession((s) => ({ ...s, interventions: s.interventions.map((x) => (x.id === id ? { ...x, minimized } : x)) }))}
        />
        <aside className="right">
          <LearnerPanel session={session} />
          <PracticePanel
            due={due}
            total={session.recall.length}
            active={activeRecall}
            feedback={recallFeedback}
            onStart={startRecall}
            onAnswer={answerRecall}
            onClose={() => setActiveRecall(null)}
            busy={!!adapting}
          />
        </aside>
      </main>

      {showHistory && (
        <div className="modal-bg" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>History</h2>
              <button className="ghost" onClick={() => setShowHistory(false)}>
                Close
              </button>
            </div>
            <LogPanel session={session} adapting={adapting} />
          </div>
        </div>
      )}
      {showCompare && <Compare session={session} live={live} onClose={() => setShowCompare(false)} />}
    </div>
  );
}

/** One line: the latest meaningful change and its cause. Fades after a while; closable. */
function Headline({ session, adapting, onClose, onHistory }: { session: Session; adapting: string | null; onClose: (id: string) => void; onHistory: () => void }) {
  const latest = [...session.log].reverse().find((l) => l.summary);
  const show = latest && latest.id !== session.headlineDismissed;
  return (
    <div className="headline-row">
      {adapting ? (
        <span className="headline pending">Updating…</span>
      ) : show ? (
        <span key={latest.id} className={`headline ${latest.error ? "err" : ""}`}>
          {latest.summary}
          <button className="x" onClick={() => onClose(latest.id)} aria-label="Close">
            ×
          </button>
        </span>
      ) : (
        <span />
      )}
      {session.log.length > 0 && (
        <button className="link" onClick={onHistory}>
          History ({session.log.length})
        </button>
      )}
    </div>
  );
}
