import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readMaybe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function safeRelativePath(inputPath) {
  const normalized = String(inputPath || "file.txt").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const safeParts = parts
    .map((part) => part.replace(/[^a-zA-Z0-9._ -]/g, "_"))
    .filter((part) => part !== "." && part !== "..");
  return safeParts.join(path.sep) || "file.txt";
}

export async function ensureDirs(dirs) {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export function fileExistsSync(filePath) {
  return fssync.existsSync(filePath);
}
