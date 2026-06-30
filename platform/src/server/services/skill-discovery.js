import { createWorkspacePaths } from "../config/paths.js";
import { runClaudePrint } from "./claude-runner.js";

/** Extract the first JSON array found in a free-text model output. */
function extractJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildPrompt(query) {
  return `Tu recherches des "agent skills" Claude Code EXISTANTS et déjà optimisés qui répondent à un besoin, avant d'en créer un de zéro.

Besoin de l'utilisateur : "${query}"

Sers-toi du skill find-skills et de ta connaissance des skills publiés (marketplaces, dépôts, skills officiels) pour proposer jusqu'à 5 skills existants pertinents.

Réponds STRICTEMENT avec un tableau JSON valide, sans aucun texte autour, au format exact :
[{"name":"...","description":"...","source":"où le trouver (marketplace, repo, officiel)","install":"commande ou étape d'installation","why":"pourquoi il convient mieux qu'un skill créé de zéro"}]

Si aucun skill existant ne convient, réponds exactement : []`;
}

/**
 * Use Claude + the find-skills skill to look for existing, optimized skills
 * online before scaffolding a new one.
 */
export async function searchExistingSkills(config, { name, description }) {
  const query = `${name || ""} ${description || ""}`.trim();
  if (!query) {
    return { ok: false, error: "Décrivez d'abord le besoin." };
  }
  const paths = createWorkspacePaths(config.workspaceRoot);
  const result = await runClaudePrint(config, buildPrompt(query), {
    cwd: paths.workspaceRoot,
    timeoutMs: 180000
  });

  if (!result.ok && !result.output) {
    return { ok: false, error: result.error || "Recherche indisponible." };
  }

  const suggestions = extractJsonArray(result.output) || [];
  return {
    ok: true,
    suggestions: suggestions
      .filter((s) => s && s.name)
      .slice(0, 5)
      .map((s) => ({
        name: String(s.name),
        description: String(s.description || ""),
        source: String(s.source || ""),
        install: String(s.install || ""),
        why: String(s.why || "")
      }))
  };
}
