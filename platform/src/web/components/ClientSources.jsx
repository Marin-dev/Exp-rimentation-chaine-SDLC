import React, { useEffect, useState } from "react";
import {
  FolderInput as FolderIcon, Upload, Map, CheckCircle2, ScanSearch, FileText, Star, EyeOff, Eye,
  AlertTriangle, Loader2, Download, RefreshCw, Circle
} from "lucide-react";
import { Api } from "../api.js";
import { Card } from "./ui.jsx";
import FolderInput from "./FolderInput.jsx";
import DocViewerModal from "./DocViewerModal.jsx";

const KIND = {
  converted: { label: "Converti", cls: "bg-[#EAF7EE] text-[#168736]" },
  native: { label: "Lu tel quel", cls: "bg-[#EAF1FB] text-[#1F5FAD]" },
  partial: { label: "Partiel", cls: "bg-[#FFF3DF] text-[#A15C07]" },
  unsupported: { label: "Illisible", cls: "bg-[#FDEBEA] text-[#B42318]" },
  failed: { label: "Échec", cls: "bg-[#FDEBEA] text-[#B42318]" }
};

const LEVELS = {
  metier: "Métier", fonctionnel: "Fonctionnel", "ux-ecrans": "UX / écrans", technique: "Technique",
  securite: "Sécurité", planning: "Planning", autre: "Autre"
};

const COVERAGE = {
  covered: { label: "Couvert", color: "#168736" },
  partial: { label: "Partiel", color: "#A15C07" },
  missing: { label: "Manquant", color: "#B42318" },
  conflict: { label: "Contradictoire", color: "#7C3AED" }
};

