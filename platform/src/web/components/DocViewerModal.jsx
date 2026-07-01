import React, { useEffect, useState } from "react";
import { X, MessageSquarePlus, Send, FileText, Sparkles } from "lucide-react";
import { Api } from "../api.js";
import MarkdownView from "./MarkdownView.jsx";
import { useEscToClose } from "./ui.jsx";

export default function DocViewerModal({ doc, phaseId, profile, feedback, onClose, onStateChange, onStartImpact }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEscToClose(onClose);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);
    Api.getDeliverable(doc.path)
      .then((r) => setContent(r.content))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [doc.path]);

  const docFeedback = (feedback || []).filter((f) => f.path === doc.path);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await Api.addFeedback(doc.path, comment.trim(), phaseId, profile);
      setComment("");
      onStateChange(res.state);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 p-4 md:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        className="bg-base-100 rounded-lg shadow-2xl w-full h-full max-w-6xl mx-auto flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-ey-border">
          <FileText size={18} className="text-ey-gray01" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px] truncate">{doc.title}</div>
            <div className="text-[11.5px] text-ey-gray02 truncate">{doc.path}</div>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* Body: document + feedback */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px] overflow-hidden">
          <div className="overflow-y-auto px-8 py-6">
            {loading ? (
              <div className="text-ey-gray01">Chargement…</div>
            ) : error ? (
              <div className="alert alert-error text-sm">{error}</div>
            ) : content ? (
              <MarkdownView content={content} />
            ) : (
              <div className="text-ey-gray01 text-[13px] italic">Ce document est vide.</div>
            )}
          </div>

          <div className="border-t lg:border-t-0 lg:border-l border-ey-border bg-base-200 flex flex-col">
            <div className="px-4 py-3 border-b border-ey-border flex items-center gap-2">
              <MessageSquarePlus size={16} className="text-ey-gray01" />
              <span className="text-[13px] font-bold">Retours sur ce document</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {docFeedback.length === 0 ? (
                <p className="text-ey-gray01 text-[12.5px] m-0">
                  Aucun retour. Ajoutez un commentaire : l'IA en tiendra compte pour réviser le
                  document au prochain passage de l'étape.
                </p>
              ) : (
                docFeedback.map((f) => (
                  <div key={f.id} className="bg-base-100 border border-ey-border rounded-md p-2.5">
                    <p className="m-0 text-[12.5px]">{f.comment}</p>
                    <div className="mt-1 text-[11px] text-ey-gray02">
                      {f.by || "—"} · {f.status === "open" ? "à traiter" : "traité"}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-ey-border">
              {error ? <div className="alert alert-error text-xs mb-2">{error}</div> : null}
              <textarea
                className="textarea textarea-bordered w-full text-[13px]"
                rows={3}
                placeholder="Votre retour sur ce document…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm w-full mt-2 gap-1.5"
                onClick={submit}
                disabled={!comment.trim() || busy}
              >
                <Send size={14} /> {busy ? "Envoi…" : "Envoyer le retour (correction)"}
              </button>
              {onStartImpact ? (
                <button
                  className="btn btn-outline btn-sm w-full mt-2 gap-1.5"
                  onClick={() => onStartImpact(doc, comment.trim())}
                  disabled={!comment.trim() || busy}
                  title="Lance une analyse d'impact (comme un nouveau besoin) au lieu d'une simple correction locale"
                >
                  <Sparkles size={14} /> Analyser l'impact sur le projet
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
