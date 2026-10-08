import fs from "node:fs";
import path from "node:path";
import { readEvidence, isEvidenceFresh } from "./verification.js";

/**
 * Dynamic G5 dev batching by Bounded Context.
 *
 * Reads the ready User Stories, groups them by their declared **Bounded Context**,
 * and orders BCs into dependency WAVES. Within a wave, each BC is a LANE that runs
 * as a parallel @developpeur process; lanes of a wave run concurrently, waves run
 * sequentially. US of the SAME BC stay in one lane (serialized) to avoid file
 * conflicts on the same module/aggregate. A final consolidation lane merges the
 * shared governance files once (no concurrent appends).
 *
 * Everything is read from the project on each launch: the US→BC grouping, which US
 * are still to develop, the BC names (headings of bounded-contexts.md) and the
 * cross-BC dependency order (dev-waves.json, owned by @architecte-metier:
 * { "waves": [["BC-08", "BC-10"], ["BC-01"], ...] }). Without dev-waves.json the
 * BCs run one per wave in id order — slower, but safe for unknown dependencies.
 */

/** BC id -> name, from the `## BC-NN : Name` headings of bounded-contexts.md. */
function readBcNames(paths) {
  let text = "";
  try { text = fs.readFileSync(paths.boundedContextsFile, "utf8"); } catch { return {}; }
  const names = {};
  for (const m of text.matchAll(/^#{2,3}\s*(BC-\d+)\s*[:\-–]\s*(.+)$/gim)) {
    names[m[1].toUpperCase()] = m[2].trim();
  }
  return names;
}

/** Declared dependency waves, or null when the project has not declared them. */
function readDeclaredWaves(paths) {
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.devWavesFile, "utf8"));
    const waves = (parsed.waves || [])
      .filter(Array.isArray)
      .map((w) => w.map((bc) => String(bc).toUpperCase()))
      .filter((w) => w.length);
    return waves.length ? waves : null;
  } catch {
    return null;
  }
}

function usDir(paths) {
  return path.join(paths.livrablesDir, "05-backlog", "user-stories");
}
function slicesDir(paths) {
  return path.join(paths.livrablesDir, "06-dev", "vertical-slices");
}

/** Parse one US file into { id, title, primaryBC, integrationBCs }. */
function parseUS(dir, fileName) {
  const full = path.join(dir, fileName);
  let text = "";
  try { text = fs.readFileSync(full, "utf8"); } catch { return null; }
  const id = (fileName.match(/US-\d+/i) || [fileName])[0].toUpperCase();
  const titleLine = (text.match(/^#\s*(.+)$/m) || [])[1] || id;
  const title = titleLine.replace(/^US-\d+\s*[:\-–]\s*/i, "").trim();

  const bcLine = (text.match(/\*\*Bounded Context\*\*\s*:\s*(.+)/i) || [])[1] || "";
  const tokens = [...bcLine.matchAll(/BC-\d+/gi)].map((m) => m[0].toUpperCase());
  const distinct = [...new Set(tokens)];
  // "BC-01 -> BC-02" lands in the target (last); "BC-04 / BC-05" is primary-first.
  const primaryBC = /->|→/.test(bcLine) ? distinct[distinct.length - 1] : distinct[0] || null;
  const integrationBCs = distinct.filter((b) => b !== primaryBC);
  return { id, file: fileName, title, primaryBC, integrationBCs, developed: false };
}

/** True if a US already has a vertical-slice impl note (=> already developed). */
function isDeveloped(paths, usId) {
  const dir = slicesDir(paths);
  try {
    return fs.readdirSync(dir).some((f) => f.toUpperCase().startsWith(`${usId}-`) && /impl/i.test(f));
  } catch {
    return false;
  }
}

function laneKey(bc) {
  return `dev-${bc.toLowerCase().replace(/-/g, "")}`; // BC-01 -> dev-bc01
}

function makeLane(bc, list, names) {
  const bcName = names[bc] || bc;
  return {
    kind: "dev-lane",
    agentKey: laneKey(bc),
    agent: "@developpeur",
    bc,
    bcName,
    goal: `Développer les User Stories du Bounded Context ${bc} (${bcName})`,
    folders: ["06-dev"],
    usList: list.map((u) => ({
      id: u.id,
      title: u.title,
      file: u.file,
      integration: u.integrationBCs.length > 0,
      integrationBCs: u.integrationBCs
    }))
  };
}

/**
 * Full per-US development report, read from disk on each call:
 * which User Stories are already developed (have a vertical-slice impl note) and
 * which are still to develop, with title and Bounded Context. Independent of the
 * launch flow — used by the dev zone to show progress.
 */
export function buildUsReport(paths) {
  const dir = usDir(paths);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^US-\d+.*\.md$/i.test(f));
  } catch {
    return { ok: false, error: "Dossier user-stories introuvable.", total: 0, developedCount: 0, todoCount: 0, developed: [], todo: [] };
  }
  const names = readBcNames(paths);
  // Acceptance result of each US in the last G5 verification (platform-run, not declared).
  const ev = readEvidence(paths, "G5");
  const fresh = ev ? isEvidenceFresh(paths, "G5", ev) : false;
  const acceptanceOf = new Map(((ev && ev.stories) || []).map((s) => [s.us, s.status]));
  const all = files
    .map((f) => parseUS(dir, f))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const developed = [];
  const todo = [];
  for (const u of all) {
    const row = {
      id: u.id,
      title: u.title,
      file: u.file,
      primaryBC: u.primaryBC,
      bcName: u.primaryBC ? names[u.primaryBC] || u.primaryBC : null,
      integrationBCs: u.integrationBCs,
      developed: isDeveloped(paths, u.id),
      acceptance: acceptanceOf.get(u.id) || null,
      acceptanceFresh: fresh
    };
    (row.developed ? developed : todo).push(row);
  }
  return {
    ok: true,
    total: all.length,
    developedCount: developed.length,
    todoCount: todo.length,
    developed,
    todo
  };
}

