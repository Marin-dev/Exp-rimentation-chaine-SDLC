import React, { useEffect, useState } from "react";
import { ShieldCheck, Play, CheckCircle2, XCircle, AlertTriangle, Lock, FlaskConical, Loader2, MinusCircle } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";

/**
 * Executable evidence of a phase.
 *  - G4: the acceptance tests @qa writes before development (manifest, lock) and the
 *    verification commands, which a human approves here before the platform runs them.
 *  - G5 / G6: the last verification the platform ran itself (build, tests, acceptance per
 *    User Story), whether it is still fresh, and whether it caps the gate.
 */

const STATUS = {
  pass: { icon: CheckCircle2, cls: "text-[#168736]", label: "OK" },
  "pass-global": { icon: CheckCircle2, cls: "text-[#168736]", label: "OK (global)" },
  fail: { icon: XCircle, cls: "text-error", label: "Échec" },
  error: { icon: XCircle, cls: "text-error", label: "Erreur" },
  missing: { icon: AlertTriangle, cls: "text-warning", label: "Manquant" },
  skipped: { icon: MinusCircle, cls: "text-ey-gray02", label: "Non exécuté" }
};

function StatusIcon({ status }) {
  const s = STATUS[status] || STATUS.skipped;
  const Icon = s.icon;
  return <Icon size={14} className={`${s.cls} shrink-0`} aria-label={s.label} />;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

function CommandsBlock({ data, profile, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cfg = data.config;
  if (cfg.missing) {
    return <p className="text-[12.5px] text-ey-gray01 m-0">Pas encore de commandes de vérification : @qa les écrit avec les tests d'acceptation (étape G4).</p>;
  }
  if (!cfg.ok) return <div className="alert alert-warning text-[12.5px] py-2">{cfg.error}</div>;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      onChange(await Api.approveVerification(cfg.hash, profile));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12.5px] font-semibold">Commandes exécutées par la plateforme</span>
        {data.approved ? (
          <span className="badge badge-ghost badge-sm gap-1"><CheckCircle2 size={12} className="text-[#168736]" /> approuvées {fmtDate(data.approval?.approvedAt)}</span>
        ) : (
          <span className="badge badge-warning badge-sm">{data.approval ? "modifiées depuis l'approbation" : "à approuver"}</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 mb-2">
        {cfg.steps.map((s) => (
          <div key={s.id} className="text-[12px] border border-ey-border rounded px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <b>{s.label}</b>
              <span className="text-ey-gray02">{s.kind} · {s.gates.join(", ")}{s.required ? "" : " · facultative"}</span>
            </div>
            <code className="block text-[11.5px] bg-transparent text-ey-gray01 break-all">{s.cwd !== "." ? `[${s.cwd}] ` : ""}{s.command}</code>
          </div>
        ))}
      </div>
      {!data.approved ? (
        <>
          <p className="text-[12px] text-ey-gray01 m-0 mb-2">
            Ces commandes sont écrites par un agent et seront lancées sur cette machine. Relis-les avant d'approuver ; toute modification du fichier demandera une nouvelle approbation.
          </p>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={approve} disabled={busy}>
            <ShieldCheck size={14} /> {busy ? "Approbation…" : "Approuver ces commandes"}
          </button>
        </>
      ) : null}
      {error ? <div className="text-error text-[12px] mt-1">{error}</div> : null}
    </div>
  );
}

function AcceptanceBlock({ data, busyRun, onLaunch }) {
  const m = data.manifest;
  const lock = data.lock;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <FlaskConical size={14} className="text-ey-gray01" />
        <span className="text-[12.5px] font-semibold">Tests d'acceptation (écrits par @qa avant le dev)</span>
      </div>
      {m.missing ? (
        <p className="text-[12.5px] text-ey-gray01 m-0 mb-2">Aucun test d'acceptation pour l'instant.</p>
      ) : !m.ok ? (
        <div className="alert alert-warning text-[12.5px] py-2 mb-2">{m.error}</div>
      ) : (
        <div className="text-[12.5px] mb-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>{m.stories} User Stories, {m.tests} fichiers de tests</span>
          {m.withoutTests.length ? <span className="text-warning">Sans test : {m.withoutTests.join(", ")}</span> : null}
          <span className="inline-flex items-center gap-1 text-ey-gray01">
            <Lock size={12} /> {lock.locked ? `verrouillés le ${fmtDate(lock.lockedAt)}` : "non verrouillés"}
          </span>
          {lock.modified.length || lock.missing.length ? (
            <span className="text-error">Modifiés depuis : {[...lock.modified, ...lock.missing].join(", ")}</span>
          ) : null}
        </div>
      )}
      <button className="btn btn-outline btn-sm gap-1.5" onClick={onLaunch} disabled={busyRun}>
        <Play size={14} /> {m.ok ? "Compléter les tests d'acceptation" : "Écrire les tests d'acceptation"}
      </button>
    </div>
  );
}

function EvidenceBlock({ gateId, data, busyRun, onRun }) {
  const ev = data.evidence[gateId];
  const enforced = data.policy.enabled;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[12.5px] font-semibold">Dernière vérification</span>
        {ev ? (
          <>
            <span className={`badge badge-sm ${ev.verdict === "PASS" ? "badge-success" : "badge-error"}`}>{ev.verdict}</span>
            <span className="text-[12px] text-ey-gray01">{fmtDate(ev.endedAt)} · {ev.tests.passed}/{ev.tests.total} tests réussis</span>
            {!ev.fresh ? <span className="badge badge-warning badge-sm">périmée : le produit a changé depuis</span> : null}
          </>
        ) : (
          <span className="text-[12px] text-ey-gray01">aucune</span>
        )}
      </div>
      {ev && ev.reasons.length ? (
        <ul className="m-0 mb-2 pl-4 text-[12px] text-error">{ev.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      ) : null}
      {ev && ev.warnings.length ? (
        <ul className="m-0 mb-2 pl-4 text-[12px] text-ey-gray01">{ev.warnings.map((r, i) => <li key={i}>{r}</li>)}</ul>
      ) : null}
      {ev ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
          <div className="flex flex-col gap-1">
            {ev.steps.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[12px]">
                <StatusIcon status={s.status} /> <span className="truncate">{s.label}</span>
                <span className="text-ey-gray02 ml-auto shrink-0">{Math.round(s.durationMs / 1000)} s</span>
              </div>
            ))}
          </div>
          {ev.stories.length ? (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {ev.stories.map((s) => (
                <div key={s.us} className="flex items-center gap-2 text-[12px]">
                  <StatusIcon status={s.status} /> <span className="font-mono text-ey-gray02 shrink-0">{s.us}</span>
                  <span className="truncate">{s.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn btn-outline btn-sm gap-1.5" onClick={onRun} disabled={busyRun || !data.approved}>
          <Play size={14} /> Lancer la vérification
        </button>
        {!data.approved ? <span className="text-[12px] text-ey-gray01">Commandes à approuver d'abord (étape G4).</span> : null}
        <span className="text-[12px] text-ey-gray01">
          {enforced ? `Le gate ${gateId} ne peut passer qu'avec des preuves fraîches et réussies.` : `Gate ${gateId} non plafonné par les preuves (projet antérieur).`}
        </span>
      </div>
    </div>
  );
}

export default function EvidencePanel({ phaseId, profile, busy, refreshKey, onRunStarted, onStateRefresh }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [policyBusy, setPolicyBusy] = useState(false);

  async function load() {
    try {
      setData(await Api.getVerification());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [refreshKey]);

  if (!["G4", "G5", "G6"].includes(phaseId)) return null;

  async function launch(fn, label) {
    try {
      const r = await fn();
      if (r.runId) onRunStarted({ id: r.runId, label: r.label || label, phaseId });
    } catch (e) {
      setError(e.message);
    }
  }

  async function togglePolicy(enabled) {
    if (enabled && !window.confirm("Activer les gates à preuves ? Un G5 / G6 déjà validé sans preuve réussie repassera en FAIL.")) return;
    setPolicyBusy(true);
    try {
      setData(await Api.setEvidencePolicy(enabled));
      onStateRefresh && onStateRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPolicyBusy(false);
    }
  }

  return (
    <Card className="p-5 mt-5">
      <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
        <ShieldCheck size={17} className="text-ey-gray01" /> Preuves exécutables
      </h3>
      <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
        {phaseId === "G4"
          ? "Avant le développement, @qa transforme les critères d'acceptation en tests exécutables. Le développeur devra les faire passer sans les modifier."
          : "La plateforme rejoue elle-même le build et les tests du produit. Le reviewer juge le reste, mais ne peut pas valider contre ces résultats."}
      </p>
      {error ? <div className="alert alert-error text-[12.5px] py-2 mb-3">{error}</div> : null}
      {!data ? (
        <div className="text-ey-gray01 text-[13px] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {!data.policy.enabled ? (
            <div className="flex items-center gap-2 rounded-md bg-base-200 border border-ey-border px-3 py-2 text-[12px] text-ey-gray01">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">Ce projet a été créé avant les gates à preuves : G5 et G6 ne sont pas encore plafonnés par les résultats réels.</span>
              <button className="btn btn-outline btn-xs" onClick={() => togglePolicy(true)} disabled={policyBusy}>Activer</button>
            </div>
          ) : null}
          {phaseId === "G4" ? (
            <>
              <AcceptanceBlock data={data} busyRun={busy} onLaunch={() => launch(() => Api.launchAcceptanceTests(), "G4 · Tests d'acceptation (@qa)")} />
              <CommandsBlock data={data} profile={profile} onChange={setData} />
            </>
          ) : (
            <EvidenceBlock gateId={phaseId} data={data} busyRun={busy} onRun={() => launch(() => Api.runVerification(phaseId), `${phaseId} · Preuves exécutables`)} />
          )}
        </div>
      )}
    </Card>
  );
}
