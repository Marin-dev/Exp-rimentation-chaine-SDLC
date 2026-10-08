import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { worktreesRoot } from "../config/paths.js";

/**
 * Git worktree isolation for G5 dev lanes (opt-in: config.devIsolation = "worktree").
 *
 * Each lane of a wave works in its own checkout, on its own branch, created from a
 * snapshot commit of the workspace. When the wave is over, every lane is committed and
 * merged back into the workspace branch; a conflicting merge is aborted and the lane
 * branch is kept for a human/architect to resolve. Nothing is ever pushed.
 */

function git(cwd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() });
    });
  });
}

/** Commit identity fallback, only when the repository has none configured. */
async function identityArgs(cwd) {
  const email = await git(cwd, ["config", "user.email"]);
  return email.ok && email.stdout ? [] : ["-c", "user.name=SDLC Studio", "-c", "user.email=sdlc-studio@localhost"];
}

// Platform-owned state never goes into lane commits.
const EXCLUDE_STATE = ":(exclude).claude/control-center";

async function commitAll(cwd, message) {
  await git(cwd, ["add", "-A", "--", ".", EXCLUDE_STATE]);
  const staged = await git(cwd, ["diff", "--cached", "--quiet"]);
  if (staged.ok) return { ok: true, committed: false }; // nothing to commit
  const r = await git(cwd, [...(await identityArgs(cwd)), "commit", "-m", message]);
  return r.ok ? { ok: true, committed: true } : { ok: false, error: r.stderr || "commit impossible" };
}

export async function isGitRepo(root) {
  const r = await git(root, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout === "true";
}

/** Commit the current workspace so lanes start from what is on disk (not just HEAD). */
export async function snapshotWorkspace(root, message) {
  return commitAll(root, message || "SDLC Studio : instantané avant vague de développement");
}

function copyDirIfMissing(src, dest, skip) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return;
  fs.cpSync(src, dest, { recursive: true, filter: (p) => !skip || !skip(p) });
}

export async function createLaneWorktree(root, laneKey) {
  const ts = Date.now().toString(36);
  const bucket = crypto.createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 10);
  const dir = path.join(worktreesRoot, bucket, `${laneKey}-${ts}`);
  const branch = `sdlc/${laneKey}-${ts}`;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const r = await git(root, ["worktree", "add", "-b", branch, dir, "HEAD"]);
  if (!r.ok) return { ok: false, error: r.stderr || "git worktree add a échoué" };
  // The agent framework may be untracked: give the lane its own copy (without platform state).
  const stateDir = path.join(root, ".claude", "control-center");
  copyDirIfMissing(path.join(root, ".claude"), path.join(dir, ".claude"), (p) => p.startsWith(stateDir));
  for (const f of ["CLAUDE.md", ".mcp.json"]) {
    const src = path.join(root, f);
    if (fs.existsSync(src) && !fs.existsSync(path.join(dir, f))) fs.copyFileSync(src, path.join(dir, f));
  }
  return { ok: true, dir, branch };
}

/** Commit the lane's work, then merge its branch into the workspace's current branch. */
export async function mergeLane(root, lane, message) {
  const c = await commitAll(lane.dir, message);
  if (!c.ok) return { ok: false, error: `commit de la lane : ${c.error}` };
  if (!c.committed) return { ok: true, merged: false };
  const m = await git(root, [...(await identityArgs(root)), "merge", "--no-ff", "--no-edit", "-m", message, lane.branch]);
  if (m.ok) return { ok: true, merged: true };
  await git(root, ["merge", "--abort"]);
  return { ok: false, conflict: true, error: m.stderr || m.stdout || "conflit de fusion" };
}

/** Remove the lane checkout; delete its branch only once merged (else keep it for a human). */
export async function removeLane(root, lane, { deleteBranch } = {}) {
  await git(root, ["worktree", "remove", "--force", lane.dir]);
  if (deleteBranch) await git(root, ["branch", "-D", lane.branch]);
}
