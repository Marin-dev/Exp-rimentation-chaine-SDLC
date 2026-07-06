import React, { useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { Api } from "../api.js";

/**
 * Folder path input with a native "Parcourir" button. The browser can't read
 * absolute paths, so the button asks the local backend to open a Windows
 * folder dialog and fills the input with the chosen path.
 */
export default function FolderInput({ value, onChange, placeholder, size = "" }) {
  const [busy, setBusy] = useState(false);

  async function browse() {
    setBusy(true);
    try {
      const res = await Api.pickFolder(value || "");
      if (res.ok && res.path) onChange(res.path);
    } catch {
      /* ignore — keep manual entry */
    } finally {
      setBusy(false);
    }
  }

  const inputCls = `input input-bordered flex-1 ${size === "sm" ? "input-sm" : ""}`;
  const btnCls = `btn btn-outline gap-1.5 ${size === "sm" ? "btn-sm" : ""}`;

  return (
    <div className="flex gap-2">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <button className={btnCls} onClick={browse} disabled={busy} title="Parcourir…" type="button">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FolderOpen size={15} />} Parcourir
      </button>
    </div>
  );
}
