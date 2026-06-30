import React, { useEffect, useRef, useState } from "react";
import { Play, Square, Server, Monitor, ExternalLink, Settings2, Save, Loader2 } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "../components/ui.jsx";

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
  const timer = useRef(null);

  function refresh() {
    Api.appStatus()
      .then((r) => {
        setApp(r.app);
        setStatus(r.status);
        if (!draft) setDraft(r.app);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 2500);
    return () => clearInterval(timer.current);
  }, []);

  const configured = Boolean(app?.backend?.command || app?.frontend?.command);
  const frontUrl = app?.frontend?.url;
  const frontRunning = status?.frontend?.status === "running";

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
          {frontRunning && frontUrl ? (
            <a className="btn btn-outline btn-sm gap-1.5" href={frontUrl} target="_blank" rel="noreferrer">
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
          <ProcCard icon={Server} title="Back-end" name="backend" proc={status.backend} onStart={start} onStop={stop} busy={busy} />
          <ProcCard icon={Monitor} title="Front-end" name="frontend" proc={status.frontend} onStart={start} onStop={stop} busy={busy} />
        </div>
      )}

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
              <input className="input input-bordered input-sm w-full" placeholder="ex. C:\\...\\api"
                value={draft.backend?.cwd || ""} onChange={(e) => field("backend", "cwd", e.target.value)} spellCheck={false} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2 font-semibold text-[13.5px]">
                <Monitor size={15} /> Front-end
              </div>
              <label className="block text-[12px] font-semibold mb-1">Commande</label>
              <input className="input input-bordered input-sm w-full mb-2" placeholder="ex. npm run dev"
                value={draft.frontend?.command || ""} onChange={(e) => field("frontend", "command", e.target.value)} spellCheck={false} />
              <label className="block text-[12px] font-semibold mb-1">Dossier de travail</label>
              <input className="input input-bordered input-sm w-full mb-2" placeholder="ex. C:\\...\\web"
                value={draft.frontend?.cwd || ""} onChange={(e) => field("frontend", "cwd", e.target.value)} spellCheck={false} />
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
