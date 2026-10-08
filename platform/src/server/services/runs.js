import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { appendSpend, costFromTokens } from "./spend-store.js";

/**
 * Agent run engine. Launches Claude Code in print mode (prompt via stdin).
 *
 * The agent's stdout/stderr go to FILES (runs/<id>.jsonl / <id>.stderr.log), not pipes:
 * the server tails them. A restarted server can therefore keep reading a run that kept
 * going (orphaned) and still get its `result` event (cost, tokens, success) — with a pipe,
 * that output was lost and the orphan died on its first write to the broken pipe.
 *
 * Every run also gets its OWN agent-io files (pending-input-<id>.json, risks-<id>.json…):
 * the default shared names in the prompt are rewritten, so concurrent runs never read or
 * overwrite each other's questions, risks, tasks or resolutions.
 */

const runs = new Map();
let counter = 0;
const hooks = { beforeDone: null, afterDone: null };

const TAIL_MS = 300;
const KEEP_LOG_IN_MEMORY_MS = 2 * 60 * 1000;
const MAX_FINISHED_RUNS = 300;
const REPLAY_BYTES = 200 * 1024;

/**
 * Platform-wide run hooks, registered once by server.js:
 *  - beforeDone(run): generic ingestion of the run's agent-io files (runs before onDone);
 *  - afterDone(run):  coordination side-effects (gate closure, review chaining…).
 * Both also run for runs re-adopted after a restart, whose own onDone closure is gone.
 */
export function setRunHooks(next) {
  Object.assign(hooks, next || {});
}

// ---------- launcher resolution ----------

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

// ---------- arguments ----------

const SAFE_TOKEN = /^[A-Za-z0-9._\-[\]]+$/;
const SESSION_ID = /^[0-9a-f-]{8,64}$/i;

/** Model for a run: explicit > per-kind setting > default setting > CLI default (null). */
export function modelForKind(config, kind) {
  const m = (config && config.models) || {};
  const byKind = m.byKind || {};
  const v = String((kind && byKind[kind]) || m.default || "").trim();
  return v && SAFE_TOKEN.test(v) ? v : null;
}

/** CLI arguments of an agent run. Pure — unit-tested. */
export function buildClaudeArgs(config, { kind, model, resumeSessionId } = {}) {
  // Headless print-mode runs can't answer permission prompts, so default to bypassing
  // them (config-overridable) — else commands like az/npm/deploy stall the whole run.
  const permissionMode = (config && config.permissionMode) || "bypassPermissions";
  // stream-json gives live events (tool uses, text) instead of a single final dump.
  const args = ["-p", "--permission-mode", permissionMode, "--output-format", "stream-json", "--verbose"];
  const chosen = model && SAFE_TOKEN.test(String(model)) ? String(model) : modelForKind(config, kind);
  if (chosen) args.push("--model", chosen);
  const maxTurns = Number(config && config.runLimits && config.runLimits.maxTurns) || 0;
  if (maxTurns > 0) args.push("--max-turns", String(Math.floor(maxTurns)));
  if (resumeSessionId && SESSION_ID.test(String(resumeSessionId))) args.push("--resume", String(resumeSessionId));
  return args;
}

// ---------- per-run agent-io isolation ----------

const IO_KEYS = { "pending-input": "pending", risks: "risks", tasks: "tasks", resolutions: "resolutions" };
const IO_DIR_REL = "livrables/_governance/agent-io";

/** The run's own agent-io files (absolute, under the run's cwd). */
export function runIoFiles(cwd, runId) {
  const out = {};
  for (const [name, key] of Object.entries(IO_KEYS)) {
    out[key] = path.join(cwd, ...IO_DIR_REL.split("/"), `${name}-${runId}.json`);
  }
  return out;
}

