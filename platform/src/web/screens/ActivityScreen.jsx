import React, { useEffect, useState } from "react";
import {
  History, RefreshCw, Users, FileText, Clock, Filter, RotateCcw,
  CheckCircle2, XCircle, Loader2, ChevronRight, Layers, MessageSquareWarning
} from "lucide-react";
import { Api } from "../api.js";
import { Card, Stat, EmptyState, GateBadge, Chip } from "../components/ui.jsx";

function fmtUsd(n) {
  const v = n || 0;
  return "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));
}
function fmtNum(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function fmtDuration(ms) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}`;
}
function baseName(p) {
  return String(p || "").split("/").pop();
}

function StatusPill({ status }) {
  const map = {
    done: { c: "#168736", Icon: CheckCircle2, t: "Terminé" },
    error: { c: "#B42318", Icon: XCircle, t: "Erreur" },
    running: { c: "#155EEF", Icon: Loader2, t: "En cours" }
  };
  const s = map[status] || { c: "#747480", Icon: Clock, t: status || "—" };
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: s.c }}>
      <s.Icon size={13} className={status === "running" ? "animate-spin" : ""} /> {s.t}
    </span>
  );
}

function TimelineRow({ item, onOpenDecision }) {
  const dur = fmtDuration(item.durationMs);
  return (
    <div className="flex gap-3 py-3.5 border-b border-ey-border last:border-0">
      {/* profile rail */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.profileColor }} />
        <span className="flex-1 w-px bg-ey-border mt-1" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge badge-sm border-none text-white font-semibold" style={{ background: "#2E2E38" }}>
            {item.kindLabel}
          </span>
          {item.phaseId ? <Chip>{item.phaseLabel}</Chip> : null}
          {item.agent ? <code className="text-[11.5px] bg-transparent" style={{ color: item.profileColor }}>{item.agent}</code> : null}
          {item.profileLabel ? <span className="text-ey-gray01 text-[11.5px]">· {item.profileLabel}</span> : null}
          <span className="ml-auto"><StatusPill status={item.status} /></span>
        </div>

        <p className="text-[13.5px] mt-1.5 mb-0">{item.description}</p>

        {item.producedFiles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.producedFiles.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 text-[11.5px] bg-base-200 border border-ey-border rounded px-1.5 py-0.5" title={f}>
                <FileText size={12} className="text-ey-gray02" /> {baseName(f)}
              </span>
            ))}
          </div>
        ) : null}

        {item.decisions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.decisions.map((d) => (
              <button
                key={d.id}
                className="inline-flex items-center gap-1 text-[11.5px] rounded px-1.5 py-0.5 border"
                style={{ borderColor: "#A15C07", color: "#A15C07", background: "#FFF3DF" }}
                onClick={() => onOpenDecision && onOpenDecision({ id: d.id })}
                title="Ouvrir la décision"
              >
                <MessageSquareWarning size={12} /> {d.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-3 mt-2 text-[11.5px] text-ey-gray01">
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {fmtDate(item.endedAt || item.startedAt)}</span>
          {dur ? <span>· {dur}</span> : null}
          {item.cost > 0 ? <span>· {fmtUsd(item.cost)}</span> : null}
          {item.tokens > 0 ? <span>· {fmtNum(item.tokens)} tk</span> : null}
        </div>
      </div>
    </div>
  );
}

/** Activity not tied to a G0–G7 gate (orchestration, chat/planning, resolutions, app-detect…). */
function OffPhaseCard({ act }) {
  return (
    <Card className="p-5 border-dashed">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold flex items-center gap-1.5">
              <Layers size={16} className="text-ey-gray01" /> Hors étape
            </span>
          </div>
          <div className="text-[12px] text-ey-gray01 mt-1">
            Exécutions non rattachées à une gate : pilotage de l'orchestrateur, échanges/consignes,
            résolutions de décisions, détection du produit…
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-bold leading-none">{act.runCount}</div>
          <div className="text-[11px] text-ey-gray01">exéc.</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">
          <Users size={13} className="text-ey-gray01" /> {act.agents.length ? act.agents.join(", ") : "aucun agent"}
        </span>
        {act.fileCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">
            <FileText size={13} className="text-ey-gray01" /> {act.fileCount} fichier{act.fileCount > 1 ? "s" : ""}
          </span>
        ) : null}
        {act.cost > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">{fmtUsd(act.cost)}</span>
        ) : null}
        {act.lastAt ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-ey-gray01 px-2 py-1">
            <Clock size={12} /> {fmtDate(act.lastAt)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function PhaseCard({ phase, act, decisions, onOpenPhase, onOpenDecision }) {
  const types = (phase.docTypes || []).filter((t) => t.items.length > 0);
  const phaseDecisions = decisions.filter((d) => d.phaseId === phase.id);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button className="text-[15px] font-bold hover:underline flex items-center gap-1" onClick={() => onOpenPhase(phase.id)}>
              {phase.id} · {phase.title} <ChevronRight size={15} className="text-ey-gray01" />
            </button>
            <GateBadge status={phase.gateStatus} />
            <span className="text-ey-gray01 text-[12px]">{phase.gateLabel}</span>
          </div>
          <div className="text-[12px] text-ey-gray01 mt-1">
            <b>Produit&nbsp;:</b> {phase.producers || "—"}
            {phase.reviewer ? <> · <b>Revue&nbsp;:</b> {phase.reviewer}</> : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-bold leading-none">{act.runCount}</div>
          <div className="text-[11px] text-ey-gray01">exéc.</div>
        </div>
      </div>

      {/* runtime activity metrics */}
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">
          <Users size={13} className="text-ey-gray01" /> {act.agents.length ? act.agents.join(", ") : "aucun agent lancé"}
        </span>
        <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">
          <FileText size={13} className="text-ey-gray01" /> {phase.docCount} livrable{phase.docCount > 1 ? "s" : ""}
        </span>
        {act.cost > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12px] bg-base-200 rounded px-2 py-1">{fmtUsd(act.cost)}</span>
        ) : null}
        {act.lastAt ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-ey-gray01 px-2 py-1">
            <Clock size={12} /> {fmtDate(act.lastAt)}
          </span>
        ) : null}
      </div>

      {/* phase-specific deliverable typology */}
      {types.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ey-gray01 mb-1.5">Données de l'étape</div>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <span key={t.key} className="inline-flex items-center gap-1.5 text-[12px] border border-ey-border rounded-full px-2.5 py-1">
                <span className="font-semibold">{t.label}</span>
                <span className="bg-ey-yellow text-ey-black rounded-full px-1.5 text-[11px] font-bold">{t.items.length}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* decisions raised in this phase */}
      {phaseDecisions.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ey-gray01 mb-1.5">
            Décisions ({phaseDecisions.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {phaseDecisions.slice(0, 6).map((d) => (
              <button
                key={d.id}
                className="inline-flex items-center gap-1 text-[11.5px] rounded px-1.5 py-0.5 border"
                style={{
                  borderColor: d.status === "pending" ? "#A15C07" : "#D7D7DC",
                  color: d.status === "pending" ? "#A15C07" : "#2E2E38",
                  background: d.status === "pending" ? "#FFF3DF" : "#fff"
                }}
                onClick={() => onOpenDecision && onOpenDecision({ id: d.id })}
              >
                <MessageSquareWarning size={12} /> {d.title || d.question || "Décision"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const STATUS_LABELS = { done: "Terminé", error: "Erreur", running: "En cours" };

export default function ActivityScreen({ state, onOpenPhase, onOpenDecision }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("timeline");
  const [filters, setFilters] = useState({ phase: "", agent: "", kind: "", status: "" });

  function load() {
    Api.getActivity().then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert alert-error text-sm">{error}</div>;

  const s = data?.summary;
  const byPhaseMap = Object.fromEntries((data?.byPhase || []).map((p) => [p.phaseId, p]));
  const decisions = state?.decisions || [];

  // Filter options derived from the loaded timeline.
  const timelineAll = data?.timeline || [];
  const phaseOpts = [...new Map(timelineAll.filter((t) => t.phaseId).map((t) => [t.phaseId, t.phaseLabel])).entries()];
  const agentOpts = [...new Set(timelineAll.map((t) => t.agent).filter(Boolean))];
  const kindOpts = [...new Map(timelineAll.filter((t) => t.kind).map((t) => [t.kind, t.kindLabel])).entries()];
  const statusOpts = [...new Set(timelineAll.map((t) => t.status).filter(Boolean))];
  const filtered = timelineAll.filter(
    (t) =>
      (!filters.phase || t.phaseId === filters.phase) &&
      (!filters.agent || t.agent === filters.agent) &&
      (!filters.kind || t.kind === filters.kind) &&
      (!filters.status || t.status === filters.status)
  );
  const anyFilter = filters.phase || filters.agent || filters.kind || filters.status;
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleAgent = (a) => setFilters((f) => ({ ...f, agent: f.agent === a ? "" : a }));
  const resetFilters = () => setFilters({ phase: "", agent: "", kind: "", status: "" });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Activité</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            Tout ce qui a été fait&nbsp;: chaque agent appelé, ce qu'il a produit, et le détail par étape.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={load}>
          <RefreshCw size={15} /> Rafraîchir
        </button>
      </div>

      {!data ? (
        <p className="text-ey-gray01 mt-5">Chargement…</p>
      ) : s.totalRuns === 0 ? (
        <Card className="mt-5">
          <EmptyState icon={History} title="Aucune activité pour le moment">
            L'historique se remplit dès qu'un agent est lancé (cadrage, production, revue…). Chaque
            exécution y apparaîtra avec ce qu'elle a produit.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Stat accent num={s.totalRuns} label="Exécutions d'agents" />
            <Stat num={s.agentsInvolved} label="Agents impliqués" />
            <Stat num={s.filesProduced} label="Livrables produits" />
            <Stat num={fmtUsd(s.totalCost)} label="Coût cumulé" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5 bg-base-200 p-1 rounded-lg w-fit">
            <button
              className={`btn btn-sm border-none gap-1.5 ${tab === "timeline" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("timeline")}
            >
              <History size={15} /> Chronologie
            </button>
            <button
              className={`btn btn-sm border-none gap-1.5 ${tab === "phase" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("phase")}
            >
              <Layers size={15} /> Par étape / gate
            </button>
          </div>

          {tab === "timeline" ? (
            <>
              {/* Agent roster */}
              <Card className="p-5 mt-4">
                <h3 className="text-[14px] font-bold m-0 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-ey-gray01" /> Agents appelés
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.byAgent.map((a) => {
                    const active = filters.agent === a.agent;
                    return (
                      <button
                        key={a.agent}
                        onClick={() => toggleAgent(a.agent)}
                        title={active ? "Retirer le filtre" : "Filtrer sur cet agent"}
                        className={`flex items-center gap-2.5 border rounded-lg px-3 py-2 text-left transition ${active ? "border-ey-yellow bg-[#FFFBEA]" : "border-ey-border hover:bg-base-200"}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.profileColor }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-semibold truncate">{a.agent}</div>
                          <div className="text-[11px] text-ey-gray01 truncate">{a.profileLabel || "—"}</div>
                        </div>
                        <div className="text-right text-[11px] text-ey-gray01 shrink-0">
                          <div><b className="text-ey-black">{a.runs}</b> run{a.runs > 1 ? "s" : ""}</div>
                          <div>{a.files} fichier{a.files > 1 ? "s" : ""} · {fmtUsd(a.cost)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Timeline */}
              <Card className="p-5 mt-4">
                <h3 className="text-[14px] font-bold m-0 mb-2 flex items-center gap-2">
                  <History size={16} className="text-ey-gray01" /> Chronologie des exécutions
                </h3>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Filter size={15} className="text-ey-gray01" />
                  <select className="select select-bordered select-sm text-[12.5px]" value={filters.phase} onChange={(e) => setFilter("phase", e.target.value)}>
                    <option value="">Toutes les étapes</option>
                    {phaseOpts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <select className="select select-bordered select-sm text-[12.5px]" value={filters.agent} onChange={(e) => setFilter("agent", e.target.value)}>
                    <option value="">Tous les agents</option>
                    {agentOpts.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select className="select select-bordered select-sm text-[12.5px]" value={filters.kind} onChange={(e) => setFilter("kind", e.target.value)}>
                    <option value="">Tous les types</option>
                    {kindOpts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <select className="select select-bordered select-sm text-[12.5px]" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                    <option value="">Tous les statuts</option>
                    {statusOpts.map((st) => <option key={st} value={st}>{STATUS_LABELS[st] || st}</option>)}
                  </select>
                  {anyFilter ? (
                    <button className="btn btn-ghost btn-sm gap-1.5" onClick={resetFilters}>
                      <RotateCcw size={14} /> Réinitialiser
                    </button>
                  ) : null}
                  <span className="ml-auto text-[12px] text-ey-gray01">
                    {filtered.length} / {timelineAll.length} exécution{timelineAll.length > 1 ? "s" : ""}
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <p className="text-ey-gray01 text-[13px] py-4 text-center">Aucune exécution ne correspond à ces filtres.</p>
                ) : (
                  <div>
                    {filtered.map((item) => (
                      <TimelineRow key={item.id} item={item} onOpenDecision={onOpenDecision} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 mt-4">
              {(state?.phases || []).map((phase) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  act={byPhaseMap[phase.id] || { runCount: 0, cost: 0, agents: [], fileCount: 0, decisionCount: 0, lastAt: null }}
                  decisions={decisions}
                  onOpenPhase={onOpenPhase}
                  onOpenDecision={onOpenDecision}
                />
              ))}
              {byPhaseMap["—"] && byPhaseMap["—"].runCount > 0 ? (
                <OffPhaseCard act={byPhaseMap["—"]} />
              ) : null}
            </div>
          )}
        </>
      )}
    </>
  );
}
