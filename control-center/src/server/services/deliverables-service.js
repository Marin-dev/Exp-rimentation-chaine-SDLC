import fs from "node:fs/promises";
import path from "node:path";
import { DELIVERABLE_FOLDERS, PHASE_DEFINITIONS } from "../config/runtime.js";
import { exists, isInside, readMaybe } from "../utils/fs-utils.js";

const DECISION_PATTERN = /adr|d[ée]cision|choix|arbitrage|retenu|recommandation|option/i;

function toWorkspaceRelative(workspaceRoot, filePath) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

function titleFromContent(content, filePath) {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return path.basename(filePath, path.extname(filePath));
}

function kindForPath(relativePath) {
  if (relativePath.includes("_governance/gates")) return "gate";
  if (relativePath.includes("architecture")) return "architecture";
  if (relativePath.includes("security")) return "security";
  if (relativePath.includes("ux")) return "ux";
  if (relativePath.includes("ui")) return "ui";
  if (relativePath.includes("backlog")) return "backlog";
  if (relativePath.includes("tests") || relativePath.includes("evaluations")) return "verification";
  return "livrable";
}

function excerptFrom(lines, startIndex) {
  const excerpt = [];
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 6); index += 1) {
    const line = lines[index].trim();
    if (index > startIndex && /^#{1,6}\s+/.test(line)) break;
    if (line) excerpt.push(line);
  }
  return excerpt.join("\n").slice(0, 700);
}

function extractDecisions(content, relativePath) {
  const lines = content.split(/\r?\n/);
  const decisions = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,5}\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (heading && DECISION_PATTERN.test(heading[1])) {
      decisions.push({
        id: `${relativePath}:${index + 1}`,
        title: heading[1].trim(),
        excerpt: excerptFrom(lines, index + 1),
        documentPath: relativePath,
        line: index + 1
      });
      return;
    }
    if (bullet && DECISION_PATTERN.test(bullet[1])) {
      decisions.push({
        id: `${relativePath}:${index + 1}`,
        title: bullet[1].slice(0, 120),
        excerpt: bullet[1],
        documentPath: relativePath,
        line: index + 1
      });
    }
  });
  return decisions.slice(0, 12);
}

async function walkMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function belongsToPhase(relativePath, phase) {
  if (!relativePath.includes("_governance/")) return true;
  const fileName = path.basename(relativePath).toLowerCase();
  return fileName.startsWith(phase.id.toLowerCase());
}

export function createDeliverablesService(configService) {
  async function describeMarkdownFile(filePath) {
    const { workspaceRoot } = await configService.getWorkspacePaths();
    const [stat, content] = await Promise.all([fs.stat(filePath), readMaybe(filePath)]);
    const relativePath = toWorkspaceRelative(workspaceRoot, filePath);
    return {
      path: relativePath,
      title: titleFromContent(content, filePath),
      folder: relativePath.split("/")[1] || "",
      kind: kindForPath(relativePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      decisions: extractDecisions(content, relativePath)
    };
  }

  async function listDeliverables() {
    const { livrablesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const rootExists = await exists(livrablesDir);
    const folders = [];
    for (const folder of DELIVERABLE_FOLDERS) {
      const dir = path.join(livrablesDir, folder);
      const present = await exists(dir);
      let files = [];
      if (present) {
        files = (await walkMarkdown(dir)).map((filePath) => toWorkspaceRelative(workspaceRoot, filePath));
      }
      folders.push({ folder, present, markdownFiles: files.length, files: files.slice(0, 20) });
    }
    return { rootExists, root: path.relative(workspaceRoot, livrablesDir), folders };
  }

  async function listPhaseWorkspaces(gates = [], humanReviews = []) {
    const { livrablesDir } = await configService.getWorkspacePaths();
    const phases = [];
    for (const phase of PHASE_DEFINITIONS) {
      const docs = [];
      for (const folder of phase.folders) {
        const folderPath = path.join(livrablesDir, folder);
        if (!(await exists(folderPath))) continue;
        const files = await walkMarkdown(folderPath);
        for (const filePath of files) {
          const doc = await describeMarkdownFile(filePath);
          if (!belongsToPhase(doc.path, phase)) continue;
          docs.push(doc);
        }
      }
      const decisions = docs.flatMap((doc) => doc.decisions.map((decision) => ({ ...decision, phaseId: phase.id })));
      const gate = gates.find((item) => item.id === phase.id);
      const reviews = humanReviews.filter((review) => review.gate === phase.id);
      phases.push({
        ...phase,
        status: gate?.status || "missing",
        gateReport: gate?.report || null,
        requiredHumanReview: gate?.requiredHumanReview || false,
        docs: docs.sort((a, b) => a.path.localeCompare(b.path)),
        decisions,
        humanReviews: reviews,
        progress: {
          expected: phase.expectedOutputs.length,
          produced: Math.min(phase.expectedOutputs.length, docs.length),
          docs: docs.length,
          decisions: decisions.length,
          reviews: reviews.length
        }
      });
    }
    return phases;
  }

  async function readDeliverableContent(relativePath) {
    const { livrablesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const normalized = String(relativePath || "").replace(/\\/g, "/");
    const absolutePath = path.resolve(workspaceRoot, normalized);
    if (!normalized || path.isAbsolute(normalized) || !isInside(livrablesDir, absolutePath)) {
      const error = new Error("Chemin de livrable invalide.");
      error.status = 400;
      throw error;
    }
    if (path.extname(absolutePath).toLowerCase() !== ".md") {
      const error = new Error("Seuls les livrables Markdown sont lisibles dans l'application.");
      error.status = 400;
      throw error;
    }
    const content = await readMaybe(absolutePath);
    if (!content) {
      const error = new Error("Livrable introuvable ou vide.");
      error.status = 404;
      throw error;
    }
    const stat = await fs.stat(absolutePath);
    return {
      path: normalized,
      title: titleFromContent(content, absolutePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      content,
      decisions: extractDecisions(content, normalized)
    };
  }

  return { listDeliverables, listPhaseWorkspaces, readDeliverableContent };
}
