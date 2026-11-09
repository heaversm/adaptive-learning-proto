// Rule-based stand-in for the adapter, so the interface can be exercised with
// no API calls. It is NOT adaptive in any interesting sense — the UI labels it
// "mock mode" everywhere. Start the server with LIVE=1 for the real thing.
import type { AdaptRequest, AdaptResponse, PathChange } from "../shared/schema";

export function mockAdapt(req: AdaptRequest): AdaptResponse {
  const out: AdaptResponse = { summary: "", learnerUpdates: [], pathChanges: [], intervention: null, newRecallItems: [], recallGrade: null };
  const current = req.steps.find((s) => !req.completedStepIds.includes(s.id));
  const knowsSampling = /DSP|sampling theory/i.test(req.profile.background);
  const last = req.events[req.events.length - 1];
  if (!last) return out;

  if (last.kind === "session_start") {
    if (!knowsSampling)
      out.pathChanges.push({
        type: "insert", stepId: null, afterStepId: "load",
        newStep: { id: "why-not-every-12th", title: "Detour: why averaging beats every 12th row", detail: "Plot both on one day and compare the peaks.", conceptIds: ["sampling"], kind: "detour" },
        reason: "Mock: background lists no signal-processing experience.",
      });
    out.summary = knowsSampling ? "Mock: path left as is." : "Mock: added a sampling detour from your background.";
    return out;
  }

  const recall = req.events.find((e) => e.kind === "recall_answer");
  if (recall && req.pendingRecall) {
    out.recallGrade = { correct: recall.summary.length > 40, feedback: `Mock grading (length only). Reference answer: ${req.pendingRecall.answer}` };
    return out;
  }

  if (last.kind === "run_error") {
    out.summary = `Mock: explained the error in ${last.cellId}.`;
    const lineMatch = /line (\d+)/.exec(last.output ?? "");
    out.intervention = {
      kind: "explain",
      cellId: last.cellId ?? null,
      line: lineMatch ? Number(lineMatch[1]) : null,
      title: "What this error is saying",
      body: `Mock mode: ${(last.output ?? "").split("\n").filter(Boolean).pop() ?? "an error occurred"}. In live mode this would be explained in terms of your background.`,
      code: null,
      sourceId: null,
      personId: null,
      reveal: null,
      because: `You hit an error in ${last.cellId}.`,
    };
    if (current?.conceptIds[0])
      out.learnerUpdates.push({ conceptId: current.conceptIds[0], level: "shaky", evidence: `Error in ${last.cellId} while on "${current.title}".` });
    return out;
  }

  if (last.kind === "question") {
    out.intervention = {
      kind: "explain", cellId: last.cellId ?? null, line: null, title: "Mock mode can't answer questions",
      body: "Restart the server with LIVE=1 and an API key in your shell to get real answers.", code: null, sourceId: null, personId: null, reveal: null,
      because: "You asked a question.",
    };
    return out;
  }

  const runs = req.events.filter((e) => e.kind === "run_ok").length;
  if (runs > 0 && current) {
    const changes: PathChange[] = [{ type: "complete", stepId: current.id, afterStepId: null, newStep: null, reason: `Mock: ${runs} clean run(s) on "${current.title}".` }];
    for (const c of current.conceptIds)
      out.learnerUpdates.push({ conceptId: c, level: "working", evidence: `Mock: ran ${last.cellId} without errors.` });
    const next = req.steps[req.steps.indexOf(current) + 1];
    out.pathChanges = changes;
    out.summary = `Mock: marked "${current.title}" done.`;
    out.intervention = next
      ? { kind: "nudge", cellId: last.cellId ?? null, line: null, title: `Next: ${next.title}`, body: next.detail, code: null, sourceId: null, personId: null, reveal: null, because: `Mock: "${current.title}" looks done.` }
      : null;
  }
  return out;
}
