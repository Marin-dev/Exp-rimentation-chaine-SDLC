import React, { useState } from "react";
import { ShieldAlert, Plus, Sparkles, ShieldCheck, Layers, X, Loader2 } from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState } from "../components/ui.jsx";
import RunConsole from "../components/RunConsole.jsx";
import { STATUS_META, SEVERITY_META } from "../components/RiskDetailModal.jsx";

const OPEN = new Set(["open", "mitigating"]);

function RiskRow({ r, onOpen, selectable, selected, onToggle }) {
  const sm = STATUS_META[r.status] || STATUS_META.open;
  const sev = SEVERITY_META[r.severity] || SEVERITY_META.medium;
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center px-5 py-4 border-b border-ey-border last:border-0 hover:bg-base-200 transition">
      {selectable ? (
        <input type="checkbox" className="checkbox checkbox-sm" checked={selected} onChange={() => onToggle(r.id)} />
      ) : (
        <span className="w-4" />
      )}
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sev.color }} title={`Sévérité : ${sev.label}`} />
      <button onClick={() => onOpen(r)} className="contents text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-ey-gray02">{r.id}</span>
            <h4 className="m-0 text-[14px] font-semibold truncate">{r.title}</h4>
          </div>
          <p className="m-0 mt-0.5 text-ey-gray01 text-[12.5px] truncate">
            {r.owner ? `${r.owner} · ` : ""}{r.gate || r.phaseLabel || "—"}{r.mitigation ? ` · ${r.mitigation}` : ""}
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-1 rounded whitespace-nowrap" style={{ color: sm.color, background: sm.bg }}>
          {sm.label}
        </span>
      </button>
    </div>
  );
}

function CreateRiskModal({ profile, onClose, onCreated }) {
  const [f, setF] = useState({ title: "", description: "", severity: "medium", phaseId: "", owner: "", mitigation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.createRisk({ ...f, raisedBy: profile });
      onCreated(res.state);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold m-0">Ajouter un risque</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block text-[12.5px] font-semibold mb-1">Titre</label>
        <input className="input input-bordered w-full mb-3" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Front non exécuté" autoFocus />
        <label className="block text-[12.5px] font-semibold mb-1">Description</label>
        <textarea className="textarea textarea-bordered w-full mb-3" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="En quoi consiste le risque et son impact." />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12.5px] font-semibold mb-1">Sévérité</label>
            <select className="select select-bordered select-sm w-full" value={f.severity} onChange={(e) => set("severity", e.target.value)}>
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
              <option value="critical">Critique</option>
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold mb-1">Phase / Gate</label>
            <input className="input input-bordered input-sm w-full" value={f.phaseId} onChange={(e) => set("phaseId", e.target.value)} placeholder="ex. G5" />
          </div>
        </div>
        <label className="block text-[12.5px] font-semibold mb-1">Propriétaire</label>
        <input className="input input-bordered input-sm w-full mb-3" value={f.owner} onChange={(e) => set("owner", e.target.value)} placeholder="ex. @developpeur" />
        <label className="block text-[12.5px] font-semibold mb-1">Mitigation / prochaine action</label>
        <input className="input input-bordered input-sm w-full mb-4" value={f.mitigation} onChange={(e) => set("mitigation", e.target.value)} placeholder="ex. monter le scaffold front" />
        {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={create} disabled={!f.title.trim() || busy}>
            <Plus size={15} /> {busy ? "Création…" : "Créer le risque"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RisksScreen({ state, profile, onOpenRisk, onStateChange }) {
  const [filter, setFilter] = useState("open");
  const [showCreate, setShowCreate] = useState(false);
  const [seedRunId, setSeedRunId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState([]);

  const risks = state.risks || [];
  const filtered = risks.filter((r) => {
    if (filter === "all") return true;
    if (filter === "open") return OPEN.has(r.status);
    return !OPEN.has(r.status); // "treated"
  });
  const openCount = risks.filter((r) => OPEN.has(r.status)).length;
  const selectable = filtered.filter((r) => OPEN.has(r.status));
  const selectedAgents = new Set(risks.filter((r) => selected.has(r.id)).map((r) => (String(r.owner || "").match(/@[\w-]+/) || ["?"])[0]));

  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === selectable.length) setSelected(new Set());
    else setSelected(new Set(selectable.map((r) => r.id)));
  }
  async function treatSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await Api.resolveRisksBatch([...selected]);
      onStateChange(res.state);
      setLaunched((res.started || []).filter((s) => s.runId).map((s) => ({ runId: s.runId, label: `${s.count} risque(s) · ${s.agent}` })));
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      const r = await Api.seedRisks();
      setSeedRunId(r.runId);
    } catch {
      setSeeding(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Risques</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            Registre historisé des risques du projet : suivi, propriétaire, statut, résolution.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm gap-1.5" onClick={seed} disabled={seeding}>
            {seeding ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Amorcer depuis les livrables
          </button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Ajouter un risque
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 my-5 flex-wrap">
        <div className="join">
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "open" ? "btn-active" : ""}`} onClick={() => setFilter("open")}>
            <ShieldAlert size={14} /> Actifs ({openCount})
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "treated" ? "btn-active" : ""}`} onClick={() => setFilter("treated")}>
            <ShieldCheck size={14} /> Traités
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "all" ? "btn-active" : ""}`} onClick={() => setFilter("all")}>
            <Layers size={14} /> Tous
          </button>
        </div>
        {selectable.length > 0 ? (
          <button className="btn btn-sm btn-ghost" onClick={toggleAll}>
            {selected.size === selectable.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        ) : null}
        {selected.size > 0 ? (
          <button className="btn btn-primary btn-sm gap-1.5 ml-auto" onClick={treatSelected} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            Traiter {selected.size} risque{selected.size > 1 ? "s" : ""}
            {selectedAgents.size > 1 ? ` (${selectedAgents.size} experts)` : ""}
          </button>
        ) : null}
      </div>

      {launched.length ? (
        <div className="mb-5 flex flex-col gap-3">
          {launched.map((l, i) => (
            <RunConsole key={i} runId={l.runId} label={l.label} onDone={() => Api.getState().then(onStateChange).catch(() => {})} />
          ))}
        </div>
      ) : null}

      {seedRunId ? (
        <div className="mb-5">
          <RunConsole
            runId={seedRunId}
            label="Amorçage du registre · @qa"
            onDone={() => { setSeeding(false); Api.getState().then(onStateChange).catch(() => {}); }}
          />
        </div>
      ) : null}

      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Aucun risque ici">
            Les risques posés par les revues (PASS_WITH_RISK, points bloquants) apparaissent ici.
            Utilisez « Amorcer depuis les livrables » pour recenser ceux déjà identifiés.
          </EmptyState>
        ) : (
          filtered.map((r) => (
            <RiskRow key={r.id} r={r} onOpen={onOpenRisk} selectable={OPEN.has(r.status)} selected={selected.has(r.id)} onToggle={toggle} />
          ))
        )}
      </Card>

      {showCreate ? (
        <CreateRiskModal
          profile={profile}
          onClose={() => setShowCreate(false)}
          onCreated={(next) => { onStateChange(next); setShowCreate(false); }}
        />
      ) : null}
    </>
  );
}
