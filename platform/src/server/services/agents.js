import fs from "node:fs";
import path from "node:path";
import { listDirSafe, readTextSafe } from "./fs-utils.js";
import { slugifySkill } from "./resources.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const DEFAULT_TOOLS = "Read, Write, Edit, Glob, Grep";

/** Parse a minimal YAML-ish frontmatter block from an agent markdown file. */
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

/** List agents declared in .claude/agents/ with name + description. */
export function listAgents(paths) {
  const agents = [];
  for (const entry of listDirSafe(paths.agentsDir)) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const content = readTextSafe(path.join(paths.agentsDir, entry.name));
    const fm = parseFrontmatter(content);
    const slug = entry.name.replace(/\.md$/i, "");
    agents.push({
      id: slug,
      name: fm.name ? `@${fm.name.replace(/^@/, "")}` : `@${slug}`,
      description: fm.description || ""
    });
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

/**
 * Create a new agent scaffold under .claude/agents/<slug>.md with frontmatter
 * (name, description, tools) and a skeleton body to fill in. Mirrors createSkill.
 * With { ifExists: "skip" }, an already-present agent is not an error — used when
 * also writing to the app template that may already have it.
 */
export function createAgent(paths, { name, description, tools, ifExists }) {
  const slug = slugifySkill(name);
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Nom d'agent invalide." };
  }
  const file = path.join(paths.agentsDir, `${slug}.md`);
  if (fs.existsSync(file)) {
    if (ifExists === "skip") return { ok: true, id: slug, skipped: true };
    return { ok: false, error: `L'agent « ${slug} » existe déjà.` };
  }
  const desc = String(description || "").trim() || `Agent ${slug}.`;
  const toolList = String(tools || "").trim() || DEFAULT_TOOLS;
  const body = `---
name: ${slug}
description: ${desc}
tools: ${toolList}
---

# ${name}

## Role

${desc}

Always start by reading:

- \`project/PROJECT.md\`
- \`.claude/rules/agent-contracts.md\`
- \`.claude/rules/conventions-livrables.md\`
- \`.claude/rules/quality-gates.md\`

## Mission

- ...

## Mandatory Inputs

- ...

## Deliverables

- ...
`;
  fs.mkdirSync(paths.agentsDir, { recursive: true });
  fs.writeFileSync(file, body, "utf8");
  return { ok: true, id: slug };
}
