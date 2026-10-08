import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Lane checkouts go to a temp dir, never to the app state (.state/).
process.env.SDLC_WORKTREES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-wt-root-"));
const { isGitRepo, snapshotWorkspace, createLaneWorktree, mergeLane, removeLane } = await import("../src/server/services/worktrees.js");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-wt-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "shared.txt"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

test("deux lanes isolées sont fusionnées ; un conflit est refusé et la branche conservée", async () => {
  const root = repo();
  assert.ok(await isGitRepo(root));
  // Uncommitted work and platform state: the first is snapshotted, the second never committed.
  fs.writeFileSync(path.join(root, "draft.md"), "brouillon\n");
  fs.mkdirSync(path.join(root, ".claude", "control-center"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "control-center", "spend.jsonl"), "{}\n");
  assert.ok((await snapshotWorkspace(root)).committed);
  assert.equal(git(root, "ls-files", ".claude"), "");

  const a = await createLaneWorktree(root, "dev-bc01");
  const b = await createLaneWorktree(root, "dev-bc02");
  assert.ok(a.ok && b.ok);
  assert.ok(fs.existsSync(path.join(a.dir, "draft.md")), "la lane part de l'instantané");
  fs.writeFileSync(path.join(a.dir, "bc01.txt"), "A\n");
  fs.writeFileSync(path.join(b.dir, "bc02.txt"), "B\n");
  assert.deepEqual(await mergeLane(root, a, "lane bc01"), { ok: true, merged: true });
  assert.deepEqual(await mergeLane(root, b, "lane bc02"), { ok: true, merged: true });
  await removeLane(root, a, { deleteBranch: true });
  await removeLane(root, b, { deleteBranch: true });
  assert.ok(fs.existsSync(path.join(root, "bc01.txt")) && fs.existsSync(path.join(root, "bc02.txt")));

  // Same line changed by two lanes → the second merge conflicts and is aborted.
  const c = await createLaneWorktree(root, "dev-bc03");
  const d = await createLaneWorktree(root, "dev-bc04");
  fs.writeFileSync(path.join(c.dir, "shared.txt"), "C\n");
  fs.writeFileSync(path.join(d.dir, "shared.txt"), "D\n");
  assert.equal((await mergeLane(root, c, "lane bc03")).ok, true);
  const conflict = await mergeLane(root, d, "lane bc04");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal(git(root, "status", "--porcelain", "--", ".", ":(exclude).claude"), "", "fusion annulée proprement");
  await removeLane(root, c, { deleteBranch: true });
  await removeLane(root, d, { deleteBranch: false });
  assert.match(git(root, "branch", "--list", d.branch), /sdlc\/dev-bc04/);
});
