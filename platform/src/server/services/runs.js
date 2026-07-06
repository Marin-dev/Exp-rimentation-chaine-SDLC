import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appendSpend } from "./spend-store.js";

/**
 * Resolve the Claude CLI to a DIRECT executable invocation, so the spawned pid IS the real
 * agent (survives orphaned across a restart) instead of a cmd.exe shell wrapper that dies
 * early. Handles both a native `claude.exe` and a `node cli.js` shim. Returns
 * { command, prefixArgs } or null (→ callers fall back to the shell spawn).
 */
let cachedLauncher; // undefined = not resolved yet; null = unavailable; object = resolved
function resolveClaudeLauncher(claudeCommand) {
  if (cachedLauncher !== undefined) return cachedLauncher;
  cachedLauncher = null;
  try {
    const cmd = String(claudeCommand || "claude");
    if (!/(^|[\\/])claude(\.cmd)?$/i.test(cmd)) return cachedLauncher; // custom command → shell
    const finder = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    const out = execSync(finder, { encoding: "utf8", windowsHide: true });
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const shim = lines.find((s) => /\.cmd$/i.test(s)) || lines.find((s) => !/\.ps1$/i.test(s));
    if (!shim || !fs.existsSync(shim)) return cachedLauncher;
    const dir = path.dirname(shim);
    const resolveShimPath = (p) => path.resolve(p.replace(/%~?dp0%?/gi, dir).replace(/\\\\/g, "\\"));

    let target = null; // the .exe or cli.js the shim ultimately runs
    if (/\.cmd$/i.test(shim)) {
      const content = fs.readFileSync(shim, "utf8");
      const quoted = [...content.matchAll(/"([^"]+\.(?:exe|js))"/gi)].map((m) => m[1]);
      target =
        quoted.find((p) => /claude-code[\\/].*(claude\.exe|cli\.js)$/i.test(p)) ||
        quoted.find((p) => /claude\.exe$/i.test(p) && !/[\\/]node\.exe$/i.test(p)) ||
        quoted.find((p) => /cli\.js$/i.test(p)) ||
        null;
      if (target) target = resolveShimPath(target);
    } else {
      const guessExe = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      const guessCli = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
      target = fs.existsSync(guessExe) ? guessExe : fs.existsSync(guessCli) ? guessCli : null;
    }
    if (!target || !fs.existsSync(target)) return cachedLauncher;
    cachedLauncher = /\.js$/i.test(target)
      ? { command: process.execPath, prefixArgs: [target] } // node cli.js …
      : { command: target, prefixArgs: [] };                // claude.exe …
  } catch {
    cachedLauncher = null;
  }
  return cachedLauncher;
}

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
export function startRun(config, { label, phaseId, agent, prompt, cwd, kind, onDone, pendingFile, risksFile }) {
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
    // Fields the active-runs registry needs to reconcile this run after a server restart.
    cwd,
    pid: null,       // the shell (cmd.exe) pid from spawn(shell:true)
    agentPid: null,  // the real agent (node/claude) pid — survives orphaned across a restart
    logFile: null,
    pendingFile: pendingFile || null,
    risksFile: risksFile || null,
    subscribers: new Set()
  };
  runs.set(id, run);

  fs.mkdirSync(path.join(cwd, ".claude", "control-center", "runs"), { recursive: true });
  const logFile = path.join(cwd, ".claude", "control-center", "runs", `${id}.log`);
  run.logFile = logFile;

  const append = (chunk) => {
    run.log += chunk;
    try { fs.appendFileSync(logFile, chunk); } catch {}
    broadcast(run, { type: "log", chunk });
  };

  let child;
  let directSpawn = false;
  try {
    // stream-json gives live events (tool uses, text) instead of a single final dump.
    // Headless print-mode runs can't answer permission prompts, so default to bypassing
    // them (config-overridable) — else commands like az/npm/deploy stall the whole run.
    const permissionMode = config.permissionMode || "bypassPermissions";
    const args = ["-p", "--permission-mode", permissionMode, "--output-format", "stream-json", "--verbose"];
    const launcher = resolveClaudeLauncher(config.claudeCommand);
    if (launcher) {
      // Direct executable (claude.exe or node cli.js) — no shell wrapper, so child.pid IS
      // the real agent and survives orphaned across a server restart (reliable reconcile).
      directSpawn = true;
      child = spawn(launcher.command, [...launcher.prefixArgs, ...args], { cwd, windowsHide: true });
    } else {
      // Fallback: shell resolves claude.cmd. windowsHide avoids allocating a console/conhost
      // per spawn, which under repeated launches exhausts the desktop heap (STATUS_DLL_INIT_FAILED).
      child = spawn(config.claudeCommand || "claude", args, { cwd, shell: true, windowsHide: true });
    }
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

  run.pid = child.pid || null;
  if (directSpawn) {
    // Direct node spawn: the pid we hold IS the agent → no shell-tree walk needed.
    run.agentPid = child.pid || null;
    persistActiveRuns(cwd);
  } else {
    persistActiveRuns(cwd);
    // Shell fallback: resolve the real agent pid (a node.exe descendant) best-effort so
    // reconcile's liveness check survives the shell dying while the agent orphans.
    resolveAgentPidWithRetry(child.pid).then((apid) => {
      if (apid && run.status === "running") {
        run.agentPid = apid;
        persistActiveRuns(cwd);
      }
    });
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
    persistActiveRuns(cwd);
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

// ---- Active-run registry: lets a restarted server re-adopt in-flight runs ----

function activeRegistryPath(cwd) {
  return path.join(cwd, ".claude", "control-center", "active-runs.json");
}

/** Snapshot the running runs of a workspace to disk, so a restart can adopt them. */
function persistActiveRuns(cwd) {
  try {
    const list = [...runs.values()]
      .filter((r) => r.cwd === cwd && r.status === "running" && r.pid)
      .map((r) => ({
        id: r.id, label: r.label, agent: r.agent, phaseId: r.phaseId, kind: r.kind,
        pid: r.pid, agentPid: r.agentPid || null, startedAt: r.startedAt, logFile: r.logFile, cwd: r.cwd,
        pendingFile: r.pendingFile, risksFile: r.risksFile
      }));
    const file = activeRegistryPath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch {}
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * On Windows, spawn(shell:true) returns the cmd.exe pid, but the real agent is a
 * `node.exe` DESCENDANT that survives (orphaned) across a server restart while the
 * shell dies. Find that descendant pid via a one-off process-tree walk. Returns null
 * on non-Windows (there the shell pid is reparented and stays valid) or on failure.
 */
function resolveAgentPid(shellPid) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !shellPid) { resolve(null); return; }
    const script =
      "$ErrorActionPreference='SilentlyContinue';" +
      "$all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name;" +
      "$q=New-Object System.Collections.Queue;$q.Enqueue(" + shellPid + ");" +
      "while($q.Count -gt 0){$p=$q.Dequeue();" +
      "foreach($c in ($all|Where-Object {$_.ParentProcessId -eq $p})){" +
      "if($c.Name -eq 'node.exe'){$c.ProcessId;exit};$q.Enqueue($c.ProcessId)}}";
    let out = "";
    let ps;
    try {
      ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    ps.stdout.on("data", (d) => (out += d.toString()));
    ps.on("error", () => resolve(null));
    ps.on("close", () => {
      const pid = parseInt(String(out).trim().split(/\s+/)[0], 10);
      resolve(Number.isInteger(pid) ? pid : null);
    });
  });
}

/** The node descendant can take a moment to appear under the shell — retry briefly. */
async function resolveAgentPidWithRetry(shellPid, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const pid = await resolveAgentPid(shellPid);
    if (pid) return pid;
    await delay(500);
  }
  return null;
}

