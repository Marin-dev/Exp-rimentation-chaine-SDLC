import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_GITIGNORE = `node_modules/
dist/
build/
.state/
*.log
.DS_Store
.env
`;

/**
 * Git operations on the workspace. Commands run with an argv array and NO shell,
 * so user input (commit messages, URLs) cannot be interpreted by a shell.
 */
function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: (stdout || "").toString(),
        stderr: (stderr || "").toString().trim(),
        code: err && typeof err.code === "number" ? err.code : err ? 1 : 0
      });
    });
  });
}

async function isRepo(cwd) {
  const r = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

function parseStatus(porcelain) {
  const lines = porcelain.split("\n").filter((l) => l.length > 0);
  let branch = null;
  let ahead = 0;
  let behind = 0;
  let upstream = null;
  const files = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      const info = line.slice(3);
      const noCommit = info.match(/No commits yet on (.+)/);
      if (noCommit) {
        branch = noCommit[1].trim();
        continue;
      }
      const m = info.match(/^(.+?)(\.\.\.(.+?))?( \[(.+)\])?$/);
      if (m) {
        branch = m[1].trim();
        upstream = m[3] ? m[3].trim() : null;
        if (m[5]) {
          const a = m[5].match(/ahead (\d+)/);
          const b = m[5].match(/behind (\d+)/);
          ahead = a ? Number(a[1]) : 0;
          behind = b ? Number(b[1]) : 0;
        }
      }
      continue;
    }
    const x = line[0];
    const y = line[1];
    const path = line.slice(3);
    const untracked = x === "?" && y === "?";
    files.push({
      path,
      x,
      y,
      untracked,
      staged: !untracked && x !== " ",
      label: describe(x, y, untracked)
    });
  }
  return { branch, upstream, ahead, behind, files };
}

function describe(x, y, untracked) {
  if (untracked) return "nouveau (non suivi)";
  const map = { M: "modifié", A: "ajouté", D: "supprimé", R: "renommé", C: "copié", U: "conflit" };
  const s = x !== " " ? map[x] : null;
  const w = y !== " " ? map[y] : null;
  return s || w || "modifié";
}

export async function gitStatus(cwd) {
  if (!(await isRepo(cwd))) {
    return { ok: true, isRepo: false };
  }
  const st = await runGit(cwd, ["status", "--porcelain=v1", "-b"]);
  const parsed = parseStatus(st.stdout);
  const remote = await runGit(cwd, ["remote", "-v"]);
  const remoteUrl =
    (remote.stdout.match(/^origin\s+(\S+)\s+\(push\)/m) || remote.stdout.match(/^origin\s+(\S+)/m) || [])[1] || null;
  const log = await runGit(cwd, ["log", "--oneline", "-n", "15", "--decorate"]);
  const branches = await runGit(cwd, ["branch", "--format=%(refname:short)"]);
  return {
    ok: true,
    isRepo: true,
    ...parsed,
    remoteUrl,
    log: log.ok ? log.stdout.split("\n").filter(Boolean) : [],
    branches: branches.ok ? branches.stdout.split("\n").map((b) => b.trim()).filter(Boolean) : []
  };
}

export async function gitAction(cwd, action, params = {}) {
  switch (action) {
    case "init": {
      const r = await runGit(cwd, ["init"]);
      if (r.ok) {
        await runGit(cwd, ["checkout", "-B", "main"]);
        // sensible default .gitignore so node_modules/dist aren't committed
        const gi = path.join(cwd, ".gitignore");
        if (!fs.existsSync(gi)) {
          try { fs.writeFileSync(gi, DEFAULT_GITIGNORE); } catch {}
        }
      }
      return r;
    }
    case "stageAll":
      return runGit(cwd, ["add", "-A"]);
    case "unstageAll":
      return runGit(cwd, ["reset"]);
    case "commit": {
      const msg = String(params.message || "").trim();
      if (!msg) return { ok: false, stderr: "Message de commit requis." };
      await runGit(cwd, ["add", "-A"]);
      return runGit(cwd, ["commit", "-m", msg]);
    }
    case "push": {
      const args = ["push"];
      if (params.setUpstream && params.branch) args.push("-u", "origin", params.branch);
      return runGit(cwd, args);
    }
    case "pull":
      return runGit(cwd, ["pull"]);
    case "fetch":
      return runGit(cwd, ["fetch", "--all"]);
    case "addRemote": {
      const url = String(params.url || "").trim();
      if (!url) return { ok: false, stderr: "URL du remote requise." };
      await runGit(cwd, ["remote", "remove", "origin"]); // ignore failure
      return runGit(cwd, ["remote", "add", "origin", url]);
    }
    case "createBranch": {
      const name = String(params.name || "").trim();
      if (!name) return { ok: false, stderr: "Nom de branche requis." };
      return runGit(cwd, ["checkout", "-b", name]);
    }
    case "checkout": {
      const name = String(params.name || "").trim();
      if (!name) return { ok: false, stderr: "Branche requise." };
      return runGit(cwd, ["checkout", name]);
    }
    case "setIdentity": {
      const name = String(params.name || "").trim();
      const email = String(params.email || "").trim();
      if (!name || !email) return { ok: false, stderr: "Nom et email requis." };
      await runGit(cwd, ["config", "user.name", name]);
      return runGit(cwd, ["config", "user.email", email]);
    }
    default:
      return { ok: false, stderr: "Action inconnue." };
  }
}
