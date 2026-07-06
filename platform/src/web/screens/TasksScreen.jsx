import React, { useState } from "react";
import { ListChecks, Plus, Play, Loader2, X, CheckCircle2, Clock, Layers, Ban, Inbox, ArrowUpCircle } from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState } from "../components/ui.jsx";
import RunConsole from "../components/RunConsole.jsx";

const OPEN = new Set(["todo", "in-progress"]);
const STATUS_META = {
  proposed: { label: "Proposée", color: "#7c3aed", bg: "#F3EEFF" },
  todo: { label: "À faire", color: "#A15C07", bg: "#FFF3DF" },
  "in-progress": { label: "En cours", color: "#155eef", bg: "#EAF0FF" },
  done: { label: "Faite", color: "#168736", bg: "#EAF7EE" },
  cancelled: { label: "Annulée", color: "#747480", bg: "#F2F2F5" }
};

function TaskRow({ t, selectable, selected, onToggle, onStatus }) {
  const sm = STATUS_META[t.status] || STATUS_META.todo;
  const isProposed = t.status === "proposed";
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-5 py-3.5 border-b border-ey-border last:border-0 hover:bg-base-200 transition">
      {selectable ? (
        <input type="checkbox" className="checkbox checkbox-sm" checked={selected} onChange={() => onToggle(t.id)} />
      ) : (
        <span className="w-4" />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-ey-gray02">{t.id}</span>
          <h4 className="m-0 text-[14px] font-semibold truncate">{t.title}</h4>
          {t.priority === "high" ? <span className="text-[10px] font-bold text-[#B42318]">PRIORITAIRE</span> : null}
        </div>
        <p className="m-0 mt-0.5 text-ey-gray01 text-[12.5px] truncate">
          {t.raisedBy ? `${t.raisedBy} → ` : ""}{t.description || "—"}{t.phaseLabel ? ` · ${t.phaseLabel}` : ""}
        </p>
      </div>
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded whitespace-nowrap"
        style={{ background: `${t.targetProfileColor}1a`, color: "#2E2E38" }}
        title="Profil responsable"
      >
        <span className="w-2 h-2 rounded-full" style={{ background: t.targetProfileColor }} />
        {t.targetProfileLabel}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold px-2 py-1 rounded whitespace-nowrap" style={{ color: sm.color, background: sm.bg }}>
          {sm.label}
        </span>
        {isProposed ? (
          <>
            <button className="btn btn-ghost btn-xs gap-1" title="Promouvoir en tâche à faire" onClick={() => onStatus(t.id, "todo")}>
              <ArrowUpCircle size={15} className="text-[#7c3aed]" /> Promouvoir
            </button>
            <button className="btn btn-ghost btn-xs" title="Écarter ce candidat" onClick={() => onStatus(t.id, "cancelled")}><Ban size={14} className="text-ey-gray01" /></button>
          </>
        ) : OPEN.has(t.status) ? (
          <>
            <button className="btn btn-ghost btn-xs" title="Marquer faite" onClick={() => onStatus(t.id, "done")}><CheckCircle2 size={15} className="text-[#168736]" /></button>
            <button className="btn btn-ghost btn-xs" title="Annuler" onClick={() => onStatus(t.id, "cancelled")}><Ban size={14} className="text-ey-gray01" /></button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CreateTaskModal({ profiles, currentProfile, onClose, onCreated }) {
  const [f, setF] = useState({ title: "", description: "", targetProfile: "developpeur", priority: "normal", phaseId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await Api.createTask({ ...f, raisedBy: currentProfile });
      onCreated(res.state);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold m-0">Créer une tâche</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block text-[12.5px] font-semibold mb-1">Titre</label>
        <input className="input input-bordered w-full mb-3" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Reprendre US-030 modifiée" autoFocus />
        <label className="block text-[12.5px] font-semibold mb-1">Description</label>
        <textarea className="textarea textarea-bordered w-full mb-3" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Ce qu'il faut faire, précisément." />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="col-span-1">
            <label className="block text-[12.5px] font-semibold mb-1">Pour le profil</label>
            <select className="select select-bordered select-sm w-full" value={f.targetProfile} onChange={(e) => set("targetProfile", e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold mb-1">Priorité</label>
            <select className="select select-bordered select-sm w-full" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="low">Basse</option>
              <option value="normal">Normale</option>
              <option value="high">Haute</option>
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold mb-1">Étape</label>
            <input className="input input-bordered input-sm w-full" value={f.phaseId} onChange={(e) => set("phaseId", e.target.value)} placeholder="ex. G5" />
          </div>
        </div>
        {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={create} disabled={!f.title.trim() || busy}>
            <Plus size={15} /> {busy ? "Création…" : "Créer la tâche"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TasksScreen({ state, profile, onStateChange }) {
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState([]);

  const tasks = state.tasks || [];
  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return OPEN.has(t.status);
    if (filter === "proposed") return t.status === "proposed";
    return t.status === "done" || t.status === "cancelled"; // "done" tab = terminal
  });
  const selectable = filtered.filter((t) => OPEN.has(t.status));
  const openCount = tasks.filter((t) => OPEN.has(t.status)).length;
  const proposedCount = tasks.filter((t) => t.status === "proposed").length;

  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === selectable.length) setSelected(new Set());
    else setSelected(new Set(selectable.map((t) => t.id)));
  }
  async function setStatus(id, status) {
    try { const res = await Api.setTaskStatus({ id, status, by: profile }); onStateChange(res.state); }
    catch (e) { console.error(e); }
  }
  async function runSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await Api.runTaskBatch([...selected]);
      onStateChange(res.state);
      setLaunched((res.started || []).filter((s) => s.runId).map((s) => ({ runId: s.runId, label: `${s.count} tâche(s) · ${s.agent}` })));
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  // How many distinct profiles are in the selection (→ that many runs).
  const selectedProfiles = new Set(tasks.filter((t) => selected.has(t.id)).map((t) => t.targetProfile));

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Tâches</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            <b>À faire</b> = le plan validé, prêt à lancer. <b>Proposées</b> = les handoffs déposés par les agents,
            en attente de tri : l'orchestrateur (ou vous) les <i>promeut</i> vers l'objectif courant, ou les <i>écarte</i>.
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Créer une tâche
        </button>
      </div>

      <div className="flex items-center gap-3 my-5 flex-wrap">
        <div className="join">
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "open" ? "btn-active" : ""}`} onClick={() => setFilter("open")}>
            <Clock size={14} /> À faire ({openCount})
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "proposed" ? "btn-active" : ""}`} onClick={() => setFilter("proposed")}>
            <Inbox size={14} /> Proposées ({proposedCount})
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "done" ? "btn-active" : ""}`} onClick={() => setFilter("done")}>
            <CheckCircle2 size={14} /> Terminées
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${filter === "all" ? "btn-active" : ""}`} onClick={() => setFilter("all")}>
            <Layers size={14} /> Toutes
          </button>
        </div>
        {selectable.length > 0 ? (
          <button className="btn btn-sm btn-ghost" onClick={toggleAll}>
            {selected.size === selectable.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        ) : null}
        {selected.size > 0 ? (
          <button className="btn btn-primary btn-sm gap-1.5 ml-auto" onClick={runSelected} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Lancer {selected.size} tâche{selected.size > 1 ? "s" : ""}
            {selectedProfiles.size > 1 ? ` (${selectedProfiles.size} agents)` : ""}
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

      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={ListChecks} title="Aucune tâche ici">
            Les actions produites par les agents (« prochaine étape : le dev doit… ») et vos tâches manuelles
            apparaissent ici, routées vers le bon profil, prêtes à être lancées.
          </EmptyState>
        ) : (
          filtered.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              selectable={OPEN.has(t.status)}
              selected={selected.has(t.id)}
              onToggle={toggle}
              onStatus={setStatus}
            />
          ))
        )}
      </Card>

      {showCreate ? (
        <CreateTaskModal
          profiles={state.profiles}
          currentProfile={profile}
          onClose={() => setShowCreate(false)}
          onCreated={(next) => { onStateChange(next); setShowCreate(false); }}
        />
      ) : null}
    </>
  );
}