/** Cross-platform "is this pid still running?" (EPERM means it exists but we can't signal it). */
function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return Boolean(e && e.code === "EPERM"); }
}

function loadLogSafe(logFile) {
  try { return fs.readFileSync(logFile, "utf8"); } catch { return ""; }
}

/** An adopted run whose process has now exited: close it out and ingest its output. */
function finalizeReconciled(run, onFinalize) {
  if (run.status !== "running") return;
  run.status = "done";
  run.exitOk = true;
  run.endedAt = new Date().toISOString();
  run.log += "\n[Repris après redémarrage — processus terminé]\n";
  broadcast(run, { type: "status", status: run.status });
  persistActiveRuns(run.cwd);
  (async () => {
    if (onFinalize) { try { await onFinalize(run); } catch {} }
    broadcast(run, { type: "ingested" });
    for (const res of run.subscribers) { try { res.end(); } catch {} }
    run.subscribers.clear();
  })();
}

/**
 * On startup, adopt runs that were still executing when the previous server stopped.
 * Their child processes keep running (orphaned) across a restart; we re-register them so
 * they reappear in the banner, and when their process exits we run onFinalize (ingestion)
 * so nothing they produced (decisions / risks / pending input) is stranded.
 */
export function reconcileRuns(paths, onFinalize) {
  const cwd = paths.workspaceRoot;
  let list = [];
  try {
    const raw = fs.readFileSync(activeRegistryPath(cwd), "utf8");
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    return { adopted: 0, finalized: 0 };
  }

  let adopted = 0;
  let finalized = 0;
  for (const e of list) {
    if (!e || !e.id || runs.has(e.id)) continue;
    const run = {
      id: e.id,
      label: e.label || "Run (repris)",
      phaseId: e.phaseId || null,
      agent: e.agent || null,
      kind: e.kind || null,
      status: "running",
      startedAt: e.startedAt || new Date().toISOString(),
      endedAt: null,
      exitOk: null,
      costUsd: 0,
      usage: null,
      model: null,
      log: loadLogSafe(e.logFile),
      cwd,
      pid: e.pid || null,
      agentPid: e.agentPid || null,
      logFile: e.logFile || null,
      pendingFile: e.pendingFile || null,
      risksFile: e.risksFile || null,
      reconciled: true,
      subscribers: new Set()
    };
    runs.set(run.id, run);
    // Check the REAL agent pid (survives orphaned); fall back to the shell pid.
    const livePid = run.agentPid || run.pid;
    if (isAlive(livePid)) {
      adopted += 1;
      const timer = setInterval(() => {
        if (!isAlive(run.agentPid || run.pid)) {
          clearInterval(timer);
          finalizeReconciled(run, onFinalize);
        }
      }, 3000);
    } else {
      finalized += 1;
      finalizeReconciled(run, onFinalize);
    }
  }
  persistActiveRuns(cwd);
  return { adopted, finalized };
}
