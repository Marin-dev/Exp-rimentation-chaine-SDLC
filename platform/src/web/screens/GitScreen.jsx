import React, { useEffect, useState } from "react";
import {
  GitBranch,
  RefreshCw,
  GitCommit,
  ArrowUp,
  ArrowDown,
  Download,
  Cloud,
  Plus,
  FileDiff,
  GitFork,
  UserCog,
  Loader2,
  Github,
  ExternalLink,
  UploadCloud,
  X,
  CheckCircle2
} from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState } from "../components/ui.jsx";

function GitHubPublishModal({ onClose, onPublished }) {
  const [gh, setGh] = useState({ ghAvailable: false, ghAuthed: false });
  const [repo, setRepo] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Api.githubStatus()
      .then((s) => {
        setGh(s);
        if (s.suggestedRepo) setRepo(s.suggestedRepo);
      })
      .catch(() => {});
  }, []);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.gitPublish(repo.trim(), visibility, token.trim());
      if (res.ok) {
        setResult(res);
        onPublished(res.status);
      } else {
        setError(res.message || "Échec.");
        if (res.status) onPublished(res.status);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold m-0 flex items-center gap-2"><Github size={18} /> Publier sur GitHub</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={18} /></button>
        </div>

        {result ? (
          <div className="mt-3">
            <div className="rounded-md border border-[#cdebd9] bg-[#EAF7EE] p-4">
              <div className="flex items-center gap-2 text-[#168736] font-semibold mb-1">
                <CheckCircle2 size={17} /> {result.message}
              </div>
              {result.url ? (
                <a className="text-accent break-all text-[13px] inline-flex items-center gap-1.5" href={result.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {result.url}
                </a>
              ) : null}
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn btn-primary btn-sm" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-ey-gray01 text-[13px] mt-1 mb-3">
              Crée le dépôt sur GitHub et pousse la branche courante, puis renvoie le lien.
            </p>

            <label className="block text-[12.5px] font-semibold mb-1.5">Nom du dépôt</label>
            <input className="input input-bordered w-full mb-3" value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} />

            <label className="block text-[12.5px] font-semibold mb-1.5">Visibilité</label>
            <div className="join mb-3">
              <button className={`btn btn-sm join-item ${visibility === "private" ? "btn-active" : ""}`} onClick={() => setVisibility("private")}>Privé</button>
              <button className={`btn btn-sm join-item ${visibility === "public" ? "btn-active" : ""}`} onClick={() => setVisibility("public")}>Public</button>
            </div>

            {gh.ghAuthed ? (
              <div className="rounded-md bg-base-200 border border-ey-border p-3 mb-3 text-[12.5px]">
                <b>Connecté via la CLI gh.</b> Aucun token nécessaire — la publication utilisera votre connexion GitHub existante.
              </div>
            ) : (
              <>
                <label className="block text-[12.5px] font-semibold mb-1.5">Token d'accès GitHub</label>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  placeholder="ghp_…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-[12px] text-ey-gray01 mt-1.5">
                  Pas de token ?{" "}
                  <a className="text-accent inline-flex items-center gap-1" href="https://github.com/settings/tokens/new?scopes=repo&description=SDLC%20Studio" target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> en créer un (portée « repo »)
                  </a>. Il n'est pas stocké : il sert uniquement à ce push.
                </p>
              </>
            )}

            {error ? <div className="alert alert-error text-sm my-3">{error}</div> : null}

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={publish}
                disabled={busy || !repo.trim() || (!gh.ghAuthed && !token.trim())}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} Publier
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GitScreen() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [ok, setOk] = useState(true);
  const [commitMsg, setCommitMsg] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [identity, setIdentity] = useState({ name: "", email: "" });
  const [showIdentity, setShowIdentity] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  function load() {
    Api.gitStatus().then(setStatus).catch((e) => { setMessage(e.message); setOk(false); });
  }
  useEffect(() => { load(); }, []);

  async function run(action, params, successMsg) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await Api.gitAction(action, params);
      setStatus(res.status);
      setOk(res.ok);
      setMessage(res.ok ? (successMsg || res.message || "Fait.") : res.message);
      if (res.ok && action === "commit") setCommitMsg("");
      if (res.ok && action === "addRemote") setRemoteUrl("");
      if (res.ok && action === "createBranch") setNewBranch("");
    } catch (e) {
      setOk(false);
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <>
        <h2 className="text-[22px] font-bold tracking-tight m-0">Git</h2>
        <p className="text-ey-gray01 mt-1">Chargement…</p>
      </>
    );
  }

  const banner = message ? (
    <div className={`alert ${ok ? "" : "alert-error"} text-[13px] mt-4 whitespace-pre-wrap`}
         style={ok ? { background: "#EAF7EE", color: "#168736", border: "none" } : undefined}>
      {message}
    </div>
  ) : null;

  if (!status.isRepo) {
    return (
      <>
        <h2 className="text-[22px] font-bold tracking-tight m-0">Git</h2>
        <p className="text-ey-gray01 mt-1 mb-5">Gérez le dépôt du projet : commits, branches, push, pull.</p>
        <Card>
          <EmptyState icon={GitFork} title="Ce dossier n'est pas encore un dépôt Git">
            Initialisez un dépôt pour commencer à versionner le projet.
          </EmptyState>
          <div className="px-6 pb-6 text-center">
            <button className="btn btn-primary btn-sm gap-1.5" onClick={() => run("init", {}, "Dépôt initialisé.")} disabled={busy}>
              <GitFork size={15} /> Initialiser le dépôt
            </button>
          </div>
        </Card>
        {banner}
      </>
    );
  }

  const staged = status.files.filter((f) => f.staged);
  const unstaged = status.files.filter((f) => !f.staged);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Git</h2>
          <p className="text-ey-gray01 mt-1 mb-0">Dépôt du projet — commits, branches, synchronisation.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setShowPublish(true)}>
            <Github size={15} /> Publier sur GitHub
          </button>
          <button className="btn btn-ghost btn-sm gap-1.5" onClick={load} disabled={busy}>
            <RefreshCw size={15} /> Rafraîchir
          </button>
        </div>
      </div>

      {showPublish ? (
        <GitHubPublishModal
          onClose={() => setShowPublish(false)}
          onPublished={(st) => st && setStatus(st)}
        />
      ) : null}

      {/* Branch + sync state */}
      <Card className="p-4 mt-5 flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[14px]">
          <GitBranch size={16} className="text-ey-gray01" /> {status.branch || "(sans branche)"}
        </span>
        {status.upstream ? <span className="text-[12px] text-ey-gray01">↔ {status.upstream}</span> : <span className="text-[12px] text-ey-gray02">sans remote suivi</span>}
        {status.ahead > 0 ? <span className="inline-flex items-center gap-1 text-[12px] text-accent"><ArrowUp size={13} /> {status.ahead}</span> : null}
        {status.behind > 0 ? <span className="inline-flex items-center gap-1 text-[12px] text-[#A15C07]"><ArrowDown size={13} /> {status.behind}</span> : null}
        <div className="ml-auto flex gap-2">
          <button className="btn btn-outline btn-xs gap-1.5" onClick={() => run("pull", {}, "Pull effectué.")} disabled={busy}>
            <Download size={13} /> Pull
          </button>
          <button
            className="btn btn-primary btn-xs gap-1.5"
            onClick={() => run("push", status.upstream ? {} : { setUpstream: true, branch: status.branch }, "Push effectué.")}
            disabled={busy || !status.remoteUrl}
            title={!status.remoteUrl ? "Configurez d'abord un remote" : ""}
          >
            <Cloud size={13} /> Push
          </button>
        </div>
      </Card>

      {/* Changes + commit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <b className="text-[14px] flex items-center gap-2"><FileDiff size={16} className="text-ey-gray01" /> Modifications ({status.files.length})</b>
            {status.files.length > 0 ? (
              <button className="btn btn-ghost btn-xs" onClick={() => run("stageAll", {}, "Tout indexé.")} disabled={busy}>Tout indexer</button>
            ) : null}
          </div>
          {status.files.length === 0 ? (
            <p className="text-ey-gray01 text-[13px] m-0">Aucune modification. Tout est propre.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {staged.map((f) => (
                <div key={"s" + f.path} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-2 h-2 rounded-full bg-[#168736]" title="indexé" />
                  <span className="truncate flex-1">{f.path}</span>
                  <span className="text-ey-gray02 text-[11px]">{f.label}</span>
                </div>
              ))}
              {unstaged.map((f) => (
                <div key={"u" + f.path} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-2 h-2 rounded-full bg-ey-gray02" title="non indexé" />
                  <span className="truncate flex-1">{f.path}</span>
                  <span className="text-ey-gray02 text-[11px]">{f.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <b className="text-[14px] flex items-center gap-2 mb-2"><GitCommit size={16} className="text-ey-gray01" /> Commit</b>
          <textarea
            className="textarea textarea-bordered w-full text-[13px]"
            rows={3}
            placeholder="Message de commit…"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm w-full mt-2 gap-1.5"
            onClick={() => run("commit", { message: commitMsg }, "Commit créé.")}
            disabled={busy || !commitMsg.trim() || status.files.length === 0}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <GitCommit size={15} />} Indexer tout & committer
          </button>
          <button className="btn btn-ghost btn-xs gap-1.5 mt-2" onClick={() => setShowIdentity((v) => !v)}>
            <UserCog size={13} /> Identité git
          </button>
          {showIdentity ? (
            <div className="mt-2 flex flex-col gap-2">
              <input className="input input-bordered input-sm" placeholder="Nom" value={identity.name} onChange={(e) => setIdentity((i) => ({ ...i, name: e.target.value }))} />
              <input className="input input-bordered input-sm" placeholder="Email" value={identity.email} onChange={(e) => setIdentity((i) => ({ ...i, email: e.target.value }))} />
              <button className="btn btn-outline btn-xs" onClick={() => run("setIdentity", identity, "Identité enregistrée.")} disabled={busy}>Enregistrer l'identité</button>
            </div>
          ) : null}
        </Card>
      </div>

      {/* Remote + branches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-4">
          <b className="text-[14px] flex items-center gap-2 mb-2"><Cloud size={16} className="text-ey-gray01" /> Remote</b>
          {status.remoteUrl ? (
            <p className="text-[13px] m-0 break-all">origin → <code className="text-accent">{status.remoteUrl}</code></p>
          ) : (
            <p className="text-ey-gray01 text-[13px] m-0 mb-2">Aucun remote. Collez l'URL d'un dépôt distant (créé sur GitHub/GitLab).</p>
          )}
          <div className="flex gap-2 mt-2">
            <input className="input input-bordered input-sm flex-1" placeholder="https://github.com/…/repo.git" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} spellCheck={false} />
            <button className="btn btn-outline btn-sm gap-1.5" onClick={() => run("addRemote", { url: remoteUrl }, "Remote configuré.")} disabled={busy || !remoteUrl.trim()}>
              <Plus size={14} /> {status.remoteUrl ? "Remplacer" : "Définir"}
            </button>
          </div>
        </Card>

        <Card className="p-4">
          <b className="text-[14px] flex items-center gap-2 mb-2"><GitBranch size={16} className="text-ey-gray01" /> Branches</b>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {status.branches.map((b) => (
              <button
                key={b}
                className={`btn btn-xs ${b === status.branch ? "btn-primary" : "btn-outline"}`}
                onClick={() => b !== status.branch && run("checkout", { name: b }, `Sur ${b}.`)}
                disabled={busy}
              >
                {b}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input input-bordered input-sm flex-1" placeholder="nouvelle-branche" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} spellCheck={false} />
            <button className="btn btn-outline btn-sm gap-1.5" onClick={() => run("createBranch", { name: newBranch }, "Branche créée.")} disabled={busy || !newBranch.trim()}>
              <Plus size={14} /> Créer
            </button>
          </div>
        </Card>
      </div>

      {/* History */}
      <Card className="p-4 mt-4">
        <b className="text-[14px] flex items-center gap-2 mb-2"><GitCommit size={16} className="text-ey-gray01" /> Derniers commits</b>
        {status.log.length === 0 ? (
          <p className="text-ey-gray01 text-[13px] m-0">Aucun commit pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-1 font-mono text-[12px]">
            {status.log.map((l, i) => (
              <div key={i} className="truncate text-ey-gray01">{l}</div>
            ))}
          </div>
        )}
      </Card>

      {banner}
    </>
  );
}
