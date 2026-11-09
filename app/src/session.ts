// Session state and the pure functions that apply an adapter response to it.
import type {
  AdaptRequest,
  AdaptResponse,
  CellSnapshot,
  ConceptState,
  Intervention,
  LearnerEvent,
  Profile,
  RecallItem,
  Scenario,
  Step,
} from "../shared/schema";

export type Cell = {
  id: string;
  code: string;
  stdout: string;
  html: string | null;
  text: string | null;
  images: string[];
  error: string | null;
  errorLine: number | null;
  ran: boolean;
};

export type ShownIntervention = Intervention & {
  id: string;
  t: number;
  status: "open" | "helpful" | "too_easy" | "too_hard" | "dismissed" | "used" | "resolved";
  minimized?: boolean;
};

export type ScheduledRecall = RecallItem & { id: string; dueAt: number; interval: number; history: { t: number; correct: boolean }[] };

export type Usage = { input: number; output: number; cacheRead: number; ms: number; model: string } | null;

export type LogEntry = {
  summary: string;
  id: string;
  t: number;
  trigger: string[]; // event summaries
  changes: string[]; // human-readable effects
  intervention: string | null;
  usage: Usage;
  mock: boolean;
  error?: string;
};

/** One adapter call's inputs, kept so the session can be replayed as another learner. */
export type Batch = { events: LearnerEvent[]; cells: CellSnapshot[] };

export type Session = {
  id: string; // one save slot per project
  scenario: Scenario;
  profile: Profile;
  datasets: Record<string, string>; // file name -> CSV text (custom projects only; demo fetches from /data)
  cells: Cell[];
  steps: Step[];
  completed: string[];
  skipped: string[];
  concepts: Record<string, ConceptState>;
  interventions: ShownIntervention[];
  recall: ScheduledRecall[];
  log: LogEntry[];
  batches: Batch[];
  dayOffset: number; // simulated days skipped ahead
  quiet: boolean; // "hints only when I'm stuck"
  headlineDismissed: string | null; // log id whose headline the learner closed
};

export const DAY = 24 * 60 * 60 * 1000;
export const uid = () => Math.random().toString(36).slice(2, 9);
export const simNow = (s: Pick<Session, "dayOffset">) => Date.now() + s.dayOffset * DAY;

export function newCell(id: string, code: string): Cell {
  return { id, code, stdout: "", html: null, text: null, images: [], error: null, errorLine: null, ran: false };
}

export function newSession(scenario: Scenario, profile: Profile, datasets: Record<string, string> = {}): Session {
  return {
    id: `${Date.now().toString(36)}-${uid()}`,
    scenario,
    profile,
    datasets,
    cells: scenario.starterCells.map((c) => newCell(c.id, c.code)),
    steps: scenario.steps,
    completed: [],
    skipped: [],
    concepts: Object.fromEntries(scenario.concepts.map((c) => [c.id, { level: "unseen", evidence: [] } as ConceptState])),
    interventions: [],
    recall: [],
    log: [],
    batches: [],
    dayOffset: 0,
    quiet: false,
    headlineDismissed: null,
  };
}

export function snapshotCells(cells: Cell[]): CellSnapshot[] {
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
  return cells.map((c) => ({
    id: c.id,
    code: c.code,
    output: c.ran ? clip([c.stdout, c.text ?? "", c.html ? "[table]" : "", c.images.length ? `[${c.images.length} plot(s)]` : ""].filter(Boolean).join("\n"), 1500) : "(not run)",
    error: c.error,
  }));
}

export function buildRequest(s: Session, events: LearnerEvent[], cells: CellSnapshot[], pendingRecall: AdaptRequest["pendingRecall"]): AdaptRequest {
  return {
    scenario: s.scenario,
    profile: s.profile,
    concepts: s.concepts,
    steps: s.steps.filter((st) => !s.skipped.includes(st.id)),
    completedStepIds: s.completed,
    cells,
    events,
    recentInterventions: s.interventions.slice(-6).map((i) => `${i.kind}: ${i.title} (${i.status})`),
    pendingRecall,
    quiet: !!s.quiet,
    scheduledRecall: s.recall.map((r) => r.question),
  };
}

