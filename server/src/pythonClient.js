import { spawn } from "child_process";
import path from "path";

const PYTHON =
  process.platform === "win32"
    ? path.join("..", ".venv", "Scripts", "python.exe")
    : path.join("..", ".venv", "bin", "python");

const AGENT = path.join("..", "python", "llm_agent.py");

export function callPython(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, [AGENT, cmd, ...args], {
      cwd: process.cwd(),
      env: process.env,
    });

    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`python exit ${code}: ${err || out}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        reject(new Error(`bad json from python: ${out}`));
      }
    });
  });
}
