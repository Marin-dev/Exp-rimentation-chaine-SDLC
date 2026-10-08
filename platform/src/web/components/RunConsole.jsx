import React, { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Terminal, Square } from "lucide-react";
import { Api } from "../api.js";

export default function RunConsole({ runId, label, onDone }) {
  const [log, setLog] = useState("");
  const [status, setStatus] = useState("running");
  const [stopping, setStopping] = useState(false);
  const boxRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    setLog("");
    setStatus("running");
    setStopping(false);
    doneRef.current = false;
    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);

    es.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "log") setLog((prev) => prev + msg.chunk);
      else if (msg.type === "status") setStatus(msg.status);
      else if (msg.type === "ingested") {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone && onDone();
        }
        es.close();
      }
    };
    es.onerror = () => {
      // Stream closed by server at end of run.
      es.close();
    };
    return () => es.close();
  }, [runId]);

  async function stop() {
    if (!window.confirm("Arrêter cet agent ? Le travail déjà écrit reste sur le disque.")) return;
    setStopping(true);
    try {
      await Api.cancelRun(runId);
    } catch {
      setStopping(false);
    }
  }

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [log]);

  return (
    <div className="border border-ey-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-base-200 border-b border-ey-border">
        <Terminal size={15} className="text-ey-gray01" />
        <span className="text-[13px] font-semibold">{label || "Travail de l'IA"}</span>
        <span className="ml-auto inline-flex items-center gap-2">
          {status === "running" ? (
            <button className="btn btn-ghost btn-xs gap-1" onClick={stop} disabled={stopping} title="Arrêter l'agent">
              <Square size={12} /> {stopping ? "Arrêt…" : "Arrêter"}
            </button>
          ) : null}
          {status === "running" ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-accent font-medium">
              <Loader2 size={14} className="animate-spin" /> En cours…
            </span>
          ) : status === "done" ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#168736] font-medium">
              <CheckCircle2 size={14} /> Terminé
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-error font-medium">
              <AlertTriangle size={14} /> Interrompu
            </span>
          )}
        </span>
      </div>
      <pre
        ref={boxRef}
        className="m-0 p-4 bg-[#1a1a24] text-[#e6e8ee] text-[12px] leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap break-words"
      >
        {log || "Initialisation…"}
      </pre>
    </div>
  );
}
