import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Api } from "./api.js";
import Layout from "./components/Layout.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import PipelineScreen from "./screens/PipelineScreen.jsx";
import DocumentsScreen from "./screens/DocumentsScreen.jsx";
import DecisionsScreen from "./screens/DecisionsScreen.jsx";
import LaunchScreen from "./screens/LaunchScreen.jsx";
import LaunchAppScreen from "./screens/LaunchAppScreen.jsx";
import CostScreen from "./screens/CostScreen.jsx";
import PhaseScreen from "./screens/PhaseScreen.jsx";
import GitScreen from "./screens/GitScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import DecisionDetailModal from "./components/DecisionDetailModal.jsx";
import CreateDecisionModal from "./components/CreateDecisionModal.jsx";

const TITLES = {
  dashboard: "Accueil",
  decisions: "Décisions",
  pipeline: "Avancement",
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
  const [screen, setScreen] = useState("dashboard");
  const [profile, setProfile] = useState(
    () => localStorage.getItem("sdlc.profile") || "orchestrateur"
  );
  const [docFilter, setDocFilter] = useState(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [openDecision, setOpenDecision] = useState(null);
  const [showCreateDecision, setShowCreateDecision] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [resume, setResume] = useState(null);

  function load() {
    Api.getState()
      .then(setState)
      .catch((e) => setError(e.message));
  }

  function refreshState() {
    Api.getState().then(setState).catch(() => {});
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
      setError(e.message);
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
      setError(e.message);
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
      setError(e.message);
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
      setError(e.message);
    }
  }

  async function startReviewRun(phaseId) {
    try {
      const phase = state.phases.find((p) => p.id === phaseId);
      const res = await Api.startReview(phaseId);
      setActiveGroup(null);
      setActiveRun({ id: res.runId, label: `${phaseId} · Revue (${phase ? phase.reviewer : ""})`, phaseId });
      setSelectedPhaseId(phaseId);
      setScreen("phase");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
          />
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
            state={state}
            phaseId={selectedPhaseId}
            profile={profile}
            activeRun={activeRun && activeRun.phaseId === selectedPhaseId ? activeRun : null}
            activeGroup={activeGroup && activeGroup.phaseId === selectedPhaseId ? activeGroup : null}
            onOpenDecision={setOpenDecision}
            onResume={startResume}
            onLaunchPhase={startPhaseRun}
            onLaunchParallel={startPhaseParallel}
            onLaunchReview={startReviewRun}
            onGoPhase={(id) => { setSelectedPhaseId(id); setScreen("phase"); }}
            onNavigate={navigate}
            onBack={() => setScreen("pipeline")}
            onBulkDone={onBulkDone}
            onStateRefresh={refreshState}
            onStateChange={setState}
            onStartImpact={impactFromDoc}
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
        {screen === "cost" ? <CostScreen /> : null}
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
    </>
  );
}