/** Apply an adapter response. Returns the new session and a list of what changed, in plain words. */
export function applyResponse(s: Session, r: AdaptResponse): { session: Session; changes: string[] } {
  const changes: string[] = [];
  const now = simNow(s);
  const concepts = { ...s.concepts };
  const name = (id: string) => s.scenario.concepts.find((c) => c.id === id)?.name ?? id;
  const stepTitle = (steps: Step[], id: string | null) => steps.find((x) => x.id === id)?.title ?? id ?? "?";

  for (const u of r.learnerUpdates) {
    const prev = concepts[u.conceptId] ?? { level: "unseen", evidence: [] };
    concepts[u.conceptId] = { level: u.level, evidence: [...prev.evidence, { t: now, text: u.evidence, level: u.level }] };
    if (prev.level !== u.level) changes.push(`${name(u.conceptId)}: ${prev.level} → ${u.level}`);
  }

  let steps = [...s.steps];
  let completed = [...s.completed];
  let skipped = [...s.skipped];
  for (const c of r.pathChanges) {
    if (c.type === "insert" && c.newStep) {
      if (steps.some((x) => x.id === c.newStep!.id)) continue;
      const idx = steps.findIndex((x) => x.id === c.afterStepId);
      steps.splice(idx >= 0 ? idx + 1 : steps.length, 0, c.newStep);
      changes.push(`Added "${c.newStep.title}" — ${c.reason}`);
    } else if (c.type === "complete" && c.stepId && !completed.includes(c.stepId)) {
      completed.push(c.stepId);
      changes.push(`Done: "${stepTitle(steps, c.stepId)}" — ${c.reason}`);
    } else if (c.type === "skip" && c.stepId && !skipped.includes(c.stepId)) {
      skipped.push(c.stepId);
      changes.push(`Skipped "${stepTitle(steps, c.stepId)}" — ${c.reason}`);
    } else if (c.type === "move_up" && c.stepId) {
      const from = steps.findIndex((x) => x.id === c.stepId);
      const firstOpen = steps.findIndex((x) => !completed.includes(x.id) && !skipped.includes(x.id));
      if (from > firstOpen && firstOpen >= 0) {
        const [st] = steps.splice(from, 1);
        steps.splice(firstOpen, 0, st);
        changes.push(`Moved up "${st.title}" — ${c.reason}`);
      }
    }
  }

  const recall = [...s.recall];
  for (const item of r.newRecallItems) {
    recall.push({ ...item, id: uid(), dueAt: now + 2 * DAY, interval: 2, history: [] });
    changes.push(`Recall question scheduled in 2 days: "${item.question}"`);
  }

  let interventions = s.interventions;
  if (r.intervention) {
    const next = r.intervention;
    // a new one replaces any still-open one on the same cell; other open ones shrink to chips
    interventions = interventions.map((i) =>
      i.status !== "open" ? i : i.cellId === next.cellId ? { ...i, status: "dismissed" as const } : { ...i, minimized: true },
    );
    interventions = [...interventions, { ...next, id: uid(), t: now, status: "open" }];
  }

  return { session: { ...s, concepts, steps, completed, skipped, recall, interventions }, changes };
}

export function gradeRecall(s: Session, id: string, correct: boolean): Session {
  const now = simNow(s);
  return {
    ...s,
    recall: s.recall.map((r) => {
      if (r.id !== id) return r;
      const interval = correct ? r.interval * 2.5 : 1;
      return { ...r, interval, dueAt: now + interval * DAY, history: [...r.history, { t: now, correct }] };
    }),
  };
}

// ---------- saving ----------
// Each project has its own slot, so two tabs or two projects can't overwrite each other.
const PREFIX = "al-project:";
const LEGACY_KEY = "adaptive-learning-session"; // the old single slot

export type ProjectMeta = { id: string; title: string; profile: string; updatedAt: number; steps: string };

const metaOf = (s: Session): ProjectMeta => ({
  id: s.id,
  title: s.scenario.title,
  profile: s.profile.name,
  updatedAt: Date.now(),
  steps: `${s.completed.length} / ${s.steps.filter((x) => !s.skipped.includes(x.id)).length} steps`,
});

/** Save a project. Returns a warning to show if the browser refused (usually storage full). */
export function saveProject(s: Session): string | null {
  const write = (x: Session) => localStorage.setItem(PREFIX + x.id, JSON.stringify({ meta: metaOf(x), session: x }));
  try {
    write(s);
    return null;
  } catch {
    try {
      // Plots are the bulk of a saved project; drop them and keep everything else.
      write({ ...s, cells: s.cells.map((c) => ({ ...c, images: [] })) });
      return "Browser storage is nearly full: this project was saved without its plot images. Re-run cells to redraw them.";
    } catch {
      return "This project couldn't be saved: browser storage is full. Delete an old project from the start screen.";
    }
  }
}

export function loadProject(id: string): Session | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw).session as Session) : null;
  } catch {
    return null;
  }
}

export function listProjects(): ProjectMeta[] {
  const out: ProjectMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      out.push(JSON.parse(localStorage.getItem(k)!).meta);
    } catch {
      /* skip unreadable entries */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const deleteProject = (id: string) => localStorage.removeItem(PREFIX + id);
export const projectKey = (id: string) => PREFIX + id;

/** Move a project saved under the old single slot into its own slot. */
export function migrateLegacy() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw) as Session;
    if (!s.id) s.id = `${Date.now().toString(36)}-${uid()}`;
    if (!saveProject(s)) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* leave it */
  }
}
