import { callPython } from "./pythonClient.js";
import { store } from "./store.js";

const MAX_LATENCY_MS = Number(process.env.HEALTH_MAX_LATENCY_MS || 2500);
console.log("MAX_LATENCY_MS =", MAX_LATENCY_MS);

const TTL_MS = Number(process.env.HEALTH_TTL_MS || 120000);

export function isHealthy(m) {
  if (!m.lastCheckedAt) return false;
  if (Date.now() - m.lastCheckedAt > TTL_MS) return false;
  if (m.ok !== true) return false;
  if (m.latencyMs != null && m.latencyMs > MAX_LATENCY_MS) return false;
  return true;
}

export async function probeOne(key) {
  const m = store.models.get(key);
  if (!m) throw new Error(`unknown modelKey: ${key}`);

  const started = Date.now();
  const res = await callPython("probe", [
    "--provider", m.provider,
    "--model", m.model,
    "--prompt", "Health check ping. Reply OK.",
  ]);
  const ended = Date.now();

  m.lastCheckedAt = ended;
  m.ok = !!res.ok;
  m.latencyMs = res.latency_ms ?? (ended - started);
  m.error = res.error ?? null;
  m.consecutiveFailures = m.ok ? 0 : (m.consecutiveFailures + 1);

  return { ...m };
}

export async function probeAll() {
  const keys = [...store.models.keys()];
  const results = [];
  for (const k of keys) {
    try {
      results.push(await probeOne(k));
    } catch (e) {
      results.push({ key: k, ok: false, error: e.message });
    }
  }
  return results;
}
