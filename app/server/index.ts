// Local server. On Netlify the same handlers run in netlify/functions/api.mts.
import express from "express";
import { config, handleAdapt, handleFetch, handleSetup, type Reply } from "./handlers";

// LIVE=1 turns on real model calls (billed to whoever's credentials the server has).
const LIVE = process.env.LIVE === "1";
const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.use(express.json({ limit: "5mb" }));
const send = (res: express.Response, r: Reply) => res.status(r.status).json(r.body);

app.get("/api/config", (_req, res) => send(res, config(LIVE)));
app.post("/api/adapt", async (req, res) => send(res, await handleAdapt(req.body, LIVE)));
app.post("/api/setup", async (req, res) => send(res, await handleSetup(req.body, LIVE)));
app.post("/api/fetch", async (req, res) => send(res, await handleFetch(req.body)));

app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT} — ${LIVE ? `LIVE mode` : "MOCK mode (no model calls)"}`);
});
