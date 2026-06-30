import { distDir, legacyPublicDir } from "../config/paths.js";
import { exists } from "../utils/fs-utils.js";
import { serveStaticFile } from "../utils/http-utils.js";

export async function createStaticRouter() {
  const staticDir = (await exists(distDir)) ? distDir : legacyPublicDir;
  return function handleStatic(req, res) {
    serveStaticFile(req, res, staticDir);
  };
}
