import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "../utils/text-utils.js";
import { readMaybe } from "../utils/fs-utils.js";

export function createAgentsService(configService) {
  async function listAgents() {
    const { agentsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const entries = await fs.readdir(agentsDir, { withFileTypes: true }).catch(() => []);
    const agents = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const filePath = path.join(agentsDir, entry.name);
      const content = await readMaybe(filePath);
      const frontmatter = parseFrontmatter(content);
      const title = content.match(/^#\s+(.+)$/m)?.[1] || frontmatter.name || entry.name;
      agents.push({
        id: frontmatter.name || entry.name.replace(/\.md$/, ""),
        file: path.relative(workspaceRoot, filePath),
        title,
        description: frontmatter.description || "",
        tools: frontmatter.tools || ""
      });
    }
    return agents.sort((a, b) => a.id.localeCompare(b.id));
  }

  return { listAgents };
}
