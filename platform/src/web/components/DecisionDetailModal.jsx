import React, { useRef, useState } from "react";
import { X, FileText, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Paperclip, Trash2, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { Api } from "../api.js";
import { Avatar, useEscToClose } from "./ui.jsx";
import MarkdownView from "./MarkdownView.jsx";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function EvidenceItem({ path }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && content === null) {
      setLoading(true);
      Api.getDeliverable(path)
        .then((r) => setContent(r.content))
        .catch((e) => setContent(`Erreur : ${e.message}`))
        .finally(() => setLoading(false));
    }
  }

  return (
    <div className="border border-ey-border rounded-md">
      <button className="flex items-center gap-2 w-full text-left px-3 py-2 text-[13px]" onClick={toggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={14} className="text-ey-gray01" />
        <span className="truncate">{path.split("/").pop()}</span>
      </button>
      {open ? (
        <div className="px-4 pb-3 border-t border-ey-border pt-2 max-h-64 overflow-y-auto">
          {loading ? <span className="text-ey-gray01 text-[13px]">Chargement…</span> : <MarkdownView content={content} />}
        </div>
      ) : null}
    </div>
  );
}

export default function DecisionDetailModal({ decision, profiles, currentProfile, onClose, onAnswered, onStateChange }) {
  const answered = decision.status === "answered";
  const [optionId, setOptionId] = useState(null);
  const [freeChoice, setFreeChoice] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEscToClose(onClose);

  const me = profiles.find((p) => p.id === currentProfile);
  const hasOptions = decision.options && decision.options.length > 0;
  const canSubmit =
    (hasOptions ? Boolean(optionId) : Boolean(freeChoice.trim())) || files.length > 0;

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of picked) {
        const dataUrl = await fileToDataUrl(file);
        const res = await Api.uploadFile(decision.id, file.name, dataUrl);
        setFiles((prev) => [...prev, { name: res.name, path: res.path }]);
      }
    } catch (err) {
      setError(err.message || "Échec de l'upload.");
    } finally {
      setUploading(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.reopenDecision(decision.id);
      // Keep the modal open: the decision becomes pending again -> the form shows,
      // with the AI's prior choice displayed as context for the correction.
      onStateChange(res.state);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.answerDecision({
        id: decision.id,
        optionId: hasOptions ? optionId : null,
        choiceLabel: hasOptions ? null : freeChoice.trim(),
        note: note.trim(),
        documents: files.map((f) => f.path),
        decidedBy: currentProfile
      });
      onAnswered(res.state, {
        runId: res.runId,
        runFullyAnswered: res.runFullyAnswered,
        phaseId: decision.phaseId
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={decision.title}
        className="bg-base-100 rounded-lg shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-ey-border">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12px] font-mono text-ey-gray01">{decision.id}</span>
              {decision.phaseLabel ? (
                <span className="badge badge-ghost badge-sm">{decision.phaseLabel}</span>
              ) : null}
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={
                  decision.severity === "high"
                    ? { color: "#B42318", background: "#FDEBEA" }
                    : { color: "#A15C07", background: "#FFF3DF" }
                }
              >
                {decision.severity === "high" ? "Important" : "À décider"}
              </span>
            </div>
            <h3 className="text-lg font-bold m-0">{decision.title}</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 pt-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-ey-gray01 mb-4">
            {decision.raisedBy ? (
              <span>
                Soulevé par <b className="text-ey-black">{decision.raisedBy}</b>
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              Pour le profil
              <span
                className="inline-flex items-center gap-1 font-semibold text-ey-black px-1.5 py-0.5 rounded"
                style={{ background: `${decision.targetProfileColor}1a` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: decision.targetProfileColor }} />
                {decision.targetProfileLabel}
              </span>
            </span>
          </div>

          {/* Context */}
          {decision.summary ? <p className="text-[14px] font-medium mb-2">{decision.summary}</p> : null}
          {decision.context ? (
            <div className="bg-base-200 rounded-md p-4 mb-4">
              <MarkdownView content={decision.context} />
            </div>
          ) : null}

          {/* Evidence */}
          {decision.evidence && decision.evidence.length ? (
            <div className="mb-4">
              <div className="text-[12px] font-bold uppercase tracking-wide text-ey-gray01 mb-1.5">
                Éléments à consulter
              </div>
              <div className="flex flex-col gap-1.5">
                {decision.evidence.map((p) => (
                  <EvidenceItem key={p} path={p} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Answered state */}
          {answered ? (
            decision.answer.delegated ? (
              <div className="rounded-md border border-ey-border bg-base-200 p-4">
                <div className="flex items-center gap-2 text-ey-black font-semibold mb-1">
                  <Sparkles size={17} className="text-ey-yellow" /> Délégué à l'IA (« fais au mieux »)
                </div>
                {decision.aiDecision ? (
                  <>
                    <p className="m-0 text-[13px] text-ey-gray01 mt-1">Décision prise par l'IA :</p>
                    <p className="m-0 text-[14px] mt-0.5"><b>{decision.aiDecision.decision || "(non précisé)"}</b></p>
                    {decision.aiDecision.rationale ? (
                      <p className="m-0 mt-1 text-[13px] text-ey-gray01">{decision.aiDecision.rationale}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="m-0 text-[13px] text-ey-gray01 mt-1">
                    L'IA tranchera au prochain passage et indiquera ici son choix.
                  </p>
                )}
                <button className="btn btn-outline btn-sm gap-1.5 mt-3" onClick={reopen} disabled={busy}>
                  <RotateCcw size={14} /> Corriger cette décision
                </button>
              </div>
            ) : (
            <div className="rounded-md border border-[#cdebd9] bg-[#EAF7EE] p-4">
              <div className="flex items-center gap-2 text-[#168736] font-semibold mb-1">
                <CheckCircle2 size={17} /> Décision tranchée
              </div>
              <p className="m-0 text-[14px]">
                <b>{decision.answer.choiceLabel}</b>
              </p>
              {decision.answer.note ? (
                <p className="m-0 mt-1 text-[13px] text-ey-gray01">{decision.answer.note}</p>
              ) : null}
              {decision.answer.documents && decision.answer.documents.length ? (
                <div className="flex flex-col gap-1 mt-2">
                  {decision.answer.documents.map((p) => (
                    <span key={p} className="flex items-center gap-1.5 text-[12.5px] text-ey-gray01">
                      <FileText size={13} /> {p.split("/").pop()}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="m-0 mt-2 text-[12px] text-ey-gray01">
                Par {profiles.find((p) => p.id === decision.answer.decidedBy)?.label || decision.answer.decidedBy} ·{" "}
                {new Date(decision.answer.decidedAt).toLocaleString("fr-FR")}
              </p>
            </div>
            )
          ) : (
            /* Decision form */
            <div className="border-t border-ey-border pt-4">
              {decision.aiDecision ? (
                <div className="rounded-md bg-base-200 border border-ey-border p-3 mb-3 text-[12.5px]">
                  <b>Correction d'une décision déléguée.</b> L'IA avait choisi :{" "}
                  <b>{decision.aiDecision.decision || "(non précisé)"}</b>. Indiquez ci-dessous la
                  décision corrigée — elle remplacera celle de l'IA au prochain passage.
                </div>
              ) : null}
              <div className="text-[12px] font-bold uppercase tracking-wide text-ey-gray01 mb-2">
                Votre décision
              </div>
              {hasOptions ? (
                <div className="flex flex-col gap-2 mb-3">
                  {decision.options.map((o) => (
                    <label
                      key={o.id}
                      className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer ${
                        optionId === o.id ? "border-ey-yellow bg-[#fffdf0]" : "border-ey-border"
                      }`}
                    >
                      <input
                        type="radio"
                        name="opt"
                        className="radio radio-sm mt-0.5"
                        checked={optionId === o.id}
                        onChange={() => setOptionId(o.id)}
                      />
                      <span>
                        <b className="text-[13.5px]">{o.label}</b>
                        {o.detail ? <span className="block text-[12.5px] text-ey-gray01">{o.detail}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="input input-bordered w-full mb-3"
                  placeholder="Votre choix / arbitrage"
                  value={freeChoice}
                  onChange={(e) => setFreeChoice(e.target.value)}
                />
              )}

              {/* Answer with a document */}
              <div className="mb-3">
                <input ref={fileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
                <button
                  className="btn btn-outline btn-sm gap-1.5"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                  {uploading ? "Envoi…" : "Répondre avec un document"}
                </button>
                <span className="text-[12px] text-ey-gray01 ml-2">
                  L'IA lira le document et en extraira la réponse.
                </span>
                {files.length ? (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 border border-ey-border rounded-md px-3 py-1.5 text-[13px]"
                      >
                        <FileText size={14} className="text-ey-gray01" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <button
                          className="btn btn-ghost btn-xs btn-square"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <textarea
                className="textarea textarea-bordered w-full mb-3"
                rows={2}
                placeholder="Justification ou précision (optionnel) — sera documentée"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              {error ? (
                <div className="alert alert-error text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} /> {error}
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="text-[12px] text-ey-gray01 flex items-center gap-1.5">
                  {me ? <Avatar profile={me} size={20} /> : null}
                  Vous décidez en tant que <b className="text-ey-black">{me?.label}</b>
                </span>
                <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit || busy}>
                  {busy ? "Enregistrement…" : "Valider la décision"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
