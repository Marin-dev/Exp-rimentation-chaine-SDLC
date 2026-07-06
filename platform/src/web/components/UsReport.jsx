import React, { useState, useEffect, useCallback } from "react";
import { Layers, CheckCircle2, Circle, RefreshCw, Loader2, ChevronDown, ChevronRight, GitMerge } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";

const US_DIR = "livrables/05-backlog/user-stories";

/** One User Story line. */
function UsRow({ u, done, onOpenDoc }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <button
      className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-md hover:bg-base-200 transition"
      onClick={() => onOpenDoc && onOpenDoc({ path: `${US_DIR}/${u.file}`, title: `${u.id} — ${u.title}`, name: u.file, phaseId: "G5" })}
    >
      <Icon size={15} className={done ? "text-[#168736] shrink-0" : "text-ey-gray02 shrink-0"} />
      <span className="text-[11px] font-mono text-ey-gray02 shrink-0">{u.id}</span>
      <span className="text-[13px] font-medium truncate flex-1">{u.title}</span>
      {u.integrationBCs && u.integrationBCs.length ? (
        <GitMerge size={13} className="text-ey-gray02 shrink-0" title={`Intégration inter-BC : ${u.integrationBCs.join(", ")}`} />
      ) : null}
      {u.primaryBC ? (
        <span className="text-[10.5px] font-semibold text-ey-gray01 bg-base-200 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
          {u.primaryBC}
        </span>
      ) : null}
    </button>
  );
}

/** A collapsible group of US grouped by Bounded Context. */
function UsGroup({ title, count, tone, list, done, defaultOpen, onOpenDoc }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  // Group by BC for readability.
  const byBC = new Map();
  for (const u of list) {
    const key = u.primaryBC || "—";
    if (!byBC.has(key)) byBC.set(key, { name: u.bcName || key, items: [] });
    byBC.get(key).items.push(u);
  }
  const groups = [...byBC.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return (
    <div className="border-t border-ey-border">
      <button className="flex items-center gap-2 w-full px-4 py-2.5 text-left" onClick={() => setOpen((o) => !o)}>
        <Chevron size={15} className="text-ey-gray02" />
        <span className="text-[13.5px] font-bold" style={{ color: tone }}>{title}</span>
        <span className="text-[12px] font-semibold text-ey-gray02">({count})</span>
      </button>
      {open ? (
        <div className="px-2 pb-3">
          {list.length === 0 ? (
            <p className="text-[12.5px] text-ey-gray02 px-3 py-1 m-0">Aucune.</p>
          ) : (
            groups.map(([bc, g]) => (
              <div key={bc} className="mb-1.5 last:mb-0">
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold text-ey-gray02 uppercase tracking-wide">
                  {bc}{g.name && g.name !== bc ? ` · ${g.name}` : ""} ({g.items.length})
                </div>
                {g.items.map((u) => <UsRow key={u.id} u={u} done={done} onOpenDoc={onOpenDoc} />)}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Development report for the dev zone: which User Stories are already developed
 * (have a vertical-slice impl note) vs still to develop. Refetches when `version`
 * changes (e.g. after a dev run produces new impl notes).
 */
export default function UsReport({ version, onOpenDoc }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Api.getUsReport()
      .then(setData)
      .catch(() => setData({ ok: false, error: "Rapport indisponible." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, version]);

  const total = data?.total || 0;
  const doneN = data?.developedCount || 0;
  const pct = total ? Math.round((doneN / total) * 100) : 0;

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4 px-4 py-3.5 border-b border-ey-border">
        <div className="flex items-start gap-2.5">
          <Layers size={18} className="mt-0.5 text-secondary" />
          <div>
            <h3 className="m-0 text-[15px] font-bold">User Stories — développement</h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-ey-gray01">
              {data && data.ok
                ? `${doneN} / ${total} développée${doneN > 1 ? "s" : ""} · ${data.todoCount} à développer`
                : "État des User Stories du backlog."}
            </p>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-square" onClick={load} title="Rafraîchir" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      {data && !data.ok ? (
        <div className="px-4 py-4 text-[13px] text-ey-gray01">
          {data.error || "Rapport indisponible."} Les User Stories sont attendues dans <code>{US_DIR}/</code>.
        </div>
      ) : total === 0 ? (
        <div className="px-4 py-4 text-[13px] text-ey-gray01">
          Aucune User Story trouvée dans le backlog pour l'instant.
        </div>
      ) : (
        <>
          <div className="px-4 py-3">
            <div className="h-2 w-full rounded-full bg-base-200 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#168736" }} />
            </div>
            <div className="mt-1 text-[11.5px] text-ey-gray02">{pct}% du backlog développé</div>
          </div>
          <UsGroup
            title="À développer"
            count={data.todoCount}
            tone="#A15C07"
            list={data.todo}
            done={false}
            defaultOpen
            onOpenDoc={onOpenDoc}
          />
          <UsGroup
            title="Développées"
            count={data.developedCount}
            tone="#168736"
            list={data.developed}
            done
            defaultOpen={false}
            onOpenDoc={onOpenDoc}
          />
        </>
      )}
    </Card>
  );
}
