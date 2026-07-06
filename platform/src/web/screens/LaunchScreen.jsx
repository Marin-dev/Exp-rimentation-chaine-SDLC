import React, { useRef, useState } from "react";
import { FolderSearch, Play, FileText, Inbox, CheckCircle2, Sparkles, Paperclip, Send, Trash2, Loader2, PlusCircle } from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState, GateBadge } from "../components/ui.jsx";
import RunConsole from "../components/RunConsole.jsx";
import RunNextSteps from "../components/RunNextSteps.jsx";
import FolderInput from "../components/FolderInput.jsx";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function LaunchScreen({ state, activeRun, onRunStarted, onStartNewNeed, onStateRefresh, onNavigate, onOpenDecision }) {
  const g0 = state.phases.find((p) => p.id === "G0");
  const [intakePath, setIntakePath] = useState("");
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [finished, setFinished] = useState(false);
  // New business need
  const [needDesc, setNeedDesc] = useState("");
  const [needFiles, setNeedFiles] = useState([]);
  const [needUploading, setNeedUploading] = useState(false);
  const [needBusy, setNeedBusy] = useState(false);
  const needFileRef = useRef(null);

  async function onPickNeedFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    setNeedUploading(true);
    try {
      for (const file of picked) {
        const dataUrl = await fileToDataUrl(file);
        const res = await Api.uploadFile("nouveau-besoin", file.name, dataUrl);
        setNeedFiles((prev) => [...prev, { name: res.name, path: res.path }]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setNeedUploading(false);
    }
  }

  async function submitNeed() {
    setNeedBusy(true);
    try {
      await onStartNewNeed(needDesc.trim(), needFiles.map((f) => f.path));
      setNeedDesc("");
      setNeedFiles([]);
    } finally {
      setNeedBusy(false);
    }
  }

  async function doScan() {
    setScanning(true);
    setError(null);
    setScan(null);
    try {
      const res = await Api.scanIntake(intakePath.trim());
      if (!res.ok) setError(res.error);
      else setScan(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  async function launch() {
    setLaunching(true);
    setError(null);
    setFinished(false);
    try {
      const res = await Api.startG0(intakePath.trim());
      onRunStarted(res.runId, "G0 · Structuration du besoin");
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Lancement du projet</h2>
          <p className="text-ey-gray01 mt-1 mb-0">
            Déposez le besoin client. L'IA structure les besoins clés et pose ses questions là où
            c'est imprécis.
          </p>
        </div>
        {g0 ? <GateBadge status={g0.gateStatus} /> : null}
      </div>

      {/* Active run */}
      {activeRun ? (
        <div className="mt-5">
          <RunConsole
            runId={activeRun.id}
            label={activeRun.label}
            onDone={() => {
              setFinished(true);
              onStateRefresh();
            }}
          />
          {finished ? (
            <RunNextSteps
              state={state}
              runId={activeRun.id}
              phaseId={activeRun.phaseId}
              onOpenDecision={onOpenDecision}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ) : (
        <>
          {/* Intake picker */}
          <Card className="p-5 mt-5">
            <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
              <FolderSearch size={17} className="text-ey-gray01" /> Dossier du besoin client
            </h3>
            <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
              Chemin du dossier contenant les documents du projet (besoins, parcours, specs, CR…).
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <FolderInput value={intakePath} onChange={setIntakePath} placeholder="C:\chemin\vers\le\dossier-intake" />
              </div>
              <button
                className="btn btn-outline gap-1.5"
                onClick={doScan}
                disabled={!intakePath.trim() || scanning}
              >
                <FolderSearch size={16} /> {scanning ? "Analyse…" : "Analyser"}
              </button>
            </div>
            {error ? <div className="alert alert-error text-sm mt-3">{error}</div> : null}

            {scan ? (
              <div className="mt-4">
                <div className="text-[13px] font-semibold mb-2">
                  {scan.count} fichier{scan.count > 1 ? "s" : ""} détecté{scan.count > 1 ? "s" : ""}
                </div>
                <div className="max-h-48 overflow-y-auto border border-ey-border rounded-md">
                  {scan.files.map((f) => (
                    <div
                      key={f.rel}
                      className="flex items-center gap-2 px-3 py-1.5 border-b border-ey-border last:border-0 text-[13px]"
                    >
                      <FileText size={14} className="text-ey-gray02" />
                      <span className="flex-1 truncate">{f.rel}</span>
                      {!f.known ? (
                        <span className="badge badge-ghost badge-sm">{f.ext || "?"}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary mt-4 gap-2" onClick={launch} disabled={launching}>
                  <Play size={16} /> Lancer la structuration du besoin
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  className="btn btn-primary gap-2"
                  onClick={launch}
                  disabled={!intakePath.trim() || launching}
                >
                  <Play size={16} /> Lancer la structuration du besoin
                </button>
                <p className="text-ey-gray02 text-[12px] mt-2">
                  Vous pouvez analyser le dossier d'abord, ou lancer directement.
                </p>
              </div>
            )}
          </Card>

          {g0 && g0.docCount > 0 ? (
            <Card className="p-4 mt-4 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-[#168736]" />
              <span className="text-[13px]">
                {g0.docCount} document(s) déjà produits pour le cadrage.{" "}
                <button className="link text-accent" onClick={() => onNavigate("documents")}>
                  Les consulter
                </button>
              </span>
            </Card>
          ) : null}

          {/* New business need */}
          <Card className="p-5 mt-4">
            <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
              <PlusCircle size={17} className="text-ey-gray01" /> Nouveau besoin métier
            </h3>
            <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
              Projet déjà cadré ? Soumettez un nouveau besoin (rôle oublié, parcours clé, document…).
              L'IA enregistre la demande et déclenche la mini-chaîne de requalification (sponsor → UX →
              métier → technique → PO), en posant les décisions au bon profil.
            </p>
            <textarea
              className="textarea textarea-bordered w-full mb-2"
              rows={3}
              placeholder="Décrivez le nouveau besoin…"
              value={needDesc}
              onChange={(e) => setNeedDesc(e.target.value)}
            />
            <input ref={needFileRef} type="file" multiple className="hidden" onChange={onPickNeedFiles} />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="btn btn-outline btn-sm gap-1.5"
                onClick={() => needFileRef.current && needFileRef.current.click()}
                disabled={needUploading}
              >
                {needUploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />} Joindre des documents
              </button>
              {needFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px] bg-base-200 border border-ey-border rounded px-2 py-1">
                  <FileText size={13} /> {f.name}
                  <button onClick={() => setNeedFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 size={13} className="text-ey-gray01" />
                  </button>
                </span>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm gap-1.5 mt-3"
              onClick={submitNeed}
              disabled={needBusy || !needDesc.trim()}
            >
              <Send size={15} /> Soumettre le besoin
            </button>
          </Card>
        </>
      )}
    </>
  );
}
