import React, { useRef, useState } from "react";
import { Inbox, Paperclip, Trash2, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { Api } from "../api.js";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Per-phase input documents: upload source docs the agents must consume, each
 * with a "pris en compte / pas encore" status that flips when the phase runs.
 */
export default function PhaseInputs({ phase, onStateChange }) {
  const inputs = phase.inputs || [];
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  async function onPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      let state;
      for (const f of files) {
        const dataUrl = await fileToDataUrl(f);
        const res = await Api.addInput(phase.id, f.name, dataUrl, desc.trim());
        state = res.state;
      }
      setDesc("");
      if (state) onStateChange(state);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(it) {
    const res = await Api.setInputStatus(it.id, it.status === "considered" ? "pending" : "considered");
    onStateChange(res.state);
  }
  async function remove(it) {
    const res = await Api.removeInput(it.id);
    onStateChange(res.state);
  }

  const pendingCount = inputs.filter((i) => i.status === "pending").length;

  return (
    <>
      <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
        <Inbox size={17} className="text-ey-gray01" /> Documents d'entrée ({inputs.length})
        {pendingCount > 0 ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ color: "#A15C07", background: "#FFF3DF" }}>
            {pendingCount} à prendre en compte
          </span>
        ) : null}
      </h3>

      <div className="border border-ey-border rounded-lg p-4">
        <p className="text-ey-gray01 text-[12.5px] mt-0 mb-3">
          Déposez les documents sources nécessaires à cette étape (schéma d'archi du SI, specs, contraintes…).
          L'agent les lira au prochain lancement et ils passeront « pris en compte ».
        </p>

        {inputs.length === 0 ? (
          <p className="text-ey-gray02 text-[13px] m-0 mb-3 italic">Aucun document d'entrée pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {inputs.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center border border-ey-border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{it.name}</div>
                  {it.description ? <div className="text-[12px] text-ey-gray01 truncate">{it.description}</div> : null}
                </div>
                <button
                  onClick={() => toggle(it)}
                  className="text-[11.5px] font-semibold px-2 py-1 rounded inline-flex items-center gap-1.5 whitespace-nowrap"
                  style={it.status === "considered" ? { color: "#168736", background: "#EAF7EE" } : { color: "#A15C07", background: "#FFF3DF" }}
                  title="Basculer le statut"
                >
                  {it.status === "considered" ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                  {it.status === "considered" ? "Pris en compte" : "Pas encore pris en compte"}
                </button>
                <button className="btn btn-ghost btn-xs btn-square" onClick={() => remove(it)} title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="input input-bordered input-sm flex-1 min-w-[180px]"
            placeholder="Description (optionnel) — ex. schéma d'architecture du SI"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button className="btn btn-outline btn-sm gap-1.5" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Ajouter un document
          </button>
        </div>
        {error ? <div className="alert alert-error text-sm mt-2">{error}</div> : null}
      </div>
    </>
  );
}
