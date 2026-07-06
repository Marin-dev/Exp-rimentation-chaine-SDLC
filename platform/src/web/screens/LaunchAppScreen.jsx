import React, { useEffect, useRef, useState } from "react";
import { Play, Square, Server, Monitor, ExternalLink, Settings2, Save, Loader2, Wand2 } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "../components/ui.jsx";
import FolderInput from "../components/FolderInput.jsx";
import RunConsole from "../components/RunConsole.jsx";

function StatusDot({ status }) {
  const map = {
    running: { c: "#168736", t: "En marche" },
    stopped: { c: "#747480", t: "Arrêté" },
    error: { c: "#B42318", t: "Erreur" }
  };
  const s = map[status] || map.stopped;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: s.c }}>
      <span className="w-2 h-2 rounded-full" style={{ background: s.c }} /> {s.t}
    </span>
  );
}

function ProcCard({ icon: Icon, title, name, proc, onStart, onStop, busy }) {
  const running = proc?.status === "running";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={17} className="text-ey-gray01" />
        <b className="text-[14px]">{title}</b>
        <span className="ml-auto">
          <StatusDot status={proc?.status} />
        </span>
      </div>
      <div className="flex gap-2 mb-2">
        {running ? (
          <button className="btn btn-outline btn-xs gap-1.5" onClick={() => onStop(name)} disabled={busy}>
            <Square size={13} /> Arrêter
          </button>
        ) : (
          <button className="btn btn-primary btn-xs gap-1.5" onClick={() => onStart(name)} disabled={busy}>
            <Play size={13} /> Démarrer
          </button>
        )}
      </div>
      <pre className="m-0 bg-[#1a1a24] text-[#e6e8ee] text-[11px] leading-relaxed rounded-md p-3 h-40 overflow-y-auto whitespace-pre-wrap break-words">
        {proc?.log || "—"}
      </pre>
    </Card>
  );
}

