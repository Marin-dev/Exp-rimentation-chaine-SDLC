import React from "react";
import { FileInput, RotateCcw, ChevronRight, ShieldCheck } from "lucide-react";

const STATUS = {
  PASS: "#168736",
  PASS_WITH_RISK: "#A15C07",
  FAIL: "#B42318",
  UNKNOWN: "#747480",
  NOT_STARTED: "#C4C4CD"
};

function PhaseNode({ phase, pending, onClick }) {
  const dot = STATUS[phase.gateStatus] || STATUS.NOT_STARTED;
  return (
    <button
      onClick={onClick}
      className="relative w-[168px] shrink-0 text-left bg-base-100 border border-ey-border rounded-lg p-3 hover:border-ey-yellow hover:shadow-md transition"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-7 h-7 rounded-md bg-ey-black text-white grid place-items-center text-[12px] font-bold">
          {phase.id}
        </span>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} title={phase.gateStatus} />
        {pending > 0 ? (
          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: "#A15C07", background: "#FFF3DF" }}>
            {pending}
          </span>
        ) : null}
      </div>
      <div className="text-[13px] font-bold leading-tight">{phase.title}</div>
      <div className="text-[11px] text-ey-gray01 mt-1 leading-snug">{phase.producers}</div>
      {phase.reviewer ? (
        <div className="text-[10.5px] text-ey-gray02 mt-1 truncate">revue : {phase.reviewer}</div>
      ) : null}
    </button>
  );
}

export default function ProcessMap({ state, onOpenPhase }) {
  const pendingFor = (id) => state.decisions.filter((d) => d.phaseId === id && d.status === "pending").length;

  return (
    <div className="bg-gradient-to-br from-[#fffef5] to-base-200 border border-ey-border rounded-xl p-5">
      <div className="flex flex-wrap items-stretch gap-2">
        {/* Intake */}
        <div className="w-[150px] shrink-0 rounded-lg border border-dashed border-ey-gray02 p-3 flex flex-col justify-center bg-base-100/60">
          <FileInput size={18} className="text-ey-gray01 mb-1" />
          <div className="text-[12.5px] font-bold leading-tight">Besoin client</div>
          <div className="text-[11px] text-ey-gray01">documents d'intake</div>
        </div>
        <div className="flex items-center"><ChevronRight size={18} className="text-ey-gray02" /></div>

        {state.phases.map((phase, i) => (
          <React.Fragment key={phase.id}>
            <PhaseNode phase={phase} pending={pendingFor(phase.id)} onClick={() => onOpenPhase(phase.id)} />
            {i < state.phases.length - 1 ? (
              <div className="flex items-center"><ChevronRight size={18} className="text-ey-gray02" /></div>
            ) : null}
          </React.Fragment>
        ))}

        <div className="flex items-center"><ChevronRight size={18} className="text-ey-gray02" /></div>
        {/* Feedback loop */}
        <div className="w-[150px] shrink-0 rounded-lg border border-dashed border-ey-gray02 p-3 flex flex-col justify-center bg-base-100/60">
          <RotateCcw size={18} className="text-ey-gray01 mb-1" />
          <div className="text-[12.5px] font-bold leading-tight">Feedback terrain</div>
          <div className="text-[11px] text-ey-gray01">@end-user → backlog</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 text-[11.5px] text-ey-gray01">
        <ShieldCheck size={14} className="text-ey-gray02" />
        Sécurité transverse : <b className="text-ey-black font-semibold">@agent-security-guard</b> veille sur les agents, permissions et données.
      </div>
    </div>
  );
}
