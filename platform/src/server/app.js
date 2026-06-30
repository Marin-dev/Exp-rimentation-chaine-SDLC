import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { distDir } from "./config/paths.js";
import { handleApi } from "./routes/api.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function serveStatic(req, res, url) {
  const indexHtml = path.join(distDir, "index.html");
  if (!fs.existsSync(distDir)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h1>SDLC Studio</h1><p>Frontend non buildé. En dev: <code>npm run dev:web</code> (puis ouvrir Vite). En prod: <code>npm run build</code> puis <code>npm start</code>.</p>"
    );
    return;
  }
  let filePath = path.join(distDir, decodeURIComponent(url.pathname));
  if (url.pathname === "/" || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = indexHtml; // SPA fallback
  }
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const handled = await handleApi(req, res, url);
    if (!handled) serveStatic(req, res, url);
  });
}
