import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquarePlus, HelpCircle, Bug, Sparkles, Compass, CircleDashed, Loader2, CheckCircle2, XCircle,
  PauseCircle, Clock, AlertTriangle, RotateCw, Ban, Send, ChevronDown, ChevronRight, Terminal, Inbox, Copy
} from "lucide-react";
import { Api } from "../api.js";
import { Card, EmptyState } from "../components/ui.jsx";

/**
 * Request desk. Anyone drops a question, a bug or a wish in plain words; the orchestrator
 * classifies it and a fixed playbook carries it out (see server/services/request-flow.js).
 * The requester follows it here: current step, history, answer, decision asked of the pilot.
 */

export const REQUEST_TYPES = {
  question: { label: "Question", Icon: HelpCircle, cls: "text-[#0891b2]" },
  bug: { label: "Anomalie", Icon: Bug, cls: "text-error" },
  feature: { label: "Évolution", Icon: Sparkles, cls: "text-[#7c3aed]" },
  "spec-change": { label: "Changement de cadrage", Icon: Compass, cls: "text-[#A15C07]" }
};

const STATUS = {
  new: { label: "Nouvelle", Icon: CircleDashed, cls: "badge-ghost" },
  "in-progress": { label: "En cours", Icon: Loader2, cls: "badge-info", spin: true },
  queued: { label: "En file d'attente", Icon: Clock, cls: "badge-ghost" },
  "waiting-human": { label: "En attente de vous", Icon: PauseCircle, cls: "badge-warning" },
  blocked: { label: "Bloquée", Icon: AlertTriangle, cls: "badge-error" },
  done: { label: "Terminée", Icon: CheckCircle2, cls: "badge-success" },
  rejected: { label: "Refusée", Icon: XCircle, cls: "badge-ghost" },
  deferred: { label: "Reportée", Icon: Clock, cls: "badge-ghost" },
  duplicate: { label: "Doublon", Icon: Copy, cls: "badge-ghost" },
  cancelled: { label: "Annulée", Icon: Ban, cls: "badge-ghost" }
};
const OPEN = new Set(["new", "in-progress", "queued", "waiting-human", "blocked"]);
const PRIORITIES = [
  { id: "high", label: "Haute" },
  { id: "normal", label: "Normale" },
  { id: "low", label: "Basse" }
];

function fmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.new;
  return (
    <span className={`badge badge-sm gap-1 whitespace-nowrap ${s.cls}`}>
      <s.Icon size={12} className={s.spin ? "animate-spin" : ""} /> {s.label}
    </span>
  );
}

