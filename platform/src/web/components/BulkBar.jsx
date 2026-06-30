import React from "react";
import { Wand2, X, Loader2 } from "lucide-react";

/** Floating action bar shown when one or more items are selected for bulk handling. */
export default function BulkBar({ count, onAuto, onClear, busy }) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-secondary text-white rounded-lg shadow-xl pl-4 pr-2 py-2 flex items-center gap-3 max-w-[92vw]">
      <span className="text-[13px]">
        <b>{count}</b> élément{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}
      </span>
      <button className="btn btn-primary btn-sm gap-1.5" onClick={onAuto} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
        Traiter au mieux (déléguer à l'IA)
      </button>
      <button className="btn btn-ghost btn-sm btn-square text-white" onClick={onClear} disabled={busy}>
        <X size={16} />
      </button>
    </div>
  );
}