export default function LaunchAppScreen() {
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const [detectAgent, setDetectAgent] = useState("@devops");
  const [detectRunId, setDetectRunId] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const resyncDraft = useRef(false);
  const timer = useRef(null);

  function refresh() {
    Api.appStatus()
      .then((r) => {
        setApp(r.app);
        setStatus(r.status);
        // Adopt the config into the draft on first load, or after an agent detection
        // has just rewritten it (so the config form reflects the detected values).
        if (!draft || resyncDraft.current) {
          setDraft(r.app);
          resyncDraft.current = false;
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 2500);
    return () => clearInterval(timer.current);
  }, []);

  const hasBackend = Boolean(app?.backend?.command?.trim());
  const hasFrontend = Boolean(app?.frontend?.command?.trim());
  const configured = hasBackend || hasFrontend;
  // Whichever running service exposes a URL is the one to open (a single Node app that
  // serves its own UI works just as well as a separate front-end).
  const frontRunning = status?.frontend?.status === "running";
  const backendRunning = status?.backend?.status === "running";
  const openUrl =
    (frontRunning && app?.frontend?.url?.trim()) ||
    (backendRunning && app?.backend?.url?.trim()) ||
    "";

  async function start(which) {
    setBusy(true);
    try {
      const r = await Api.appStart(which);
      setStatus(r.status);
    } finally {
      setBusy(false);
    }
  }
  async function stop(which) {
    setBusy(true);
    try {
      const r = await Api.appStop(which);
      setStatus(r.status);
    } finally {
      setBusy(false);
    }
  }
  async function saveConfig() {
    setBusy(true);
    setSaved(false);
    try {
      await Api.setAppConfig(draft);
      setApp(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  function field(group, key, value) {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  }

  async function detect() {
    setDetecting(true);
    try {
      const r = await Api.appDetect(detectAgent);
      setDetectRunId(r.runId);
      setShowConfig(true);
    } catch {
      setDetecting(false);
    }
  }

  function onDetectDone() {
    setDetecting(false);
    resyncDraft.current = true; // next status poll adopts the agent-written config
    refresh();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Application</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            Lancez le produit développé en local (back-end + front-end) pour le voir tourner.
          </p>
        </div>
        <div className="flex gap-2">
          {openUrl ? (
            <a className="btn btn-outline btn-sm gap-1.5" href={openUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Ouvrir l'application
            </a>
          ) : null}
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => start("all")}
            disabled={busy || !configured}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Tout démarrer
          </button>
          <button className="btn btn-outline btn-sm gap-1.5" onClick={() => stop("all")} disabled={busy}>
            <Square size={15} /> Tout arrêter
          </button>
        </div>
      </div>

      {!configured ? (
        <Card className="p-5 mt-5">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 size={17} className="text-ey-gray01" />
            <b>À configurer</b>
          </div>
          <p className="text-ey-gray01 text-[13px] mt-0">
            Renseignez les commandes de démarrage du back-end et du front-end de votre produit
            ci-dessous, puis lancez. (Ces commandes seront produites par l'étape DevOps de la chaîne.)
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {hasBackend ? (
            <ProcCard icon={Server} title="Back-end" name="backend" proc={status.backend} onStart={start} onStop={stop} busy={busy} />
          ) : null}
          {hasFrontend ? (
            <ProcCard icon={Monitor} title="Front-end" name="frontend" proc={status.frontend} onStart={start} onStop={stop} busy={busy} />
          ) : null}
        </div>
      )}

      {/* Auto-détection des paramètres de lancement par un agent technique */}
      <Card className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 size={17} className="text-ey-gray01" />
          <b>Compléter automatiquement</b>
        </div>
        <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
          Demandez à un agent technique d'inspecter le produit développé et de renseigner
          les commandes de démarrage (back-end, front-end, URL) à votre place.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] font-semibold">Agent</label>
          <select
            className="select select-bordered select-sm"
            value={detectAgent}
            onChange={(e) => setDetectAgent(e.target.value)}
            disabled={detecting}
          >
            <option value="@devops">@devops</option>
            <option value="@developpeur">@developpeur</option>
          </select>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={detect} disabled={detecting}>
            {detecting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            Détecter les paramètres
          </button>
        </div>
        {detectRunId ? (
          <div className="mt-4">
            <RunConsole runId={detectRunId} label={`Détection · ${detectAgent}`} onDone={onDetectDone} />
          </div>
        ) : null}
      </Card>

      {/* Config */}
      <button
        className="btn btn-ghost btn-sm gap-1.5 mt-5"
        onClick={() => setShowConfig((v) => !v)}
      >
        <Settings2 size={15} /> {showConfig ? "Masquer" : "Configurer"} les commandes de lancement
      </button>

      {showConfig && draft ? (
        <Card className="p-5 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2 font-semibold text-[13.5px]">
                <Server size={15} /> Back-end
              </div>
              <label className="block text-[12px] font-semibold mb-1">Commande</label>
              <input className="input input-bordered input-sm w-full mb-2" placeholder="ex. npm start"
                value={draft.backend?.command || ""} onChange={(e) => field("backend", "command", e.target.value)} spellCheck={false} />
              <label className="block text-[12px] font-semibold mb-1">Dossier de travail</label>
              <div className="mb-2">
                <FolderInput size="sm" value={draft.backend?.cwd || ""} onChange={(v) => field("backend", "cwd", v)} placeholder="ex. C:\...\api" />
              </div>
              <label className="block text-[12px] font-semibold mb-1">URL d'ouverture <span className="font-normal text-ey-gray01">(si le back-end sert aussi l'UI)</span></label>
              <input className="input input-bordered input-sm w-full" placeholder="ex. http://localhost:3000"
                value={draft.backend?.url || ""} onChange={(e) => field("backend", "url", e.target.value)} spellCheck={false} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2 font-semibold text-[13.5px]">
                <Monitor size={15} /> Front-end
              </div>
              <label className="block text-[12px] font-semibold mb-1">Commande</label>
              <input className="input input-bordered input-sm w-full mb-2" placeholder="ex. npm run dev"
                value={draft.frontend?.command || ""} onChange={(e) => field("frontend", "command", e.target.value)} spellCheck={false} />
              <label className="block text-[12px] font-semibold mb-1">Dossier de travail</label>
              <div className="mb-2">
                <FolderInput size="sm" value={draft.frontend?.cwd || ""} onChange={(v) => field("frontend", "cwd", v)} placeholder="ex. C:\...\web" />
              </div>
              <label className="block text-[12px] font-semibold mb-1">URL d'ouverture</label>
              <input className="input input-bordered input-sm w-full" placeholder="ex. http://localhost:3000"
                value={draft.frontend?.url || ""} onChange={(e) => field("frontend", "url", e.target.value)} spellCheck={false} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm gap-1.5 mt-4" onClick={saveConfig} disabled={busy}>
            <Save size={15} /> {saved ? "Enregistré" : "Enregistrer"}
          </button>
        </Card>
      ) : null}
    </>
  );
}
