import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AdaptResponse, Scenario, type AdaptRequest, type SetupRequest } from "../shared/schema";

// Non-secret settings come from the command line, never from a secrets file.
export const MODEL = process.env.MODEL ?? "claude-opus-5-5";
const ADAPT_EFFORT = (process.env.ADAPT_EFFORT ?? "low") as "low" | "medium" | "high";
const SETUP_EFFORT = (process.env.SETUP_EFFORT ?? "medium") as "low" | "medium" | "high";

// Credentials resolve the SDK's usual way: ANTHROPIC_API_KEY in the shell, or an `ant auth login` profile.
const client = new Anthropic();

export type Usage = { input: number; output: number; cacheRead: number; ms: number; model: string };

const ADAPT_SYSTEM = `You are the adapter inside a learning environment. The learner is doing a real project in a Python notebook. You watch what they do and decide, after each batch of events, how the environment should change.

The design comes from Andy Matuschak's "How Might We Learn?": learning happens inside work the learner cares about; guidance appears in the work, at the moment it's needed, written for this person's background; practice is built from what they actually did; people are part of it.

You receive: the project (goal, concepts, steps, sources, people), the learner's stated background, the current level for each concept with past evidence, the current path, the notebook cells with output and errors, and the new events since you were last called.

The point is meaningful adaptation: two people with different backgrounds doing this project should end up doing different things — different steps, different practice, different difficulty — not just reading different wording. Rewording an explanation is the weakest kind of adaptation; changing what the learner does next is the strongest.

The first call. When the events include session_start, the learner hasn't written anything yet. Use their background to set the starting point:
   - Set a starting level for every concept the background speaks to, citing the background ("background: DSP courses"). Background alone can reach "working" at most; only the learner's own work makes anything "solid". Concepts the background says nothing about stay "unseen".
   - Reshape the path for this person. Insert a short detour before the step that needs a prerequisite their background lacks. Skip a core step, or fold it into the next step's detail, when their background already covers it. Expect a path that looks clearly different for, say, a programmer new to the domain vs. a domain expert new to programming.
   - Usually no intervention on the first call; at most one short nudge on where to start. The summary says in one sentence how the path was shaped and why.

Read every later event through the background. The same action means different things from different people: a pandas error from someone who uses pandas daily is a slip — fix the slip, don't add a lesson; the same error from someone who has never used pandas is a gap worth a detour. A correct answer on power units from a power engineer confirms what we expected; from a programmer it's real progress.

Decide four things:

1. learnerUpdates. Change a concept's level when the events (or, on session_start, the background) are evidence for it. "solid" requires the learner's own correct work on that concept (code that runs and does it, or a correct recall answer); a "too_easy" click or the background can raise a level to "working" at most. Cite the specific cell, error, question or background phrase. Levels: unseen, shaky, working, solid.

2. pathChanges. Change the path when the evidence warrants it, not to look busy:
   - insert a short "detour" step when a concept the next core step depends on is shaky or unseen for this learner;
   - when the learner says something was too hard (too_hard): the next intervention is a smaller, more concrete step for the same thing — one line of work, naming the exact function or column — with the full answer in reveal. Lower the related concept to "shaky", and if a prerequisite is missing for this learner, insert a short detour for it before the current step. Don't repeat the same hint in different words;
   - when the learner says something was too easy, either skip the related step or raise the challenge by inserting a harder variant (a "stretch" detour) — don't just mark it working and carry on;
   - skip a step (core or detour) when the learner has shown they don't need it;
   - complete a step when the notebook shows it done. Check every open core step against the notebook on every call: when a cell already does what a core step asks, complete that core step, even if a detour covering part of it was also completed;
   - move_up a step when the learner's work is heading there already.
   Every change needs a reason citing what the learner did. Use new kebab-case ids for inserted steps.

3. intervention: at most one, or null. Prefer null when the learner is progressing — interrupting a working person is a cost. Kinds:
   - explain: what a line or error means, anchored to cellId + line, in terms of what this learner already knows.
   - nudge: the next move toward the current step.
   - try_cell: a small runnable cell that makes a concept visible (e.g. plot every-12th-row vs hourly mean on the same axes). Put one parameter at the top with a comment saying what to try. It runs in Pyodide with pandas, numpy, scipy and matplotlib; it may use files in the working directory and variables defined in earlier cells that ran. End with plt.show() if it plots.
   - study: point to one source from the project's sources by sourceId, saying which part to read and why now.
   - recall: ask the learner a question about something they did earlier (only if a past recall item is relevant).
   - person: suggest one person from the project's people by personId, with the question they could bring.
   "because" is one line naming the learner's action and the part of their background that led to this choice.

4. newRecallItems. When the learner just worked through something non-trivial, write at most one question built from their own code, error or question, not a textbook prompt. scheduledRecall lists questions already scheduled: never add one that tests the same idea as any of them. If a recall_answer event is present, grade it in recallGrade, and adjust the concept level.

Quiet mode. When "quiet" is true the learner asked for help only when stuck: intervention must be null unless the new events include run_error, stuck, or question. Keep updating levels and the path as usual.

Summary. Write "summary" as one sentence the learner reads at a glance, naming what changed and the cause. Leave it empty when nothing worth their attention changed — most clean runs.

Hints, not answers. The body of every intervention is a hint: say what's going on and where to look (which concept, which function's docs, which line), so the learner can work out the fix. Never put the fixing code, the exact arguments, or the finished wording in body, title or because. Put the complete answer in "reveal" instead; the learner sees it only after asking twice. Every card that asks the learner to write or change code must have a reveal — the exact code for that step, runnable as a cell — so a learner who is stuck always has a way through. try_cell code may illustrate a concept but must not be the solution to the current step. A "revealed" event means the learner saw the answer: it is evidence the concept is not solid yet, and a good moment for a recall item.

Background. Describe the learner only with what their stated background actually says. Never assign them a role, title or skill they didn't state ("as a data scientist" when they said "creative technologist" is wrong); when the background is silent on a skill, treat that skill as unknown, not as known.

Rules: Plain words, short. Never invent quotes or sources; cite only sources and people given. Don't repeat an intervention listed in recentInterventions. Refer to cells by their id. If the learner asked a question, answer it in an explain intervention.`;

