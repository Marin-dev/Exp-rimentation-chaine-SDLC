import React from "react";
import { Inbox, CheckCircle2, ArrowRight, Users, ShieldCheck, GitBranch } from "lucide-react";
import { Card, Stat, GateBadge, Chip, EmptyState, SectionTitle } from "../components/ui.jsx";
import ProcessMap from "../components/ProcessMap.jsx";

export default function DashboardScreen({ state, profile, onNavigate, onOpenDecision, onOpenPhase }) {
  const me = state.profiles.find((p) => p.id === profile) || state.profiles[0];
  const currentPhase = state.phases.find((p) => p.id === state.project.currentPhaseId);
  const myDecisions = state.decisions.filter(
    (d) => d.status === "pending" && (me.seesAll || d.targetProfile === me.id)
  );

  return (
    <>
      {/* Vision hero */}
      <div className="ey-beam rounded-xl px-7 py-6 text-white mb-5">
        <div className="text-ey-yellow text-[12px] font-bold uppercase tracking-wider mb-1">
          AI Dev Chain
        </div>
        <h2 className="text-[24px] font-bold tracking-tight m-0 max-w-3xl">
          De la vision au logiciel livré, piloté par une équipe d'agents IA — avec l'humain dans la boucle.
        </h2>
        <p className="text-white/70 mt-2 mb-4 max-w-3xl text-[14px]">
          Chaque étape est portée par des agents qui incarnent un métier (sponsor, UX, architecte,
          PO, dev, QA, DevOps…). Des reviewers challengent, des gates verrouillent la qualité, et
          quand un choix structurant dépasse les preuves, le bon profil tranche.
        </p>
        <div className="flex flex-wrap gap-5 text-[12.5px] text-white/80">
          <span className="flex items-center gap-1.5"><Users size={15} className="text-ey-yellow" /> Agents = profils métier</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-ey-yellow" /> Gates G0→G7</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-ey-yellow" /> Sécurité produit & agents</span>
          <span className="flex items-center gap-1.5"><GitBranch size={15} className="text-ey-yellow" /> Boucle de feedback</span>
        </div>
      </div>

      {/* Process map (the vision) */}
      <ProcessMap state={state} onOpenPhase={onOpenPhase} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Stat accent num={`${state.summary.gatesPassed}/${state.summary.totalGates}`} label="Étapes validées" />
        <Stat num={state.summary.docsCount} label="Documents produits" />
        <Stat num={state.summary.decisionsPending} label="Décisions en attente" />
      </div>

      {/* Inbox */}
      <SectionTitle icon={Inbox}>Ce qui vous attend — {me.label}</SectionTitle>
      <Card>
        {myDecisions.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Rien à traiter pour le moment">
            Quand un agent a besoin d'une décision ou d'une information de votre part, elle apparaît
            ici, routée vers votre profil.
          </EmptyState>
        ) : (
          myDecisions.slice(0, 6).map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[auto_1fr_auto] gap-3.5 items-center px-5 py-4 border-b border-ey-border last:border-0"
            >
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded"
                style={d.severity === "high" ? { color: "#B42318", background: "#FDEBEA" } : { color: "#A15C07", background: "#FFF3DF" }}
              >
                {d.severity === "high" ? "Important" : "À décider"}
              </span>
              <div className="min-w-0">
                <h4 className="m-0 text-sm font-semibold truncate">{d.title}</h4>
                <p className="m-0 mt-0.5 text-ey-gray01 text-[12.5px] truncate">{d.summary}</p>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => onOpenDecision(d)}>
                Ouvrir
              </button>
            </div>
          ))
        )}
      </Card>

      {currentPhase ? (
        <Card className="p-4 mt-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <strong className="text-[15px]">Étape en cours : {currentPhase.id} · {currentPhase.title}</strong>
              <GateBadge status={currentPhase.gateStatus} />
            </div>
            <p className="text-ey-gray01 text-[12.5px] m-0 mt-0.5">{currentPhase.plain}</p>
          </div>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onOpenPhase(currentPhase.id)}>
            Ouvrir <ArrowRight size={15} />
          </button>
        </Card>
      ) : null}
    </>
  );
}
