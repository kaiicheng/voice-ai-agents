export const store = {
  models: new Map(),
  fallbacks: [],
};

export function seedModels() {
  const defaults = [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
  ];

  for (const m of defaults) {
    const key = `${m.provider}:${m.model}`;
    store.models.set(key, {
      ...m,
      key,
      lastCheckedAt: 0,
      ok: null,
      latencyMs: null,
      error: null,
      consecutiveFailures: 0,
    });
  }
}

export function clearFallbacks() {
  store.fallbacks.length = 0; // clear array
}
