import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DEFAULT_CONFIG } from "../config/runtime.js";
import { configPath, createWorkspacePaths, defaultWorkspaceRoot } from "../config/paths.js";
import { readJson, writeJson } from "../utils/fs-utils.js";

export function createConfigService() {
  async function getConfig() {
    const stored = await readJson(configPath, {});
    const workspaceRoot = path.resolve(stored.workspaceRoot || DEFAULT_CONFIG.workspaceRoot || defaultWorkspaceRoot);
    return { ...DEFAULT_CONFIG, ...stored, workspaceRoot };
  }

  async function assertWorkspaceDirectory(workspaceRoot) {
    const resolved = path.resolve(workspaceRoot || defaultWorkspaceRoot);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      const error = new Error("Le dossier de travail est introuvable ou inaccessible.");
      error.status = 400;
      throw error;
    }
    return resolved;
  }

  async function getWorkspacePaths() {
    const config = await getConfig();
    return createWorkspacePaths(config.workspaceRoot);
  }

  async function updateConfig(body) {
    const current = await getConfig();
    const workspaceRoot = body.workspaceRoot
      ? await assertWorkspaceDirectory(body.workspaceRoot)
      : current.workspaceRoot;
    const next = {
      ...current,
      workspaceRoot,
      claudeCommand: body.claudeCommand || current.claudeCommand,
      claudeArgs: Array.isArray(body.claudeArgs) ? body.claudeArgs : current.claudeArgs
    };
    await writeJson(configPath, next);
    return next;
  }

  async function isCommandAvailable(command) {
    const checker = process.platform === "win32" ? "where" : "which";
    return new Promise((resolve) => {
      const child = spawn(checker, [command], { stdio: "ignore", shell: false });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
  }

  return { getConfig, getWorkspacePaths, updateConfig, isCommandAvailable };
}
