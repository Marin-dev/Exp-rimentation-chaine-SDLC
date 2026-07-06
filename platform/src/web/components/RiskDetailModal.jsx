import React, { useState } from "react";
import { X, ShieldAlert, Clock, Wrench, CheckCircle2, ShieldCheck, Archive, RotateCcw, Bot, Loader2 } from "lucide-react";
import { Api } from "../api.js";
import { useEscToClose } from "./ui.jsx";
import RunConsole from "./RunConsole.jsx";

export const STATUS_META = {
  open: { label: "Identifié", color: "#B42318", bg: "#FDEBEA" },
  mitigating: { label: "En traitement", color: "#A15C07", bg: "#FFF3DF" },
  resolved: { label: "Résolu", color: "#168736", bg: "#EAF7EE" },
  accepted: { label: "Accepté", color: "#5A5A66", bg: "#F2F2F5" },
  closed: { label: "Clôturé", color: "#747480", bg: "#F2F2F5" }
};
export const SEVERITY_META = {
  critical: { label: "Critique", color: "#B42318" },
  high: { label: "Élevé", color: "#A15C07" },
  medium: { label: "Moyen", color: "#8A6D00" },
  low: { label: "Faible", color: "#747480" }
};

// The status transitions offered, given the current status.
const ACTIONS = [
  { to: "mitigating", label: "Prendre en charge", Icon: Wrench, when: (s) => s === "open" },
  { to: "resolved", label: "Marquer résolu", Icon: CheckCircle2, when: (s) => s !== "resolved" && s !== "closed" },
  { to: "accepted", label: "Accepter le risque", Icon: ShieldCheck, when: (s) => s !== "accepted" && s !== "closed" },
  { to: "closed", label: "Clôturer", Icon: Archive, when: (s) => s !== "closed" },
  { to: "open", label: "Rouvrir", Icon: RotateCcw, when: (s) => s === "resolved" || s === "accepted" || s === "closed" }
];

export default function RiskDetailModal({ risk, profile, onClose, onStateChange }) {
  useEscToClose(onClose);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [runId, setRunId] = useState(null);

  const sm = STATUS_META[risk.status] || STATUS_META.open;
  const sev = SEVERITY_META[risk.severity] || SEVERITY_META.medium;

  async function treatViaAgent() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.resolveRiskViaAgent(risk.id);
      if (res.state) onStateChange(res.state);
      setRunId(res.runId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function move(to) {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.setRiskStatus({ id: risk.id, status: to, note: note.trim(), by: profile });
      onStateChange(res.state);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={risk.title}
        className="bg-base-100 rounded-lg shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-ey-border">
          <ShieldAlert size={20} className="shrink-0 mt-0.5" style={{ color: sev.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-ey-gray02">{risk.id}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ color: sm.color, background: sm.bg }}>{sm.label}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border" style={{ color: sev.color, borderColor: `${sev.color}55` }}>Sévérité : {sev.label}</span>
            </div>
            <h3 className="m-0 mt-1 text-[16px] font-bold">{risk.title}</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] mb-4">
            {risk.phaseLabel || risk.gate ? <div><span className="text-ey-gray01">Origine :</span> <b>{risk.gate || risk.phaseLabel}</b></div> : null}
            {risk.owner ? <div><span className="text-ey-gray01">Propriétaire :</span> <b>{risk.owner}</b></div> : null}
            {risk.raisedBy ? <div><span className="text-ey-gray01">Identifié par :</span> {risk.raisedBy}</div> : null}
            <div><span className="text-ey-gray01">Mis à jour :</span> {(risk.updatedAt || "").slice(0, 16).replace("T", " ")}</div>
          </div>

          {risk.description ? (
            <>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ey-gray01 mb-1">Description</div>
              <p className="text-[13.5px] mt-0 mb-4 whitespace-pre-wrap">{risk.description}</p>
            </>
          ) : null}

          {risk.mitigation ? (
            <>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ey-gray01 mb-1">Mitigation / prochaine action</div>
              <p className="text-[13.5px] mt-0 mb-4 whitespace-pre-wrap">{risk.mitigation}</p>
            </>
          ) : null}

          {/* History timeline */}
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ey-gray01 mb-2">Historique</div>
          <ol className="m-0 mb-4 p-0 list-none border-l-2 border-ey-border pl-4">
            {(risk.history || []).map((h, i) => {
              const to = STATUS_META[h.to] || { label: h.to, color: "#747480" };
              return (
                <li key={i} className="relative mb-3 last:mb-0">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full" style={{ background: to.color }} />
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <Clock size={12} className="text-ey-gray02" />
                    <span className="text-ey-gray02">{(h.at || "").slice(0, 16).replace("T", " ")}</span>
                    <span className="font-semibold" style={{ color: to.color }}>{to.label}</span>
                    <span className="text-ey-gray01">· {h.by}</span>
                  </div>
                  {h.note ? <p className="m-0 mt-0.5 text-[12.5px] text-ey-gray01">{h.note}</p> : null}
                </li>
              );
            })}
          </ol>

          {/* Treat via the owner (specialist) agent */}
          <div className="border-t border-ey-border pt-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[12.5px] text-ey-gray01">
                <b className="text-ey-black">Faire traiter par le spécialiste.</b> L'agent {risk.owner || "propriétaire"} applique
                une mitigation dans ses livrables, met à jour ce risque, et ouvre une décision routée vers le
                demandeur ({risk.raisedBy || "?"}) s'il a besoin d'un arbitrage — c'est le dialogue spécialiste ↔ demandeur.
              </div>
              <button className="btn btn-primary btn-sm gap-1.5 shrink-0" onClick={treatViaAgent} disabled={busy || Boolean(runId)}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />} Confier à {risk.owner || "l'agent"}
              </button>
            </div>
            {error && !runId ? <div className="alert alert-error text-sm mt-3">{error}</div> : null}
            {runId ? (
              <div className="mt-3">
                <RunConsole
                  runId={runId}
                  label={`Traitement ${risk.id} · ${risk.owner || "agent"}`}
                  onDone={() => Api.getState().then(onStateChange).catch(() => {})}
                />
              </div>
            ) : null}
          </div>

          {/* Status actions */}
          <div className="border-t border-ey-border pt-4">
            <label className="block text-[12px] font-semibold mb-1">Note (facultative, jointe au changement)</label>
            <textarea
              className="textarea textarea-bordered w-full text-[13px] mb-3"
              rows={2}
              placeholder="ex. mitigation appliquée, décision de report tracée, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}
            <div className="flex flex-wrap gap-2">
              {ACTIONS.filter((a) => a.when(risk.status)).map((a) => (
                <button key={a.to} className="btn btn-outline btn-sm gap-1.5" onClick={() => move(a.to)} disabled={busy}>
                  <a.Icon size={15} /> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
