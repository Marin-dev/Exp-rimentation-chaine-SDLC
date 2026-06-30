import fs from "node:fs/promises";
import path from "node:path";
import { GATE_DEFINITIONS } from "../config/runtime.js";
import { parseGateStatus } from "../utils/text-utils.js";
import { readMaybe } from "../utils/fs-utils.js";

export function createGatesService(configService) {
  async function findGateReport(gateId, gatesDir) {
    const entries = await fs.readdir(gatesDir).catch(() => []);
    const prefix = gateId.toLowerCase();
    const found = entries.find((name) => name.toLowerCase().startsWith(prefix));
    if (!found) return null;
    return path.join(gatesDir, found);
  }

  async function listGates(humanReviews = []) {
    const { gatesDir, workspaceRoot } = await configService.getWorkspacePaths();
    const gates = [];
    for (const definition of GATE_DEFINITIONS) {
      const reportPath = await findGateReport(definition.id, gatesDir);
      const content = reportPath ? await readMaybe(reportPath) : "";
      const reviewsForGate = humanReviews.filter((review) => review.gate === definition.id);
      gates.push({
        ...definition,
        status: parseGateStatus(content),
        report: reportPath ? path.relative(workspaceRoot, reportPath) : null,
        issues: [...content.matchAll(/^- \[(?:x| )\]\s*(.+)$/gim)].map((m) => m[1]).slice(0, 5),
        humanReviews: reviewsForGate
      });
    }
    return gates;
  }

  return { listGates };
}
