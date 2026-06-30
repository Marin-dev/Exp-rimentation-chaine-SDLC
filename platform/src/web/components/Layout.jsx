import React from "react";
import { Home, Inbox, GitBranch, FileText, Settings, Rocket, Server, GitFork, Wallet } from "lucide-react";
import ProfileSwitcher from "./ProfileSwitcher.jsx";

const NAV = [
  {
    group: "Pilotage",
    items: [
      { id: "dashboard", label: "Accueil", Icon: Home },
      { id: "decisions", label: "Décisions", Icon: Inbox, badge: "pending" },
      { id: "pipeline", label: "Avancement", Icon: GitBranch },
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
  children
}) {
  const pending = state?.summary?.decisionsPending || 0;

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
