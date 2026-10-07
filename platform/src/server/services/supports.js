import fs from "node:fs";
import path from "node:path";
import { templatesDir } from "../config/paths.js";
import { readTemplate, renderPptx, renderDocx, markdownToOutline, readPlanning } from "./support-render.js";
import { contractBlock } from "./run-prompts.js";
import { PHASES, PHASE_BY_ID } from "../domain/phases.js";

/**
 * PowerPoint / Word supports of the whole project, generated from any phase.
 * An agent consolidates the deliverables up to that phase into an outline
 * (livrables/_supports/<id>/outline.json); the platform then renders it with the
 * template uploaded in the settings (or a neutral one). Index: _supports/supports.json.
 */

export const FORMATS = { pptx: "PowerPoint", docx: "Word" };

function indexFile(paths) {
  return path.join(paths.supportsDir, "supports.json");
}

export function listSupports(paths) {
  try {
    return JSON.parse(fs.readFileSync(indexFile(paths), "utf8"));
  } catch {
    return [];
  }
}

function saveSupports(paths, list) {
  fs.mkdirSync(paths.supportsDir, { recursive: true });
  fs.writeFileSync(indexFile(paths), JSON.stringify(list, null, 2), "utf8");
}

function patchSupport(paths, id, patch) {
  const list = listSupports(paths);
  const s = list.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
  saveSupports(paths, list);
  return s;
}

/** Phases covered by a support generated from `phaseId` (G0 up to that phase). */
function coveredPhases(phaseId) {
  const i = PHASES.findIndex((p) => p.id === phaseId);
  return PHASES.slice(0, i + 1);
}

export function buildSupportPrompt({ phaseId, format, outlineRel, audience }) {
  const covered = coveredPhases(phaseId);
  const folders = covered.flatMap((p) => p.folders.map((f) => `/livrables/${f}/`));
  const withPlanning = covered.some((p) => p.id === "G4");
  return `Tu agis comme @project-bootstrapper (rôle de rédaction de synthèse), conformément à CLAUDE.md et .claude/rules/.

Objectif : préparer le contenu d'un support ${FORMATS[format]} GLOBAL du projet, qui présente l'état du projet de G0 jusqu'à l'étape ${phaseId} (${PHASE_BY_ID[phaseId].title}) incluse.
Public : ${audience || "le client et les parties prenantes (décideurs métier et techniques)"}. Le support doit être compréhensible sans connaître la plateforme ni la chaîne d'agents.

Sources à consolider (lis-les, ne les recopie pas) :
- project/PROJECT.md et project/<slug>/ ;
- les livrables de ces dossiers : ${folders.join(", ")} ;
- les décisions dans /livrables/_governance/decisions/ et les gates /livrables/_governance/gates/ des étapes couvertes.

Structure attendue (adapte aux livrables réellement disponibles ; une section par grand thème, pas une section par fichier) :
1. Contexte et objectifs (vision, KPIs, périmètre MVP) ;
2. Utilisateurs et parcours ; écrans clés ;
3. Modèle métier (domaines, règles structurantes) ;
4. Architecture applicative et sécurité, si G3 est couvert ;
5. Backlog (epics, volumétrie des user stories, priorités)${withPlanning ? " et planning (charge, équipe, sprints, jalons)" : ""}, si G4 est couvert ;
6. Décisions prises, risques et points ouverts ; prochaines étapes.

Règles de rédaction :
- Synthétique : des phrases courtes et des listes, des chiffres quand ils existent. Une liste fait au plus 6 éléments ; un tableau au plus une quinzaine de lignes (résume au-delà).
- N'invente rien : chaque information vient d'un livrable. Ce qui n'est pas encore produit est présenté comme « à venir ».
- Images : tu peux citer une image PNG ou JPG existante sous /livrables/ (maquette, schéma) par son chemin relatif au projet ; n'en cite que si elle existe.
${withPlanning ? "- Planning : si /livrables/05-backlog/planning.json existe, insère un bloc {\"type\": \"planning\"} dans la section planning ; la plateforme le dessine elle-même (indicateurs, calendrier, tableaux). Ne recopie pas les chiffres du planning à la main." : ""}

Écris UNIQUEMENT le fichier \`${outlineRel}\` (crée le dossier si besoin), AU FORMAT EXACT :
{
  "title": "titre du support",
  "subtitle": "sous-titre (ex. état du projet au ${new Date().toLocaleDateString("fr-FR")})",
  "sections": [
    { "title": "titre de section", "blocks": [
      { "type": "text", "text": "paragraphe" },
      { "type": "bullets", "title": "titre optionnel", "items": ["..."] },
      { "type": "table", "title": "titre optionnel", "columns": ["..."], "rows": [["..."]] },
      { "type": "kpis", "title": "titre optionnel", "items": [{ "label": "...", "value": "..." }] },
      { "type": "image", "path": "livrables/...png", "caption": "..." }${withPlanning ? ',\n      { "type": "planning" }' : ""}
    ] }
  ]
}
Ne modifie aucun livrable.

${contractBlock()}`;
}

