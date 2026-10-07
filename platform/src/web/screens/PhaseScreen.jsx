import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  FileText,
  ChevronDown,
  ChevronRight,
  Rocket,
  RefreshCw,
  Play,
  HelpCircle,
  Scale
} from "lucide-react";
import { ClipboardCheck, MessageCircle, Wand2, ListChecks } from "lucide-react";

/** Open tasks routed to a profile that are attached to this phase (gate integration). */
function PhaseTasks({ phaseId, tasks, onNavigate }) {
  const open = (tasks || []).filter((t) => t.phaseId === phaseId && (t.status === "todo" || t.status === "in-progress"));
  if (!open.length) return null;
  return (
    <div className="mt-7">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <ListChecks size={17} className="text-ey-gray01" /> Tâches de cette étape ({open.length})
        </h3>
        <button className="btn btn-ghost btn-xs gap-1" onClick={() => onNavigate("tasks")}>
          Gérer <ArrowRight size={13} />
        </button>
      </div>
      <div className="border border-ey-border rounded-lg overflow-hidden">
        {open.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-ey-border last:border-0">
            <span className="text-[11px] font-mono text-ey-gray02">{t.id}</span>
            <span className="text-[13px] font-medium flex-1 truncate">{t.title}</span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] px-2 py-0.5 rounded whitespace-nowrap"
              style={{ background: `${t.targetProfileColor}1a`, color: "#2E2E38" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: t.targetProfileColor }} />
              {t.targetProfileLabel}
            </span>
            <span className="text-[11px] text-ey-gray01">{t.status === "in-progress" ? "En cours" : "À faire"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
import { Api } from "../api.js";
import { Card, GateBadge, EmptyState } from "../components/ui.jsx";
import BulkBar from "../components/BulkBar.jsx";
import RunConsole from "../components/RunConsole.jsx";
import DocViewerModal from "../components/DocViewerModal.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import DocTypeTabs from "../components/DocTypeTabs.jsx";
import RunNextSteps from "../components/RunNextSteps.jsx";
import ParallelRunView from "../components/ParallelRunView.jsx";
import PhaseInputs from "../components/PhaseInputs.jsx";
import SupportsPanel from "../components/SupportsPanel.jsx";
import UsReport from "../components/UsReport.jsx";

function ItemRow({ d, onOpen, selectable, selected, onToggle }) {
  const Icon = d.type === "question" ? HelpCircle : Scale;
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center px-4 py-3 border border-ey-border rounded-md w-full hover:border-ey-gray02 hover:bg-base-200 transition">
      {selectable ? (
        <input type="checkbox" className="checkbox checkbox-sm" checked={selected} onChange={() => onToggle(d.id)} />
      ) : (
        <span className="w-4" />
      )}
      <button onClick={() => onOpen(d)} className="contents text-left">
        <Icon size={18} className="text-ey-gray01" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-ey-gray02">{d.id}</span>
            <span className="text-[14px] font-semibold truncate">{d.title}</span>
          </div>
          {d.summary ? <p className="m-0 text-[12.5px] text-ey-gray01 truncate">{d.summary}</p> : null}
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

function DocItem({ doc, feedbackCount, onOpen }) {
  return (
    <button
      className="flex items-center gap-2 w-full text-left px-3 py-2.5 border border-ey-border rounded-md hover:border-ey-gray02 hover:bg-base-200 transition"
      onClick={() => onOpen(doc)}
    >
      <FileText size={15} className="text-ey-gray01" />
      <span className="text-[13.5px] font-medium flex-1 truncate">{doc.title}</span>
      {feedbackCount > 0 ? (
        <span className="badge badge-sm" style={{ background: "#FFF3DF", color: "#A15C07", border: "none" }}>
          {feedbackCount} retour{feedbackCount > 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="text-[11px] text-ey-gray02">{doc.name}</span>
    </button>
  );
}

export default function PhaseScreen({
  state,
  phaseId,
  profile,
  activeRun,
  activeGroup,
  active,
  onOpenDecision,
  onResume,
  onLaunchPhase,
  onLaunchParallel,
  onLaunchDevBatches,
  onLaunchReview,
  onGenerateSupport,
  onRemediateRisks,
  onNavigate,
  onGoPhase,
  onBack,
  onBulkDone,
  onStateRefresh,
  onStateChange,
  onStartImpact
}) {
  const idx = state.phases.findIndex((p) => p.id === phaseId);
  const phase = state.phases[idx];
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [openDoc, setOpenDoc] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatSeed, setChatSeed] = useState(null);
  const [runDone, setRunDone] = useState(false);
  // Prefer the freshly-launched run/group; otherwise recover any run still running
  // for this phase (server-side), so a page refresh doesn't hide live work.
  const liveGroup = activeGroup || (active?.groups || []).find((g) => g.phaseId === phaseId) || null;
  const liveRun = activeRun || (active?.runs || []).find((r) => r.phaseId === phaseId && r.kind !== "parallel") || null;
  useEffect(() => { setRunDone(false); }, [(liveRun && liveRun.id) || (liveGroup && liveGroup.groupId) || null]);
  if (!phase) return null;

  function runConsigne(text) {
    setShowChat(true);
    setChatSeed({ text, nonce: (chatSeed?.nonce || 0) + 1 });
  }
  function launch() {
    if (phase.parallel) onLaunchParallel(phaseId);
    else onLaunchPhase(phaseId);
  }

  const profileObj = state.profiles.find((p) => p.id === profile);
  const feedbackFor = (p) => (state.feedback || []).filter((f) => f.path === p).length;

  const prevPhase = idx > 0 ? state.phases[idx - 1] : null;
  const nextPhase = idx < state.phases.length - 1 ? state.phases[idx + 1] : null;
  const passed = (s) => s === "PASS" || s === "PASS_WITH_RISK";
  const prevDone = !prevPhase || passed(prevPhase.gateStatus);

  const items = state.decisions.filter((d) => d.phaseId === phaseId);
  const pending = items.filter((d) => d.status === "pending");
  const answered = items.filter((d) => d.status === "answered");
  const docCount = (phase.docTypes || []).reduce((s, t) => s + t.items.length, 0);

  const runIds = [...new Set(items.map((d) => d.runId).filter(Boolean))];
  const relaunchRun = runIds.find((rid) => {
    const its = items.filter((d) => d.runId === rid);
    return its.length > 0 && its.every((d) => d.status === "answered");
  });
  const blocked = pending.length > 0;
  const isG0 = phaseId === "G0";
  const isG5 = phaseId === "G5";
  const gatePassed = passed(phase.gateStatus);
  const withRisk = phase.gateStatus === "PASS_WITH_RISK";
  const isFail = phase.gateStatus === "FAIL";
  const notStarted = !blocked && !relaunchRun && !gatePassed;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  async function handleAuto() {
    setBusy(true);
    try {
      const res = await Api.answerItemsAuto([...selected], profile);
      setSelected(new Set());
      onBulkDone(res.state, res.resumableRuns);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const launchLabel =
    (docCount > 0 || answered.length > 0 ? "Faire avancer l'étape" : "Lancer cette étape") +
    (phase.parallel ? " (en parallèle)" : "");

  return (
    <>
      <button className="btn btn-ghost btn-sm gap-1.5 mb-3 -ml-2" onClick={onBack}>
        <ArrowLeft size={15} /> Avancement
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">
            {phase.id} · {phase.title}
          </h2>
          <p className="text-ey-gray01 mt-1 mb-0 max-w-2xl">{phase.goal || phase.plain}</p>
          {phase.agents ? (
            <p className="text-ey-gray02 text-[12.5px] mt-1 mb-0">Agents : {phase.agents}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <GateBadge status={phase.gateStatus} />
          {phase.gateFile ? (
            <button
              className="text-[12px] text-accent hover:underline flex items-center gap-1"
              onClick={() =>
                setOpenDoc({
                  path: `livrables/_governance/gates/${phase.gateFile}`,
                  title: `Rapport de validation ${phase.id}`,
                  name: phase.gateFile,
                  phaseId
                })
              }
            >
              <FileText size={13} /> Voir le rapport
            </button>
          ) : null}
        </div>
      </div>

      {/* Gate FAIL ou PASS_WITH_RISK : proposer de corriger, pas seulement d'avancer/relancer */}
      {(withRisk || isFail) && !liveRun && !liveGroup && onRemediateRisks ? (
        <div
          className="mt-4 flex items-start gap-3 rounded-lg border px-4 py-3"
          style={isFail ? { borderColor: "#F0A9A0", background: "#FDEBEA" } : { borderColor: "#F0C27A", background: "#FFF3DF" }}
        >
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: isFail ? "#B42318" : "#A15C07" }} />
          <div className="flex-1 text-[13.5px]">
            {isFail ? (
              <>
                <b style={{ color: "#B42318" }}>Bloqué.</b> La revue a refusé cette étape. Vous pouvez demander à
                l'agent de <b>lever les points bloquants</b> du rapport (et d'escalader au bon profil ceux qui ne
                le concernent pas), puis de réévaluer la validation — plutôt que de rester bloqué.
              </>
            ) : (
              <>
                <b style={{ color: "#A15C07" }}>Validé avec risque.</b> Vous pouvez demander à l'agent de corriger
                les risques acceptés et de réévaluer la validation, au lieu de simplement passer à l'étape suivante.
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {phase.gateFile ? (
              <button
                className="btn btn-ghost btn-sm gap-1.5"
                onClick={() =>
                  setOpenDoc({
                    path: `livrables/_governance/gates/${phase.gateFile}`,
                    title: `Rapport de validation ${phase.id}`,
                    name: phase.gateFile,
                    phaseId
                  })
                }
              >
                <FileText size={15} /> {isFail ? "Voir les points bloquants" : "Voir les risques"}
              </button>
            ) : null}
            <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onRemediateRisks(phaseId)}>
              <Wand2 size={15} /> {isFail ? "Corriger les points bloquants" : "Corriger les risques"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Live run */}
      {liveGroup ? (
        <div className="mt-4">
          <ParallelRunView
            groupId={liveGroup.groupId}
            onDone={() => { onStateRefresh(); setRunDone(true); }}
          />
          {runDone ? (
            <RunNextSteps
              state={state}
              phaseId={phaseId}
              byPhase
              onOpenDecision={onOpenDecision}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ) : liveRun ? (
        <div className="mt-4">
          <RunConsole
            runId={liveRun.id}
            label={liveRun.label}
            onDone={() => { onStateRefresh(); setRunDone(true); }}
          />
          {runDone ? (
            <RunNextSteps
              state={state}
              runId={liveRun.id}
              phaseId={phaseId}
              onOpenDecision={onOpenDecision}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ) : (
        /* Status / action banner */
        <div className="mt-4">
          {blocked ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#f0d8a8] bg-[#FFF3DF] px-4 py-3">
              <AlertTriangle size={20} className="text-[#A15C07] shrink-0" />
              <div className="text-[13.5px]">
                <b>Étape bloquée.</b> {pending.length} sollicitation(s) de l'IA attendent une réponse.
              </div>
            </div>
          ) : gatePassed ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#cdebd9] bg-[#EAF7EE] px-4 py-3">
              <CheckCircle2 size={20} className="text-[#168736] shrink-0" />
              <div className="flex-1 text-[13.5px]">
                <b>Étape validée.</b> {nextPhase ? "Vous pouvez passer à la suite." : "Chaîne terminée."}
              </div>
              {nextPhase ? (
                <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onGoPhase(nextPhase.id)}>
                  Passer à {nextPhase.id} <ArrowRight size={15} />
                </button>
              ) : null}
            </div>
          ) : relaunchRun ? (
            <div className="flex items-center gap-3 rounded-lg border border-ey-border bg-base-200 px-4 py-3">
              <RefreshCw size={20} className="text-accent shrink-0" />
              <div className="flex-1 text-[13.5px]">
                <b>Toutes les réponses sont données.</b> L'IA peut reprendre le travail.
              </div>
              <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onResume(relaunchRun, phaseId)}>
                <RefreshCw size={15} /> Relancer l'IA
              </button>
            </div>
          ) : isG0 && docCount === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-ey-border bg-base-200 px-4 py-3">
              <Rocket size={20} className="text-accent shrink-0" />
              <div className="flex-1 text-[13.5px]">
                <b>Étape pas encore démarrée.</b> Déposez le besoin client pour lancer la structuration.
              </div>
              <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onNavigate("launch")}>
                <Rocket size={15} /> Aller au lancement
              </button>
            </div>
          ) : !isG0 && notStarted ? (
            <div className="flex items-center gap-3 rounded-lg border border-ey-border bg-base-200 px-4 py-3">
              <Play size={20} className="text-accent shrink-0" />
              <div className="flex-1 text-[13.5px]">
                {prevDone ? (
                  <><b>Prête à démarrer.</b> Lancez les agents de cette étape.</>
                ) : (
                  <>
                    <b className="text-[#A15C07]">Étape précédente non validée.</b> Vous pouvez lancer
                    quand même, mais {prevPhase.id} devrait être validée d'abord.
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isG5 && onLaunchDevBatches ? (
                  <button
                    className="btn btn-outline btn-sm gap-1.5"
                    title="Développe les User Stories en vagues parallèles regroupées par Bounded Context"
                    onClick={() => onLaunchDevBatches(phaseId)}
                  >
                    <Play size={15} /> Dev par batch (BC)
                  </button>
                ) : null}
                <button className="btn btn-primary btn-sm gap-1.5" onClick={launch}>
                  <Play size={15} /> {launchLabel}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-ey-border bg-base-200 px-4 py-3">
              <div className="text-[13.5px] flex items-center gap-2">
                <CheckCircle2 size={18} className="text-ey-gray01" /> Rien en attente sur cette étape.
              </div>
              {!isG0 ? (
                <div className="flex items-center gap-2">
                  {isG5 && onLaunchDevBatches ? (
                    <button
                      className="btn btn-outline btn-sm gap-1.5"
                      title="Développe les User Stories en vagues parallèles regroupées par Bounded Context"
                      onClick={() => onLaunchDevBatches(phaseId)}
                    >
                      <Play size={15} /> Dev par batch (BC)
                    </button>
                  ) : null}
                  <button className="btn btn-outline btn-sm gap-1.5" onClick={launch}>
                    <Play size={15} /> {launchLabel}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Rapport de développement des User Stories (zone dev G5) */}
      {isG5 ? <UsReport version={docCount} onOpenDoc={setOpenDoc} /> : null}

      {/* Tâches ouvertes rattachées à cette étape */}
      <PhaseTasks phaseId={phaseId} tasks={state.tasks || []} onNavigate={onNavigate} />

      {/* Documents d'entrée (sources fournies par l'humain) */}
      <PhaseInputs phase={phase} onStateChange={onStateChange} />

      {/* Supports PowerPoint / Word du projet jusqu'à cette étape */}
      <SupportsPanel phase={phase} busy={Boolean(activeRun)} refreshKey={activeRun ? activeRun.id : "idle"} onGenerate={(format) => onGenerateSupport(phaseId, format)} />

      {/* À traiter */}
      {pending.length > 0 ? (
        <>
          <div className="flex items-center justify-between mt-7 mb-3">
            <h3 className="text-[15px] font-bold flex items-center gap-2">
              <Inbox size={17} className="text-ey-gray01" /> À traiter ({pending.length})
            </h3>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((d) => d.id)))}
            >
              {selected.size === pending.length ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((d) => (
              <ItemRow key={d.id} d={d} onOpen={onOpenDecision} selectable selected={selected.has(d.id)} onToggle={toggle} />
            ))}
          </div>
        </>
      ) : null}

      {/* Livrables de l'étape — par typologie, en onglets */}
      <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
        <FileText size={17} className="text-ey-gray01" /> Livrables de l'étape ({docCount})
      </h3>
      <DocTypeTabs
        types={phase.docTypes || []}
        renderItem={(doc) => (
          <DocItem key={doc.path} doc={doc} feedbackCount={feedbackFor(doc.path)} onOpen={setOpenDoc} />
        )}
      />

      {/* Revue & validation (reviewer explicite) */}
      {phase.reviewer ? (
        <>
          <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
            <ClipboardCheck size={17} className="text-ey-gray01" /> Revue & validation
          </h3>
          <Card className="p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[13.5px]">
                Revue par <b>{phase.reviewer}</b> — évalue les livrables et décide la gate
                ({phase.gateLabel || phase.id}).
              </div>
              <div className="text-[12px] text-ey-gray01 mt-0.5">
                Statut actuel : <GateBadge status={phase.gateStatus} />
              </div>
            </div>
            <button
              className="btn btn-outline btn-sm gap-1.5"
              onClick={() => onLaunchReview(phaseId)}
              disabled={docCount === 0 || Boolean(liveRun)}
              title={docCount === 0 ? "Aucun livrable à évaluer" : ""}
            >
              <ClipboardCheck size={15} /> Lancer la revue
            </button>
          </Card>
        </>
      ) : null}

      {/* Consignes types + chat avec l'agent de la phase */}
      {phase.producers ? (
        <>
          <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
            <MessageCircle size={17} className="text-ey-gray01" /> Agir avec {phase.producers}
          </h3>

          {phase.instructions && phase.instructions.length ? (
            <div className="mb-3">
              <div className="text-[12px] text-ey-gray01 mb-1.5">Consignes types (un clic = envoyé à l'agent) :</div>
              <div className="flex flex-wrap gap-2">
                {phase.instructions.map((ins, i) => (
                  <button
                    key={i}
                    className="btn btn-outline btn-sm gap-1.5"
                    title={ins.text}
                    onClick={() => runConsigne(ins.text)}
                  >
                    <Wand2 size={14} /> {ins.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showChat ? (
            <ChatPanel
              phaseId={phaseId}
              agentLabel={phase.producers}
              profile={profile}
              profileObj={profileObj}
              onRunDone={onStateRefresh}
              seed={chatSeed}
              threadKey={`phase:${state?.config?.workspaceRoot || ""}:${phaseId}`}
            />
          ) : (
            <Card className="p-4 flex items-center gap-3">
              <div className="flex-1 text-[13.5px]">
                Discutez librement avec <b>{phase.producers}</b>, ou utilisez une consigne type
                ci-dessus.
              </div>
              <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setShowChat(true)}>
                <MessageCircle size={15} /> Ouvrir la discussion
              </button>
            </Card>
          )}
        </>
      ) : null}

      {/* Déjà répondu */}
      {answered.length > 0 ? (
        <>
          <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
            <CheckCircle2 size={17} className="text-[#168736]" /> Déjà répondu ({answered.length})
          </h3>
          <div className="flex flex-col gap-2">
            {answered.map((d) => (
              <ItemRow key={d.id} d={d} onOpen={onOpenDecision} />
            ))}
          </div>
        </>
      ) : null}

      <BulkBar count={selected.size} busy={busy} onAuto={handleAuto} onClear={() => setSelected(new Set())} />

      {openDoc ? (
        <DocViewerModal
          doc={openDoc}
          phaseId={phaseId}
          profile={profile}
          feedback={state.feedback}
          onClose={() => setOpenDoc(null)}
          onStateChange={onStateChange}
          onStartImpact={onStartImpact}
        />
      ) : null}
    </>
  );
}
