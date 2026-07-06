import React, { useState, useRef, useEffect } from "react";
import { ShieldCheck, Loader2, AlertTriangle, FileWarning, CheckCircle2, RotateCcw } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";

/** One finding line inside an audit report. */
function Finding({ f }) {
  const incoherence = f.kind === "incoherence";
  const Icon = incoherence ? AlertTriangle : FileWarning;
  const color = incoherence ? "#B42318" : "#A15C07";
  const bg = incoherence ? "#FDEBEA" : "#FFF3DF";
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-md" style={{ background: bg }}>
      <Icon size={15} className="mt-0.5 shrink-0" style={{ color }} />
      <div className="min-w-0 text-[12.5px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold" style={{ color }}>{f.decisionId}</span>
          <span className="font-semibold" style={{ color }}>
            {incoherence ? "Incohérence" : "Non documentée"}
          </span>
          {f.reopen ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ey-gray01">
              <RotateCcw size={11} /> renvoyée au profil
            </span>
          ) : null}
        </div>
        <p className="m-0 mt-0.5 text-ey-black/80">{f.rationale}</p>
      </div>
    </div>
  );
}

/** Compact report body: summary + findings (or an all-clear line). */
function Report({ rep }) {
  if (!rep) return null;
  const findings = Array.isArray(rep.findings) ? rep.findings : [];
  return (
    <div className="mt-2 space-y-2">
      {rep.summary ? <p className="m-0 text-[12.5px] text-ey-gray01">{rep.summary}</p> : null}
      {findings.length === 0 ? (
        <div className="flex items-center gap-2 text-[12.5px] text-[#168736]">
          <CheckCircle2 size={15} /> Décisions cohérentes et documentées.
        </div>
      ) : (
        <div className="space-y-1.5">
          {findings.map((f, i) => <Finding key={`${f.decisionId}-${i}`} f={f} />)}
        </div>
      )}
    </div>
  );
}

/** Small status badge for the last audit of a scope. */
function AuditBadge({ rep, running }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ey-gray01">
        <Loader2 size={13} className="animate-spin" /> Contrôle en cours…
      </span>
    );
  }
  if (!rep) return <span className="text-[11px] text-ey-gray02">Jamais contrôlé</span>;
  const n = Array.isArray(rep.findings) ? rep.findings.length : 0;
  if (n === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#168736]">
        <CheckCircle2 size={13} /> Conforme
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#B42318" }}>
      <AlertTriangle size={13} /> {n} problème{n > 1 ? "s" : ""}
    </span>
  );
}

/**
 * Quality control over ANSWERED decisions. One audit per profile (its own agent
 * checks coherence + documentation of its decisions) plus a cross-profile global
 * coherence check. Flagged decisions are returned to their profile as pending.
 */
export default function DecisionsControl({ state, onStateChange }) {
  const decisions = state.decisions || [];
  const audits = state.audits || {};
  const [busy, setBusy] = useState({}); // key -> boolean
  const [open, setOpen] = useState({}); // key -> expanded
  const pollRef = useRef({});

  const answeredByProfile = {};
  for (const d of decisions) {
    if (d.status === "answered") {
      answeredByProfile[d.targetProfile] = (answeredByProfile[d.targetProfile] || 0) + 1;
    }
  }
  const rows = (state.profiles || []).filter((p) => answeredByProfile[p.id]);
  const totalAnswered = decisions.filter((d) => d.status === "answered").length;

  useEffect(() => () => Object.values(pollRef.current).forEach((t) => clearInterval(t)), []);

  // Poll global state until the report for `key` carries the launched runId (audit done).
  function poll(key, runId) {
    let tries = 0;
    clearInterval(pollRef.current[key]);
    pollRef.current[key] = setInterval(async () => {
      tries += 1;
      try {
        const next = await Api.getState();
        onStateChange(next);
        const rep = (next.audits || {})[key];
        if ((rep && rep.runId === runId) || tries > 60) {
          clearInterval(pollRef.current[key]);
          setBusy((b) => ({ ...b, [key]: false }));
          setOpen((o) => ({ ...o, [key]: true }));
        }
      } catch { /* keep polling */ }
    }, 3000);
  }

  async function runAudit(scope, key, profileId) {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await Api.auditDecisions(scope, profileId);
      if (res.ok) poll(key, res.runId);
      else setBusy((b) => ({ ...b, [key]: false }));
    } catch {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  if (totalAnswered === 0) return null;

  const globalRep = audits._global;
  const globalBusy = Boolean(busy._global);

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ey-border">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 text-secondary" />
          <div>
            <h3 className="m-0 text-[15px] font-bold">Contrôle des décisions</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-ey-gray01">
              Chaque profil vérifie la cohérence de ses décisions tranchées et qu'elles sont bien
              documentées dans les livrables. Les incohérences sont renvoyées au profil concerné.
            </p>
          </div>
        </div>
        <button
          className="btn btn-secondary btn-sm gap-1.5 whitespace-nowrap"
          onClick={() => runAudit("global", "_global")}
          disabled={globalBusy}
        >
          {globalBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Cohérence globale
        </button>
      </div>

      {globalRep || globalBusy ? (
        <div className="px-5 py-3 border-b border-ey-border bg-base-200/40">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">Cohérence croisée (tous profils)</span>
            <AuditBadge rep={globalRep} running={globalBusy} />
          </div>
          {!globalBusy ? <Report rep={globalRep} /> : null}
        </div>
      ) : null}

      {rows.map((p) => {
        const rep = audits[p.id];
        const running = Boolean(busy[p.id]);
        const findings = rep && Array.isArray(rep.findings) ? rep.findings.length : 0;
        const expanded = open[p.id];
        return (
          <div key={p.id} className="px-5 py-3.5 border-b border-ey-border last:border-0">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold">{p.label}</span>
                  <span className="text-[11.5px] text-ey-gray02">
                    {answeredByProfile[p.id]} décision{answeredByProfile[p.id] > 1 ? "s" : ""} tranchée{answeredByProfile[p.id] > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <AuditBadge rep={rep} running={running} />
              {rep && !running ? (
                <button className="btn btn-ghost btn-xs" onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}>
                  {expanded ? "Masquer" : "Détails"}
                </button>
              ) : null}
              <button
                className="btn btn-outline btn-xs gap-1"
                onClick={() => runAudit("profile", p.id, p.id)}
                disabled={running}
              >
                {running ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                Contrôler
              </button>
            </div>
            {rep && expanded && !running ? <Report rep={rep} /> : null}
          </div>
        );
      })}
    </Card>
  );
}
