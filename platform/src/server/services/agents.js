import path from "node:path";
import { listDirSafe, readTextSafe } from "./fs-utils.js";

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
