// Request handlers shared by the local Express server (server/index.ts) and the
// Netlify function (netlify/functions/api.mts). Each returns { status, body }.
import { adapt, setup, describeError, MODEL } from "./claude";
import { mockAdapt } from "./mock";
import type { AdaptRequest, SetupRequest } from "../shared/schema";

const MAX_FETCH_CHARS = 300_000;
export type Reply = { status: number; body: unknown };

export const config = (live: boolean): Reply => ({ status: 200, body: { live, model: live ? MODEL : null } });

export async function handleAdapt(body: AdaptRequest, live: boolean): Promise<Reply> {
  if (!live) return { status: 200, body: { result: mockAdapt(body), usage: null, mock: true } };
  try {
    const out = await adapt(body);
    console.log(`[adapt] ${body.events.map((e) => e.kind).join(",")} → ${out.usage.input}in/${out.usage.output}out (${out.usage.cacheRead} cached) ${out.usage.ms}ms`);
    return { status: 200, body: { ...out, mock: false } };
  } catch (err) {
    const e = describeError(err);
    console.error("[adapt]", e.message);
    return { status: e.status, body: { error: e.message } };
  }
}

export async function handleSetup(body: SetupRequest, live: boolean): Promise<Reply> {
  if (!live) return { status: 400, body: { error: "Building a new project needs live mode. Restart with LIVE=1." } };
  try {
    const out = await setup(body);
    console.log(`[setup] ${out.usage.input}in/${out.usage.output}out ${out.usage.ms}ms`);
    return { status: 200, body: out };
  } catch (err) {
    const e = describeError(err);
    console.error("[setup]", e.message);
    return { status: e.status, body: { error: e.message } };
  }
}

// Fetch a source page or dataset by URL (avoids browser CORS limits). No model call.
export async function handleFetch(body: { url: string; as: "text" | "raw" }): Promise<Reply> {
  try {
    const parsed = new URL(body.url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http(s) URLs.");
    const r = await fetch(parsed, { headers: { "User-Agent": "adaptive-learning-prototype" } });
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    let text = await r.text();
    if (body.as === "text" && /html/i.test(r.headers.get("content-type") ?? "")) {
      text = text
        .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    }
    const truncated = text.length > MAX_FETCH_CHARS;
    return { status: 200, body: { text: truncated ? text.slice(0, MAX_FETCH_CHARS) : text, truncated, chars: text.length } };
  } catch (err) {
    return { status: 400, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}
