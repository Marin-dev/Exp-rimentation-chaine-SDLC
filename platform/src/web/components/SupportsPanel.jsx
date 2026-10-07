import React, { useEffect, useState } from "react";
import { Presentation, FileText, Download, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";

const FORMAT_ICON = { pptx: Presentation, docx: FileText };

/**
 * Generate a global PowerPoint / Word support of the project up to this phase, and list
 * the supports already generated. The content is written by an agent from the
 * deliverables; the file is rendered with the template set in the settings.
 */
export default function SupportsPanel({ phase, busy, refreshKey, onGenerate }) {
  const [supports, setSupports] = useState([]);
  const [error, setError] = useState(null);
  const [rendering, setRendering] = useState(null);

  async function load() {
    try {
      const r = await Api.getSupports();
      setSupports(r.supports || []);
    } catch (e) {
      setError(e.message);
    }
  }
  // Reload when a run starts or ends (refreshKey), and poll while a support is being rendered.
  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => {
    if (!supports.some((s) => s.status === "generating")) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [supports]);

  async function rerender(id) {
    setRendering(id);
    setError(null);
    try {
      await Api.rerenderSupport(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRendering(null);
    }
  }

  return (
    <Card className="p-5 mt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold m-0 flex items-center gap-2">
            <Presentation size={17} className="text-ey-gray01" /> Support du projet
          </h3>
          <p className="text-ey-gray01 text-[13px] mt-1 mb-0">
            Un document de synthèse de tout le projet, de G0 jusqu'à {phase.id} ({phase.title}), rédigé à partir des
            livrables et mis en forme avec le gabarit défini dans les Réglages.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm gap-1.5" disabled={busy} onClick={() => onGenerate("pptx")}>
            <Presentation size={15} /> PowerPoint
          </button>
          <button className="btn btn-outline btn-sm gap-1.5" disabled={busy} onClick={() => onGenerate("docx")}>
            <FileText size={15} /> Word
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error text-sm mt-3">{error}</div> : null}

      {supports.length ? (
        <div className="mt-4 border border-ey-border rounded-md">
          {supports.slice(0, 8).map((s) => {
            const Icon = FORMAT_ICON[s.format] || FileText;
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 border-b border-ey-border last:border-0 text-[13px]">
                <Icon size={15} className="text-ey-gray01 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold">{s.title || `Support ${s.format.toUpperCase()}`}</div>
                  <div className="text-ey-gray01 text-[12px]">
                    Jusqu'à {s.phaseId} · {new Date(s.createdAt).toLocaleString("fr-FR")}
                    {s.status === "failed" && s.error ? ` · ${s.error}` : ""}
                  </div>
                </div>
                {s.status === "ready" ? (
                  <a className="btn btn-primary btn-xs gap-1" href={`/api/supports/download?id=${encodeURIComponent(s.id)}`}>
                    <Download size={13} /> Télécharger
                  </a>
                ) : s.status === "generating" ? (
                  <span className="inline-flex items-center gap-1 text-ey-gray01 text-[12px]">
                    <Loader2 size={13} className="animate-spin" /> Rédaction…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#B42318] text-[12px]">
                    <AlertTriangle size={13} /> Échec
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-xs"
                  title="Refaire la mise en forme à partir du contenu déjà rédigé (ex. après un changement de gabarit)"
                  disabled={rendering === s.id}
                  onClick={() => rerender(s.id)}
                >
                  {rendering === s.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
