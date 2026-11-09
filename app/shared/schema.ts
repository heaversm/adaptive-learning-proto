// Shapes shared by the browser and the server.
// The zod schemas double as the structured-output formats sent to Claude, so
// every field is required (nullable where optional) and there are no numeric
// range constraints.
import { z } from "zod";

export const Level = z.enum(["unseen", "shaky", "working", "solid"]);
export type Level = z.infer<typeof Level>;

export const Concept = z.object({
  id: z.string().describe("short kebab-case id"),
  name: z.string(),
  why: z.string().describe("one sentence: why this project needs it"),
});
export type Concept = z.infer<typeof Concept>;

export const Step = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().describe("one or two sentences: what the learner does in the notebook"),
  conceptIds: z.array(z.string()),
  kind: z.enum(["core", "detour"]).describe("core = part of the project; detour = side lesson added for this learner"),
});
export type Step = z.infer<typeof Step>;

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["paper", "textbook", "docs", "dataset-readme", "article", "video"]),
  url: z.string().nullable(),
  excerpt: z.string().describe("the passage or summary the learner would read; never invented quotes"),
});
export type Source = z.infer<typeof Source>;

export const Person = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["mentor", "peer", "video"]),
  blurb: z.string(),
});
export type Person = z.infer<typeof Person>;

export const StarterCell = z.object({
  id: z.string(),
  code: z.string(),
});

export const Dataset = z.object({
  name: z.string().describe("file name as it appears in the notebook's working directory"),
  description: z.string(),
});

/** Everything the app needs to run one project. */
export const Scenario = z.object({
  title: z.string(),
  goal: z.string().describe("the learner's goal, phrased as the thing they want to make or understand"),
  datasets: z.array(Dataset),
  concepts: z.array(Concept),
  steps: z.array(Step),
  sources: z.array(Source),
  people: z.array(Person).describe("illustrative people; the app labels them as made up"),
  starterCells: z.array(StarterCell),
});
export type Scenario = z.infer<typeof Scenario>;

export type Evidence = { t: number; text: string; level: Level };
export type ConceptState = { level: Level; evidence: Evidence[] };

export type Profile = { id: string; name: string; background: string };

export type LearnerEventKind =
  | "run_ok"
  | "run_error"
  | "edit"
  | "stuck"
  | "question"
  | "dismiss"
  | "too_easy"
  | "too_hard"
  | "helpful"
  | "recall_answer"
  | "step_done"
  | "revealed"
  | "session_start";

export type LearnerEvent = {
  t: number;
  kind: LearnerEventKind;
  cellId?: string;
  summary: string; // human-readable, shown in the log and sent to the model
  code?: string;
  output?: string;
};

// ---------- What the adapter returns ----------

export const LearnerUpdate = z.object({
  conceptId: z.string(),
  level: Level,
  evidence: z.string().describe("the specific thing the learner did that justifies this level, citing the cell or question"),
});

export const PathChange = z.object({
  type: z.enum(["insert", "skip", "complete", "move_up"]),
  stepId: z.string().nullable().describe("existing step for skip/complete/move_up"),
  afterStepId: z.string().nullable().describe("for insert: place the new step after this one"),
  newStep: Step.nullable().describe("for insert only"),
  reason: z.string().describe("plain-language cause, citing what the learner did"),
});
export type PathChange = z.infer<typeof PathChange>;

export const Intervention = z.object({
  kind: z.enum(["explain", "nudge", "try_cell", "study", "recall", "person"]),
  cellId: z.string().nullable(),
  line: z.number().nullable().describe("1-based line in the cell this is anchored to"),
  title: z.string(),
  body: z.string().describe("short; plain words; written for this learner's background"),
  code: z.string().nullable().describe("try_cell only: a runnable cell with a parameter at the top to change"),
  sourceId: z.string().nullable().describe("study only"),
  personId: z.string().nullable().describe("person only"),
  because: z.string().describe("one line: what the learner did plus what their background is that led to this"),
  reveal: z
    .string()
    .nullable()
    .describe("the full fix or answer (exact code or wording), hidden until the learner asks for it twice; required whenever the card asks the learner to write or change code; null only for cards that ask for no work (e.g. a person or a source to read)"),
});
export type Intervention = z.infer<typeof Intervention>;

export const RecallItem = z.object({
  conceptId: z.string(),
  question: z.string().describe("built from the learner's own code or question, not a textbook prompt"),
  answer: z.string(),
  basedOn: z.string().describe("which cell, error or question it comes from"),
});
export type RecallItem = z.infer<typeof RecallItem>;

export const AdaptResponse = z.object({
  summary: z
    .string()
    .describe("one plain sentence a learner would read at a glance: what changed and the cause, e.g. 'Added a detour on time indexes because resample failed on row numbers.' Empty string if nothing meaningful changed."),
  learnerUpdates: z.array(LearnerUpdate),
  pathChanges: z.array(PathChange),
  intervention: Intervention.nullable().describe("at most one; null when the learner is doing fine and should be left alone"),
  newRecallItems: z.array(RecallItem),
  recallGrade: z
    .object({ correct: z.boolean(), feedback: z.string() })
    .nullable()
    .describe("only when the events include a recall_answer"),
});
export type AdaptResponse = z.infer<typeof AdaptResponse>;

// ---------- Request bodies ----------

export type CellSnapshot = { id: string; code: string; output: string; error: string | null };

export type AdaptRequest = {
  scenario: Scenario;
  profile: Profile;
  concepts: Record<string, ConceptState>;
  steps: Step[];
  completedStepIds: string[];
  cells: CellSnapshot[];
  events: LearnerEvent[]; // new since the last adapt call
  recentInterventions: string[]; // titles, so the model doesn't repeat itself
  pendingRecall: { question: string; answer: string; conceptId: string } | null;
  quiet: boolean; // learner asked for help only when stuck
  scheduledRecall: string[]; // questions already scheduled, so the model doesn't repeat them
};

export type SetupRequest = {
  goal: string;
  background: string;
  sourceText: string;
  sourceUrl: string;
  datasets: { name: string; columns: string[]; head: string }[];
};