/**
 * After a wave of SEVERAL parallel lanes, one integration step builds and tests the whole
 * product and fixes only the breaks between lanes, before the next wave builds on it.
 */
function pushIntegration(stages, waveMeta, lanes) {
  if (lanes.length < 2) return;
  const wave = waveMeta.filter((w) => w.bcs && !w.integration).length;
  stages.push([
    {
      kind: "dev-integrate",
      agentKey: `dev-integration-w${wave}`,
      agent: "@developpeur",
      label: `@developpeur · intégration vague ${wave}`,
      wave,
      lanes: lanes.map((l) => ({ bc: l.bc, bcName: l.bcName, us: l.usList.map((u) => u.id) })),
      goal: `Builder, tester et réparer l'intégration de la vague ${wave}`
    }
  ]);
  waveMeta.push({ integration: true, wave });
}

/**
 * Build the dev batches. Returns { stages, meta }.
 * `stages` is directly consumable by startPhaseGroup (waves of parallel lane tasks).
 */
export function buildDevBatches(paths) {
  const dir = usDir(paths);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^US-\d+.*\.md$/i.test(f));
  } catch {
    return { stages: [], meta: { total: 0, todo: 0, waves: [], skippedDeveloped: 0, unknownBCs: [], error: "Dossier user-stories introuvable." } };
  }

  const all = files.map((f) => parseUS(dir, f)).filter(Boolean);
  const skippedDeveloped = [];
  const todo = [];
  for (const u of all) {
    if (isDeveloped(paths, u.id)) skippedDeveloped.push(u.id);
    else todo.push(u);
  }

  // Group todo by primary BC.
  const byBC = new Map();
  for (const u of todo) {
    const bc = u.primaryBC || "BC-?";
    if (!byBC.has(bc)) byBC.set(bc, []);
    byBC.get(bc).push(u);
  }
  // Deterministic US order within a lane (by id).
  for (const list of byBC.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const names = readBcNames(paths);
  const declared = readDeclaredWaves(paths);
  // Undeclared order: one BC per wave, by id (no parallelism we can't justify).
  const tiers = declared
    || [...byBC.keys()].filter((bc) => bc !== "BC-?")
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((bc) => [bc]);
  const knownBCs = new Set(tiers.flat());
  const stages = [];
  const waveMeta = [];

  // Ordered waves from the declared (or default) tiers.
  for (const tier of tiers) {
    const lanes = [];
    for (const bc of tier) {
      const list = byBC.get(bc);
      if (list && list.length) lanes.push(makeLane(bc, list, names));
    }
    if (lanes.length) {
      stages.push(lanes);
      waveMeta.push({ bcs: lanes.map((l) => ({ bc: l.bc, name: l.bcName, us: l.usList.length })) });
      pushIntegration(stages, waveMeta, lanes);
    }
  }

  // Any BC not in the dependency map -> final "misc" wave, flagged.
  const unknownBCs = [...byBC.keys()].filter((bc) => !knownBCs.has(bc));
  if (unknownBCs.length) {
    const lanes = unknownBCs.map((bc) => makeLane(bc, byBC.get(bc), names));
    stages.push(lanes);
    waveMeta.push({ misc: true, bcs: lanes.map((l) => ({ bc: l.bc, name: l.bcName, us: l.usList.length })) });
    pushIntegration(stages, waveMeta, lanes);
  }

  // Final governance consolidation lane (single task) — only if we developed anything.
  if (stages.length) {
    stages.push([
      {
        kind: "dev-consolidate",
        agentKey: "dev-consolidation",
        agent: "@developpeur",
        goal: "Consolider la gouvernance (changelog, traçabilité, journal) après les vagues de dev"
      }
    ]);
    waveMeta.push({ consolidation: true });
  }

  return {
    stages,
    meta: {
      total: all.length,
      todo: todo.length,
      skippedDeveloped: skippedDeveloped.length,
      skippedList: skippedDeveloped,
      unknownBCs,
      orderSource: declared ? "dev-waves.json" : "default",
      waves: waveMeta
    }
  };
}