/** Rewrite the SHARED default agent-io file names of a prompt to this run's own files. */
export function isolatePromptIo(prompt, runId) {
  return String(prompt || "").replace(
    /agent-io\/(pending-input|risks|tasks|resolutions)\.json/g,
    (_m, name) => `agent-io/${name}-${runId}.json`
  );
}

// ---------- stream parsing ----------

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

/** Turn one parsed stream-json event into a readable progress string (or null to skip). */
export function formatEvent(evt) {
  if (!evt || typeof evt !== "object") return null;
  if (evt.type === "system" && evt.subtype === "init") return "Initialisation de l'agent…\n";
  if (evt.type === "assistant" && evt.message) {
    let out = "";
    for (const part of evt.message.content || []) {
      if (part.type === "text" && part.text && part.text.trim()) out += part.text.trim() + "\n";
      else if (part.type === "tool_use") out += `  → ${toolLabel(part)}\n`;
    }
    return out || null;
  }
  if (evt.type === "result" && evt.subtype && evt.subtype !== "success") return `\n[Résultat: ${evt.subtype}]\n`;
  return null;
}

/** Capture session, model, live token usage and the final result from one event. */
export function captureEvent(run, evt) {
  if (!evt || typeof evt !== "object") return;
  if (evt.session_id && !run.sessionId) run.sessionId = evt.session_id;
  if (evt.type === "system" && evt.subtype === "init") {
    if (evt.session_id) run.sessionId = evt.session_id;
    if (evt.model) run.model = String(evt.model).replace(/-\d{8}$/, "");
    return;
  }
  if (evt.type === "assistant" && evt.message && evt.message.usage) {
    // One API message is streamed as several events sharing its id: keep the latest usage.
    const id = evt.message.id || `anon-${run.liveUsage.size}`;
    run.liveUsage.set(id, evt.message.usage);
    return;
  }
  if (evt.type === "result") {
    run.resultEvent = { subtype: evt.subtype || null, isError: Boolean(evt.is_error) };
    if (evt.session_id) run.sessionId = evt.session_id;
    if (typeof evt.total_cost_usd === "number") run.costUsd = evt.total_cost_usd;
    if (evt.usage) run.usage = evt.usage;
    if (typeof evt.duration_ms === "number") run.durationMs = evt.duration_ms;
    if (evt.modelUsage && typeof evt.modelUsage === "object") {
      // The CLI reports a dated model id; the pricing table is keyed on the bare id.
      const raw = Object.keys(evt.modelUsage)[0];
      if (raw) run.model = raw.replace(/-\d{8}$/, "");
    }
  }
}

/** Sum of the live (per-message) usage of a run — used before its `result` arrives. */
function summedLiveUsage(run) {
  const u = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  for (const m of run.liveUsage.values()) {
    for (const k of Object.keys(u)) u[k] += Number(m[k]) || 0;
  }
  return u;
}

function usageRecord(u) {
  u = u || {};
  return {
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreateTokens: u.cache_creation_input_tokens || 0,
    cacheReadTokens: u.cache_read_input_tokens || 0
  };
}

/** Best current cost of a run: reported cost, else tokens × pricing (live while running). */
export function runCostUsd(run, pricing) {
  if (run.costUsd && run.costUsd > 0) return run.costUsd;
  const usage = run.usage || summedLiveUsage(run);
  return costFromTokens({ model: run.model, ...usageRecord(usage) }, pricing).cost;
}

/** Cost already burnt by the runs still in flight (optionally only some ids). */
export function liveCostUsd(pricing, ids) {
  let total = 0;
  for (const r of runs.values()) {
    if (r.status !== "running") continue;
    if (ids && !ids.has(r.id)) continue;
    total += runCostUsd(r, pricing);
  }
  return total;
}

// ---------- files ----------

function runsDirOf(stateRoot) {
  return path.join(stateRoot, ".claude", "control-center", "runs");
}

