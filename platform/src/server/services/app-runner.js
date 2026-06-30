import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Launches the DELIVERED product (backend + frontend) locally as long-running
 * processes, so a non-technical user can start the app and open it.
 * Distinct from runs.js (which runs Claude in print mode).
 */

const procs = new Map(); // name -> { name, child, status, log, startedAt, exitCode }
const MAX_LOG = 60000;

function rec(name) {
  if (!procs.has(name)) {
    procs.set(name, { name, child: null, status: "stopped", log: "", startedAt: null, exitCode: null });
  }
  return procs.get(name);
}

function append(r, chunk) {
  r.log = (r.log + chunk).slice(-MAX_LOG);
}

export function startApp(config, name, workspaceRoot) {
  const cfg = config.app && config.app[name];
  if (!cfg || !cfg.command || !cfg.command.trim()) {
    return { ok: false, error: `Aucune commande configurée pour ${name}.` };
  }
  const r = rec(name);
  if (r.status === "running") return { ok: true, already: true };

  const cwd = cfg.cwd && cfg.cwd.trim() ? path.resolve(cfg.cwd) : workspaceRoot;
  r.log = "";
  r.exitCode = null;
  append(r, `[Démarrage] ${cfg.command}\n[Dossier] ${cwd}\n\n`);

  let child;
  try {
    child = spawn(cfg.command, { cwd, shell: true });
  } catch (e) {
    r.status = "error";
    append(r, `[Erreur] ${e.message}\n`);
    return { ok: false, error: e.message };
  }
  r.child = child;
  r.status = "running";
  r.startedAt = new Date().toISOString();

  child.stdout.on("data", (d) => append(r, d.toString()));
  child.stderr.on("data", (d) => append(r, d.toString()));
  child.on("error", (e) => append(r, `[Erreur] ${e.message}\n`));
  child.on("close", (code) => {
    r.status = code === 0 ? "stopped" : "error";
    r.exitCode = code;
    r.child = null;
    append(r, `\n[Processus terminé] code ${code}\n`);
  });

  return { ok: true };
}

export function stopApp(name) {
  const r = procs.get(name);
  if (!r || !r.child) return { ok: true, already: true };
  const pid = r.child.pid;
  try {
    if (process.platform === "win32") {
      // Kill the whole process tree (shell -> npm -> node).
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false });
    } else {
      r.child.kill("SIGTERM");
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
  r.status = "stopped";
  return { ok: true };
}

export function appStatus() {
  const out = {};
  for (const name of ["backend", "frontend"]) {
    const r = procs.get(name);
    out[name] = r
      ? { status: r.status, log: r.log, startedAt: r.startedAt, exitCode: r.exitCode }
      : { status: "stopped", log: "", startedAt: null, exitCode: null };
  }
  return out;
}
