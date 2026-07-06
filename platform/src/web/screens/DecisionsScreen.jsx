import React, { useState } from "react";
import { Plus, ClipboardList, CheckCircle2, CheckCheck, Clock, Hourglass, HelpCircle, Scale, RotateCcw, Loader2 } from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState } from "../components/ui.jsx";
import BulkBar from "../components/BulkBar.jsx";
import DecisionsControl from "../components/DecisionsControl.jsx";
import RunConsole from "../components/RunConsole.jsx";

function DecisionRow({ d, onOpen, selectable, selected, onToggle }) {
  const applied = d.status === "applied";
  const answered = d.status === "answered";
  const decided = applied || answered;
  const TypeIcon = d.type === "question" ? HelpCircle : Scale;
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center px-5 py-4 border-b border-ey-border last:border-0 hover:bg-base-200 transition">
      {selectable ? (
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={selected}
          onChange={() => onToggle(d.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="w-4" />
      )}
      <button onClick={() => onOpen(d)} className="contents text-left">
        {applied ? (
          <CheckCheck size={18} className="text-[#168736]" />
        ) : answered ? (
          <Hourglass size={17} className="text-[#A15C07]" />
        ) : (
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
            style={
              d.severity === "high"
                ? { color: "#B42318", background: "#FDEBEA" }
                : { color: "#A15C07", background: "#FFF3DF" }
            }
          >
            {d.severity === "high" ? "Important" : "À décider"}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TypeIcon size={14} className="text-ey-gray02" />
            <span className="text-[11px] font-mono text-ey-gray02">{d.id}</span>
            <h4 className="m-0 text-[14px] font-semibold truncate">{d.title}</h4>
            {decided ? (
              <span
                className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                style={applied ? { color: "#168736", background: "#EAF7EE" } : { color: "#A15C07", background: "#FFF3DF" }}
              >
                {applied ? "Prise en compte" : "Répondu — à intégrer"}
              </span>
            ) : null}
          </div>
          <p className="m-0 mt-0.5 text-ey-gray01 text-[12.5px] truncate">
            {decided
              ? `Réponse : ${d.answer?.choiceLabel || "—"}`
              : d.reopenReason
                ? `↩︎ ${d.reopenReason}`
                : d.summary || "—"}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded whitespace-nowrap"
          style={{ background: `${d.targetProfileColor}1a`, color: "#2E2E38" }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: d.targetProfileColor }} />
          {d.targetProfileLabel}
        </span>
      </button>
    </div>
  );
}

export default function DecisionsScreen({ state, profile, onOpenDecision, onRequestCreate, onBulkDone, onStateChange }) {
  const me = state.profiles.find((p) => p.id === profile) || state.profiles[0];
  const [scope, setScope] = useState("mine");
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [launched, setLaunched] = useState([]);

  const filtered = state.decisions.filter((d) => {
    if (scope === "mine" && !me.seesAll && d.targetProfile !== me.id) return false;
    if (status !== "all" && d.status !== status) return false;
    return true;
  });
  // Pending → bulk auto-answer ; Answered (not applied) → batch integration.
  const selectable = filtered.filter((d) => d.status === "pending" || d.status === "answered");
  const byId = new Map(state.decisions.map((d) => [d.id, d]));
  const selPending = [...selected].filter((id) => byId.get(id)?.status === "pending");
  const selAnswered = [...selected].filter((id) => byId.get(id)?.status === "answered");

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === selectable.length) setSelected(new Set());
    else setSelected(new Set(selectable.map((d) => d.id)));
  }

  async function handleAuto() {
    if (!selPending.length) return;
    setBusy(true);
    try {
      const res = await Api.answerItemsAuto(selPending, profile);
      setSelected(new Set());
      onBulkDone(res.state, res.resumableRuns);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function integrate() {
    if (!selAnswered.length) return;
    setIntegrating(true);
    try {
      const res = await Api.integrateDecisions(selAnswered);
      onStateChange(res.state);
      setLaunched((res.started || []).filter((s) => s.runId).map((s) => ({ runId: s.runId, label: `Intégration ${s.count} décision(s) · ${s.agent}` })));
      setSelected(new Set());
    } finally {
      setIntegrating(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Décisions</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            Les questions et choix produits par l'IA qui attendent une réponse humaine.
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={onRequestCreate}>
          <Plus size={15} /> Demander une décision
        </button>
      </div>

      <div className="flex items-center gap-4 my-5 flex-wrap">
        <div className="join">
          <button className={`btn btn-sm join-item ${scope === "mine" ? "btn-active" : ""}`} onClick={() => setScope("mine")}>
            Pour moi
          </button>
          <button className={`btn btn-sm join-item ${scope === "all" ? "btn-active" : ""}`} onClick={() => setScope("all")}>
            Toutes
          </button>
        </div>
        <div className="join">
          <button className={`btn btn-sm join-item gap-1.5 ${status === "pending" ? "btn-active" : ""}`} onClick={() => setStatus("pending")}>
            <Clock size={14} /> En attente
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${status === "answered" ? "btn-active" : ""}`} onClick={() => setStatus("answered")}>
            <Hourglass size={14} /> Répondues
          </button>
          <button className={`btn btn-sm join-item gap-1.5 ${status === "applied" ? "btn-active" : ""}`} onClick={() => setStatus("applied")}>
            <CheckCheck size={14} /> Prises en compte
          </button>
          <button className={`btn btn-sm join-item ${status === "all" ? "btn-active" : ""}`} onClick={() => setStatus("all")}>
            Toutes
          </button>
        </div>
        {selectable.length > 0 ? (
          <button className="btn btn-sm btn-ghost ml-auto" onClick={toggleAll}>
            {selected.size === selectable.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        ) : null}
        {selAnswered.length > 0 ? (
          <button className={`btn btn-primary btn-sm gap-1.5 ${selectable.length > 0 ? "" : "ml-auto"}`} onClick={integrate} disabled={integrating}>
            {integrating ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Intégrer {selAnswered.length} décision{selAnswered.length > 1 ? "s" : ""}
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
          <EmptyState icon={ClipboardList} title="Aucune décision ici">
            Quand l'IA produit une question ou un choix structurant, il apparaît dans cette liste,
            routé vers le bon profil.
          </EmptyState>
        ) : (
          filtered.map((d) => (
            <DecisionRow
              key={d.id}
              d={d}
              onOpen={onOpenDecision}
              selectable={d.status === "pending" || d.status === "answered"}
              selected={selected.has(d.id)}
              onToggle={toggle}
            />
          ))
        )}
      </Card>

      <DecisionsControl state={state} onStateChange={onStateChange} />

      <BulkBar count={selPending.length} busy={busy} onAuto={handleAuto} onClear={() => setSelected(new Set())} />
    </>
  );
}