function writeMeta(run) {
  try {
    const meta = {
      id: run.id, label: run.label, kind: run.kind, phaseId: run.phaseId, agent: run.agent,
      cwd: run.cwd, stateRoot: run.stateRoot, sessionId: run.sessionId || null, model: run.model || null,
      status: run.status, exitOk: run.exitOk, cancelled: Boolean(run.cancelled),
      startedAt: run.startedAt, endedAt: run.endedAt,
      pendingFile: run.pendingFile, risksFile: run.risksFile, tasksFile: run.tasksFile,
      extraIo: run.extraIo || [], resumeOf: run.resumeOf || null, post: run.post || null,
      basePrompt: run.basePrompt || ""
    };
    fs.writeFileSync(path.join(runsDirOf(run.stateRoot), `${run.id}.meta.json`), JSON.stringify(meta, null, 2), "utf8");
  } catch {}
}

/** Persisted metadata of a run (session id, agent, io files, original prompt…) or null. */
export function readRunMeta(stateRoot, runId) {
  const live = runs.get(runId);
  if (live) {
    return {
      id: live.id, label: live.label, kind: live.kind, phaseId: live.phaseId, agent: live.agent,
      cwd: live.cwd, stateRoot: live.stateRoot, sessionId: live.sessionId || null, model: live.model || null,
      status: live.status, pendingFile: live.pendingFile, risksFile: live.risksFile, tasksFile: live.tasksFile,
      extraIo: live.extraIo || [], resumeOf: live.resumeOf || null, post: live.post || null,
      basePrompt: live.basePrompt || ""
    };
  }
  if (!/^[\w.-]+$/.test(String(runId || ""))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(runsDirOf(stateRoot), `${runId}.meta.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Append this run's cost/token record to the workspace spend log. */
function persistSpend(run) {
  appendSpend(run.stateRoot, {
    id: run.id,
    label: run.label,
    phaseId: run.phaseId,
    agent: run.agent,
    kind: run.kind,
    model: run.model || null,
    status: run.status,
    cancelled: Boolean(run.cancelled),
    sessionId: run.sessionId || null,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.durationMs || null,
    costUsd: run.costUsd || 0,
    ...usageRecord(run.usage || summedLiveUsage(run))
  });
}

/** Poll-tail a file from offset 0, decoding UTF-8 safely across chunk boundaries. */
function createTail(file, onText) {
  let offset = 0;
  const decoder = new StringDecoder("utf8");
  const readMore = () => {
    let fd;
    try { fd = fs.openSync(file, "r"); } catch { return; }
    try {
      const size = fs.fstatSync(fd).size;
      while (offset < size) {
        const len = Math.min(size - offset, 1 << 20);
        const buf = Buffer.alloc(len);
        const n = fs.readSync(fd, buf, 0, len, offset);
        if (n <= 0) break;
        offset += n;
        onText(decoder.write(buf.subarray(0, n)));
      }
    } catch {
    } finally {
      try { fs.closeSync(fd); } catch {}
    }
  };
  const timer = setInterval(readMore, TAIL_MS);
  return {
    stop() {
      clearInterval(timer);
      readMore();
      const rest = decoder.end();
      if (rest) onText(rest);
    }
  };
}

// ---------- registry ----------

function nextRunId() {
  counter += 1;
  return `run-${Date.now()}-${counter}`;
}

function broadcast(run, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.subscribers) {
    try { res.write(payload); } catch { run.subscribers.delete(res); }
  }
}

const PUBLIC_FIELDS = [
  "id", "label", "phaseId", "agent", "kind", "status", "startedAt", "endedAt", "exitOk", "costUsd",
  "usage", "model", "durationMs", "sessionId", "cancelled", "cancelReason", "reconciled", "cwd",
  "pid", "agentPid", "logFile", "pendingFile", "risksFile", "tasksFile", "resumeOf"
];

function publicRun(run) {
  const out = {};
  for (const k of PUBLIC_FIELDS) out[k] = run[k] ?? null;
  return out;
}

/** The run's readable log — in memory while recent, else read back from its file. */
function runLogText(run) {
  if (typeof run.log === "string") return run.log;
  try { return fs.readFileSync(run.logFile, "utf8"); } catch { return ""; }
}

export function getRun(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  return { ...publicRun(run), log: runLogText(run) };
}

export function listRuns() {
  return [...runs.values()].map(publicRun);
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
  // Replay the tail of the log (a long dev run can weigh megabytes), then stream.
  let log = runLogText(run);
  if (log.length > REPLAY_BYTES) log = `[… début du journal tronqué — journal complet dans ${path.basename(run.logFile || "")}]\n` + log.slice(-REPLAY_BYTES);
  res.write(`data: ${JSON.stringify({ type: "log", chunk: log })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "status", status: run.status })}\n\n`);
  if (run.status !== "running" && run.ingested) {
    // Run already finished before this subscriber connected — still signal completion
    // so late-arriving clients (chat, next-steps) don't hang waiting for "ingested".
    res.write(`data: ${JSON.stringify({ type: "ingested" })}\n\n`);
    res.end();
    return;
  }
  run.subscribers.add(res);
  res.on("close", () => run.subscribers.delete(res));
}

/** Drop old finished runs from memory (their files stay on disk). */
function evictFinished() {
  const finished = [...runs.values()].filter((r) => r.status !== "running");
  if (finished.length <= MAX_FINISHED_RUNS) return;
  finished.sort((a, b) => String(a.endedAt || "").localeCompare(String(b.endedAt || "")));
  for (const r of finished.slice(0, finished.length - MAX_FINISHED_RUNS)) runs.delete(r.id);
}

function newRun(fields) {
  return {
    status: "running",
    endedAt: null,
    exitOk: null,
    costUsd: 0,
    usage: null,
    model: null,
    durationMs: null,
    sessionId: null,
    resultEvent: null,
    liveUsage: new Map(),
    cancelled: false,
    cancelReason: null,
    finalized: false,
    ingested: false,
    log: "",
    subscribers: new Set(),
    ...fields
  };
}

function append(run, chunk) {
  if (!chunk) return;
  if (typeof run.log === "string") run.log += chunk;
  try { run.logStream && run.logStream.write(chunk); } catch {}
  broadcast(run, { type: "log", chunk });
}

/** Feed raw stdout text (stream-json, one event per line) into the run. */
function makeStdoutConsumer(run) {
  let buf = "";
  const line = (raw) => {
    const t = raw.trim();
    if (!t) return;
    let evt;
    try { evt = JSON.parse(t); } catch { return; } // ignore non-JSON noise
    const hadSession = Boolean(run.sessionId);
    captureEvent(run, evt);
    if (!hadSession && run.sessionId) writeMeta(run);
    append(run, formatEvent(evt));
  };
  return {
    push(text) {
      buf += text;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        line(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    },
    flush() {
      if (buf.trim()) line(buf);
      buf = "";
    }
  };
}

function armTimeout(run, config) {
  const minutes = Number(config && config.runLimits && config.runLimits.timeoutMinutes) || 0;
  if (minutes <= 0) return;
  const elapsed = Date.now() - new Date(run.startedAt).getTime();
  const remaining = Math.max(1000, minutes * 60000 - elapsed);
  run.timeoutTimer = setTimeout(() => {
    cancelRun(run.id, `Délai maximum dépassé (${minutes} min).`);
  }, remaining);
}

/**
 * Close a run out (normal exit, cancellation or re-adopted orphan): final status from the
 * exit code — or, when unknown (orphan), from the `result` event — then spend, hooks, onDone.
 */
async function finalize(run, { code, onDone }) {
  if (run.finalized) return;
  run.finalized = true;
  clearTimeout(run.timeoutTimer);
  if (run.liveTimer) clearInterval(run.liveTimer);
  if (run.outTail) run.outTail.stop();
  if (run.errTail) run.errTail.stop();
  if (run.stdout) run.stdout.flush();

  const r = run.resultEvent;
  let ok;
  if (run.cancelled) ok = false;
  else if (typeof code === "number") ok = code === 0;
  else ok = Boolean(r && r.subtype === "success" && !r.isError);
  run.status = ok ? "done" : "error";
  run.exitOk = ok;
  run.endedAt = new Date().toISOString();
  const why = typeof code === "number" ? `code ${code}` : r ? `résultat ${r.subtype}` : "processus disparu sans résultat";
  if (run.cancelled) append(run, `\n[Annulé] ${run.cancelReason || ""}\n`);
  append(run, `\n[Terminé] ${why}\n`);
  try { run.logStream && run.logStream.end(); } catch {}
  run.logStream = null;

  persistSpend(run);
  persistActiveRuns(run.stateRoot);
  writeMeta(run);
  broadcast(run, { type: "status", status: run.status });

  const safe = async (fn, label) => {
    if (!fn) return;
    try { await fn(run); } catch (e) { append(run, `\n[${label}] erreur: ${e.message}\n`); }
  };
  await safe(hooks.beforeDone, "Ingestion");
  await safe(onDone, "Ingestion");
  await safe(hooks.afterDone, "Coordination");

  run.ingested = true;
  broadcast(run, { type: "ingested" });
  for (const res of run.subscribers) { try { res.end(); } catch {} }
  run.subscribers.clear();
  setTimeout(() => { run.log = null; }, KEEP_LOG_IN_MEMORY_MS).unref?.();
  evictFinished();
}

/**
 * Start an agent run. Returns the run id immediately; the process runs async.
 * onDone(run) is called after the process exits (used to ingest agent output).
 *
 * Options beyond the basics:
 *  - stateRoot: workspace that holds control-center/ (defaults to cwd; differs for a
 *    lane running in a git worktree);
 *  - resumeSessionId: continue that Claude session (`--resume`) instead of starting cold;
 *  - model: explicit model (else per-kind setting);
 *  - resumeOf / extraIo / post: bookkeeping for resumes and re-adoption after restart.
 */
export function startRun(config, opts) {
  const {
    label, phaseId, agent, prompt, cwd, kind, onDone, pendingFile, risksFile, tasksFile,
    stateRoot, resumeSessionId, model, resumeOf, extraIo, post
  } = opts;
  const id = nextRunId();
  const root = stateRoot || cwd;
  const runsDir = runsDirOf(root);
  fs.mkdirSync(runsDir, { recursive: true });
  const io = runIoFiles(cwd, id);
  const run = newRun({
    id,
    // Kept in memory for the run hooks (chaining uses the settings the run was launched with).
    config,
    label: label || "Run",
    phaseId: phaseId || null,
    agent: agent || null,
    kind: kind || null,
    startedAt: new Date().toISOString(),
    cwd,
    stateRoot: root,
    pid: null,       // the spawned pid (shell pid on the shell fallback)
    agentPid: null,  // the real agent (node/claude) pid — survives orphaned across a restart
    logFile: path.join(runsDir, `${id}.log`),
    rawFile: path.join(runsDir, `${id}.jsonl`),
    errFile: path.join(runsDir, `${id}.stderr.log`),
    io,
    pendingFile: pendingFile || null,
    risksFile: risksFile || null,
    tasksFile: tasksFile || null,
    extraIo: Array.isArray(extraIo) ? extraIo.filter(Boolean) : [],
    resumeOf: resumeOf || null,
    post: post || null,
    basePrompt: String(prompt || "")
  });
  runs.set(id, run);
  run.logStream = fs.createWriteStream(run.logFile, { flags: "a" });
  writeMeta(run);

  let child;
  let directSpawn = false;
  try {
    const args = buildClaudeArgs(config, { kind, model, resumeSessionId });
    const outFd = fs.openSync(run.rawFile, "a");
    const errFd = fs.openSync(run.errFile, "a");
    const stdio = ["pipe", outFd, errFd];
    try {
      const launcher = resolveClaudeLauncher(config.claudeCommand);
      if (launcher) {
        // Direct executable (claude.exe or node cli.js) — no shell wrapper, so child.pid IS
        // the real agent and survives orphaned across a server restart (reliable reconcile).
        directSpawn = true;
        child = spawn(launcher.command, [...launcher.prefixArgs, ...args], { cwd, windowsHide: true, stdio });
      } else {
        // Fallback: shell resolves claude.cmd. windowsHide avoids allocating a console/conhost
        // per spawn, which under repeated launches exhausts the desktop heap (STATUS_DLL_INIT_FAILED).
        child = spawn(config.claudeCommand || "claude", args, { cwd, shell: true, windowsHide: true, stdio });
      }
    } finally {
      // The child holds its own handles; ours are no longer needed.
      try { fs.closeSync(outFd); } catch {}
      try { fs.closeSync(errFd); } catch {}
    }
  } catch (e) {
    append(run, `\n[Erreur de lancement] ${e.message}\n`);
    // Finalize like a normal exit so cost is recorded and any group waiting on onDone unblocks.
    finalize(run, { code: -1, onDone });
    return id;
  }

  run.pid = child.pid || null;
  if (directSpawn) {
    run.agentPid = child.pid || null;
    persistActiveRuns(root);
  } else {
    persistActiveRuns(root);
    // Shell fallback: resolve the real agent pid (a node.exe descendant) best-effort so
    // reconcile's liveness check survives the shell dying while the agent orphans.
    resolveAgentPidWithRetry(child.pid).then((apid) => {
      if (apid && run.status === "running") {
        run.agentPid = apid;
        persistActiveRuns(root);
      }
    });
  }

  append(run, `[Démarrage] ${run.label}${resumeSessionId ? " (reprise de la session de l'agent)" : ""}\n`);
  run.stdout = makeStdoutConsumer(run);
  run.outTail = createTail(run.rawFile, (t) => run.stdout.push(t));
  run.errTail = createTail(run.errFile, (t) => {
    const s = t.trim();
    if (s) append(run, `[!] ${s}\n`);
  });
  armTimeout(run, config);

  child.on("error", (e) => append(run, `\n[Erreur] ${e.message}\n`));
  child.on("close", (code) => finalize(run, { code, onDone }));

  try {
    // Each run writes to its own agent-io files (see isolatePromptIo).
    child.stdin.write(isolatePromptIo(prompt, id));
    child.stdin.end();
  } catch (e) {
    append(run, `\n[Erreur stdin] ${e.message}\n`);
  }

  return id;
}

// ---------- command runs (no LLM) ----------

/** Run one shell step, its output streamed into the run log. Resolves its outcome. */
function runShellStep(run, step) {
  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    try {
      // Commands come from the project's (human-approved) verification file. CI=1 keeps
      // test runners out of watch / interactive modes; stdin is closed.
      child = spawn(step.command, {
        cwd: step.cwd,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" }
      });
    } catch (e) {
      resolve({ status: "error", exitCode: null, durationMs: 0, startedAt: new Date(started).toISOString(), error: e.message, logTail: "" });
      return;
    }
    run.pid = child.pid || null;
    run.agentPid = child.pid || null;
    let tail = "";
    let timedOut = false;
    const onData = (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-6000);
      append(run, s);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      timedOut = true;
      append(run, `\n[Délai dépassé] ${Math.round(step.timeoutMs / 60000)} min — arrêt de la commande.\n`);
      killTree(child.pid);
    }, step.timeoutMs);
    let settled = false;
    const done = (exitCode, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: error ? "error" : exitCode === 0 && !timedOut ? "pass" : "fail",
        exitCode: typeof exitCode === "number" ? exitCode : null,
        timedOut,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        error: error || null,
        logTail: tail
      });
    };
    child.on("error", (e) => done(null, e.message));
    child.on("close", (code) => done(code));
  });
}

/**
 * Start a run that executes shell commands instead of an agent (e.g. the build and the
 * tests of the product, for executable gate evidence). Same registry, log, SSE, cancel and
 * hooks as an agent run; no cost. steps: [{ id, label, command, cwd, timeoutMs, stopOnFail }].
 * The outcome of each step is in run.stepResults when onDone(run) is called.
 * Not re-adopted after a server restart: an interrupted verification is simply re-run.
 */
export function startCommandRun(config, opts) {
  const { label, phaseId, kind, cwd, stateRoot, steps, onDone, post } = opts;
  const id = nextRunId();
  const root = stateRoot || cwd;
  const runsDir = runsDirOf(root);
  fs.mkdirSync(runsDir, { recursive: true });
  const run = newRun({
    id,
    config,
    label: label || "Commandes",
    phaseId: phaseId || null,
    agent: "SDLC Studio",
    kind: kind || "command",
    startedAt: new Date().toISOString(),
    cwd,
    stateRoot: root,
    pid: null,
    agentPid: null,
    logFile: path.join(runsDir, `${id}.log`),
    rawFile: null,
    io: null,
    pendingFile: null,
    risksFile: null,
    tasksFile: null,
    extraIo: [],
    post: post || null,
    basePrompt: "",
    stepResults: []
  });
  runs.set(id, run);
  run.logStream = fs.createWriteStream(run.logFile, { flags: "a" });
  writeMeta(run);

  (async () => {
    append(run, `[Démarrage] ${run.label}\n`);
    let stopped = false;
    for (const step of steps || []) {
      if (run.cancelled || stopped) {
        run.stepResults.push({ id: step.id, status: "skipped" });
        continue;
      }
      append(run, `\n▶ ${step.label || step.id}\n$ ${step.command}\n`);
      const r = await runShellStep(run, step);
      run.stepResults.push({ id: step.id, ...r });
      append(run, `→ ${r.status === "pass" ? "OK" : r.status.toUpperCase()}${r.exitCode != null ? ` (code ${r.exitCode})` : ""}, ${Math.round(r.durationMs / 1000)} s\n`);
      if (r.status !== "pass" && step.stopOnFail) stopped = true;
    }
    await finalize(run, { code: run.cancelled ? 1 : 0, onDone });
  })().catch((e) => {
    append(run, `\n[Erreur] ${e.message}\n`);
    finalize(run, { code: 1, onDone });
  });
  return id;
}

// ---------- cancellation ----------

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      // Kill BY PID with its descendants (/T) — never by image name.
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {}
}

/** Stop a running agent (user action, timeout, budget). The run finalizes as "error". */
export function cancelRun(runId, reason) {
  const run = runs.get(runId);
  if (!run) return { ok: false, error: "Run introuvable." };
  if (run.status !== "running") return { ok: false, error: "Ce run est déjà terminé." };
  run.cancelled = true;
  run.cancelReason = reason || "Arrêt demandé par l'utilisateur.";
  append(run, `\n[Arrêt demandé] ${run.cancelReason}\n`);
  killTree(run.agentPid || run.pid);
  if (run.pid && run.pid !== run.agentPid) killTree(run.pid);
  return { ok: true, id: runId };
}

// ---------- active-run registry: lets a restarted server re-adopt in-flight runs ----------

function activeRegistryPath(root) {
  return path.join(root, ".claude", "control-center", "active-runs.json");
}

/** Snapshot the running runs of a workspace to disk, so a restart can adopt them. */
function persistActiveRuns(root) {
  try {
    const list = [...runs.values()]
      // Agent runs only: command runs (no raw stream) are not re-adopted.
      .filter((r) => r.stateRoot === root && r.status === "running" && r.pid && r.rawFile)
      .map((r) => ({
        id: r.id, label: r.label, agent: r.agent, phaseId: r.phaseId, kind: r.kind,
        pid: r.pid, agentPid: r.agentPid || null, startedAt: r.startedAt,
        logFile: r.logFile, rawFile: r.rawFile, errFile: r.errFile, cwd: r.cwd, stateRoot: r.stateRoot,
        pendingFile: r.pendingFile, risksFile: r.risksFile, tasksFile: r.tasksFile,
        extraIo: r.extraIo || [], resumeOf: r.resumeOf || null, post: r.post || null
      }));
    const file = activeRegistryPath(root);
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

/**
 * On startup, adopt runs that were still executing when the previous server stopped.
 * Their stdout went to a file, so we replay it from the start (log, session, usage) and
 * keep tailing. When the process exits, the run is finalized from its `result` event, its
 * cost is recorded and the run hooks ingest what it produced. Runs launched before this
 * format existed (no raw file) fall back to their old log, with no cost.
 */
export function reconcileRuns(paths, config) {
  const root = paths.workspaceRoot;
  let list = [];
  try {
    const raw = fs.readFileSync(activeRegistryPath(root), "utf8");
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    return { adopted: 0, finalized: 0 };
  }

  let adopted = 0;
  let finalized = 0;
  for (const e of list) {
    if (!e || !e.id || runs.has(e.id)) continue;
    const meta = readRunMeta(e.stateRoot || root, e.id) || {};
    const run = newRun({
      id: e.id,
      label: e.label || "Run (repris)",
      phaseId: e.phaseId || null,
      agent: e.agent || null,
      kind: e.kind || null,
      startedAt: e.startedAt || new Date().toISOString(),
      cwd: e.cwd || root,
      stateRoot: e.stateRoot || root,
      pid: e.pid || null,
      agentPid: e.agentPid || null,
      logFile: e.logFile || null,
      rawFile: e.rawFile || null,
      errFile: e.errFile || null,
      io: runIoFiles(e.cwd || root, e.id),
      pendingFile: e.pendingFile || null,
      risksFile: e.risksFile || null,
      tasksFile: e.tasksFile || null,
      extraIo: e.extraIo || [],
      resumeOf: e.resumeOf || null,
      post: e.post || null,
      basePrompt: meta.basePrompt || "",
      sessionId: meta.sessionId || null,
      reconciled: true
    });
    runs.set(run.id, run);

    if (run.rawFile && fs.existsSync(run.rawFile)) {
      // Rebuild the readable log from the raw stream, then keep following it.
      run.logStream = run.logFile ? fs.createWriteStream(run.logFile, { flags: "w" }) : null;
      append(run, `[Démarrage] ${run.label}\n`);
      run.stdout = makeStdoutConsumer(run);
      run.outTail = createTail(run.rawFile, (t) => run.stdout.push(t));
      if (run.errFile) {
        run.errTail = createTail(run.errFile, (t) => {
          const s = t.trim();
          if (s) append(run, `[!] ${s}\n`);
        });
      }
    } else {
      try { run.log = fs.readFileSync(run.logFile, "utf8"); } catch { run.log = ""; }
      run.logStream = run.logFile ? fs.createWriteStream(run.logFile, { flags: "a" }) : null;
    }
    append(run, "\n[Repris après redémarrage du serveur]\n");

    if (isAlive(run.agentPid || run.pid)) {
      adopted += 1;
      armTimeout(run, config);
      run.liveTimer = setInterval(() => {
        if (!isAlive(run.agentPid || run.pid)) finalize(run, { code: null });
      }, 3000);
    } else {
      finalized += 1;
      finalize(run, { code: null });
    }
  }
  persistActiveRuns(root);
  return { adopted, finalized };
}
