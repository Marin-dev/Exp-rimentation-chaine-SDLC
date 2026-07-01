import fs from "node:fs";
import path from "node:path";
import { listDirSafe, readTextSafe } from "./fs-utils.js";

function parseFrontmatter(content) {
  if (!content) return {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Skills declared in the workspace: .claude/skills/<slug>/SKILL.md */
export function listSkills(paths) {
  const skills = [];
  for (const entry of listDirSafe(paths.skillsDir)) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(paths.skillsDir, entry.name, "SKILL.md");
    const content = readTextSafe(skillFile);
    if (content === null) continue;
    const fm = parseFrontmatter(content);
    skills.push({
      id: entry.name,
      name: fm.name || entry.name,
      description: fm.description || ""
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** MCP servers from .mcp.json (project) or .claude/mcp.json. */
export function listMcpServers(paths) {
  for (const file of [paths.mcpProjectPath, paths.mcpClaudePath]) {
    const content = readTextSafe(file);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      const servers = parsed.mcpServers || parsed.servers || {};
      return Object.entries(servers).map(([id, cfg]) => ({
        id,
        name: id,
        command: cfg.command || cfg.url || cfg.type || "",
        source: path.basename(file)
      }));
    } catch {
      // ignore malformed config
    }
  }
  return [];
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function slugifySkill(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 49);
}

/**
 * Create a new skill scaffold under .claude/skills/<slug>/SKILL.md.
 * With { ifExists: "skip" }, an already-present skill is not an error (returns
 * ok:true, skipped:true) — used when writing to the app template that may already have it.
 */
export function createSkill(paths, { name, description, ifExists }) {
  const slug = slugifySkill(name);
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Nom de skill invalide." };
  }
  const dir = path.join(paths.skillsDir, slug);
  if (fs.existsSync(dir)) {
    if (ifExists === "skip") return { ok: true, id: slug, skipped: true };
    return { ok: false, error: `Le skill « ${slug} » existe déjà.` };
  }
  const desc = String(description || "").trim() || `Skill ${slug}.`;
  const body = `---
name: ${slug}
description: ${desc}
---

# ${name}

${desc}

## Quand l'utiliser

Décrivez ici les déclencheurs et le contexte d'usage de ce skill.

## Étapes

1. ...
2. ...
`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf8");
  return { ok: true, id: slug };
}
