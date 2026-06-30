import React, { useEffect, useState } from "react";
import { DollarSign, RefreshCw, Layers, Users, Coins, Activity, Tag, Info, PieChart } from "lucide-react";
import { Api } from "../api.js";
import { Card, Stat, EmptyState } from "../components/ui.jsx";
import DonutChart from "../components/DonutChart.jsx";

const COLORS = ["#FFE600", "#2563eb", "#db2777", "#16a34a", "#ca8a04", "#dc2626", "#0891b2", "#7c3aed", "#0d9488", "#94a3b8"];

function fmtUsd(n) {
  const v = n || 0;
  return "$" + (v < 1 ? v.toFixed(4) : v.toFixed(2));
}
function fmtNum(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}

function BarList({ title, icon: Icon, data, color }) {
  const entries = Object.entries(data || {})
    .map(([key, v]) => ({ key, ...v }))
    .filter((e) => e.cost > 0 || e.tokens > 0)
    .sort((a, b) => b.cost - a.cost);
  const max = Math.max(1, ...entries.map((e) => e.cost));
  return (
    <Card className="p-5">
      <h3 className="text-[14px] font-bold m-0 mb-3 flex items-center gap-2">
        {Icon ? <Icon size={16} className="text-ey-gray01" /> : null} {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-ey-gray01 text-[13px] m-0">Aucune donnée.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.map((e, i) => (
            <div key={e.key}>
              <div className="flex justify-between text-[12.5px] mb-0.5">
                <span className="font-medium truncate">{e.key}</span>
                <span className="text-ey-gray01">
                  {fmtUsd(e.cost)} · {fmtNum(e.tokens)} tk · {e.runs} run{e.runs > 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-2 bg-base-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(e.cost / max) * 100}%`, background: color || COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BarDays({ data }) {
  const entries = Object.entries(data || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return <p className="text-ey-gray01 text-[13px] m-0">Aucune donnée.</p>;
  const max = Math.max(1, ...entries.map(([, v]) => v.cost));
  return (
    <div className="flex items-end gap-2 h-32">
      {entries.map(([day, v]) => (
        <div key={day} className="flex-1 flex flex-col items-center justify-end" title={`${day} · ${fmtUsd(v.cost)}`}>
          <div className="w-full bg-ey-yellow rounded-t" style={{ height: `${(v.cost / max) * 100}%`, minHeight: 2 }} />
          <span className="text-[10px] text-ey-gray02 mt-1">{day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function toSegments(map, field) {
  const entries = Object.entries(map || {})
    .map(([label, v]) => ({ label, value: v[field] || 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  if (entries.length <= 8) return entries;
  return [...entries.slice(0, 7), { label: "Autres", value: entries.slice(7).reduce((s, e) => s + e.value, 0) }];
}

function PricingEditor({ pricing, onSaved }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(pricing || { models: {} })));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fields = [["input", "Entrée"], ["output", "Sortie"], ["cacheWrite", "Écriture cache"], ["cacheRead", "Lecture cache"]];
  function setVal(model, key, value) {
    setDraft((d) => ({ ...d, models: { ...d.models, [model]: { ...d.models[model], [key]: Number(value) } } }));
  }
  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await Api.setPricing(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved && onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-ey-gray01 text-[12.5px] mt-0 mb-3">
        Prix en USD par <b>million de tokens</b>. Utilisés pour estimer le coût quand Claude ne renvoie
        pas de montant (abonnement).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-ey-gray01 text-left border-b border-ey-border">
              <th className="py-1.5 pr-3 font-semibold">Modèle</th>
              {fields.map(([k, l]) => <th key={k} className="py-1.5 pr-3 font-semibold text-right">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.keys(draft.models || {}).map((model) => (
              <tr key={model} className="border-b border-ey-border last:border-0">
                <td className="py-1.5 pr-3"><code className="bg-transparent">{model}</code></td>
                {fields.map(([k]) => (
                  <td key={k} className="py-1.5 pr-3 text-right">
                    <input type="number" step="0.01" className="input input-bordered input-xs w-20 text-right"
                      value={draft.models[model][k] ?? 0} onChange={(e) => setVal(model, k, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-primary btn-sm mt-3" onClick={save} disabled={busy}>
        {saved ? "Enregistré" : busy ? "Enregistrement…" : "Enregistrer les tarifs"}
      </button>
    </div>
  );
}

export default function CostScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showPricing, setShowPricing] = useState(false);

  function load() {
    Api.getSpend().then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert alert-error text-sm">{error}</div>;
  if (!data) return <p className="text-ey-gray01">Chargement…</p>;

  const s = data.summary;
  const tb = s.tokenBreakdown;
  const totalTb = Math.max(1, tb.input + tb.output + tb.cacheCreate + tb.cacheRead);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight m-0">Coûts</h2>
          <p className="text-ey-gray01 mt-1 mb-0">Dépenses et consommation de tokens du projet, par étape et par agent.</p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={load}>
          <RefreshCw size={15} /> Rafraîchir
        </button>
      </div>

      {s.runCount === 0 ? (
        <Card className="mt-5">
          <EmptyState icon={DollarSign} title="Aucune dépense enregistrée">
            Les coûts apparaîtront ici dès que des agents auront tourné (chaque run enregistre son coût
            et ses tokens).
          </EmptyState>
        </Card>
      ) : (
        <>
          {s.estimated ? (
            <div className="alert text-[13px] mt-4" style={{ background: "#FFF3DF", color: "#A15C07", border: "none" }}>
              <Info size={16} /> Certains coûts sont <b>estimés</b> à partir des tokens et de la table de tarifs.
            </div>
          ) : null}

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Stat accent num={fmtUsd(s.totalCost)} label="Coût total" />
            <Stat num={fmtNum(s.totalTokens)} label="Tokens (entrée + sortie)" />
            <Stat num={s.runCount} label="Exécutions d'agents" />
          </div>

          {/* Bars (restored) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <BarList title="Coût par étape" icon={Layers} data={s.byPhase} />
            <BarList title="Coût par agent" icon={Users} data={s.byAgent} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="p-5">
              <h3 className="text-[14px] font-bold m-0 mb-3 flex items-center gap-2">
                <Coins size={16} className="text-ey-gray01" /> Répartition des tokens
              </h3>
              {[
                ["Entrée", tb.input, "#2563eb"],
                ["Sortie", tb.output, "#16a34a"],
                ["Cache créé", tb.cacheCreate, "#ca8a04"],
                ["Cache lu", tb.cacheRead, "#0891b2"]
              ].map(([label, val, color]) => (
                <div key={label} className="mb-2.5">
                  <div className="flex justify-between text-[12.5px] mb-0.5">
                    <span className="font-medium">{label}</span>
                    <span className="text-ey-gray01">{fmtNum(val)} ({Math.round((val / totalTb) * 100)}%)</span>
                  </div>
                  <div className="h-2 bg-base-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(val / totalTb) * 100}%`, background: color }} />
                  </div>
                </div>
              ))}
            </Card>
            <BarList title="Coût par type d'action" icon={Activity} data={s.byKind} color="#2E2E38" />
          </div>

          {/* Bonus: a couple of donuts */}
          <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
            <PieChart size={17} className="text-ey-gray01" /> Vue d'ensemble (camemberts)
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <DonutChart title="Coût par étape" segments={toSegments(s.byPhase, "cost")} unit="usd" />
            </Card>
            <Card className="p-5">
              <DonutChart
                title="Répartition des tokens"
                unit="num"
                segments={[
                  { label: "Entrée", value: tb.input },
                  { label: "Sortie", value: tb.output },
                  { label: "Cache créé", value: tb.cacheCreate },
                  { label: "Cache lu", value: tb.cacheRead }
                ]}
              />
            </Card>
          </div>

          {/* Daily */}
          <Card className="p-5 mt-4">
            <h3 className="text-[14px] font-bold m-0 mb-3 flex items-center gap-2">
              <Activity size={16} className="text-ey-gray01" /> Dépenses par jour
            </h3>
            <BarDays data={s.byDay} />
          </Card>

          {/* Table */}
          <Card className="p-5 mt-4">
            <h3 className="text-[14px] font-bold m-0 mb-3">Derniers runs</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-ey-gray01 text-left border-b border-ey-border">
                    <th className="py-1.5 pr-3 font-semibold">Action</th>
                    <th className="py-1.5 pr-3 font-semibold">Agent</th>
                    <th className="py-1.5 pr-3 font-semibold">Étape</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Coût</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Tokens</th>
                    <th className="py-1.5 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-b border-ey-border last:border-0">
                      <td className="py-1.5 pr-3 truncate max-w-[220px]">{r.label}</td>
                      <td className="py-1.5 pr-3">{r.agent || "—"}</td>
                      <td className="py-1.5 pr-3">{r.phaseId || "—"}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtUsd(r.cost)}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtNum((r.inputTokens || 0) + (r.outputTokens || 0))}</td>
                      <td className="py-1.5 text-ey-gray01">{r.endedAt ? new Date(r.endedAt).toLocaleString("fr-FR") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <button className="btn btn-ghost btn-sm gap-1.5 mt-5" onClick={() => setShowPricing((v) => !v)}>
        <Tag size={15} /> {showPricing ? "Masquer" : "Voir / modifier"} les tarifs (USD / M tokens)
      </button>
      {showPricing && data.pricing ? (
        <Card className="p-5 mt-2">
          <PricingEditor pricing={data.pricing} onSaved={load} />
        </Card>
      ) : null}
    </>
  );
}
