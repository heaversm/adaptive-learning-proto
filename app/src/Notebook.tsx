import { useState } from "react";
import type { Cell, Session, ShownIntervention } from "./session";

type Props = {
  session: Session;
  pyStatus: string;
  adapting: string | null;
  onRun: (cellId: string) => void;
  onEdit: (cellId: string, code: string) => void;
  onAdd: (afterId: string | null) => void;
  onAsk: (q: string, cellId: string | null) => void;
  onFeedback: (id: string, kind: "helpful" | "too_easy" | "too_hard" | "dismiss") => void;
  onInsertTry: (id: string) => void;
  onReveal: (id: string) => void;
  onMinimize: (id: string, minimized: boolean) => void;
};

export function Notebook(p: Props) {
  const [focus, setFocus] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const open = p.session.interventions.filter((i) => i.status === "open");
  // The latest change, repeated here because the one-line update at the top is often scrolled out of view.
  const last = p.session.log[p.session.log.length - 1];
  const latest = last && (last.summary || last.error) ? last : null;
  const floating = open.filter((i) => !i.cellId || !p.session.cells.some((c) => c.id === i.cellId));

  return (
    <section className="notebook">
      <div className="nb-head">
        <span className="nb-file">project.ipynb</span>
        <span className={`kernel ${p.pyStatus === "ready" ? "ok" : ""}`}>● {p.pyStatus === "ready" ? "Python ready" : p.pyStatus}</span>
      </div>

      {floating.map((i) => (
        <InterventionCard key={i.id} i={i} session={p.session} onFeedback={p.onFeedback} onInsertTry={p.onInsertTry} onReveal={p.onReveal} onMinimize={p.onMinimize} />
      ))}

      {p.session.cells.map((c, idx) => (
        <div key={c.id}>
          <CellView
            cell={c}
            index={idx + 1}
            anchoredLines={open.filter((i) => i.cellId === c.id && i.line).map((i) => i.line!)}
            disabled={p.pyStatus !== "ready"}
            onRun={() => p.onRun(c.id)}
            onEdit={(code) => p.onEdit(c.id, code)}
            onFocus={() => setFocus(c.id)}
          />
          {open
            .filter((i) => i.cellId === c.id)
            .map((i) => (
              <InterventionCard key={i.id} i={i} session={p.session} onFeedback={p.onFeedback} onInsertTry={p.onInsertTry} onReveal={p.onReveal} onMinimize={p.onMinimize} />
            ))}
          <button className="add-cell" onClick={() => p.onAdd(c.id)}>
            + cell
          </button>
        </div>
      ))}

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (!question.trim()) return;
          p.onAsk(question.trim(), focus);
          setQuestion("");
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={`Ask about this notebook${focus ? ` (about ${focus})` : ""}…`} />
        <button type="submit" disabled={!question.trim()}>
          Ask
        </button>
      </form>
      {p.adapting ? (
        <div className="adapting">Adapting to: {p.adapting}</div>
      ) : (
        latest && (
          <div key={latest.id} className={`nb-update ${latest.error ? "err" : ""}`}>
            {latest.error ? "Couldn't update: " : "✓ "}
            {latest.error ?? latest.summary}
          </div>
        )
      )}
    </section>
  );
}

