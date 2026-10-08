import React, { useEffect, useRef, useState } from "react";
import { Sparkles, AlertTriangle, X } from "lucide-react";
import { Api } from "./api.js";
import Layout from "./components/Layout.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import PipelineScreen from "./screens/PipelineScreen.jsx";
import DocumentsScreen from "./screens/DocumentsScreen.jsx";
import DecisionsScreen from "./screens/DecisionsScreen.jsx";
import RisksScreen from "./screens/RisksScreen.jsx";
import TasksScreen from "./screens/TasksScreen.jsx";
import LaunchScreen from "./screens/LaunchScreen.jsx";
import LaunchAppScreen from "./screens/LaunchAppScreen.jsx";
import CostScreen from "./screens/CostScreen.jsx";
import ActivityScreen from "./screens/ActivityScreen.jsx";
import OrchestratorScreen from "./screens/OrchestratorScreen.jsx";
import PhaseScreen from "./screens/PhaseScreen.jsx";
import GitScreen from "./screens/GitScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import RequestsScreen, { NewRequestForm } from "./screens/RequestsScreen.jsx";
import DecisionDetailModal from "./components/DecisionDetailModal.jsx";
import RiskDetailModal from "./components/RiskDetailModal.jsx";
import CreateDecisionModal from "./components/CreateDecisionModal.jsx";
import RunConsole from "./components/RunConsole.jsx";

const TITLES = {
  dashboard: "Accueil",
  requests: "Demandes",
  orchestrator: "Orchestrateur",
  decisions: "Décisions",
  risks: "Risques",
  tasks: "Tâches",
  pipeline: "Avancement",
  activity: "Activité",
  cost: "Coûts",
  launch: "Lancement",
  documents: "Documents",
  app: "Application",
  git: "Git",
  settings: "Réglages"
};

