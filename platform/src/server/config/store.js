import fs from "node:fs";
import { appStateDir, configPath, defaultWorkspaceRoot } from "./paths.js";

const DEFAULT_CONFIG = {
  workspaceRoot: defaultWorkspaceRoot,
  // Advanced: how the platform invokes Claude Code. Hidden from non-technical users.
  claudeCommand: "claude",
  claudeArgs: ["-p", "{prompt}"],
  // Permission mode for the headless agent runs. Runs are non-interactive (`claude -p`),
  // so they CANNOT answer a permission prompt: any tool needing approval would hang/stall.
  // "bypassPermissions" lets agents execute commands (az, npm, deploy…) without prompting;
  // human validation happens through this platform's own protocol (decisions / pending-input),
  // not through the CLI's tool prompts. "acceptEdits" only auto-approves file edits (shell
  // commands still block — use only if you deliberately want agents unable to run commands).
  permissionMode: "bypassPermissions",
  // Bounds of every agent run. timeoutMinutes: the run is stopped (by PID) past this
  // duration — a stuck agent can't freeze the chain. maxTurns: passed as --max-turns
  // (0 = CLI default, unlimited).
  runLimits: { timeoutMinutes: 120, maxTurns: 0 },
  // Model per run kind (--model). Empty = the CLI's default model. The autopilot planner
  // ("plan") only reads a snapshot and writes a JSON plan: a lighter model is enough.
  models: { default: "", byKind: { plan: "sonnet", "app-detect": "sonnet", "request-classify": "sonnet" } },
  // Chain the reviewer automatically after a producer / remediation run of a phase that
  // has one, so the gate is always decided by the reviewer.
  autoReview: true,
  // G5 dev lanes of a parallel wave: "shared" (same folder, anti-collision by prompt) or
  // "worktree" (one git worktree per lane, merged after the wave; commits the workspace).
  devIsolation: "shared",
  // How to launch the DELIVERED product (the app the chain builds) locally.
  app: {
    backend: { command: "", cwd: "" },
    frontend: { command: "", cwd: "", url: "" }
  },
  // Templates used as style examples for generated supports (files under .state/templates/).
  supportTemplates: { pptx: null, docx: null },
  // Governance policies that shape what agents may do autonomously.
  policies: {
    // mode "ask": the agent must request approval before a non-approved library.
    // mode "allow-all": the agent may use any library.
    libraries: { mode: "ask", allowed: [] }
  },
  // Autopilot ("gestion automatique") : the orchestrator drives the chain by itself —
  // it plans the next bounded batch, launches the agents, and delegates each decision to
  // the domain expert agent, only pausing to ask the human when the expert is itself blocked.
  autopilot: {
    enabled: false,
    // Max agent processes running at once; below it the conductor keeps delegating and
    // planning alongside the agents already at work (a dev batch counts each lane).
    maxConcurrent: 1,
    // Hard stop after this many orchestration turns (guards against loops).
    maxIterations: 30,
    // Hard stop once the session spends this much (USD). 0 = no cost cap.
    budgetUsd: 10,
    // When to STOP and ask the human instead of delegating to the expert agent:
    //  "expert-blocked" — delegate everything; escalate only if the expert can't decide.
    //  "structural"     — delegate routine choices; escalate structural/irreversible ones.
    //  "always-delegate"— never escalate mid-run (the expert always decides).
    escalation: "expert-blocked",
    // External, hard-to-reverse actions (git push, GitHub publish, launching the built
    // product) are NEVER run autonomously — they always stay on manual confirmation.
    externalActionsNeedConfirm: true
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
