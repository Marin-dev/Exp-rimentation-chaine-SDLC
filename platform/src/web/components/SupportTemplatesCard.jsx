import React, { useRef, useState } from "react";
import { Palette, Upload, Trash2, Loader2, Presentation, FileText } from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";

const FORMATS = [
  { id: "pptx", label: "PowerPoint", Icon: Presentation },
  { id: "docx", label: "Word", Icon: FileText }
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Settings: the PowerPoint / Word files used as style examples for generated supports. */
export default function SupportTemplatesCard({ state, onStateChange }) {
  const templates = state.config?.supportTemplates || {};
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const inputs = { pptx: useRef(null), docx: useRef(null) };

  async function upload(format, e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(format);
    setError(null);
    try {
      const res = await Api.uploadSupportTemplate(format, file.name, await fileToDataUrl(file));
      onStateChange(res.state);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(format) {
    setBusy(format);
    setError(null);
    try {
      const res = await Api.removeSupportTemplate(format);
      onStateChange(res.state);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5 mb-4">
      <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
        <Palette size={17} className="text-ey-gray01" /> Gabarits des supports
      </h3>
      <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
        Déposez un PowerPoint et un Word d'exemple (le modèle de votre cabinet ou du client) : les supports générés
        reprennent ses couleurs et ses polices, et pour Word ses styles. Sans gabarit, une mise en forme neutre est utilisée.
      </p>
      <div className="flex flex-col gap-2">
        {FORMATS.map(({ id, label, Icon }) => {
          const t = templates[id];
          return (
            <div key={id} className="flex items-center gap-3 border border-ey-border rounded-md px-3 py-2">
              <Icon size={16} className="text-ey-gray01" />
              <div className="flex-1 text-[13px]">
                <b>{label}</b>
                <span className="text-ey-gray01"> · {t ? `${t.name} (déposé le ${new Date(t.uploadedAt).toLocaleDateString("fr-FR")})` : "gabarit neutre"}</span>
              </div>
              <input ref={inputs[id]} type="file" accept={`.${id}`} className="hidden" onChange={(e) => upload(id, e)} />
              <button className="btn btn-outline btn-xs gap-1" disabled={Boolean(busy)} onClick={() => inputs[id].current && inputs[id].current.click()}>
                {busy === id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {t ? "Remplacer" : "Déposer"}
              </button>
              {t ? (
                <button className="btn btn-ghost btn-xs" disabled={Boolean(busy)} onClick={() => remove(id)} title="Revenir au gabarit neutre">
                  <Trash2 size={13} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <div className="alert alert-error text-sm mt-3">{error}</div> : null}
    </Card>
  );
}
