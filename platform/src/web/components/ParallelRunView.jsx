import React, { useEffect, useRef, useState } from "react";
import { Layers, Loader2, CheckCircle2 } from "lucide-react";
import { Api } from "../api.js";
import RunConsole from "./RunConsole.jsx";

/**
 * Live view of a parallel phase run (Option A): renders each stage, and within
 * the active stage a console per agent running concurrently.
 */
export default function ParallelRunView({ groupId, onDone }) {
  const [group, setGroup] = useState(null);
  const timer = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    function poll() {
      Api.getGroup(groupId)
        .then((r) => {
          setGroup(r.group);
          if (r.group.status !== "running" && !doneRef.current) {
            doneRef.current = true;
            clearInterval(timer.current);
            onDone && onDone();
          }
        })
        .catch(() => {});
    }
    poll();
    timer.current = setInterval(poll, 2500);
    return () => clearInterval(timer.current);
  }, [groupId]);

  if (!group) {
    return (
      <div className="text-ey-gray01 text-[13px] flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Démarrage des agents en parallèle…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {group.stages.map((stage, i) => {
        if (stage.agents.length === 0) return null;
        const isCurrent = i === group.currentStage && group.status === "running";
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-2 text-[12.5px] font-semibold text-ey-gray01">
              <Layers size={14} /> Étape parallèle {i + 1}/{group.stages.length}
              {isCurrent ? (
                <span className="text-accent inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> en cours</span>
              ) : (
                <span className="text-[#168736] inline-flex items-center gap-1"><CheckCircle2 size={12} /> terminé</span>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {stage.agents.map((a) => (
                <div key={a.runId || a.name}>
                  <div className="text-[12px] font-semibold mb-1">{a.name}</div>
                  {a.runId ? (
                    <RunConsole runId={a.runId} label={a.name} />
                  ) : (
                    <div className="text-ey-gray02 text-[12px]">en attente…</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