function CellView(props: {
  cell: Cell;
  index: number;
  anchoredLines: number[];
  disabled: boolean;
  onRun: () => void;
  onEdit: (code: string) => void;
  onFocus: () => void;
}) {
  const { cell } = props;
  const lines = cell.code.split("\n");
  return (
    <div className={`cell ${cell.error ? "has-error" : ""}`}>
      <div className="cell-bar">
        <span className="cell-id">
          [{props.index}] {cell.id}
        </span>
        <button className="run" disabled={props.disabled} onClick={props.onRun} title="Shift+Enter">
          ▶ Run
        </button>
      </div>
      <div className="editor">
        <pre className="gutter" aria-hidden>
          {lines.map((_, i) => (
            <div key={i} className={props.anchoredLines.includes(i + 1) ? "mark" : cell.errorLine === i + 1 ? "err" : ""}>
              {i + 1}
            </div>
          ))}
        </pre>
        <textarea
          spellCheck={false}
          value={cell.code}
          rows={Math.max(2, lines.length)}
          onFocus={props.onFocus}
          onChange={(e) => props.onEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              props.onRun();
            } else if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = t;
              props.onEdit(cell.code.slice(0, a) + "    " + cell.code.slice(b));
              requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = a + 4));
            }
          }}
        />
      </div>
      {cell.ran && (
        <div className="output">
          {cell.stdout && <pre className="stdout">{cell.stdout}</pre>}
          {cell.text && <pre className="stdout">{cell.text}</pre>}
          {cell.html && <div className="df" dangerouslySetInnerHTML={{ __html: cell.html }} />}
          {cell.images.map((img, i) => (
            <img key={i} src={`data:image/png;base64,${img}`} alt="plot output" />
          ))}
          {cell.error && (
            <pre className="error">
              {cell.errorLine ? `line ${cell.errorLine}: ` : ""}
              {cell.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  explain: "Explanation",
  nudge: "Next move",
  try_cell: "Try it",
  study: "Read this now",
  recall: "Quick check",
  person: "Talk to someone",
};

function InterventionCard({
  i,
  session,
  onFeedback,
  onInsertTry,
  onReveal,
  onMinimize,
}: {
  i: ShownIntervention;
  session: Session;
  onFeedback: Props["onFeedback"];
  onInsertTry: Props["onInsertTry"];
  onReveal: Props["onReveal"];
  onMinimize: Props["onMinimize"];
}) {
  const [reveal, setReveal] = useState<"hidden" | "confirm" | "shown">("hidden");
  const source = i.sourceId ? session.scenario.sources.find((s) => s.id === i.sourceId) : null;
  const person = i.personId ? session.scenario.people.find((s) => s.id === i.personId) : null;
  if (i.minimized)
    return (
      <button className={`iv-chip k-${i.kind}`} onClick={() => onMinimize(i.id, false)} title="Open">
        <span className="iv-kind">{KIND_LABEL[i.kind] ?? i.kind}</span>
        {i.line ? <span className="iv-anchor">line {i.line}</span> : null}
        <span className="chip-title">{i.title}</span>
      </button>
    );
  return (
    <div className={`intervention k-${i.kind}`}>
      <div className="iv-head">
        <span className="iv-kind">{KIND_LABEL[i.kind] ?? i.kind}</span>
        {i.line && <span className="iv-anchor">line {i.line}</span>}
        <span className="iv-controls">
          <button className="icon" onClick={() => onMinimize(i.id, true)} title="Minimize" aria-label="Minimize">
            –
          </button>
          <button className="icon" onClick={() => onFeedback(i.id, "dismiss")} title="Close — doesn't apply" aria-label="Close">
            ×
          </button>
        </span>
      </div>
      <div className="iv-title">{i.title}</div>
      <div className="iv-body">{i.body}</div>
      {i.code && <pre className="iv-code">{i.code}</pre>}
      {source && (
        <div className="iv-source">
          <div className="src-title">{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}</div>
          <div className="src-excerpt">{source.excerpt}</div>
        </div>
      )}
      {person && (
        <div className="iv-person">
          <b>{person.name}</b> <span className="illustrative">illustrative, not a real person</span>
          <div>{person.blurb}</div>
        </div>
      )}
      {i.reveal && reveal === "hidden" && (
        <button className="link reveal-btn" onClick={() => setReveal("confirm")}>
          Reveal the answer
        </button>
      )}
      {i.reveal && reveal === "confirm" && (
        <div className="reveal-confirm">
          Sure? Working it out yourself is what makes it stick, and the system will count this as not knowing it yet.
          <div className="iv-actions">
            <button
              className="primary"
              onClick={() => {
                setReveal("shown");
                onReveal(i.id);
              }}
            >
              Yes, show me
            </button>
            <button onClick={() => setReveal("hidden")}>Keep trying</button>
          </div>
        </div>
      )}
      {i.reveal && reveal === "shown" && <pre className="iv-code reveal">{i.reveal}</pre>}
      <div className="iv-because">Because: {i.because}</div>
      <div className="iv-actions">
        {i.code && (
          <button className="primary" onClick={() => onInsertTry(i.id)}>
            Insert as a cell
          </button>
        )}
        <button onClick={() => onFeedback(i.id, "helpful")}>Helpful</button>
        <button onClick={() => onFeedback(i.id, "too_hard")}>Too hard</button>
        <button onClick={() => onFeedback(i.id, "too_easy")}>Too easy</button>
        <button className="ghost" onClick={() => onFeedback(i.id, "dismiss")}>
          Not now
        </button>
      </div>
    </div>
  );
}
