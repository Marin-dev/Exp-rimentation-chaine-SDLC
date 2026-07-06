import fs from "node:fs";
import path from "node:path";

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
 * "Dynamic" = the US→BC grouping, which US are still to develop, and the counts are
 * read from disk each launch. Only the cross-BC dependency ORDER is declared here,
 * because that is domain knowledge the US files do not encode machine-readably.
 */

// Dependency tiers: each inner array is a wave; its BCs run as parallel lanes.
// Foundations (access guard, audit) first; then the mission-lifecycle pipeline.
const BC_TIERS = [
  ["BC-08", "BC-10"], // fondations : garde d'accès + audit (contrats transverses)
  ["BC-09", "BC-01"], // notifications + engagement/calendrier
  ["BC-02"],          // orchestration de mission
  ["BC-03"],          // demandes / inputs
  ["BC-04"],          // document final
  ["BC-05"],          // sign-off
  ["BC-06"],          // knowledge & archive
  ["BC-07"]           // recherche
];

const BC_NAMES = {
  "BC-01": "Engagement & Calendrier",
  "BC-02": "Mission Orchestration",
  "BC-03": "Demandes / Inputs",
  "BC-04": "Document final",
  "BC-05": "Sign-off",
  "BC-06": "Knowledge & Archive",
  "BC-07": "Recherche",
  "BC-08": "Access & Confidentiality",
  "BC-09": "Notifications",
  "BC-10": "Audit"
};

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

function makeLane(bc, list) {
  return {
    kind: "dev-lane",
    agentKey: laneKey(bc),
    agent: "@developpeur",
    bc,
    bcName: BC_NAMES[bc] || bc,
    goal: `Développer les User Stories du Bounded Context ${bc} (${BC_NAMES[bc] || bc})`,
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
      bcName: u.primaryBC ? BC_NAMES[u.primaryBC] || u.primaryBC : null,
      integrationBCs: u.integrationBCs,
      developed: isDeveloped(paths, u.id)
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

  const knownBCs = new Set(BC_TIERS.flat());
  const stages = [];
  const waveMeta = [];

  // Ordered waves from the declared tiers.
  for (const tier of BC_TIERS) {
    const lanes = [];
    for (const bc of tier) {
      const list = byBC.get(bc);
      if (list && list.length) lanes.push(makeLane(bc, list));
    }
    if (lanes.length) {
      stages.push(lanes);
      waveMeta.push({ bcs: lanes.map((l) => ({ bc: l.bc, name: l.bcName, us: l.usList.length })) });
    }
  }

  // Any BC not in the dependency map -> final "misc" wave, flagged.
  const unknownBCs = [...byBC.keys()].filter((bc) => !knownBCs.has(bc));
  if (unknownBCs.length) {
    const lanes = unknownBCs.map((bc) => makeLane(bc, byBC.get(bc)));
    stages.push(lanes);
    waveMeta.push({ misc: true, bcs: lanes.map((l) => ({ bc: l.bc, name: l.bcName, us: l.usList.length })) });
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
      waves: waveMeta
    }
  };
}
