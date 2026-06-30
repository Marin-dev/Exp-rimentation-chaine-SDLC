import fs from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../utils/fs-utils.js";
import { isoStamp, slugify } from "../utils/text-utils.js";

export function createHumanReviewService(configService) {
  async function listHumanReviews() {
    const { humanReviewsDir } = await configService.getWorkspacePaths();
    const entries = await fs.readdir(humanReviewsDir).catch(() => []);
    const reviews = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const review = await readJson(path.join(humanReviewsDir, entry), null);
      if (review) reviews.push(review);
    }
    return reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function createHumanReview(body) {
    const { humanReviewsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const review = {
      id: `${isoStamp()}-${slugify(body.gate || "review")}`,
      gate: body.gate || "",
      phaseTitle: body.phaseTitle || "",
      status: body.status || "needs_changes",
      target: body.target || "",
      documentPath: body.documentPath || "",
      quotedText: body.quotedText || "",
      expectedChange: body.expectedChange || "",
      title: body.title || "Revue humaine",
      comment: body.comment || "",
      requestedAgent: body.requestedAgent || "",
      createdAt: new Date().toISOString()
    };
    const filePath = path.join(humanReviewsDir, `${review.id}.json`);
    await writeJson(filePath, review);
    return { ...review, file: path.relative(workspaceRoot, filePath) };
  }

  return { listHumanReviews, createHumanReview };
}