function TypeTag({ type }) {
  const t = REQUEST_TYPES[type];
  if (!t) return <span className="text-[11.5px] text-ey-gray02">À classer</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${t.cls}`}>
      <t.Icon size={13} /> {t.label}
    </span>
  );
}

/** The submission box — also used from the header button. */
export function NewRequestForm({ profile, initialText, onSubmitted, autoFocus }) {
  const [text, setText] = useState(initialText || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setText(initialText || ""); }, [initialText]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await Api.submitRequest(text.trim(), profile);
      setText("");
      onSubmitted && onSubmitted(r.request);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        className="textarea textarea-bordered w-full text-[13.5px] min-h-[96px]"
        placeholder="Une question, un bouton qui ne marche pas, une fonctionnalité à ajouter… Décrivez-la comme à un collègue : où, quoi, ce que vous attendiez."
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) submit(); }}
      />
      {error ? <div className="text-error text-[12px] mt-1">{error}</div> : null}
      <div className="flex items-center gap-3 mt-2">
        <button className="btn btn-primary btn-sm gap-1.5" onClick={submit} disabled={busy || !text.trim()}>
          <Send size={14} /> {busy ? "Envoi…" : "Envoyer la demande"}
        </button>
        <span className="text-[12px] text-ey-gray01">L'orchestrateur la classe et la confie au bon agent. Vous suivez ici son avancement.</span>
      </div>
    </div>
  );
}

function Detail({ req, steps, profile, decisions, onOpenDecision, onOpenRun, onChanged, onNewFromSuggestion }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const c = req.classification || {};
  const decision = req.decisionId ? (decisions || []).find((d) => d.id === req.decisionId) : null;
  const open = OPEN.has(req.status);

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      onChanged(r.request);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 flex flex-col gap-3 text-[13px]">
      <div className="bg-base-200 rounded-md px-3 py-2 whitespace-pre-wrap">{req.text}</div>
      {c.summary ? <div><b>Compris comme :</b> {c.summary}</div> : null}
      {(c.expected || c.observed || c.screen || (c.us || []).length) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-ey-gray01">
          {c.screen ? <div><b className="text-ey-black">Zone :</b> {c.screen}</div> : null}
          {(c.us || []).length ? <div><b className="text-ey-black">User Stories :</b> {c.us.join(", ")}</div> : null}
          {c.expected ? <div><b className="text-ey-black">Attendu :</b> {c.expected}</div> : null}
          {c.observed ? <div><b className="text-ey-black">Observé :</b> {c.observed}</div> : null}
        </div>
      ) : null}

      {req.blockedReason && open ? (
        <div className={`alert py-2 text-[12.5px] ${req.status === "blocked" ? "alert-error" : "alert-warning"}`}>
          <AlertTriangle size={15} /> <span>{req.blockedReason}</span>
        </div>
      ) : null}

      {req.answer ? (
        <div className="border border-ey-border rounded-md p-3">
          <div className="text-[12px] text-ey-gray01 mb-1">Réponse de {req.answer.by || "l'agent"}</div>
          <div className="whitespace-pre-wrap">{req.answer.text}</div>
          {(req.answer.sources || []).length ? (
            <div className="text-[11.5px] text-ey-gray01 mt-2">Sources : {req.answer.sources.join(", ")}</div>
          ) : null}
        </div>
      ) : null}
      {req.suggestion ? (
        <div className="flex items-center gap-2 rounded-md bg-base-200 border border-ey-border px-3 py-2 text-[12.5px]">
          <AlertTriangle size={14} className="shrink-0 text-warning" />
          <span className="flex-1">L'agent a relevé {req.suggestion.type === "bug" ? "une anomalie" : "un besoin non couvert"} : {req.suggestion.summary}</span>
          <button className="btn btn-outline btn-xs" onClick={() => onNewFromSuggestion(req.suggestion.summary)}>Ouvrir une demande</button>
        </div>
      ) : null}

      {req.impact ? (
        <div className="border border-ey-border rounded-md p-3">
          <div className="text-[12px] text-ey-gray01 mb-1">Analyse d'impact (@po)</div>
          <div>{req.impact.summary}</div>
          {req.impact.estimateDays ? <div className="text-[12px] text-ey-gray01 mt-1">Charge estimée : {req.impact.estimateDays.min}–{req.impact.estimateDays.max} j</div> : null}
          {decision ? (
            <button className="btn btn-sm btn-primary mt-2" onClick={() => onOpenDecision(decision)}>
              {decision.status === "pending" ? "Décider (chef de projet)" : "Voir la décision"}
            </button>
          ) : null}
        </div>
      ) : null}
      {(req.usIds || []).length ? <div className="text-[12.5px]"><b>User Stories :</b> {req.usIds.join(", ")}</div> : null}
      {(req.regressionTests || []).length ? <div className="text-[12.5px]"><b>Test de non-régression :</b> {req.regressionTests.join(", ")}</div> : null}

      <div>
        <div className="text-[12px] font-semibold mb-1">Historique</div>
        <ol className="m-0 pl-0 list-none flex flex-col gap-1">
          {(req.history || []).slice().reverse().map((h, i) => (
            <li key={i} className="text-[12.5px] flex gap-2">
              <span className="text-ey-gray02 shrink-0 w-28">{fmt(h.at)}</span>
              <span>{h.step && steps[h.step] ? <b>{steps[h.step]} · </b> : null}{h.msg}</span>
            </li>
          ))}
        </ol>
      </div>
      {(req.comments || []).length ? (
        <div>
          <div className="text-[12px] font-semibold mb-1">Compléments</div>
          {req.comments.map((m, i) => (
            <div key={i} className="text-[12.5px]"><b>{m.byLabel || "—"}</b> ({fmt(m.at)}) : {m.text}</div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="Ajouter une précision (étapes pour reproduire, données, contexte)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) act(async () => { const r = await Api.commentRequest(req.id, comment.trim(), profile); setComment(""); return r; }); }}
            />
            <button className="btn btn-outline btn-sm" disabled={busy || !comment.trim()} onClick={() => act(async () => { const r = await Api.commentRequest(req.id, comment.trim(), profile); setComment(""); return r; })}>
              Ajouter
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {req.currentRunId && req.status === "in-progress" ? (
              <button className="btn btn-ghost btn-xs gap-1" onClick={() => onOpenRun({ id: req.currentRunId, label: `${req.id} · ${steps[req.step] || ""}` })}>
                <Terminal size={13} /> Voir l'agent au travail
              </button>
            ) : null}
            {req.status === "blocked" || (req.status === "waiting-human" && !req.decisionId) ? (
              <button className="btn btn-outline btn-xs gap-1" disabled={busy} onClick={() => act(() => Api.retryRequest(req.id))}>
                <RotateCw size={13} /> Relancer l'étape
              </button>
            ) : null}
            <label className="text-[12px] text-ey-gray01 inline-flex items-center gap-1">
              Priorité
              <select className="select select-bordered select-xs" value={req.priority} disabled={busy} onChange={(e) => act(() => Api.setRequestPriority(req.id, e.target.value))}>
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <button
              className="btn btn-ghost btn-xs gap-1 ml-auto"
              disabled={busy}
              onClick={() => { if (window.confirm(`Annuler la demande ${req.id} ?`)) act(() => Api.cancelRequest(req.id)); }}
            >
              <Ban size={13} /> Annuler la demande
            </button>
          </div>
        </div>
      ) : null}
      {error ? <div className="text-error text-[12px]">{error}</div> : null}
    </div>
  );
}

export default function RequestsScreen({ state, profile, focusId, onOpenDecision, onOpenRun }) {
  const [requests, setRequests] = useState(null);
  const [steps, setSteps] = useState({});
  const [tab, setTab] = useState("open");
  const [expanded, setExpanded] = useState(focusId || null);
  const [prefill, setPrefill] = useState("");
  const [error, setError] = useState(null);
  const timer = useRef(null);

  async function load() {
    try {
      const r = await Api.listRequests();
      setRequests(r.requests || []);
      setSteps(r.steps || {});
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    timer.current = setInterval(load, 4000);
    return () => clearInterval(timer.current);
  }, []);
  useEffect(() => { if (focusId) setExpanded(focusId); }, [focusId]);

  const lists = useMemo(() => {
    const all = requests || [];
    return {
      open: all.filter((r) => OPEN.has(r.status)),
      mine: all.filter((r) => r.by === profile),
      closed: all.filter((r) => !OPEN.has(r.status))
    };
  }, [requests, profile]);
  const shown = lists[tab] || [];

  function changed(req) {
    if (!req) return load();
    setRequests((cur) => (cur || []).map((r) => (r.id === req.id ? req : r)));
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h3 className="text-base font-bold mt-0 mb-1 flex items-center gap-2">
          <MessageSquarePlus size={17} className="text-ey-gray01" /> Nouvelle demande
        </h3>
        <NewRequestForm
          profile={profile}
          initialText={prefill}
          onSubmitted={(req) => { setPrefill(""); setTab("open"); if (req) { setExpanded(req.id); setRequests((cur) => [req, ...(cur || [])]); } }}
        />
      </Card>

      <div className="flex items-center gap-2">
        {[
          { id: "open", label: `En cours (${lists.open.length})` },
          { id: "mine", label: `Mes demandes (${lists.mine.length})` },
          { id: "closed", label: `Closes (${lists.closed.length})` }
        ].map((t) => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? "btn-active" : "btn-ghost"}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {error ? <div className="alert alert-error text-[13px]">{error}</div> : null}
      {!requests ? (
        <div className="text-ey-gray01 text-[13px] flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Chargement…</div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande">Les questions, anomalies et évolutions déposées apparaîtront ici.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          {shown.map((r) => {
            const isOpen = expanded === r.id;
            const Chevron = isOpen ? ChevronDown : ChevronRight;
            return (
              <div key={r.id} className="border-b border-ey-border last:border-0">
                <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-base-200" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <Chevron size={15} className="text-ey-gray02 shrink-0" />
                  <span className="font-mono text-[11.5px] text-ey-gray02 shrink-0">{r.id}</span>
                  <span className="shrink-0 w-40"><TypeTag type={r.type} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium truncate">{(r.classification && r.classification.title) || r.text}</span>
                    <span className="block text-[11.5px] text-ey-gray01 truncate">
                      {r.byLabel || "—"} · {fmt(r.createdAt)}{r.step && OPEN.has(r.status) ? ` · ${steps[r.step] || r.step}` : ""}
                      {r.priority === "high" ? " · priorité haute" : ""}
                    </span>
                  </span>
                  <StatusBadge status={r.status} />
                </button>
                {isOpen ? (
                  <Detail
                    req={r}
                    steps={steps}
                    profile={profile}
                    decisions={state.decisions}
                    onOpenDecision={onOpenDecision}
                    onOpenRun={onOpenRun}
                    onChanged={changed}
                    onNewFromSuggestion={(text) => { setPrefill(text); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  />
                ) : null}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