/** Register a new support; the caller starts the agent run. */
export function createSupport(paths, { phaseId, format }) {
  if (!PHASE_BY_ID[phaseId]) return { ok: false, error: "Étape inconnue." };
  if (!FORMATS[format]) return { ok: false, error: "Format inconnu." };
  const id = `SUP-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
  const dir = path.join(paths.supportsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const outlineRel = path.relative(paths.workspaceRoot, path.join(dir, "outline.json")).split(path.sep).join("/");
  const entry = { id, phaseId, format, status: "generating", createdAt: new Date().toISOString(), outline: outlineRel, file: null, title: null, error: null };
  saveSupports(paths, [entry, ...listSupports(paths)]);
  return { ok: true, support: entry };
}

export function templateFile(config, format) {
  const t = config.supportTemplates && config.supportTemplates[format];
  return t && t.file ? path.join(templatesDir, t.file) : null;
}

/** After the agent run: render the outline into the final file. */
export async function finalizeSupport(paths, config, id, runOk) {
  const s = listSupports(paths).find((x) => x.id === id);
  if (!s) return;
  if (!runOk) return patchSupport(paths, id, { status: "failed", error: "La rédaction du contenu a échoué." });
  let outline;
  try {
    outline = JSON.parse(fs.readFileSync(path.resolve(paths.workspaceRoot, s.outline), "utf8"));
  } catch {
    return patchSupport(paths, id, { status: "failed", error: "Contenu du support introuvable ou invalide (outline.json)." });
  }
  try {
    const { theme, stylesXml } = await readTemplate(templateFile(config, s.format));
    const planning = readPlanning(paths.planningJsonFile);
    const buffer = s.format === "pptx"
      ? await renderPptx(outline, { theme, workspaceRoot: paths.workspaceRoot, planning })
      : await renderDocx(outline, { theme, stylesXml, workspaceRoot: paths.workspaceRoot, planning });
    const slug = String(outline.title || "support").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "support";
    const file = path.join(path.dirname(path.resolve(paths.workspaceRoot, s.outline)), `${slug}-${s.phaseId}.${s.format}`);
    fs.writeFileSync(file, buffer);
    return patchSupport(paths, id, {
      status: "ready",
      title: outline.title || null,
      file: path.relative(paths.workspaceRoot, file).split(path.sep).join("/"),
      readyAt: new Date().toISOString()
    });
  } catch (e) {
    return patchSupport(paths, id, { status: "failed", error: `Rendu impossible : ${e.message}` });
  }
}

/** Absolute path of a generated support, guarded to stay inside _supports/. */
export function supportFilePath(paths, id) {
  const s = listSupports(paths).find((x) => x.id === id);
  if (!s || !s.file) return null;
  const full = path.resolve(paths.workspaceRoot, s.file);
  return full.startsWith(path.resolve(paths.supportsDir) + path.sep) && fs.existsSync(full) ? full : null;
}

/** Direct Word export of one Markdown deliverable (e.g. the client questionnaire). */
export async function exportMarkdownDocx(paths, config, relPath) {
  const full = path.resolve(paths.workspaceRoot, String(relPath || ""));
  if (!full.startsWith(path.resolve(paths.livrablesDir) + path.sep) || !/\.md$/i.test(full) || !fs.existsSync(full)) {
    return { ok: false, error: "Document introuvable ou hors périmètre." };
  }
  const outline = markdownToOutline(fs.readFileSync(full, "utf8"), path.basename(full, ".md"));
  const { theme, stylesXml } = await readTemplate(templateFile(config, "docx"));
  const buffer = await renderDocx(outline, { theme, stylesXml, workspaceRoot: paths.workspaceRoot, planning: null });
  return { ok: true, buffer, filename: `${path.basename(full, ".md")}.docx` };
}

/** Save a template uploaded from the settings (base64). Returns the config patch value. */
export function saveTemplate(format, filename, contentBase64) {
  if (!FORMATS[format]) return { ok: false, error: "Format inconnu." };
  if (!new RegExp(`\\.${format}$`, "i").test(String(filename || ""))) return { ok: false, error: `Le gabarit doit être un fichier .${format}.` };
  const comma = String(contentBase64 || "").indexOf(",");
  const raw = comma !== -1 ? contentBase64.slice(comma + 1) : contentBase64;
  const buffer = Buffer.from(raw || "", "base64");
  if (!buffer.length) return { ok: false, error: "Fichier vide." };
  if (buffer.length > 30 * 1024 * 1024) return { ok: false, error: "Gabarit trop volumineux (max 30 Mo)." };
  fs.mkdirSync(templatesDir, { recursive: true });
  const file = `template.${format}`;
  fs.writeFileSync(path.join(templatesDir, file), buffer);
  return { ok: true, value: { file, name: path.basename(filename), uploadedAt: new Date().toISOString() } };
}
