# Voice AI Agents – Model Health Monitor + Fallback

This repo implements a lightweight reliability layer for starting interview simulations when LLM providers/models vary in latency/availability.

* **Node.js (Express)** owns **state**: model registry, health snapshots, and fallback event logging.
* **Python** owns **LLM calls**: a small CLI agent that simulates (or can be extended to perform) provider API calls.

> ✅ Core behavior: when an interview is started with an **unhealthy primary model**, the server automatically selects a **healthy secondary model** (caller-supplied or auto-chosen) and records the fallback event.

---

## Project Structure

```
voice-ai-agents/
  python/
    llm_agent.py
    requirements.txt
  server/
    src/
      index.js
      health.js
      store.js
      pythonClient.js
    package.json
    .env
  README.md
```

---

## Prerequisites

* **Node.js** 18+ (recommended)
* **Python** 3.10+

---

## Setup

### 1) Python environment

From repo root:

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

pip install -r .\python\requirements.txt
```

### 2) Node server dependencies

```bash
cd server
npm install
```

---

## Run

### Terminal A — start the Node server

```bash
cd server
npm run dev
```

Server prints:

```
http://localhost:3000
```

### Terminal B — (optional) run Python directly

From repo root:

```bash
.\.venv\Scripts\Activate.ps1
python .\python\llm_agent.py probe --provider openai --model gpt-4o-mini
```

---

## API Endpoints

<details>
<summary><strong>API Endpoints</strong></summary>

### `POST /health/probe`

Triggers a health probe for all registered models.

```powershell
irm -Method POST http://localhost:3000/health/probe
```

### `GET /health`

Returns the latest health snapshot.

```powershell
irm http://localhost:3000/health | ConvertTo-Json -Depth 10
```

### `POST /interviews/start`

Starts an interview simulation.

Request body:

* `simulationId` (string) — required
* `primary` (string) — required, e.g. `openai:gpt-4o-mini`
* `fallbacks` (string[]) — optional

If `primary` is unhealthy, the server selects a healthy fallback and records a fallback event.

### `GET /fallbacks`

Returns recorded fallback events.

```powershell
curl.exe http://localhost:3000/fallbacks
```

</details>

---

## End-to-End Verification (Recommended)

<details>
<summary><strong>End-to-End Verification</strong></summary>

### Step 1 — probe health

```powershell
irm -Method POST http://localhost:3000/health/probe
```

### Case A — no fallbacks provided (AUTO secondary selection)

```powershell
$r = irm -Method POST http://localhost:3000/interviews/start `
  -ContentType "application/json" `
  -Body '{"simulationId":"sim-auto","primary":"anthropic:claude-3-5-sonnet-latest"}'

$r | ConvertTo-Json -Depth 10
```

Expected:

* `usedFallback: true` (if primary is unhealthy)
* `chosen` is a healthy alternative
* `python.received_config` includes the posted body

### Case B — caller-provided fallbacks (CALLER order honored)

```powershell
irm -Method POST http://localhost:3000/interviews/start `
  -ContentType "application/json" `
  -Body '{"simulationId":"sim-caller","primary":"anthropic:claude-3-5-sonnet-latest","fallbacks":["openai:gpt-4o","openai:gpt-4o-mini"]}' |
  ConvertTo-Json -Depth 10
```

Expected:

* `chosen` matches the first healthy model in `fallbacks`
* fallback event has `fallbackSource: "caller"`

### Case C — primary healthy (NO fallback)

```powershell
irm -Method POST http://localhost:3000/interviews/start `
  -ContentType "application/json" `
  -Body '{"simulationId":"sim-healthy","primary":"openai:gpt-4o-mini"}' |
  ConvertTo-Json -Depth 10
```

Expected:

* `usedFallback: false`
* `chosen == primary`
* no new fallback event for this request

### Check fallback logs

```powershell
curl.exe http://localhost:3000/fallbacks
```

</details>

---

## Design Notes (Brief)

<details>
<summary><strong>Design Notes</strong></summary>

### Health monitoring

* Node stores health results in memory.
* `POST /health/probe` manually triggers probes for all registered models.
* The health snapshot includes:

  * `ok` (boolean)
  * `latencyMs`
  * `lastCheckedAt`
  * `consecutiveFailures`

### Fallback selection

When starting an interview:

1. Check if `primary` is healthy.
2. If unhealthy:

   * If caller provides `fallbacks`, try them in order.
   * Otherwise auto-select candidates from all other registered models.
3. Record a fallback event:

   * `{ simulationId, primary, chosen, reason: "primary_unhealthy", fallbackSource: "caller" | "auto" }`

### Node ↔ Python contract

* Node calls Python via a small CLI wrapper.
* Python outputs **exactly one JSON object to stdout** (Node parses it).
* Request config is passed via `--config` as JSON string.

---

## Note on LLM calls (stub mode)

To stay within the timebox, LLM calls are **stubbed** by default. The Python agent returns deterministic “ok/latency” responses and includes `stub: true`.

**TODO:** Replace stubs with real provider API requests (OpenAI/Anthropic) for both health probes and interview initiation, while keeping the same Node↔Python contract and CLI arguments (`probe` / `interview`).

---

## Assumptions / Trade-offs

* In-memory state only (no DB) to keep the scope minimal.
* Health checks are invoked manually via `/health/probe` (can be extended to periodic checks).
* The interview initiation is a lightweight test completion request (or stub) to validate basic connectivity/latency.

---

## Future Improvements

* Add periodic health probing (e.g., `setInterval`) with configurable interval.
* Add TTL / stale-health handling and stricter health thresholds.
* Add real OpenAI/Anthropic calls and structured provider adapters.
* Persist fallback events and health history to a datastore.

</details>