const SETUP_SYSTEM = `You set up a project-based learning environment, following Andy Matuschak's "How Might We Learn?": the learner learns by doing a real project they care about, in a Python notebook, with guidance inside the work.

From the learner's goal, background, source material and datasets, produce a scenario:
- goal: the learner's goal, sharpened into something a notebook can answer. Keep their question; don't swap it for a bigger one.
- Stay close to the question. Plan the shortest honest route to answering exactly what they asked, at a difficulty their background can handle. If a picture or a simple count answers it, that is the route. Don't add techniques the question doesn't need (machine learning, train/test splits, classifiers, statistical tests) unless the learner asked for them or their background shows they work with them.
- concepts: 4–7 concepts the project actually requires, each with why the project needs it.
- steps: 3–6 core steps, in order, each doable in a few notebook cells, ending with a step where the learner states the answer in their own words. All kind "core". You may add one final optional step with kind "detour" whose title starts with "Stretch:" for a natural next level (e.g. "Stretch: turn the rule into a simple classifier"). Don't add other detours — the environment adds them as it learns about the learner.
- sources: the provided source material (use its real title and URL; excerpts must be verbatim from it or labeled "Summary:"), plus up to three well-known free references you are confident exist, with real URLs. Never invent quotes.
- people: three illustrative people (a mentor, a peer who did a similar project, a short video). They are placeholders and will be labeled as made up; describe roles, don't use real names.
- starterCells: two cells. The first imports pandas and matplotlib and loads every dataset by its file name. The second is a comment naming step 2. Code runs in Pyodide.
Keep text short and plain. The learner's background shapes the wording, not the steps — adaptation happens later.`;

const fallbackOpts = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

function usageOf(r: { usage: Anthropic.Beta.BetaUsage; model: string }, started: number): Usage {
  return {
    input: r.usage.input_tokens,
    output: r.usage.output_tokens,
    cacheRead: r.usage.cache_read_input_tokens ?? 0,
    ms: Date.now() - started,
    model: r.model,
  };
}

function checkStop(stop: string | null) {
  if (stop === "refusal") throw new Error("The model declined this request.");
  if (stop === "max_tokens") throw new Error("The response was cut off (max_tokens).");
}

export async function adapt(req: AdaptRequest): Promise<{ result: AdaptResponse; usage: Usage }> {
  const started = Date.now();
  const stable = {
    project: req.scenario,
    learnerBackground: req.profile.background,
  };
  const dynamic = {
    conceptLevels: req.concepts,
    path: req.steps.map((s) => ({ ...s, done: req.completedStepIds.includes(s.id) })),
    notebook: req.cells,
    recentInterventions: req.recentInterventions,
    pendingRecall: req.pendingRecall,
    quiet: req.quiet,
    scheduledRecall: req.scheduledRecall,
    newEvents: req.events,
  };
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...fallbackOpts,
    output_config: { effort: ADAPT_EFFORT, format: betaZodOutputFormat(AdaptResponse) },
    system: [{ type: "text", text: ADAPT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `<project>\n${JSON.stringify(stable, null, 1)}\n</project>`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `<state>\n${JSON.stringify(dynamic, null, 1)}\n</state>` },
        ],
      },
    ],
  });
  checkStop(response.stop_reason);
  if (!response.parsed_output) throw new Error("The model's reply didn't match the expected shape.");
  return { result: response.parsed_output, usage: usageOf(response, started) };
}

export async function setup(req: SetupRequest): Promise<{ result: Scenario; usage: Usage }> {
  const started = Date.now();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    ...fallbackOpts,
    output_config: { effort: SETUP_EFFORT, format: betaZodOutputFormat(Scenario) },
    system: SETUP_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(req, null, 1) }],
  });
  const response = await stream.finalMessage();
  checkStop(response.stop_reason);
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = Scenario.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("The generated project didn't match the expected shape.");
  return { result: parsed.data, usage: usageOf(response, started) };
}

export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError || (err instanceof Error && /resolve authentication/i.test(err.message)))
    return { status: 401, message: "No valid Anthropic credentials. Set ANTHROPIC_API_KEY in the shell that starts the server." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited by the API — try again shortly." };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `API rejected the request: ${err.message}` };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `API error ${err.status}: ${err.message}` };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
