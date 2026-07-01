import React, { useState } from "react";
import {
  Search,
  Plus,
  Puzzle,
  Plug,
  Bot,
  Copy,
  ArrowLeft,
  Sparkles,
  FolderOpen,
  Library,
  X,
  FolderPlus,
  Rocket
} from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState, useEscToClose } from "../components/ui.jsx";
import FolderInput from "../components/FolderInput.jsx";

function LibraryPolicyCard({ state, onStateChange }) {
  const current = (state.config && state.config.policies && state.config.policies.libraries) || { mode: "ask", allowed: [] };
  const [mode, setMode] = useState(current.mode || "ask");
  const [allowed, setAllowed] = useState(current.allowed || []);
  const [newLib, setNewLib] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function addLib() {
    const v = newLib.trim();
    if (v && !allowed.includes(v)) setAllowed((a) => [...a, v]);
    setNewLib("");
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const next = await Api.setPolicies({ libraries: { mode, allowed } });
      onStateChange(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 mb-4">
      <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
        <Library size={17} className="text-ey-gray01" /> Politique des librairies
      </h3>
      <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
        Contrôlez si les agents (dev, etc.) peuvent utiliser des librairies librement ou doivent
        d'abord vous demander l'autorisation.
      </p>

      <div className="flex flex-col gap-2 mb-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="radio" className="radio radio-sm mt-0.5" checked={mode === "ask"} onChange={() => setMode("ask")} />
          <span>
            <b className="text-[13.5px]">Demander l'autorisation</b>
            <span className="block text-[12.5px] text-ey-gray01">
              L'agent lève une décision « Utiliser la librairie X ? » et attend votre réponse avant de l'installer.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="radio" className="radio radio-sm mt-0.5" checked={mode === "allow-all"} onChange={() => setMode("allow-all")} />
          <span>
            <b className="text-[13.5px]">Tout autoriser</b>
            <span className="block text-[12.5px] text-ey-gray01">
              L'agent utilise les librairies qu'il juge pertinentes, sans demander.
            </span>
          </span>
        </label>
      </div>

      {mode === "ask" ? (
        <div className="mb-3">
          <label className="block text-[12.5px] font-semibold mb-1.5">Librairies déjà approuvées</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allowed.length === 0 ? <span className="text-[12.5px] text-ey-gray02">Aucune pour l'instant.</span> : null}
            {allowed.map((lib) => (
              <span key={lib} className="inline-flex items-center gap-1.5 text-[12.5px] bg-base-200 border border-ey-border rounded px-2 py-1">
                {lib}
                <button onClick={() => setAllowed((a) => a.filter((x) => x !== lib))}>
                  <X size={13} className="text-ey-gray01" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="ex. daisyui"
              value={newLib}
              onChange={(e) => setNewLib(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLib()}
            />
            <button className="btn btn-outline btn-sm gap-1.5" onClick={addLib} disabled={!newLib.trim()}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
        </div>
      ) : null}

      <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
        {saved ? "Enregistré" : busy ? "Enregistrement…" : "Enregistrer la politique"}
      </button>
    </Card>
  );
}

function ResourceRow({ title, subtitle, badge }) {
  return (
    <div className="grid grid-cols-[minmax(160px,220px)_1fr_auto] gap-3 items-center py-2.5 border-b border-ey-border last:border-0">
      <code className="bg-transparent text-accent text-[13px] font-semibold">{title}</code>
      <span className="text-ey-gray01 text-[13px]">{subtitle}</span>
      {badge ? <span className="badge badge-ghost badge-sm">{badge}</span> : <span />}
    </div>
  );
}

function SuggestionCard({ s }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-ey-border rounded-md p-3.5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} className="text-ey-gray01" />
        <b className="text-[13.5px]">{s.name}</b>
        {s.source ? <span className="badge badge-ghost badge-sm">{s.source}</span> : null}
      </div>
      {s.description ? <p className="text-[12.5px] text-ey-gray01 m-0 mb-1.5">{s.description}</p> : null}
      {s.why ? <p className="text-[12.5px] m-0 mb-2">{s.why}</p> : null}
      {s.install ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] bg-base-200 border border-ey-border rounded px-2 py-1 truncate">
            {s.install}
          </code>
          <button
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => {
              navigator.clipboard?.writeText(s.install);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy size={13} /> {copied ? "Copié" : "Copier"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AddSkillModal({ onClose, onCreated }) {
  useEscToClose(onClose);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState("input"); // input | searching | results
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function search() {
    setPhase("searching");
    setError(null);
    try {
      const res = await Api.searchSkills(name.trim(), description.trim());
      setSuggestions(res.suggestions || []);
      setPhase("results");
    } catch (e) {
      setError(e.message);
      setPhase("input");
    }
  }

  async function createNew() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.createSkill(name.trim(), description.trim());
      onCreated(res.state);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un skill"
        className="bg-base-100 rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold m-0 mb-1">Ajouter un skill</h3>
        <p className="text-ey-gray01 text-[13px] mt-0 mb-4">
          On cherche d'abord un skill existant et optimisé en ligne avant d'en créer un de zéro.
        </p>

        {phase === "input" ? (
          <>
            <label className="block text-[12.5px] font-semibold mb-1.5">Nom du skill</label>
            <input
              className="input input-bordered w-full mb-3"
              placeholder="ex. revue-rgpd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <label className="block text-[12.5px] font-semibold mb-1.5">Besoin / description</label>
            <textarea
              className="textarea textarea-bordered w-full mb-3"
              rows={3}
              placeholder="À quoi sert ce skill et quand l'utiliser ?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Annuler
              </button>
              <button
                className="btn btn-outline btn-sm gap-1.5"
                onClick={createNew}
                disabled={!name.trim() || busy}
              >
                <Plus size={15} /> Créer un skill vierge
              </button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={search}
                disabled={!name.trim()}
              >
                <Search size={15} /> Chercher un skill existant
              </button>
            </div>
          </>
        ) : null}

        {phase === "searching" ? (
          <div className="text-center py-10">
            <span className="loading loading-spinner loading-lg text-ey-yellow" />
            <p className="text-ey-gray01 mt-3 mb-0">
              Recherche de skills existants et optimisés…
            </p>
            <p className="text-ey-gray02 text-[12px] mt-1">
              Le skill <code>find-skills</code> explore les skills publiés. Cela peut prendre un
              moment.
            </p>
          </div>
        ) : null}

        {phase === "results" ? (
          <>
            {suggestions.length > 0 ? (
              <>
                <p className="text-[13px] font-semibold mb-2">
                  {suggestions.length} skill{suggestions.length > 1 ? "s" : ""} existant
                  {suggestions.length > 1 ? "s" : ""} trouvé{suggestions.length > 1 ? "s" : ""} :
                </p>
                <div className="flex flex-col gap-2.5 mb-4">
                  {suggestions.map((s, i) => (
                    <SuggestionCard key={i} s={s} />
                  ))}
                </div>
              </>
            ) : (
              <div className="py-4">
                <EmptyState icon={Search} title="Aucun skill existant trouvé">
                  Rien d'optimisé en ligne pour ce besoin. Vous pouvez créer un nouveau skill.
                </EmptyState>
              </div>
            )}
            {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}
            <div className="flex justify-between gap-2">
              <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => setPhase("input")}>
                <ArrowLeft size={15} /> Retour
              </button>
              <button className="btn btn-primary btn-sm gap-1.5" onClick={createNew} disabled={busy}>
                <Plus size={15} /> {busy ? "Création…" : "Créer un nouveau skill"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const TABS = [
  { id: "agents", label: "Agents", Icon: Bot },
  { id: "skills", label: "Skills", Icon: Puzzle },
  { id: "mcp", label: "MCP", Icon: Plug }
];

export default function SettingsScreen({ state, onStateChange }) {
  const [workspace, setWorkspace] = useState(state.config.workspaceRoot);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("agents");
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newBusy, setNewBusy] = useState(false);
  const [newMsg, setNewMsg] = useState(null);
  const [newErr, setNewErr] = useState(null);

  async function createProject() {
    setNewBusy(true);
    setNewMsg(null);
    setNewErr(null);
    try {
      const res = await Api.newProject(newPath.trim());
      onStateChange(res.state);
      setNewMsg(`Projet créé : ${res.path}. Dossier de travail basculé dessus.`);
      setNewPath("");
      setWorkspace(res.state.config.workspaceRoot);
    } catch (e) {
      setNewErr(e.message);
    } finally {
      setNewBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const next = await Api.setWorkspace(workspace.trim());
      onStateChange(next);
      setMessage("Dossier de travail mis à jour.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const counts = { agents: state.agents.length, skills: state.skills.length, mcp: state.mcpServers.length };

  return (
    <>
      <h2 className="text-[22px] font-bold tracking-tight m-0">Réglages</h2>
      <p className="text-ey-gray01 mt-1 mb-6">
        Dossier de travail et ressources disponibles pour la chaîne d'agents.
      </p>

      {/* Workspace */}
      <Card className="p-5 mb-4">
        <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
          <FolderOpen size={17} className="text-ey-gray01" /> Dossier de travail
        </h3>
        <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
          Le dossier du projet contenant <code>.claude/</code> et <code>livrables/</code>.
        </p>
        <FolderInput value={workspace} onChange={setWorkspace} />
        <p className={`text-[12px] mt-1.5 ${state.config.workspaceExists ? "text-success" : "text-error"}`}>
          {state.config.workspaceExists ? "Dossier détecté" : "Ce dossier est introuvable."}
        </p>
        {message ? <div className="text-success text-sm mb-2">{message}</div> : null}
        {error ? <div className="alert alert-error text-sm mb-2">{error}</div> : null}
        <button className="btn btn-primary btn-sm mt-1" onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </Card>

      {/* New project */}
      <Card className="p-5 mb-4">
        <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
          <FolderPlus size={17} className="text-ey-gray01" /> Nouveau projet
        </h3>
        <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
          Crée un nouveau dossier de projet avec le socle réutilisable (agents, règles, skills) et
          une arborescence /livrables vide, puis bascule le dossier de travail dessus.
        </p>
        <FolderInput value={newPath} onChange={setNewPath} placeholder="C:\chemin\vers\le\nouveau-projet" />
        <button className="btn btn-primary gap-1.5 mt-3" onClick={createProject} disabled={newBusy || !newPath.trim()}>
          <Rocket size={16} /> {newBusy ? "Création…" : "Créer le projet"}
        </button>
        {newMsg ? <div className="text-success text-sm mt-2">{newMsg}</div> : null}
        {newErr ? <div className="alert alert-error text-sm mt-2">{newErr}</div> : null}
      </Card>

      {/* Library policy */}
      <LibraryPolicyCard state={state} onStateChange={onStateChange} />

      {/* Resources */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold m-0">Ressources du projet</h3>
          {tab === "skills" ? (
            <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setShowSkillModal(true)}>
              <Plus size={15} /> Ajouter un skill
            </button>
          ) : null}
        </div>

        <div role="tablist" className="tabs tabs-bordered mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              className={`tab gap-1.5 ${tab === t.id ? "tab-active font-semibold" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <t.Icon size={15} /> {t.label} ({counts[t.id]})
            </button>
          ))}
        </div>

        {tab === "agents" ? (
          <div>
            {state.agents.map((a) => (
              <ResourceRow key={a.id} title={a.name} subtitle={a.description} />
            ))}
          </div>
        ) : null}

        {tab === "skills" ? (
          state.skills.length === 0 ? (
            <EmptyState icon={Puzzle} title="Aucun skill dans ce projet">
              Les skills étendent les capacités des agents. Cliquez sur « Ajouter un skill » pour en
              chercher un existant ou en créer un dans <code>.claude/skills/</code>.
            </EmptyState>
          ) : (
            <div>
              {state.skills.map((s) => (
                <ResourceRow key={s.id} title={s.name} subtitle={s.description} />
              ))}
            </div>
          )
        ) : null}

        {tab === "mcp" ? (
          state.mcpServers.length === 0 ? (
            <EmptyState icon={Plug} title="Aucun serveur MCP configuré">
              Les serveurs MCP donnent aux agents l'accès à des outils externes (GitHub, cloud,
              navigateur…). Ajoutez-les dans un fichier <code>.mcp.json</code> à la racine du projet.
            </EmptyState>
          ) : (
            <div>
              {state.mcpServers.map((m) => (
                <ResourceRow key={m.id} title={m.name} subtitle={m.command} badge={m.source} />
              ))}
            </div>
          )
        ) : null}
      </Card>

      {showSkillModal ? (
        <AddSkillModal
          onClose={() => setShowSkillModal(false)}
          onCreated={(next) => {
            onStateChange(next);
            setShowSkillModal(false);
            setTab("skills");
          }}
        />
      ) : null}
    </>
  );
}
