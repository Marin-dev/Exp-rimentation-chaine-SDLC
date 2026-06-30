import fs from "node:fs";
import { appStateDir, configPath, defaultWorkspaceRoot } from "./paths.js";

const DEFAULT_CONFIG = {
  workspaceRoot: defaultWorkspaceRoot,
  // Advanced: how the platform invokes Claude Code. Hidden from non-technical users.
  claudeCommand: "claude",
  claudeArgs: ["-p", "{prompt}"],
  // How to launch the DELIVERED product (the app the chain builds) locally.
  app: {
    backend: { command: "", cwd: "" },
    frontend: { command: "", cwd: "", url: "" }
  },
  // Governance policies that shape what agents may do autonomously.
  policies: {
    // mode "ask": the agent must request approval before a non-approved library.
    // mode "allow-all": the agent may use any library.
    libraries: { mode: "ask", allowed: [] }
  },
  // USD price per MILLION tokens, per model. Used to compute cost from tokens
  // when Claude doesn't report total_cost_usd (e.g. subscription billing).
  // Seeded with official list prices; editable in the Coûts screen.
  pricing: {
    currency: "USD",
    default: "claude-opus-4-8",
    models: {
      "claude-fable-5": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1.0 },
      "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
      "claude-opus-4-7": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
      "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
      "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
    }
  }
};

function ensureStateDir() {
  if (!fs.existsSync(appStateDir)) {
    fs.mkdirSync(appStateDir, { recursive: true });
  }
}

export function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(patch) {
  ensureStateDir();
  const next = { ...loadConfig(), ...patch };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}
