import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";

/**
 * Persist one run's cost/token record. Appended as ONE line to spend.jsonl (O(1) per run,
 * no read-modify-write of the whole history). Older workspaces also have a spend.json
 * array: it is still read, never rewritten.
 */
export function appendSpend(root, record) {
  const file = path.join(root, ".claude", "control-center", "spend.jsonl");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  } catch {}
}

function statKey(file) {
  try {
    const s = fs.statSync(file);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return "none";
  }
}

// Parsed records cached on the files' size+mtime: the autopilot reads the total every tick.
const cache = new Map();

function readSpend(paths) {
  const key = `${statKey(paths.spendFile)}|${statKey(paths.spendLogFile)}`;
  const hit = cache.get(paths.workspaceRoot);
  if (hit && hit.key === key) return hit.records.map((r) => ({ ...r }));
  let records = [];
  const legacy = readTextSafe(paths.spendFile);
  if (legacy) {
    try {
      const list = JSON.parse(legacy);
      if (Array.isArray(list)) records = list;
    } catch {}
  }
  const lines = readTextSafe(paths.spendLogFile);
  if (lines) {
    for (const line of lines.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch {}
    }
  }
  cache.set(paths.workspaceRoot, { key, records });
  return records.map((r) => ({ ...r }));
}

function bucket(map, key, rec) {
  if (!key) key = "—";
  if (!map[key]) map[key] = { cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0, runs: 0 };
  const b = map[key];
  b.cost += rec.cost || 0;
  b.inputTokens += rec.inputTokens || 0;
  b.outputTokens += rec.outputTokens || 0;
  b.tokens += (rec.inputTokens || 0) + (rec.outputTokens || 0);
  b.runs += 1;
}

/** Effective cost: Claude's reported cost if present, else computed from tokens × pricing. */
function effectiveCost(rec, pricing) {
  if (rec.costUsd && rec.costUsd > 0) return { cost: rec.costUsd, estimated: false };
  return costFromTokens(rec, pricing);
}

/** Cost computed from token counts × the pricing table (model, else the default model). */
export function costFromTokens(rec, pricing) {
  const models = (pricing && pricing.models) || {};
  // Older records may carry a dated model id (e.g. claude-opus-4-8-20260101); normalize it.
  const modelKey = (rec.model || "").replace(/-\d{8}$/, "");
  const p = models[modelKey] || models[(pricing && pricing.default) || ""] || null;
  if (!p) return { cost: 0, estimated: false };
  const cost =
    ((rec.inputTokens || 0) * (p.input || 0) +
      (rec.outputTokens || 0) * (p.output || 0) +
      (rec.cacheCreateTokens || 0) * (p.cacheWrite || 0) +
      (rec.cacheReadTokens || 0) * (p.cacheRead || 0)) /
    1_000_000;
  return { cost, estimated: true };
}

/** Read all spend records and compute BI aggregations. */
export function getSpend(paths, pricing) {
  const records = readSpend(paths);
  let anyEstimated = false;
  for (const r of records) {
    const e = effectiveCost(r, pricing);
    r.cost = e.cost;
    if (e.estimated && (r.inputTokens || r.outputTokens)) anyEstimated = true;
  }
  const byPhase = {};
  const byAgent = {};
  const byKind = {};
  const byDay = {};
  const tokenBreakdown = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  let totalCost = 0;
  let totalTokens = 0;

  for (const r of records) {
    bucket(byPhase, r.phaseId, r);
    bucket(byAgent, r.agent, r);
    bucket(byKind, r.kind, r);
    bucket(byDay, (r.endedAt || r.startedAt || "").slice(0, 10), r);
    tokenBreakdown.input += r.inputTokens || 0;
    tokenBreakdown.output += r.outputTokens || 0;
    tokenBreakdown.cacheCreate += r.cacheCreateTokens || 0;
    tokenBreakdown.cacheRead += r.cacheReadTokens || 0;
    totalCost += r.cost || 0;
    totalTokens += (r.inputTokens || 0) + (r.outputTokens || 0);
  }

  return {
    // Full history, newest first (no cap): Coût AND Activité show every run.
    records: records.slice().reverse().map((r) => ({ ...r, cost: r.cost })),
    pricing: pricing || null,
    summary: {
      totalCost,
      totalTokens,
      runCount: records.length,
      estimated: anyEstimated,
      byPhase,
      byAgent,
      byKind,
      byDay,
      tokenBreakdown
    }
  };
}
