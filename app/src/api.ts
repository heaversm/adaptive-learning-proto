import type { AdaptRequest, AdaptResponse, Scenario, SetupRequest } from "../shared/schema";
import type { Usage } from "./session";

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
  return json as T;
}

export const getConfig = () => fetch("/api/config").then((r) => r.json() as Promise<{ live: boolean; model: string | null }>);
export const adaptCall = (req: AdaptRequest) => post<{ result: AdaptResponse; usage: Usage; mock: boolean }>("/api/adapt", req);
export const setupCall = (req: SetupRequest) => post<{ result: Scenario; usage: Usage }>("/api/setup", req);
export const fetchUrl = (url: string, as: "text" | "raw") => post<{ text: string; truncated: boolean; chars: number }>("/api/fetch", { url, as });
