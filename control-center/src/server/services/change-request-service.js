import fs from "node:fs/promises";
import path from "node:path";
import { isInside, readJson, safeRelativePath, writeJson } from "../utils/fs-utils.js";
import { isoStamp, slugify } from "../utils/text-utils.js";

export function createChangeRequestService(configService) {
  async function listChangeRequests() {
    const { changeRequestsDir } = await configService.getWorkspacePaths();
    const entries = await fs.readdir(changeRequestsDir).catch(() => []);
    const requests = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const item = await readJson(path.join(changeRequestsDir, entry), null);
      if (item) requests.push(item);
    }
    return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function persistSourceFiles(requestId, sourceFiles = []) {
    const { changeRequestSourcesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const files = Array.isArray(sourceFiles) ? sourceFiles.slice(0, 50) : [];
    const targetDir = path.join(changeRequestSourcesDir, requestId);
    const stored = [];
    let totalChars = 0;
    for (const file of files) {
      if (typeof file.content !== "string") continue;
      totalChars += file.content.length;
      if (totalChars > 5_000_000) break;
      const relative = safeRelativePath(file.path);
      const destination = path.join(targetDir, relative);
      if (!isInside(targetDir, destination)) continue;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content, "utf8");
      stored.push({
        path: path.relative(workspaceRoot, destination).replace(/\\/g, "/"),
        originalPath: file.path,
        size: file.content.length
      });
    }
    return stored;
  }

  async function createChangeRequest(body) {
    const { changeRequestsDir, livrablesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const request = {
      id: `${isoStamp()}-${slugify(body.title || "nouveau-besoin")}`,
      title: body.title || "Nouveau besoin",
      description: body.description || "",
      origin: body.origin || "Utilisateur",
      impact: body.impact || "À qualifier",
      urgency: body.urgency || "normal",
      createdAt: new Date().toISOString()
    };
    const sourceFiles = await persistSourceFiles(request.id, body.sourceFiles);
    const fullRequest = { ...request, sourceFiles };
    const jsonPath = path.join(changeRequestsDir, `${request.id}.json`);
    await writeJson(jsonPath, fullRequest);

    const targetMd = path.join(livrablesDir, "00-contexte", "nouveaux-besoins.md");
    await fs.mkdir(path.dirname(targetMd), { recursive: true });
    const sourceList = sourceFiles.length
      ? `\n\n**Sources**:\n${sourceFiles.map((file) => `- \`${file.path}\``).join("\n")}\n`
      : "";
    await fs.appendFile(
      targetMd,
      `\n## ${request.createdAt} - ${request.title}\n\n**Origine**: ${request.origin}\n**Urgence**: ${request.urgency}\n**Impact pressenti**: ${request.impact}${sourceList}\n\n${request.description}\n`,
      "utf8"
    );
    return {
      ...fullRequest,
      file: path.relative(workspaceRoot, jsonPath).replace(/\\/g, "/"),
      livrable: path.relative(workspaceRoot, targetMd).replace(/\\/g, "/")
    };
  }

  return { listChangeRequests, createChangeRequest };
}
