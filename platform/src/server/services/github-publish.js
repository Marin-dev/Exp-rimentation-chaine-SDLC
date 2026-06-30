import { execFile } from "node:child_process";

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: (stdout || "").toString(),
        stderr: (stderr || "").toString().trim(),
        code: err && typeof err.code === "number" ? err.code : err ? 1 : 0
      });
    });
  });
}

/** Is the GitHub CLI installed and already authenticated? */
export async function githubStatus() {
  const ver = await run("gh", ["--version"]);
  if (!ver.ok) return { ghAvailable: false, ghAuthed: false };
  const status = await run("gh", ["auth", "status"]);
  return { ghAvailable: true, ghAuthed: status.ok };
}

async function ghApi(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "sdlc-studio",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

/**
 * Create the GitHub repo and push the current branch. Two paths:
 * - token: create via GitHub API, push using a one-time auth header (token NOT
 *   persisted in .git/config — only the clean remote URL is stored).
 * - gh (no token): `gh repo create --source . --push` using the CLI's own auth.
 * Returns { ok, url, message }.
 */
export async function publish(cwd, { repo, visibility, token }) {
  const isRepo = await run("git", ["rev-parse", "--is-inside-work-tree"], cwd);
  if (!isRepo.ok) return { ok: false, message: "Le dossier n'est pas un dépôt git. Initialisez-le d'abord." };
  const head = await run("git", ["rev-parse", "HEAD"], cwd);
  if (!head.ok) return { ok: false, message: "Aucun commit à pousser. Faites d'abord un commit." };
  const branchRes = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const branch = branchRes.ok ? branchRes.stdout.trim() : "main";
  const name = String(repo || "").trim();
  if (!name) return { ok: false, message: "Nom du dépôt requis." };
  const isPrivate = visibility !== "public";

  // --- Token path (GitHub API + headered push) ---
  if (token && token.trim()) {
    const t = token.trim();
    let owner = null;
    let htmlUrl = null;
    const create = await ghApi(t, "POST", "/user/repos", { name, private: isPrivate });
    if (create.status === 201 && create.json) {
      owner = create.json.owner && create.json.owner.login;
      htmlUrl = create.json.html_url;
    } else if (create.status === 422) {
      // Already exists — resolve the authenticated user as owner.
      const me = await ghApi(t, "GET", "/user");
      owner = me.json && me.json.login;
      htmlUrl = owner ? `https://github.com/${owner}/${name}` : null;
    } else {
      const msg = (create.json && create.json.message) || `Erreur GitHub (${create.status}).`;
      return { ok: false, message: `Création du dépôt impossible : ${msg}` };
    }
    if (!owner) return { ok: false, message: "Impossible de déterminer le compte GitHub (token invalide ?)." };

    const remoteUrl = `https://github.com/${owner}/${name}.git`;
    await run("git", ["remote", "remove", "origin"], cwd); // ignore failure
    await run("git", ["remote", "add", "origin", remoteUrl], cwd);
    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${t}`).toString("base64")}`;
    const push = await run("git", ["-c", `http.extraheader=${header}`, "push", "-u", "origin", branch], cwd);
    if (!push.ok) return { ok: false, message: `Push échoué : ${push.stderr || "erreur"}`, url: htmlUrl };
    return { ok: true, url: htmlUrl, message: "Dépôt créé et code poussé." };
  }

  // --- gh CLI path ---
  const st = await githubStatus();
  if (!st.ghAvailable) return { ok: false, message: "Aucun token fourni et la CLI gh n'est pas installée." };
  if (!st.ghAuthed) return { ok: false, message: "gh n'est pas connecté. Fournissez un token, ou connectez gh (gh auth login)." };
  const args = ["repo", "create", name, "--source", ".", "--remote", "origin", "--push", isPrivate ? "--private" : "--public"];
  const created = await run("gh", args, cwd);
  if (!created.ok) return { ok: false, message: `gh: ${created.stderr || "échec de création"}` };
  const url = ((created.stdout + " " + created.stderr).match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/) || [])[0] || null;
  return { ok: true, url, message: "Dépôt créé et code poussé (gh)." };
}
