import json
import argparse, json, os, time
import requests
from dotenv import load_dotenv
import sys

load_dotenv()

def now_ms(): return int(time.time() * 1000)

def ok(provider, model, latency, extra=None):
    out = {"ok": True, "provider": provider, "model": model, "latency_ms": latency, "error": None}
    if extra: out.update(extra)
    return out

def err(provider, model, latency, e):
    return {"ok": False, "provider": provider, "model": model, "latency_ms": latency, "error": e}

def probe_openai(model, prompt):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        time.sleep(0.2)
        return ok("openai", model, 200, {"stub": True})

    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {"model": model, "messages":[{"role":"user","content":prompt}], "max_tokens": 10, "temperature": 0}

    t0 = now_ms()
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=15)
        latency = now_ms() - t0
        if r.status_code >= 400:
            return err("openai", model, latency, f"HTTP {r.status_code}: {r.text[:200]}")
        return ok("openai", model, latency, {"stub": False})
    except Exception as e:
        return err("openai", model, now_ms() - t0, repr(e))

def probe_anthropic(model, prompt):
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        time.sleep(0.25)
        return ok("anthropic", model, 250, {"stub": True})

    url = "https://api.anthropic.com/v1/messages"
    headers = {"x-api-key": key, "anthropic-version":"2023-06-01", "content-type":"application/json"}
    payload = {"model": model, "max_tokens": 10, "temperature": 0, "messages":[{"role":"user","content":prompt}]}

    t0 = now_ms()
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=15)
        latency = now_ms() - t0
        if r.status_code >= 400:
            return err("anthropic", model, latency, f"HTTP {r.status_code}: {r.text[:200]}")
        return ok("anthropic", model, latency, {"stub": False})
    except Exception as e:
        return err("anthropic", model, now_ms() - t0, repr(e))

def probe(provider, model, prompt):
    provider = provider.lower()
    if provider == "openai": return probe_openai(model, prompt)
    if provider == "anthropic": return probe_anthropic(model, prompt)
    return err(provider, model, 0, "unknown provider")

def parse_config(s: str):
    if not s:
        return {}

    # try strict JSON first
    try:
        return json.loads(s)
    except Exception:
        pass

    # fallback: parse "{k:v,a:b}" (no quotes) style
    t = s.strip()
    if t.startswith("{") and t.endswith("}"):
        t = t[1:-1].strip()

    out = {}
    if not t:
        return out

    for part in t.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        k = k.strip().strip('"').strip("'")
        v = v.strip().strip('"').strip("'")
        out[k] = v
    return out


def initiateInterview(simulation_config: dict, provider: str, model: str, prompt: str):
    """
    Simulates starting an interview by making a test completion request.
    In stub mode, we just return a deterministic response and echo the config.
    """
    out = probe(provider, model, prompt)
    out["kind"] = "initiateInterview"
    out["received_config"] = simulation_config
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("probe")
    p1.add_argument("--provider", required=True)
    p1.add_argument("--model", required=True)
    p1.add_argument("--prompt", default="Health check ping. Reply OK.")

    p2 = sub.add_parser("interview")
    p2.add_argument("--provider", required=True)
    p2.add_argument("--model", required=True)
    p2.add_argument("--prompt", default="Simulate interview start. Reply READY.")
    p2.add_argument("--config", default="{}")

    args = ap.parse_args()

    if args.cmd == "probe":
        print(json.dumps(probe(args.provider, args.model, args.prompt)))
    else:
        # out = probe(args.provider, args.model, args.prompt)
        # out["kind"] = "initiateInterview"
        # print(json.dumps(out))


        # Step 2-2: parse config JSON and call initiateInterview(config,...)
        try:
            # simulation_config = json.loads(args.config) if args.config else {}
            # print("DEBUG config repr:", repr(args.config))
            # print("DEBUG config repr:", repr(args.config), file=sys.stderr)
            simulation_config = parse_config(args.config)
            
            if not isinstance(simulation_config, dict):
                simulation_config = {"_raw_config": simulation_config}
        except Exception as e:
            simulation_config = {"_raw_config": args.config, "_config_parse_error": repr(e)}

        out = initiateInterview(
            simulation_config=simulation_config,
            provider=args.provider,
            model=args.model,
            prompt=args.prompt,
        )
        print(json.dumps(out))



if __name__ == "__main__":
    main()
