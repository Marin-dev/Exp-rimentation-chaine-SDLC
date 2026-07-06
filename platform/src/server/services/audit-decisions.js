import fs from "node:fs";
import path from "node:path";
import { startRun } from "./runs.js";
import { listDecisions, reopenDecision } from "./decisions-store.js";
import { buildAuditAgentPrompt, libraryPolicyText } from "./run-prompts.js";
import { ingestPendingInput } from "./inbox-ingest.js";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Coherence control over ALREADY-ANSWERED decisions. Each profile's agent audits its
 * own decisions; the orchestrator audits cross-profile coherence. The agent verifies
 * (a) mutual coherence and (b) that each decision is actually documented in the
 * deliverables, then writes findings. Incoherent/undocumented decisions flagged
 * `reopen` are returned to pending for their target profile with the reason attached.
 */

const ORCHESTRATOR_AGENT = "@project-bootstrapper";

function agentForProfile(profileId) {
  const p = PROFILE_BY_ID[profileId];
  return p && Array.isArray(p.agents) && p.agents[0] ? p.agents[0] : null;
}

/** Answered items to audit — all when no profile, else those routed to that profile. */
function answeredFor(paths, profileId) {
  const answered = listDecisions(paths).filter((d) => d.status === "answered");
  return profileId ? answered.filter((d) => d.targetProfile === profileId) : answered;
}

function launchAudit(config, paths, { scope, key, auditor, profileLabel, decisions }) {
  const lkey = String(key).toLowerCase();
  const reportRel = `livrables/_governance/audits/audit-${key}.json`;
  const reportAbs = path.join(paths.auditsDir, `audit-${key}.json`);
  const pendingRel = `livrables/_governance/agent-io/pending-input-audit-${lkey}.json`;
  const pendingAbs = path.join(paths.agentIoDir, `pending-input-audit-${lkey}.json`);
  try { fs.rmSync(reportAbs, { force: true }); } catch {}

  const prompt =
    buildAuditAgentPrompt({
      scope,
      auditor,
      profileLabel,
      decisions,
      reportFileRel: reportRel,
      pendingFileRel: pendingRel
    }) + libraryPolicyText(config);

  const runId = startRun(config, {
    label: `Contrôle ${scope === "global" ? "cohérence globale" : profileLabel} · ${auditor}`,
    kind: "audit",
    phaseId: null,
    agent: auditor,
    prompt,
    cwd: paths.workspaceRoot,
    onDone: (run) => {
      let report = null;
      const raw = readTextSafe(reportAbs);
      if (raw) { try { report = JSON.parse(raw); } catch {} }
      const findings = report && Array.isArray(report.findings) ? report.findings : [];

      // Return each flagged decision to its target profile, with the reason.
      const reopened = [];
      for (const f of findings) {
        if (!f || !f.reopen) continue;
        const id = String(f.decisionId || "").trim();
        if (!id) continue;
        const kindLabel = f.kind === "incoherence" ? "incohérence" : "non documentée";
        const note = String(f.reopenNote || f.rationale || "").trim();
        const r = reopenDecision(paths, id, `Contrôle qualité — ${kindLabel} : ${note}`);
        if (r.ok) reopened.push(id);
      }

      // Persist the enriched report for the UI (source of truth for the control panel).
      const enriched = {
        scope,
        key,
        profileId: scope === "global" ? null : key,
        auditor,
        runId: run.id,
        generatedAt: new Date().toISOString(),
        checked: decisions.length,
        summary: report ? String(report.summary || "").trim() : "",
        findings,
        reopened
      };
      fs.mkdirSync(paths.auditsDir, { recursive: true });
      fs.writeFileSync(reportAbs, JSON.stringify(enriched, null, 2), "utf8");

      // Surface any escalation the auditor itself raised while reading deliverables.
      try {
        ingestPendingInput(paths, { runId: run.id, phaseId: null, raisedBy: auditor }, pendingAbs);
      } catch {}
    }
  });

  return { ok: true, runId, auditor, scope, key, checked: decisions.length };
}

/** Audit the decisions routed to a single profile (that profile's own agent). */
export function auditProfileDecisions(config, paths, { profileId }) {
  const profile = PROFILE_BY_ID[profileId];
  const auditor = agentForProfile(profileId);
  if (!profile || !auditor) return { ok: false, error: "Profil ou agent invalide." };
  const decisions = answeredFor(paths, profileId);
  if (!decisions.length) return { ok: false, error: "Aucune décision tranchée à contrôler pour ce profil." };
  return launchAudit(config, paths, {
    scope: "profile",
    key: profileId,
    auditor,
    profileLabel: profile.label,
    decisions
  });
}

/** Audit cross-profile coherence over ALL answered decisions (orchestrator). */
export function auditGlobalCoherence(config, paths) {
  const decisions = answeredFor(paths, null);
  if (!decisions.length) return { ok: false, error: "Aucune décision tranchée à contrôler." };
  return launchAudit(config, paths, {
    scope: "global",
    key: "_global",
    auditor: ORCHESTRATOR_AGENT,
    profileLabel: "Orchestrateur",
    decisions
  });
}

/** Read the latest audit report per scope key ({ [profileId|"_global"]: report }). */
export function readAudits(paths) {
  const out = {};
  let files = [];
  try {
    files = fs.readdirSync(paths.auditsDir).filter((f) => f.startsWith("audit-") && f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const raw = readTextSafe(path.join(paths.auditsDir, f));
    if (!raw) continue;
    try {
      const rep = JSON.parse(raw);
      const key = rep.key || f.replace(/^audit-/, "").replace(/\.json$/, "");
      out[key] = rep;
    } catch {}
  }
  return out;
}