export default function App() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [profile, setProfile] = useState(
    () => localStorage.getItem("sdlc.profile") || "orchestrateur"
  );
  const [docFilter, setDocFilter] = useState(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [openDecision, setOpenDecision] = useState(null);
  const [openRisk, setOpenRisk] = useState(null);
  const staleTicksRef = useRef(0);
  const [showCreateDecision, setShowCreateDecision] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [resume, setResume] = useState(null);
  const [active, setActive] = useState({ runs: [], groups: [] });
  // Live console for ANY running agent (resolution, audit, remediation, phase…),
  // opened from the header indicator regardless of the run's phase.
  const [openRun, setOpenRun] = useState(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);

  function load() {
    Api.getState()
      .then(setState)
      .catch((e) => setError(e.message));
  }

  function refreshState() {
    Api.getState().then(setState).catch(() => {});
    refreshActive();
  }

  // Which agents/groups are running right now (server-side truth), so the UI
  // recovers live state after a page refresh instead of losing track of runs.
  function refreshActive() {
    Api.getActiveRuns()
      .then((r) => {
        const runs = r.runs || [];
        setActive({ runs, groups: r.groups || [] });
        // Drop a stale activeRun: if the server no longer reports it running for two
        // consecutive polls (~8s grace so a just-launched run can appear), clear it —
        // otherwise a finished/gone run would keep a phase stuck on "En cours".
        setActiveRun((cur) => {
          if (!cur) return cur;
          if (runs.some((x) => x.id === cur.id)) { staleTicksRef.current = 0; return cur; }
          staleTicksRef.current += 1;
          return staleTicksRef.current >= 2 ? null : cur;
        });
      })
      .catch(() => {});
  }

  function onBulkDone(nextState, resumableRuns) {
    setState(nextState);
    if (resumableRuns && resumableRuns.length) {
      setResume({ runId: resumableRuns[0].runId, phaseId: resumableRuns[0].phaseId });
    }
  }

  async function startResume(runId, phaseId) {
    try {
      const res = await Api.resumeRun(runId, phaseId);
      const pid = phaseId || "new-need";
      setActiveGroup(null);
      setActiveRun({
        id: res.runId,
        label: pid === "new-need" ? "Nouveau besoin · Reprise" : `${pid} · Reprise après réponses`,
        phaseId: pid
      });
      setResume(null);
      if (pid !== "G0" && pid !== "new-need") {
        setSelectedPhaseId(pid);
        setScreen("phase");
      } else {
        setScreen("launch");
      }
    } catch (e) {
      // Action failure: show a dismissable toast, don't blank the whole app.
      setNotice({ type: "error", text: e.message });
    }
  }

  async function startPhaseRun(phaseId) {
    try {
      const phase = state.phases.find((p) => p.id === phaseId);
      const res = await Api.startPhase(phaseId);
      setActiveGroup(null);
      setActiveRun({ id: res.runId, label: `${phaseId} · ${phase ? phase.title : ""}`, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      // Action failure: show a dismissable toast, don't blank the whole app.
      setNotice({ type: "error", text: e.message });
    }
  }

  async function startPhaseParallel(phaseId) {
    try {
      const res = await Api.startPhaseParallel(phaseId);
      setActiveRun(null);
      setActiveGroup({ groupId: res.groupId, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      // Action failure: show a dismissable toast, don't blank the whole app.
      setNotice({ type: "error", text: e.message });
    }
  }

  // G5: launch development in parallel batches grouped by Bounded Context.
  async function startDevBatches(phaseId) {
    try {
      const res = await Api.startDevBatches();
      if (!res.groupId) {
        setNotice({ type: "info", text: res.message || "Aucune User Story à développer." });
        return;
      }
      const w = (res.meta && res.meta.waves ? res.meta.waves.filter((x) => x.bcs).length : 0);
      setNotice({ type: "info", text: `Dev par batch lancé : ${res.meta?.todo ?? "?"} US en ${w} vagues (par Bounded Context).` });
      setActiveRun(null);
      setActiveGroup({ groupId: res.groupId, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    }
  }

  function impactFromDoc(doc, comment) {
    if (!comment) return;
    startNewNeed(`Retour sur le document « ${doc.title} » (${doc.path}) : ${comment}`, [doc.path]);
  }

  async function startNewNeed(description, documents) {
    try {
      const res = await Api.startNewNeed(description, documents);
      setActiveRun({ id: res.runId, label: "Nouveau besoin · Requalification", phaseId: "new-need" });
      setScreen("launch");
    } catch (e) {
      // Action failure: show a dismissable toast, don't blank the whole app.
      setNotice({ type: "error", text: e.message });
    }
  }

  // Generate a PowerPoint / Word support of the whole project up to this phase.
  async function startSupport(phaseId, format) {
    try {
      const res = await Api.createSupport(phaseId, format);
      setActiveGroup(null);
      setActiveRun({ id: res.runId, label: res.label, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    }
  }

  async function startReviewRun(phaseId) {
    try {
      const phase = state.phases.find((p) => p.id === phaseId);
      const res = await Api.startReview(phaseId);
      setActiveGroup(null);
      setActiveRun({ id: res.runId, label: res.label || `${phaseId} · Revue (${phase ? phase.reviewer : ""})`, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      // Action failure: show a dismissable toast, don't blank the whole app.
      setNotice({ type: "error", text: e.message });
    }
  }

  // PASS_WITH_RISK / FAIL: relaunch the producer agent to fix what the gate flagged + re-evaluate.
  async function startRemediation(phaseId) {
    try {
      const res = await Api.remediateRisks(phaseId);
      setActiveGroup(null);
      setActiveRun({ id: res.runId, label: `${phaseId} · Correction des points bloquants`, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    }
  }

  useEffect(() => {
    load();
    refreshActive();
    const t = setInterval(refreshActive, 4000);
    return () => clearInterval(t);
  }, []);

  // Auto-dismiss action toasts after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  function changeProfile(id) {
    setProfile(id);
    localStorage.setItem("sdlc.profile", id);
  }

  function navigate(target) {
    if (target !== "documents") setDocFilter(null);
    setScreen(target);
  }

  function openPhase(phase) {
    setSelectedPhaseId(phase.id);
    setScreen("phase");
  }

  if (error) {
    return (
      <div className="grid place-items-center h-screen bg-base-200 p-4">
        <div className="max-w-md text-center">
          <div className="alert alert-error text-sm mb-3">{error}</div>
          <p className="text-ey-gray01">
            Le backend n'est peut-être pas démarré. Lancez <code>npm start</code> (ou{" "}
            <code>npm run dev:server</code> en dev).
          </p>
          <button className="btn btn-primary btn-sm mt-2" onClick={() => { setError(null); load(); }}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid place-items-center h-screen bg-base-200">
        <div className="text-center text-ey-gray01">
          <span className="loading loading-spinner loading-lg text-ey-yellow" />
          <div className="mt-3">Chargement du projet…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        state={state}
        screen={screen}
        onNavigate={navigate}
        profile={profile}
        onProfileChange={changeProfile}
        title={screen === "phase" ? `Étape ${selectedPhaseId || ""}` : TITLES[screen]}
        crumb={state.config.workspaceRoot}
        activeRuns={active.runs}
        onOpenPhase={(id) => { setSelectedPhaseId(id); setScreen("phase"); }}
        onNewRequest={() => setShowNewRequest(true)}
        onOpenRun={(r) => setOpenRun({ id: r.id, label: r.agent ? `${r.agent}${r.phaseId ? " · " + r.phaseId : ""}` : (r.label || "Travail de l'IA") })}
      >
        {screen === "dashboard" ? (
          <DashboardScreen
            state={state}
            profile={profile}
            onNavigate={navigate}
            onOpenDecision={setOpenDecision}
            onOpenPhase={(id) => { setSelectedPhaseId(id); setScreen("phase"); }}
          />
        ) : null}
        {screen === "decisions" ? (
          <DecisionsScreen
            state={state}
            profile={profile}
            onOpenDecision={setOpenDecision}
            onRequestCreate={() => setShowCreateDecision(true)}
            onBulkDone={onBulkDone}
            onStateChange={setState}
          />
        ) : null}
        {screen === "risks" ? (
          <RisksScreen
            state={state}
            profile={profile}
            onOpenRisk={setOpenRisk}
            onStateChange={setState}
          />
        ) : null}
        {screen === "requests" ? (
          <RequestsScreen
            state={state}
            profile={profile}
            focusId={focusRequest}
            onOpenDecision={setOpenDecision}
            onOpenRun={(r) => setOpenRun(r)}
          />
        ) : null}
        {screen === "tasks" ? (
          <TasksScreen state={state} profile={profile} onStateChange={setState} />
        ) : null}
        {screen === "launch" ? (
          <LaunchScreen
            state={state}
            activeRun={activeRun && (activeRun.phaseId === "G0" || activeRun.phaseId === "new-need") ? activeRun : null}
            onRunStarted={(id, label) => setActiveRun({ id, label, phaseId: "G0" })}
            onStartNewNeed={startNewNeed}
            onStateRefresh={refreshState}
            onNavigate={navigate}
            onOpenDecision={setOpenDecision}
          />
        ) : null}
        {screen === "pipeline" ? (
          <PipelineScreen state={state} onOpenPhase={openPhase} />
        ) : null}
        {screen === "phase" ? (
          <PhaseScreen
            key={selectedPhaseId}
            state={state}
            phaseId={selectedPhaseId}
            profile={profile}
            activeRun={activeRun && activeRun.phaseId === selectedPhaseId ? activeRun : null}
            activeGroup={activeGroup && activeGroup.phaseId === selectedPhaseId ? activeGroup : null}
            active={active}
            onOpenDecision={setOpenDecision}
            onResume={startResume}
            onLaunchPhase={startPhaseRun}
            onLaunchParallel={startPhaseParallel}
            onLaunchDevBatches={startDevBatches}
            onLaunchReview={startReviewRun}
            onGenerateSupport={startSupport}
            onRemediateRisks={startRemediation}
            onGoPhase={(id) => { setSelectedPhaseId(id); setScreen("phase"); }}
            onNavigate={navigate}
            onBack={() => setScreen("pipeline")}
            onBulkDone={onBulkDone}
            onStateRefresh={refreshState}
            onStateChange={setState}
            onStartImpact={impactFromDoc}
            onRunStarted={(run) => { setActiveGroup(null); setActiveRun(run); }}
          />
        ) : null}
        {screen === "documents" ? (
          <DocumentsScreen
            state={state}
            filterFolders={docFilter}
            profile={profile}
            onStateChange={setState}
            onStartImpact={impactFromDoc}
          />
        ) : null}
        {screen === "app" ? <LaunchAppScreen /> : null}
        {screen === "orchestrator" ? <OrchestratorScreen state={state} onStateChange={setState} /> : null}
        {screen === "cost" ? <CostScreen /> : null}
        {screen === "activity" ? (
          <ActivityScreen
            state={state}
            onOpenPhase={(id) => { setSelectedPhaseId(id); setScreen("phase"); }}
            onOpenDecision={setOpenDecision}
            onNavigate={navigate}
          />
        ) : null}
        {screen === "git" ? <GitScreen /> : null}
        {screen === "settings" ? (
          <SettingsScreen state={state} onStateChange={setState} />
        ) : null}
      </Layout>

      {openDecision ? (
        <DecisionDetailModal
          decision={state.decisions.find((d) => d.id === openDecision.id) || openDecision}
          profiles={state.profiles}
          currentProfile={profile}
          onStateChange={setState}
          onResume={(runId, phaseId) => { setOpenDecision(null); startResume(runId, phaseId); }}
          onClose={() => setOpenDecision(null)}
          onAnswered={(next, meta) => {
            setState(next);
            setOpenDecision(null);
            if (meta && meta.runFullyAnswered && meta.runId) {
              setResume({ runId: meta.runId, phaseId: meta.phaseId });
            }
          }}
        />
      ) : null}

      {openRisk ? (
        <RiskDetailModal
          risk={(state.risks || []).find((r) => r.id === openRisk.id) || openRisk}
          profile={profile}
          onStateChange={setState}
          onClose={() => setOpenRisk(null)}
        />
      ) : null}

      {resume ? (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-secondary text-white rounded-lg shadow-xl px-5 py-3 flex items-center gap-4 max-w-[92vw]">
          <Sparkles size={20} className="text-ey-yellow shrink-0" />
          <div className="text-[13px]">
            <b>Toutes les réponses sont données.</b>
            <div className="text-white/70 text-[12px]">L'IA peut reprendre le travail avec vos réponses.</div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => startResume(resume.runId, resume.phaseId)}
          >
            Relancer l'IA
          </button>
          <button className="btn btn-ghost btn-sm text-white" onClick={() => setResume(null)}>
            Plus tard
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="fixed top-5 right-5 z-50 max-w-sm bg-base-100 border border-error/40 rounded-lg shadow-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
          <div className="text-[13px] flex-1">
            <b>L'action a échoué.</b>
            <div className="text-ey-gray01 text-[12.5px] mt-0.5 break-words">{notice.text}</div>
          </div>
          <button className="btn btn-ghost btn-xs btn-square" onClick={() => setNotice(null)} aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {showNewRequest ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={() => setShowNewRequest(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nouvelle demande"
            className="bg-base-100 rounded-lg shadow-xl w-full max-w-xl p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") setShowNewRequest(false); }}
          >
            <div className="flex items-center mb-3">
              <h3 className="text-base font-bold m-0 flex-1">Nouvelle demande</h3>
              <button className="btn btn-ghost btn-xs btn-square" onClick={() => setShowNewRequest(false)} aria-label="Fermer"><X size={15} /></button>
            </div>
            <NewRequestForm
              profile={profile}
              autoFocus
              onSubmitted={(req) => {
                setShowNewRequest(false);
                setFocusRequest(req ? req.id : null);
                setScreen("requests");
                refreshState();
              }}
            />
          </div>
        </div>
      ) : null}

      {showCreateDecision ? (
        <CreateDecisionModal
          state={state}
          currentProfile={profile}
          onClose={() => setShowCreateDecision(false)}
          onCreated={(next) => {
            setState(next);
            setShowCreateDecision(false);
          }}
        />
      ) : null}

      {openRun ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={() => setOpenRun(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Console de l'agent"
            className="bg-base-100 rounded-lg shadow-xl w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-ey-border">
              <h3 className="text-[15px] font-bold m-0">Ce que fait l'agent</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setOpenRun(null)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <RunConsole runId={openRun.id} label={openRun.label} onDone={() => refreshState()} />
              <p className="text-[12px] text-ey-gray01 mt-2 mb-0">
                Sortie en direct de l'agent. À la fin, ses réponses et documents sont ingérés automatiquement.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
