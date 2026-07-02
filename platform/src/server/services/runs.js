import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appendSpend } from "./spend-store.js";

/** Capture cost/token usage from the stream-json `result` event onto the run. */
function captureUsage(run, line) {
  const t = line.trim();
  if (!t || t.indexOf('"result"') === -1) return;
  let evt;
  try {
    evt = JSON.parse(t);
  } catch {
    return;
  }
  if (evt.type !== "result") return;
  if (typeof evt.total_cost_usd === "number") run.costUsd = evt.total_cost_usd;
  if (evt.usage) run.usage = evt.usage;
  if (typeof evt.duration_ms === "number") run.durationMs = evt.duration_ms;
  if (evt.modelUsage && typeof evt.modelUsage === "object") {
    // The CLI reports a dated model id (e.g. claude-opus-4-8-20260101); the pricing
    // table is keyed on the bare id, so strip the trailing -YYYYMMDD for the lookup.
    const raw = Object.keys(evt.modelUsage)[0];
    if (raw) run.model = raw.replace(/-\d{8}$/, "");
  }
}

/** Append this run's cost/token record to the workspace spend log. */
function persistSpend(cwd, run) {
  const u = run.usage || {};
  appendSpend(cwd, {
    id: run.id,
    label: run.label,
    phaseId: run.phaseId,
    agent: run.agent,
    kind: run.kind,
    model: run.model || null,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.durationMs || null,
    costUsd: run.costUsd || 0,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreateTokens: u.cache_creation_input_tokens || 0,
    cacheReadTokens: u.cache_read_input_tokens || 0
  });
}

/**
 * Agent run engine. Launches Claude Code in print mode (prompt via stdin),
 * streams its output live to subscribers (SSE), and persists a run log.
 * Runs are tracked in memory (logs also written to disk under .claude/control-center/runs/).
 */

const runs = new Map();
let counter = 0;

function toolLabel(p) {
  const i = p.input || {};
  const short = (s) => String(s || "").replace(/\s+/g, " ").slice(0, 90);
  // File paths are re-parsed by the activity log, so keep them intact (don't truncate).
  const fullPath = (s) => String(s || "").replace(/\s+/g, " ");
  switch (p.name) {
    case "Read": return `Lecture · ${fullPath(i.file_path)}`;
    case "Write": return `Écriture · ${fullPath(i.file_path)}`;
    case "Edit": return `Modification · ${fullPath(i.file_path)}`;
    case "Bash": return `Commande · ${short(i.command)}`;
    case "Glob": return `Recherche fichiers · ${short(i.pattern)}`;
    case "Grep": return `Recherche · ${short(i.pattern)}`;
    case "TodoWrite": return `Mise à jour du plan`;
    default: return p.name || "Outil";
  }
}

/** Turn one stream-json line into a readable progress string (or null to skip). */
function formatEvent(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let evt;
  try {
    evt = JSON.parse(trimmed);
  } catch {
    return null; // ignore non-JSON noise
  }
  if (evt.type === "system" && evt.subtype === "init") {
    return "Initialisation de l'agent…\n";
  }
  if (evt.type === "assistant" && evt.message) {
    let out = "";
    for (const part of evt.message.content || []) {
      if (part.type === "text" && part.text && part.text.trim()) {
        out += part.text.trim() + "\n";
      } else if (part.type === "tool_use") {
        out += `  → ${toolLabel(part)}\n`;
      }
    }
    return out || null;
  }
  if (evt.type === "result") {
    if (evt.subtype && evt.subtype !== "success") {
      return `\n[Résultat: ${evt.subtype}]\n`;
    }
    return null; // final text already shown via assistant messages
  }
  return null;
}

function nextRunId() {
  counter += 1;
  return `run-${Date.now()}-${counter}`;
}

function broadcast(run, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.subscribers) {
    try {
      res.write(payload);
    } catch {
      run.subscribers.delete(res);
    }
  }
}

export function getRun(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  const { subscribers, ...rest } = run;
  return rest;
}

export function listRuns() {
  return [...runs.values()].map(({ subscribers, log, ...rest }) => rest);
}

