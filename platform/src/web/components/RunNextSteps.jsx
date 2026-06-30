import React from "react";
import { CheckCircle2, HelpCircle, Scale, Inbox, FileText, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "./ui.jsx";

/**
 * Shown when an agent run completes: turns the raw console end into clear,
 * human next steps — what the AI raised (decisions/questions, by profile) and
 * what to do now.
 */
export default function RunNextSteps({ state, runId, phaseId, byPhase, onOpenDecision, onNavigate }) {
  const items = byPhase
    ? state.decisions.filter((d) => d.phaseId === phaseId)
    : state.decisions.filter((d) => d.runId === runId);
  const pending = items.filter((d) => d.status === "pending");
  const isNewNeed = phaseId === "new-need" || phaseId == null;

  return (
    <Card className="p-5 mt-3 border-l-4" style={{ borderLeftColor: "#FFE600" }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-ey-yellow" />
        <b className="text-[15px]">L'IA a terminé ce passage</b>
      </div>

      {pending.length > 0 ? (
        <>
          <p className="text-ey-gray01 text-[13px] mt-1 mb-3">
            Elle a besoin de <b>{pending.length}</b> réponse{pending.length > 1 ? "s" : ""} avant de
            pouvoir continuer{isNewNeed ? " la prise en compte du besoin" : ""} :
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {pending.map((d) => {
              const Icon = d.type === "question" ? HelpCircle : Scale;
              return (
                <button
                  key={d.id}
                  onClick={() => onOpenDecision(d)}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-2.5 border border-ey-border rounded-md text-left hover:border-ey-gray02 hover:bg-base-200 transition"
                >
                  <Icon size={17} className="text-ey-gray01" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{d.title}</div>
                    <div className="text-[12px] text-ey-gray01 truncate">
                      {d.type === "question" ? "Question" : "Décision"} · pour {d.targetProfileLabel}
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                    style={d.severity === "high" ? { color: "#B42318", background: "#FDEBEA" } : { color: "#A15C07", background: "#FFF3DF" }}
                  >
                    {d.severity === "high" ? "Bloquant" : "À traiter"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="bg-base-200 rounded-md p-3 text-[12.5px] text-ey-gray01 mb-3">
            <b className="text-ey-black">Quoi faire :</b> répondez à chaque sollicitation (saisie,
            document, ou « Traiter au mieux » pour déléguer à l'IA). Une fois tout répondu, le bouton
            <b className="text-ey-black"> « Relancer l'IA »</b> apparaît pour qu'elle poursuive
            {isNewNeed ? " et propage le besoin vers les étapes impactées (vision, domaine, technique, backlog)." : "."}
          </div>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={() => onNavigate("decisions")}>
            <Inbox size={15} /> Traiter dans Décisions ({pending.length})
          </button>
        </>
      ) : (
        <>
          <p className="text-ey-gray01 text-[13px] mt-1 mb-3 flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-[#168736]" /> Aucune question en attente. Étapes
            possibles :
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm gap-1.5" onClick={() => onNavigate("documents")}>
              <FileText size={15} /> Voir les documents produits
            </button>
            <button className="btn btn-outline btn-sm gap-1.5" onClick={() => onNavigate("pipeline")}>
              <ArrowRight size={15} /> Suivre l'avancement
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
