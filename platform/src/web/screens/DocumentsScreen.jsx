import React, { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Card, EmptyState } from "../components/ui.jsx";
import DocViewerModal from "../components/DocViewerModal.jsx";
import DocTypeTabs from "../components/DocTypeTabs.jsx";

function DocButton({ doc, fb, onOpen }) {
  return (
    <button
      onClick={() => onOpen(doc)}
      className="flex items-center gap-2.5 px-3.5 py-2.5 bg-base-100 border border-ey-border rounded-md text-left hover:border-ey-gray02 hover:bg-base-200 transition w-full"
    >
      <FileText size={16} className="text-ey-gray01 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium truncate">{doc.title}</div>
        <div className="text-[11px] text-ey-gray02 truncate">{doc.name}</div>
      </div>
      {fb > 0 ? (
        <span className="badge badge-sm" style={{ background: "#FFF3DF", color: "#A15C07", border: "none" }}>{fb}</span>
      ) : null}
    </button>
  );
}

export default function DocumentsScreen({ state, profile, onStateChange, onStartImpact }) {
  const [openDoc, setOpenDoc] = useState(null);
  const feedbackFor = (p) => (state.feedback || []).filter((f) => f.path === p).length;
  const totalDocs = state.deliverables.reduce((s, g) => s + g.items.length, 0);

  // Governance / unclassified docs as a pseudo set of typologies (by folder).
  const govTypes = useMemo(
    () =>
      state.deliverables
        .map((g) => ({ key: g.folder, label: g.label, items: g.items.filter((it) => !it.phaseId) }))
        .filter((g) => g.items.length > 0),
    [state.deliverables]
  );

  // Phase tabs: only phases that have at least one document.
  const phaseTabs = state.phases.filter((p) => (p.docTypes || []).some((t) => t.items.length > 0));
  const tabs = [
    ...phaseTabs.map((p) => ({ id: p.id, label: `${p.id} · ${p.title}`, docTypes: p.docTypes })),
    ...(govTypes.length ? [{ id: "gov", label: "Gouvernance & autres", docTypes: govTypes }] : [])
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <>
      <h2 className="text-[22px] font-bold tracking-tight m-0">Documents</h2>
      <p className="text-ey-gray01 mt-1 mb-5">
        Les livrables, par étape et par type. Cliquez pour ouvrir en plein écran et laisser un retour.
      </p>

      {totalDocs === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="Aucun document pour l'instant">
            Les documents apparaîtront ici au fil des étapes : vision, parcours, architecture, User
            Stories, tests…
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Phase tabs */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`text-[13px] font-semibold px-3 py-1.5 rounded-md transition ${
                  t.id === active.id ? "bg-ey-yellow text-ey-black" : "bg-base-200 text-ey-gray01 hover:text-ey-black"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Type tabs for the active phase */}
          <Card className="p-5">
            <DocTypeTabs
              types={active.docTypes}
              renderItem={(doc) => (
                <DocButton key={doc.path} doc={doc} fb={feedbackFor(doc.path)} onOpen={setOpenDoc} />
              )}
              emptyHint="Aucun document de ce type pour l'instant."
            />
          </Card>
        </>
      )}

      {openDoc ? (
        <DocViewerModal
          doc={openDoc}
          phaseId={openDoc.phaseId || null}
          profile={profile}
          feedback={state.feedback}
          onClose={() => setOpenDoc(null)}
          onStateChange={onStateChange}
          onStartImpact={onStartImpact}
        />
      ) : null}
    </>
  );
}
