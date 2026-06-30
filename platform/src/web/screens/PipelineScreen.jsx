import React from "react";
import { GateBadge, Chip } from "../components/ui.jsx";

export default function PipelineScreen({ state, onOpenPhase }) {
  return (
    <>
      <h2 className="text-[22px] font-bold tracking-tight m-0">Avancement du projet</h2>
      <p className="text-ey-gray01 mt-1 mb-6">
        Les 8 étapes de la chaîne, de la définition du besoin jusqu'à la mise en production. Chaque
        étape n'est franchie qu'une fois validée.
      </p>

      <div className="flex flex-col gap-2.5">
        {state.phases.map((phase) => {
          const isCurrent = phase.id === state.project.currentPhaseId;
          const pendingCount = state.decisions.filter(
            (d) => d.phaseId === phase.id && d.status === "pending"
          ).length;
          return (
            <button
              key={phase.id}
              onClick={() => onOpenPhase(phase)}
              className={`grid grid-cols-[52px_1fr_auto] items-center gap-4 px-5 py-4 bg-base-100 border rounded-lg shadow-sm text-left w-full transition hover:border-ey-gray02 ${
                isCurrent ? "border-ey-yellow ring-1 ring-ey-yellow" : "border-ey-border"
              }`}
            >
              <span
                className={`w-11 h-11 rounded-lg grid place-items-center font-bold text-[15px] ${
                  isCurrent ? "bg-ey-yellow text-ey-black" : "bg-base-200 text-ey-gray01"
                }`}
              >
                {phase.id}
              </span>
              <div>
                <h3 className="m-0 text-[15px] font-bold">
                  {phase.title}
                  {isCurrent ? (
                    <span className="text-ey-gray01 text-xs font-medium ml-2">• en cours</span>
                  ) : null}
                </h3>
                <p className="m-0 mt-0.5 text-ey-gray01 text-[12.5px]">{phase.plain}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <GateBadge status={phase.gateStatus} />
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {phase.ownerProfiles.map((p) => (
                    <Chip key={p.id} color={p.color}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
                {pendingCount > 0 ? (
                  <span
                    className="text-[11.5px] font-semibold px-2 py-0.5 rounded"
                    style={{ color: "#A15C07", background: "#FFF3DF" }}
                  >
                    {pendingCount} à traiter
                  </span>
                ) : (
                  <span className="text-[11.5px] text-ey-gray01">
                    {phase.docCount} document{phase.docCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
