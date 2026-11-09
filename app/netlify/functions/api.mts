// The app's server on Netlify. Always live: the key comes from the site's
// environment settings (ANTHROPIC_API_KEY), never from the repo.
//
// A public link spends real money, so model calls are capped:
//   per visitor address: CALLS_PER_HOUR (default 60)
//   for the whole site:  CALLS_PER_DAY  (default 400)
// Over either cap, the call is refused with a plain message and nothing is billed.
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const PER_HOUR = Number(process.env.CALLS_PER_HOUR ?? 60);
const PER_DAY = Number(process.env.CALLS_PER_DAY ?? 400);
// Building a project is one long call; low effort keeps it inside Netlify's 60-second limit.
process.env.SETUP_EFFORT ??= "low";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function allowCall(ip: string): Promise<string | null> {
  const store = getStore({ name: "call-limits", consistency: "strong" });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const dayKey = `day/${day}`;
  const ipKey = `ip/${hour}/${ip.replace(/[^0-9a-f:.]/gi, "_")}`;
  const [d, h] = await Promise.all([store.get(dayKey, { type: "json" }), store.get(ipKey, { type: "json" })]);
  const dayCount = (d as number | null) ?? 0;
  const hourCount = (h as number | null) ?? 0;
  if (dayCount >= PER_DAY) return `This demo has used its ${PER_DAY} model calls for today. It resets at midnight UTC.`;
  if (hourCount >= PER_HOUR) return `You've used ${PER_HOUR} model calls this hour. Try again after the hour turns.`;
  await Promise.all([store.setJSON(dayKey, dayCount + 1), store.setJSON(ipKey, hourCount + 1)]);
  return null;
}

export default async (req: Request, context: Context) => {
  const route = new URL(req.url).pathname.replace(/^\/api\//, "");
  // Imported lazily so the SETUP_EFFORT default above is set before claude.ts reads it.
  const { config, handleAdapt, handleFetch, handleSetup } = await import("../../server/handlers");
  const live = !!process.env.ANTHROPIC_API_KEY;

  if (req.method === "GET" && route === "config") {
    const r = config(live);
    return json(r.status, r.body);
  }
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const body = await req.json().catch(() => null);
  if (!body) return json(400, { error: "Expected a JSON body." });

  if (route === "fetch") {
    const r = await handleFetch(body);
    return json(r.status, r.body);
  }
  if (route === "adapt" || route === "setup") {
    if (live) {
      const refusal = await allowCall(context.ip ?? "unknown");
      if (refusal) return json(429, { error: refusal });
    }
    const r = route === "adapt" ? await handleAdapt(body, live) : await handleSetup(body, live);
    return json(r.status, r.body);
  }
  return json(404, { error: `No route /api/${route}` });
};

export const config: Config = { path: "/api/*" };
