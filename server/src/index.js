import "dotenv/config";

import express from "express";

import { store, seedModels, clearFallbacks } from "./store.js";
import { probeAll, isHealthy } from "./health.js";
import { callPython } from "./pythonClient.js";

const app = express();
app.use(express.json());

seedModels();

// continuous monitoring
const INTERVAL = Number(process.env.HEALTH_CHECK_INTERVAL_MS || 300);
// setInterval(() => { probeAll().catch(() => {}); }, INTERVAL);
// console.log("server booted, interval =", INTERVAL);

setInterval(() => {
  probeAll()
    .then((results) => console.log("periodic probe:", results))
    .catch((err) => console.error("periodic probe failed:", err));
}, INTERVAL);

probeAll().catch(() => {});

// health overview
app.get("/health", (req, res) => {
  const models = [...store.models.values()].map((m) => ({
    key: m.key, provider: m.provider, model: m.model,
    ok: m.ok, latencyMs: m.latencyMs,
    lastCheckedAt: m.lastCheckedAt,
    healthy: isHealthy(m),
    error: m.error,
  }));
  res.json({ models });
});

// manual probe
app.post("/health/probe", async (req, res) => {
  res.json({ results: await probeAll() });
});

// start interview with fallback
app.post("/interviews/start", async (req, res) => {

  const { simulationId, primary, fallbacks } = req.body || {};


  if (!simulationId || !primary) {
    return res.status(400).json({ error: "simulationId and primary are required" });
  }

  const callerFallbacks = Array.isArray(fallbacks) ? fallbacks : [];

  // auto-pick secondary models from registry if caller doesn't provide fallbacks
  const autoFallbacks = [...store.models.keys()].filter((k) => k !== primary);
  const effectiveFallbacks = callerFallbacks.length ? callerFallbacks : autoFallbacks;
  const fallbackSource = callerFallbacks.length ? "caller" : "auto";

  const candidates = [primary, ...effectiveFallbacks];


  let chosen = null;

  for (const key of candidates) {
    const st = store.models.get(key);
    if (st && isHealthy(st)) { chosen = key; break; }
  }

  if (!chosen) {
    store.fallbacks.push({ ts: Date.now(), simulationId, primary, chosen: null, reason: "no_healthy_model" });
    return res.status(503).json({ error: "No healthy model available", simulationId });
  }

  if (chosen !== primary) {
    // store.fallbacks.push({ ts: Date.now(), simulationId, primary, chosen, reason: "primary_unhealthy" });
    store.fallbacks.push({
      ts: Date.now(),
      simulationId,
      primary,
      chosen,
      reason: "primary_unhealthy",
      fallbackSource, // "caller" | "auto"
    });
  }

  const m = store.models.get(chosen);
  if (!m) {
    return res.status(500).json({ error: "Chosen model not found in store", chosen, simulationId });
  }

  const configJson = JSON.stringify(req.body || {});
  const py = await callPython("interview", [
    "--provider", m.provider,
    "--model", m.model,
    "--prompt", "Simulate interview start. Reply READY.",
    "--config", configJson,
  ]);


  res.json({ simulationId, primary, chosen, usedFallback: chosen !== primary, python: py });
});


// root
app.get("/", (req, res) => {
  res.send("ok");
});

// fallback events
app.get("/fallbacks", (req, res) => res.json({ events: store.fallbacks }));

// clear fallback events (history)
app.delete("/fallbacks", (req, res) => {
  clearFallbacks();
  res.json({ ok: true, cleared: true, remaining: store.fallbacks.length });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