export function subscribe(runId, res) {
  const run = runs.get(runId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  if (!run) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Run introuvable." })}\n\n`);
    res.end();
    return;
  }
  // Replay existing log, then stream.
  res.write(`data: ${JSON.stringify({ type: "log", chunk: run.log })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "status", status: run.status })}\n\n`);
  if (run.status !== "running") {
    // Run already finished before this subscriber connected — still signal completion
    // so late-arriving clients (chat, next-steps) don't hang waiting for "ingested".
    res.write(`data: ${JSON.stringify({ type: "ingested" })}\n\n`);
    res.end();
    return;
  }
  run.subscribers.add(res);
  res.on("close", () => run.subscribers.delete(res));
}

/**
 * Start an agent run. Returns the run id immediately; the process runs async.
 * onDone(run) is called after the process exits (used to ingest agent output).
 */
export function startRun(config, { label, phaseId, agent, prompt, cwd, kind, onDone }) {
  const id = nextRunId();
  const run = {
    id,
    label: label || "Run",
    phaseId: phaseId || null,
    agent: agent || null,
    kind: kind || null,
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitOk: null,
    costUsd: 0,
    usage: null,
    model: null,
    log: "",
    subscribers: new Set()
  };
  runs.set(id, run);

  fs.mkdirSync(path.join(cwd, ".claude", "control-center", "runs"), { recursive: true });
  const logFile = path.join(cwd, ".claude", "control-center", "runs", `${id}.log`);

  const append = (chunk) => {
    run.log += chunk;
    try { fs.appendFileSync(logFile, chunk); } catch {}
    broadcast(run, { type: "log", chunk });
  };

  let child;
  try {
    // stream-json gives live events (tool uses, text) instead of a single final dump.
    child = spawn(
      config.claudeCommand || "claude",
      ["-p", "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"],
      // windowsHide avoids allocating a console/conhost per spawn, which under
      // repeated launches exhausts the desktop heap and makes new processes fail
      // to init (Windows STATUS_DLL_INIT_FAILED, exit code 0xC0000142).
      { cwd, shell: true, windowsHide: true }
    );
  } catch (e) {
    run.status = "error";
    run.exitOk = false;
    run.endedAt = new Date().toISOString();
    append(`\n[Erreur de lancement] ${e.message}\n`);
    // Finalize like a normal exit so cost is recorded and any group waiting on onDone unblocks.
    persistSpend(cwd, run);
    broadcast(run, { type: "status", status: run.status });
    (async () => {
      if (onDone) {
        try { await onDone(run); } catch (err) { append(`\n[Ingestion] erreur: ${err.message}\n`); }
      }
      broadcast(run, { type: "ingested" });
      for (const res of run.subscribers) { try { res.end(); } catch {} }
      run.subscribers.clear();
    })();
    return id;
  }

  append(`[Démarrage] ${run.label}\n`);

  // Parse the stream-json line by line and turn events into readable progress.
  let buf = "";
  const consume = (flush) => {
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      captureUsage(run, line);
      const text = formatEvent(line);
      if (text) append(text);
    }
    if (flush && buf.trim()) {
      captureUsage(run, buf);
      const text = formatEvent(buf);
      if (text) append(text);
      buf = "";
    }
  };
  child.stdout.on("data", (d) => {
    buf += d.toString();
    consume(false);
  });
  child.stderr.on("data", (d) => {
    const s = d.toString().trim();
    if (s) append(`[!] ${s}\n`);
  });
  child.on("error", (e) => append(`\n[Erreur] ${e.message}\n`));
  child.on("close", async (code) => {
    consume(true);
    run.status = code === 0 ? "done" : "error";
    run.exitOk = code === 0;
    run.endedAt = new Date().toISOString();
    append(`\n[Terminé] code ${code}\n`);
    persistSpend(cwd, run);
    broadcast(run, { type: "status", status: run.status });
    if (onDone) {
      try {
        await onDone(run);
      } catch (e) {
        append(`\n[Ingestion] erreur: ${e.message}\n`);
      }
    }
    broadcast(run, { type: "ingested" });
    for (const res of run.subscribers) {
      try { res.end(); } catch {}
    }
    run.subscribers.clear();
  });

  try {
    child.stdin.write(prompt);
    child.stdin.end();
  } catch (e) {
    append(`\n[Erreur stdin] ${e.message}\n`);
  }

  return id;
}