function Step({ done, active, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${done ? "text-[#168736]" : active ? "font-semibold" : "text-ey-gray02"}`}>
      {done ? <CheckCircle2 size={14} /> : <Circle size={14} />} {label}
    </span>
  );
}

/**
 * Bootstrap from a rich client folder: import + conversion, cartography by an agent,
 * human validation of each document's target phases, then coverage + client questionnaire.
 */
export default function ClientSources({ state, onRunStarted }) {
  const [data, setData] = useState(null);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [viewer, setViewer] = useState(null);

  const phases = (state.phases || []).filter((p) => p.id !== "G0");

  async function load() {
    try {
      const r = await Api.getSources();
      setData(r);
      if (r.sourceFolder) setFolder((f) => f || r.sourceFolder);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function act(key, fn) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const ingest = () => act("ingest", async () => {
    const r = await Api.ingestSources(folder.trim());
    setData(r.overview);
    const s = r.stats;
    setMessage(`${s.total} document(s) importé(s) : ${s.new} nouveau(x), ${s.changed} modifié(s), ${s.unchanged} inchangé(s)${s.removed ? `, ${s.removed} retiré(s)` : ""}.`);
  });
  const map = () => act("map", async () => {
    const r = await Api.startSourceMap();
    onRunStarted(r.runId, "G0 · Cartographie des sources client");
  });
  const coverage = () => act("coverage", async () => {
    const r = await Api.startCoverage();
    onRunStarted(r.runId, "G0 · Couverture des sources et questionnaire client");
  });
  const validate = () => act("validate", async () => {
    const r = await Api.validateSources();
    setData(r.overview);
    setMessage(`${r.routed} document(s) routé(s) vers les étapes ${r.phases.join(", ") || "—"}. Les agents de ces étapes travailleront en mode reprise.`);
  });
  const patch = (id, p) => act(`row-${id}`, async () => {
    const r = await Api.updateSource(id, p);
    setData(r.overview);
  });

  if (!data) return null;

  const files = (data.files || []).filter((f) => f.status !== "removed");
  const readable = files.filter((f) => f.routable);
  const count = (k) => files.filter((f) => f.kind === k).length;
  const coverageItems = data.coverage ? data.coverage.items : [];

  return (
    <Card className="p-5 mt-5">
      <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
        <FolderIcon size={17} className="text-ey-gray01" /> Sources client
      </h3>
      <p className="text-ey-gray01 text-[13px] mt-0 mb-3">
        Le client a déjà produit des documents (specs fonctionnelles et techniques, maquettes, présentations…) ?
        Importez son dossier : la plateforme en garde une copie intacte, convertit chaque fichier, puis un agent
        affecte chaque document à la bonne étape. Les étapes concernées reprendront cette matière au lieu de partir de zéro.
      </p>

      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <FolderInput value={folder} onChange={setFolder} placeholder="C:\chemin\vers\le\dossier-client" />
        </div>
        <button className="btn btn-outline gap-1.5" onClick={ingest} disabled={!folder.trim() || busy}>
          {busy === "ingest" ? <Loader2 size={16} className="animate-spin" /> : data.ingested ? <RefreshCw size={16} /> : <Upload size={16} />}
          {data.ingested ? "Réimporter" : "Importer"}
        </button>
      </div>
      {data.ingested ? (
        <p className="text-ey-gray02 text-[12px] mt-1 mb-0">
          Réimporter après une nouvelle livraison du client : seuls les documents nouveaux ou modifiés sont retraités.
        </p>
      ) : null}

      {error ? <div className="alert alert-error text-sm mt-3">{error}</div> : null}
      {message ? <div className="text-[13px] rounded-md border border-[#cdebd9] bg-[#EAF7EE] text-[#168736] px-3 py-2 mt-3">{message}</div> : null}

      {data.ingested ? (
        <>
          <div className="flex flex-wrap gap-4 mt-4 mb-3">
            <Step done label={`Import (${files.length} doc.)`} />
            <Step done={Boolean(data.mappedAt)} active={!data.mappedAt} label="Cartographie" />
            <Step done={Boolean(data.validatedAt)} active={Boolean(data.mappedAt) && !data.validatedAt} label="Validation" />
            <Step done={Boolean(data.coverage)} active={Boolean(data.validatedAt) && !data.coverage} label="Couverture" />
          </div>

          <div className="flex flex-wrap gap-2 text-[12px] mb-3">
            {Object.entries(KIND).map(([k, v]) => count(k) ? (
              <span key={k} className={`px-2 py-0.5 rounded ${v.cls}`}>{count(k)} {v.label.toLowerCase()}</span>
            ) : null)}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm gap-1.5" onClick={map} disabled={Boolean(busy) || !readable.length}>
              <Map size={15} /> {data.mappedAt ? "Refaire la cartographie" : "Cartographier les documents"}
            </button>
            <button className="btn btn-primary btn-sm gap-1.5" onClick={validate} disabled={Boolean(busy) || !data.mappedAt}>
              <CheckCircle2 size={15} /> Valider l'affectation
            </button>
            <button className="btn btn-outline btn-sm gap-1.5" onClick={coverage} disabled={Boolean(busy) || !data.validatedAt}>
              <ScanSearch size={15} /> Analyser la couverture
            </button>
          </div>

          <div className="mt-4 border border-ey-border rounded-md overflow-x-auto">
            <table className="table table-sm text-[12.5px]">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Lecture</th>
                  <th>Niveau</th>
                  <th>Étapes alimentées</th>
                  <th className="text-center">Réf.</th>
                  <th className="text-center">Garder</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const k = KIND[f.kind] || KIND.unsupported;
                  const conflicts = (f.relations || []).filter((r) => r.type === "contradiction");
                  const rowBusy = busy === `row-${f.id}`;
                  return (
                    <tr key={f.id} className={f.excluded ? "opacity-50" : ""}>
                      <td className="min-w-[220px]">
                        <div className="font-semibold flex items-center gap-1.5">
                          {f.id} · {f.title}
                          {conflicts.length ? (
                            <span title={conflicts.map((c) => `Contradiction avec ${c.with} : ${c.topic || ""}`).join("\n")}>
                              <AlertTriangle size={13} className="text-[#7C3AED]" />
                            </span>
                          ) : null}
                        </div>
                        <div className="text-ey-gray02">{f.rel}{f.status === "changed" ? " · modifié" : f.status === "new" && data.validatedAt ? " · nouveau" : ""}</div>
                        {f.summary ? <div className="text-ey-gray01 mt-0.5">{f.summary}</div> : null}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded whitespace-nowrap ${k.cls}`} title={f.note || ""}>{k.label}</span>
                      </td>
                      <td>
                        <select
                          className="select select-bordered select-xs"
                          value={f.level || ""}
                          disabled={!f.routable || rowBusy}
                          onChange={(e) => patch(f.id, { level: e.target.value || null })}
                        >
                          <option value="">—</option>
                          {Object.entries(LEVELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {phases.map((p) => {
                            const on = f.phases.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                title={`${p.id} · ${p.title}`}
                                disabled={!f.routable || rowBusy}
                                onClick={() => patch(f.id, { phases: on ? f.phases.filter((x) => x !== p.id) : [...f.phases, p.id] })}
                                className={`px-1.5 py-0.5 rounded border text-[11.5px] ${on ? "bg-ey-black text-white border-ey-black" : "border-ey-border text-ey-gray02"}`}
                              >
                                {p.id}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="text-center">
                        <button disabled={!f.routable || rowBusy} onClick={() => patch(f.id, { reference: !f.reference })} title="Document de référence (prime en cas de doute)">
                          <Star size={15} className={f.reference ? "text-[#A15C07] fill-[#FFE600]" : "text-ey-gray02"} />
                        </button>
                      </td>
                      <td className="text-center">
                        <button disabled={!f.routable || rowBusy} onClick={() => patch(f.id, { excluded: !f.excluded })} title={f.excluded ? "Exclu : cliquer pour le garder" : "Gardé : cliquer pour l'exclure"}>
                          {f.excluded ? <EyeOff size={15} className="text-ey-gray02" /> : <Eye size={15} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.mappedAt || data.coverage ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {data.mappedAt ? (
                <button className="btn btn-ghost btn-xs gap-1" onClick={() => setViewer({ path: "livrables/00-contexte/cartographie-sources.md", title: "Cartographie des sources" })}>
                  <FileText size={13} /> Cartographie
                </button>
              ) : null}
              {data.coverage ? (
                <>
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => setViewer({ path: "livrables/00-contexte/couverture-sources.md", title: "Couverture des sources" })}>
                    <FileText size={13} /> Couverture
                  </button>
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => setViewer({ path: "livrables/00-contexte/questionnaire-client.md", title: "Questionnaire client" })}>
                    <FileText size={13} /> Questionnaire client
                  </button>
                  <a className="btn btn-ghost btn-xs gap-1" href={`/api/export/docx?path=${encodeURIComponent("livrables/00-contexte/questionnaire-client.md")}`}>
                    <Download size={13} /> Questionnaire en Word
                  </a>
                </>
              ) : null}
            </div>
          ) : null}

          {coverageItems.length ? (
            <div className="mt-4">
              <div className="text-[13px] font-semibold mb-2">Couverture par étape</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                {[...new Set(coverageItems.map((i) => i.phaseId))].sort().map((ph) => {
                  const items = coverageItems.filter((i) => i.phaseId === ph);
                  return (
                    <div key={ph} className="border border-ey-border rounded-md p-2.5">
                      <div className="font-semibold text-[13px] mb-1">{ph}</div>
                      {Object.entries(COVERAGE).map(([k, v]) => {
                        const n = items.filter((i) => i.status === k).length;
                        return n ? (
                          <div key={k} className="flex items-center gap-1.5 text-[12px]">
                            <span className="w-2 h-2 rounded-full" style={{ background: v.color }} /> {n} {v.label.toLowerCase()}
                          </div>
                        ) : null;
                      })}
                    </div>
                  );
                })}
              </div>
              {coverageItems.filter((i) => i.status === "missing" || i.status === "conflict").length ? (
                <ul className="mt-3 mb-0 pl-4 text-[12.5px] space-y-1">
                  {coverageItems.filter((i) => i.status === "missing" || i.status === "conflict").map((i, n) => (
                    <li key={n}>
                      <span style={{ color: COVERAGE[i.status].color }} className="font-semibold">{COVERAGE[i.status].label}</span>
                      {" · "}{i.phaseId} · {i.requirement}{i.note ? ` — ${i.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {viewer ? (
        <DocViewerModal doc={viewer} phaseId="G0" feedback={[]} onClose={() => setViewer(null)} onStateChange={() => {}} />
      ) : null}
    </Card>
  );
}
