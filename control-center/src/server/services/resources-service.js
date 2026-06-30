import fs from "node:fs/promises";
import path from "node:path";
import { readJson, readMaybe } from "../utils/fs-utils.js";
import { parseFrontmatter } from "../utils/text-utils.js";

export function createResourcesService(configService) {
  async function listSkills() {
    const { skillsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
      const content = await readMaybe(skillPath);
      if (!content) continue;
      const frontmatter = parseFrontmatter(content);
      skills.push({
        id: entry.name,
        name: frontmatter.name || entry.name,
        description: frontmatter.description || content.match(/^#\s+(.+)$/m)?.[1] || "",
        file: path.relative(workspaceRoot, skillPath)
      });
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function listMcpServers() {
    const { mcpConfigPath } = await configService.getWorkspacePaths();
    const config = await readJson(mcpConfigPath, {});
    const servers = config.mcpServers || config.servers || {};
    return Object.entries(servers).map(([id, value]) => ({
      id,
      command: value.command || "",
      args: value.args || [],
      envKeys: Object.keys(value.env || {})
    }));
  }

  return { listSkills, listMcpServers };
}
