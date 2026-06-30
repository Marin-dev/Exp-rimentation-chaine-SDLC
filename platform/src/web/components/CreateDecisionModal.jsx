import React, { useMemo, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Api } from "../api.js";

export default function CreateDecisionModal({ state, currentProfile, onClose, onCreated }) {
  const me = state.profiles.find((p) => p.id === currentProfile);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [context, setContext] = useState("");
  const [targetProfile, setTargetProfile] = useState(state.profiles[0]?.id || "");
  const [phaseId, setPhaseId] = useState("");
  const [severity, setSeverity] = useState("normal");
  const [options, setOptions] = useState([{ label: "", detail: "" }]);
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const allDocs = useMemo(() => state.deliverables.flatMap((g) => g.items), [state.deliverables]);

  function setOption(i, key, value) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: value } : o)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.createDecision({
        title: title.trim(),
        summary: summary.trim(),
        context: context.trim(),
        targetProfile,
        phaseId: phaseId || null,
        severity,
        raisedBy: me ? me.label : "",
        options: options.filter((o) => o.label.trim()),
        evidence
      });
      onCreated(res.state);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-base-100 rounded-lg shadow-xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold m-0">Demander une décision</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="text-ey-gray01 text-[13px] mt-0 mb-4">
          Soumettez un choix structurant au profil concerné. Il apparaîtra dans sa boîte de décisions.
        </p>

        <label className="block text-[12.5px] font-semibold mb-1.5">Intitulé de la décision</label>
        <input
          className="input input-bordered w-full mb-3"
          placeholder="ex. Choix du fournisseur cloud"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <label className="block text-[12.5px] font-semibold mb-1.5">Résumé court</label>
        <input
          className="input input-bordered w-full mb-3"
          placeholder="Une phrase qui s'affiche dans la boîte de réception"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />

        <label className="block text-[12.5px] font-semibold mb-1.5">Contexte (expliqué simplement)</label>
        <textarea
          className="textarea textarea-bordered w-full mb-3"
          rows={3}
          placeholder="Pourquoi cette décision se pose, ce qui est en jeu…"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12.5px] font-semibold mb-1.5">Profil qui décide</label>
            <select
              className="select select-bordered w-full"
              value={targetProfile}
              onChange={(e) => setTargetProfile(e.target.value)}
            >
              {state.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold mb-1.5">Étape concernée</label>
            <select
              className="select select-bordered w-full"
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
            >
              <option value="">—</option>
              {state.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={severity === "high"}
            onChange={(e) => setSeverity(e.target.checked ? "high" : "normal")}
          />
          <span className="text-[13px]">Marquer comme important</span>
        </label>

        <label className="block text-[12.5px] font-semibold mb-1.5">Options proposées (optionnel)</label>
        <div className="flex flex-col gap-2 mb-3">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input input-bordered input-sm flex-1"
                placeholder={`Option ${i + 1}`}
                value={o.label}
                onChange={(e) => setOption(i, "label", e.target.value)}
              />
              <input
                className="input input-bordered input-sm flex-1"
                placeholder="Détail / conséquence"
                value={o.detail}
                onChange={(e) => setOption(i, "detail", e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={options.length === 1}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="btn btn-ghost btn-sm gap-1.5 self-start"
            onClick={() => setOptions((prev) => [...prev, { label: "", detail: "" }])}
          >
            <Plus size={14} /> Ajouter une option
          </button>
        </div>

        {allDocs.length ? (
          <>
            <label className="block text-[12.5px] font-semibold mb-1.5">Documents à joindre (optionnel)</label>
            <div className="max-h-32 overflow-y-auto border border-ey-border rounded-md p-2 mb-4">
              {allDocs.map((d) => (
                <label key={d.path} className="flex items-center gap-2 py-1 cursor-pointer text-[13px]">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={evidence.includes(d.path)}
                    onChange={(e) =>
                      setEvidence((prev) =>
                        e.target.checked ? [...prev, d.path] : prev.filter((p) => p !== d.path)
                      )
                    }
                  />
                  {d.title}
                </label>
              ))}
            </div>
          </>
        ) : null}

        {error ? <div className="alert alert-error text-sm mb-3">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!title.trim() || busy}>
            {busy ? "Envoi…" : "Envoyer la décision"}
          </button>
        </div>
      </div>
    </div>
  );
}
