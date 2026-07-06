import React from "react";
import { Home, Inbox, GitBranch, FileText, Settings, Rocket, Server, GitFork, Wallet, History, Loader2, Compass, ShieldAlert, ListChecks } from "lucide-react";
import ProfileSwitcher from "./ProfileSwitcher.jsx";

/** Header indicator: which agents are running right now, across the whole app. */
function ActiveRunsIndicator({ runs, onOpenRun }) {
  if (!runs || runs.length === 0) return null;
  return (
    <div className="dropdown dropdown-end">
      <button tabIndex={0} className="btn btn-sm gap-2 bg-base-100 border-ey-border">
        <Loader2 size={15} className="animate-spin text-accent" />
        {runs.length} agent{runs.length > 1 ? "s" : ""} en cours
      </button>
      <div
        tabIndex={0}
        className="dropdown-content mt-2 w-80 bg-base-100 border border-ey-border rounded-lg shadow-xl p-2 z-50"
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-ey-gray01 px-2 py-1">
          Agents en cours
        </div>
        {runs.map((r) => (
          <button
            key={r.id}
            className="w-full text-left px-2 py-2 rounded hover:bg-base-200 flex items-center gap-2"
            onClick={() => onOpenRun && onOpenRun(r)}
            title="Voir ce que fait l'agent"
          >
            <Loader2 size={13} className="animate-spin text-accent shrink-0" />
            <span className="text-[13px] font-medium flex-1 truncate">{r.agent || r.label}</span>
            {r.phaseId ? <span className="badge badge-ghost badge-sm">{r.phaseId}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  {
    group: "Pilotage",
    items: [
      { id: "dashboard", label: "Accueil", Icon: Home },
      { id: "orchestrator", label: "Orchestrateur", Icon: Compass },
      { id: "decisions", label: "Décisions", Icon: Inbox, badge: "pending" },
      { id: "risks", label: "Risques", Icon: ShieldAlert, badge: "risks" },
      { id: "tasks", label: "Tâches", Icon: ListChecks, badge: "tasks" },
      { id: "pipeline", label: "Avancement", Icon: GitBranch },
      { id: "activity", label: "Activité", Icon: History },
      { id: "cost", label: "Coûts", Icon: Wallet }
    ]
  },
  {
    group: "Projet",
    items: [
      { id: "launch", label: "Lancement", Icon: Rocket },
      { id: "documents", label: "Documents", Icon: FileText },
      { id: "app", label: "Application", Icon: Server }
    ]
  },
  {
    group: "Système",
    items: [
      { id: "git", label: "Git", Icon: GitFork },
      { id: "settings", label: "Réglages", Icon: Settings }
    ]
  }
];

function EyMark() {
  return (
    <div className="w-9 h-9 bg-ey-yellow grid place-items-center rounded-[3px] shrink-0">
      <span className="text-ey-black font-extrabold text-[15px] italic tracking-tight">EY</span>
    </div>
  );
}

export default function Layout({
  state,
  screen,
  onNavigate,
  profile,
  onProfileChange,
  title,
  crumb,
  activeRuns,
  onOpenPhase,
  onOpenRun,
  children
}) {
  const pending = state?.summary?.decisionsPending || 0;
  const risksOpen = state?.summary?.risksOpen || 0;
  const tasksOpen = state?.summary?.tasksOpen || 0;

  return (
    <div className="grid grid-cols-[256px_1fr] h-screen">
      {/* Sidebar */}
      <aside className="ey-beam text-ey-gray02 flex flex-col p-4 gap-1 overflow-y-auto">
        <div className="flex items-center gap-2.5 px-1 pb-4">
          <EyMark />
          <div>
            <div className="text-white font-bold text-[15px] leading-tight">SDLC Studio</div>
            <div className="text-ey-gray01 text-[11px]">Chaîne de développement</div>
          </div>
        </div>

        {NAV.map((grp) => (
          <div key={grp.group}>
            <div className="text-ey-gray01 text-[10.5px] font-bold uppercase tracking-wider px-2.5 pt-4 pb-1.5">
              {grp.group}
            </div>
            {grp.items.map((item) => (
              <button
                key={item.id}
                className={`ey-nav-item ${screen === item.id ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
              >
                <item.Icon size={17} strokeWidth={2} />
                {item.label}
                {item.badge === "pending" && pending > 0 ? (
                  <span className="ml-auto bg-error text-white rounded-full px-2 text-[11px] font-semibold">
                    {pending}
                  </span>
                ) : null}
                {item.badge === "risks" && risksOpen > 0 ? (
                  <span className="ml-auto bg-[#A15C07] text-white rounded-full px-2 text-[11px] font-semibold">
                    {risksOpen}
                  </span>
                ) : null}
                {item.badge === "tasks" && tasksOpen > 0 ? (
                  <span className="ml-auto bg-secondary text-white rounded-full px-2 text-[11px] font-semibold">
                    {tasksOpen}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ))}

        <div className="mt-auto pt-4">
          <div className="text-ey-gray01 text-[10.5px] font-bold uppercase tracking-wider px-2.5 pb-1">
            Projet actif
          </div>
          <div className="px-2.5 text-white text-[13px] font-semibold">
            {state?.project?.name || "Aucun projet"}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-7 py-3.5 bg-base-100 border-b border-ey-border">
          <div>
            <h1 className="text-base font-bold m-0">{title}</h1>
            {crumb ? <div className="text-ey-gray01 text-[12px]">{crumb}</div> : null}
          </div>
          <div className="flex-1" />
          <ActiveRunsIndicator runs={activeRuns} onOpenRun={onOpenRun} />
          {state?.profiles ? (
            <ProfileSwitcher
              profiles={state.profiles}
              current={profile}
              onChange={onProfileChange}
            />
          ) : null}
        </header>
        <main className="overflow-y-auto p-7">
          <div className="max-w-5xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
