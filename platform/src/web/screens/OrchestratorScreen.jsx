import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, Bot, Compass, Sparkles, Play, Zap, CheckCircle2, Trash2, Gauge, StopCircle, AlertTriangle, HelpCircle, Activity } from "lucide-react";
import { Api } from "../api.js";
import MarkdownView from "../components/MarkdownView.jsx";
import RunConsole from "../components/RunConsole.jsx";
import { loadThread, saveThread, clearThread } from "../chatStore.js";

const STOP_LABELS = {
  manual: "Arrêté",
  done: "Demande accomplie",
  budget: "Plafond de dépense atteint",
  iterations: "Nombre de tours maximum atteint",
  stuck: "Bloqué — précise ou reformule ta demande"
};

/**
 * Copilot ("gestion automatique") panel: you type ONE demand, and the orchestrator carries it
 * out end to end — planning, launching agents, delegating decisions to the expert agents — then
 * hands you back a report. When an expert is blocked, its question surfaces HERE as a card:
 * you answer, it continues. Without a demand it does nothing.
 */
function AutopilotPanel({ onStateChange }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState("");
  const [answers, setAnswers] = useState({}); // { [decisionId]: { choiceLabel, note } }
  const timerRef = useRef(null);

  async function refresh() {
    try { setStatus(await Api.autopilotStatus()); } catch {}
  }
  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 3000);
    return () => clearInterval(timerRef.current);
  }, []);

  const session = status?.session || null;
  const st = session?.status;
  const active = Boolean(session && (st === "running" || st === "waiting-human"));
  const escalations = session?.escalations || [];

  async function launch() {
    const demand = req.trim();
    if (!demand) return;
    setBusy(true);
    try {
      const r = await Api.autopilotStart(demand);
      setReq("");
      setStatus(r);
    } catch (e) {
      // surface the error inline via a transient status refresh
      await refresh();
    } finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    try { setStatus(await Api.autopilotStop()); } catch {}
    finally { setBusy(false); }
  }

  async function submitAnswer(item) {
    const draft = answers[item.id] || {};
    const choiceLabel = String(draft.choiceLabel || "").trim();
    if (!choiceLabel) return;
    setBusy(true);
    try {
      await Api.autopilotAnswer({
        id: item.id,
        choiceLabel,
        note: String(draft.note || "").trim(),
        decidedBy: item.targetProfile
      });
      setAnswers((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      await refresh();
      if (onStateChange) Api.getState().then(onStateChange).catch(() => {});
    } catch {}
    finally { setBusy(false); }
  }

  async function delegateAgain(item) {
    // "Fais au mieux" — hand it back to the expert with an explicit free-hand mandate.
    setBusy(true);
    try {
      await Api.autopilotAnswer({ id: item.id, delegate: true, decidedBy: item.targetProfile });
      setAnswers((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      await refresh();
      if (onStateChange) Api.getState().then(onStateChange).catch(() => {});
    } catch {}
    finally { setBusy(false); }
  }

  const settings = status?.settings || {};
  const budget = settings.budgetUsd || 0;
  const spent = session?.spentUsd || 0;
  const showResult = st === "stopped" && (session?.result || session?.stopReason);

  return (
    <div className="border border-ey-border rounded-lg bg-base-100 mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-base-200 border-b border-ey-border">
        <span className="w-8 h-8 rounded-lg bg-ey-black grid place-items-center shrink-0">
          <Gauge size={17} className="text-ey-yellow" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] leading-tight">Gestion automatique</div>
          <div className="text-[11.5px] text-ey-gray01">
            Donne-lui une demande : il s'en occupe de bout en bout (planifie, lance les agents, fait trancher les experts) et te rend le résultat.
          </div>
        </div>
        {active ? (
          <button className="btn btn-outline btn-error btn-sm gap-1.5 shrink-0" onClick={stop} disabled={busy}>
            <StopCircle size={15} /> Arrêter
          </button>
        ) : null}
      </div>

      <div className="px-4 py-3">
        {/* Demande input — shown when nothing is running */}
        {!active ? (
          <div className="mb-1">
            <label className="block text-[12.5px] font-semibold mb-1.5">Que veux-tu que l'orchestrateur fasse ?</label>
            <textarea
              className="textarea textarea-bordered w-full text-[13px]"
              rows={2}
              placeholder="Ex. « Développe l'écran de connexion à partir des US du backlog » ou « Fais passer la revue G2 »."
              value={req}
              onChange={(e) => setReq(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch(); }}
              disabled={busy}
            />
            <div className="flex items-center gap-2 mt-2">
              <button className="btn btn-primary btn-sm gap-1.5" onClick={launch} disabled={busy || !req.trim()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Lancer en automatique
              </button>
              <span className="text-[11px] text-ey-gray02">Il te demandera seulement si un expert est bloqué. ⌘/Ctrl + Entrée</span>
            </div>
          </div>
        ) : null}

        {/* Result / stop report */}
        {showResult ? (
          <div className={`mb-3 flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px] ${session.stopReason === "done" ? "bg-[#EAF7EE] border border-[#cdebd9]" : "bg-base-200 border border-ey-border"}`}>
            {session.stopReason === "done" ? <CheckCircle2 size={15} className="text-[#168736] mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="text-ey-gray01 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="font-bold">{STOP_LABELS[session.stopReason] || "Terminé"}</div>
              {session.request ? <div className="text-[11.5px] text-ey-gray02 mt-0.5 italic">« {session.request} »</div> : null}
              <div className="mt-1 whitespace-pre-wrap">{session.result || session.stopMessage || ""}</div>
            </div>
          </div>
        ) : null}

        {/* Live status while active */}
        {active ? (
          <>
            {session?.request ? (
              <div className="mb-2 text-[12.5px]">
                <span className="text-ey-gray02">Demande :</span> <b>« {session.request} »</b>
              </div>
            ) : null}
            <div className="flex items-center gap-4 flex-wrap text-[12px]">
              <span className="flex items-center gap-1.5">
                {st === "running" ? <Loader2 size={14} className="animate-spin text-secondary" /> : <HelpCircle size={14} className="text-[#A15C07]" />}
                <b>{st === "running" ? "En cours…" : "En attente de ta réponse"}</b>
              </span>
              <span className="text-ey-gray01">Tours : <b>{session?.iterations ?? 0}</b>{settings.maxIterations ? ` / ${settings.maxIterations}` : ""}</span>
              <span className="text-ey-gray01">Dépense : <b>${spent.toFixed(2)}</b>{budget ? ` / $${budget}` : ""}</span>
            </div>

            {/* Steps launched so far — what it delegated, to whom */}
            {session?.launched?.length ? (
              <div className="mt-2.5 flex flex-col gap-1">
                {session.launched.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <Bot size={13} className="text-secondary shrink-0" />
                    <span className="font-semibold">{l.agent || "agent"}</span>
                    {l.phaseId ? <span className="badge badge-ghost badge-xs">{l.phaseId}</span> : null}
                    <span className="text-ey-gray01 truncate">{l.label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Live console of the agent currently working — see exactly what it's doing */}
            {status?.currentRun ? (
              <div className="mt-3">
                <div className="text-[11.5px] text-ey-gray02 mb-1 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  {status.currentRun.kind === "chat" ? "L'orchestrateur analyse et planifie…" : `${status.currentRun.agent || "L'agent"} travaille en direct :`}
                </div>
                <RunConsole runId={status.currentRun.id} label={status.currentRun.label} />
              </div>
            ) : null}
          </>
        ) : null}

        {active || escalations.length || session?.activity?.length ? (
        <div className={active ? "" : "mt-1"}>
          {/* Escalations — the "it asks, you answer, it continues" cards */}
          {escalations.length ? (
            <div className="mt-3 rounded-lg border border-[#f0d8a8] bg-[#FFFBF2] p-3">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#A15C07] uppercase tracking-wide mb-2">
                <HelpCircle size={14} /> L'orchestrateur te demande ({escalations.length})
              </div>
              <div className="flex flex-col gap-2.5">
                {escalations.map((item) => (
                  <div key={item.id} className="bg-base-100 border border-ey-border rounded-md p-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-base-200 text-ey-gray01">{item.id}</span>
                      {item.phaseId ? <span className="badge badge-ghost badge-sm">{item.phaseId}</span> : null}
                      {item.raisedBy ? <span className="text-[11px] text-ey-gray02">soulevé par {item.raisedBy}</span> : null}
                    </div>
                    <div className="text-[13.5px] font-semibold">{item.title}</div>
                    {item.summary || item.context ? (
                      <p className="m-0 mt-0.5 text-[12.5px] text-ey-gray01">{item.summary || item.context}</p>
                    ) : null}
                    {item.options?.length ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.options.map((o) => {
                          const active = (answers[item.id]?.choiceLabel || "") === o.label;
                          return (
                            <button
                              key={o.id}
                              className={`btn btn-xs ${active ? "btn-primary" : "btn-outline"}`}
                              onClick={() => setAnswers((p) => ({ ...p, [item.id]: { ...(p[item.id] || {}), choiceLabel: o.label } }))}
                              title={o.detail || ""}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <input
                      className="input input-bordered input-sm w-full mt-2 text-[12.5px]"
                      placeholder={item.options?.length ? "…ou saisis ta propre réponse" : "Ta réponse"}
                      value={answers[item.id]?.choiceLabel || ""}
                      onChange={(e) => setAnswers((p) => ({ ...p, [item.id]: { ...(p[item.id] || {}), choiceLabel: e.target.value } }))}
                    />
                    <input
                      className="input input-bordered input-sm w-full mt-1.5 text-[12.5px]"
                      placeholder="Précision / justification (facultatif)"
                      value={answers[item.id]?.note || ""}
                      onChange={(e) => setAnswers((p) => ({ ...p, [item.id]: { ...(p[item.id] || {}), note: e.target.value } }))}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button className="btn btn-primary btn-sm gap-1.5" onClick={() => submitAnswer(item)} disabled={busy || !((answers[item.id]?.choiceLabel || "").trim())}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Répondre et continuer
                      </button>
                      <button className="btn btn-ghost btn-sm gap-1.5 text-ey-gray01" onClick={() => delegateAgain(item)} disabled={busy} title="Laisse l'agent expert trancher au mieux">
                        <Bot size={13} /> Laisse l'expert décider
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recent activity feed */}
          {session?.activity?.length ? (
            <details className="mt-3">
              <summary className="text-[11.5px] text-ey-gray02 cursor-pointer flex items-center gap-1.5">
                <Activity size={12} /> Journal de l'autopilote ({session.activity.length})
              </summary>
              <div className="mt-1.5 max-h-52 overflow-y-auto rounded-md bg-base-200 border border-ey-border p-2 flex flex-col gap-1">
                {session.activity.slice().reverse().map((a, i) => (
                  <div key={i} className="text-[11.5px] text-ey-gray01 flex gap-2">
                    <span className="text-ey-gray02 shrink-0 font-mono">{(a.at || "").slice(11, 19)}</span>
                    <span>{a.msg}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}

const ACTION_LABELS = {
  launch_dev: "Lancer l'agent",
  launch_phase: "Lancer l'étape",
  launch_review: "Lancer la revue",
  remediate: "Corriger les risques",
  launch_dev_batches: "Lancer le dev (par BC)",
  seed_risks: "Amorcer les risques"
};

const SUGGESTIONS = [
  "Où en est le projet globalement ?",
  "Qu'est-ce qui tourne en ce moment ?",
  "Quelles décisions m'attendent et pourquoi ?",
  "Rappelle-moi la vision et le périmètre MVP.",
  "Quelle est la prochaine étape à lancer ?"
];

/**
 * Global orchestrator chat: ask about progress, vision, and agent state.
 * Advisory only (the orchestrator explains, it does not modify anything).
 */
export default function OrchestratorScreen({ state, onStateChange }) {
  const threadKey = `orchestrator:${state?.config?.workspaceRoot || ""}`;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [actions, setActions] = useState([]);
  const [acting, setActing] = useState(false);
  const [launched, setLaunched] = useState([]); // [{runId?, groupId?, label}]
  const accRef = useRef("");
  const esRef = useRef(null);
  const scrollRef = useRef(null);
  const streamingRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => () => esRef.current && esRef.current.close(), []);

  // Restore the saved thread on mount; persist it whenever it changes.
  useEffect(() => {
    setMessages(loadThread(threadKey));
    loadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);
  useEffect(() => {
    if (loadedRef.current) saveThread(threadKey, messages);
  }, [messages, threadKey]);

  function clearConversation() {
    setMessages([]);
    setActions([]);
    setLaunched([]);
    clearThread(threadKey);
  }
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendText(text);
  }

  function sendText(text) {
    if (!text || streamingRef.current) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setStreaming(true);
    streamingRef.current = true;
    setStreamText("");
    setActions([]); // a new turn supersedes the previous proposals
    accRef.current = "";

    Api.orchestratorChat(text, history)
      .then(({ runId }) => {
        const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);
        esRef.current = es;
        let finished = false;
        const finalize = () => {
          if (finished) return;
          finished = true;
          const finalText = accRef.current.replace(/^\[Démarrage\][^\n]*\n?/, "").trim();
          setMessages((prev) => [...prev, { role: "agent", text: finalText || "(pas de réponse)" }]);
          setStreaming(false);
          streamingRef.current = false;
          setStreamText("");
          es.close();
          // Pick up any actions the orchestrator proposed this turn.
          Api.orchestratorActions().then((r) => setActions(r.actions || [])).catch(() => {});
          // Those same proposals are now mirrored as "todo" tasks in the tray — refresh
          // global state so the Tasks badge/list reflects them without navigating.
          if (onStateChange) Api.getState().then(onStateChange).catch(() => {});
        };
        es.onmessage = (e) => {
          let msg;
          try { msg = JSON.parse(e.data); } catch { return; }
          if (msg.type === "log") {
            accRef.current += msg.chunk;
            setStreamText(accRef.current);
          } else if (msg.type === "ingested") {
            finalize();
          }
        };
        es.onerror = () => { if (streamingRef.current) finalize(); else es.close(); };
      })
      .catch((err) => {
        setMessages((prev) => [...prev, { role: "agent", text: `Erreur : ${err.message}` }]);
        setStreaming(false);
        streamingRef.current = false;
      });
  }

  async function runAction(action) {
    setActing(true);
    try {
      const res = await Api.orchestratorAct(action);
      setLaunched((prev) => [
        ...prev,
        { runId: res.runId || null, groupId: res.groupId || null, label: res.label || action.label || "Action" }
      ]);
      // Remove ONLY the launched one — the others stay available.
      setActions((prev) => prev.filter((a) => a !== action));
    } catch (e) {
      setMessages((prev) => [...prev, { role: "agent", text: `Le lancement a échoué : ${e.message}` }]);
    } finally {
      setActing(false);
    }
  }

  // Launch every remaining proposed action (each is an independent, isolated run).
  async function runAll() {
    setActing(true);
    const list = [...actions];
    for (const action of list) {
      try {
        const res = await Api.orchestratorAct(action);
        setLaunched((prev) => [
          ...prev,
          { runId: res.runId || null, groupId: res.groupId || null, label: res.label || action.label || "Action" }
        ]);
      } catch (e) {
        setMessages((prev) => [...prev, { role: "agent", text: `Échec du lancement « ${action.label || action.type} » : ${e.message}` }]);
      }
    }
    setActions([]);
    setActing(false);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg bg-ey-yellow grid place-items-center shrink-0">
          <Compass size={19} className="text-ey-black" />
        </span>
        <div className="flex-1">
          <h2 className="text-[22px] font-bold tracking-tight m-0">Orchestrateur</h2>
          <p className="text-ey-gray01 mt-0.5 mb-0 text-[13px]">
            Posez vos questions sur l'avancement, ou demandez-lui la prochaine étape : l'orchestrateur
            analyse le projet et vous <b>propose des actions à lancer</b> — que vous confirmez d'un clic.
          </p>
        </div>
        {messages.length > 0 ? (
          <button className="btn btn-ghost btn-sm gap-1.5 text-ey-gray01" onClick={clearConversation} title="Effacer cette conversation">
            <Trash2 size={15} /> Effacer
          </button>
        ) : null}
      </div>

      <AutopilotPanel onStateChange={onStateChange} />

      <div className="border border-ey-border rounded-lg flex flex-col bg-base-100 mt-4" style={{ height: "calc(100vh - 240px)", minHeight: 420 }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {messages.length === 0 && !streaming ? (
            <div className="text-ey-gray01">
              <p className="text-[13px] m-0 mb-3">Par exemple :</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="btn btn-outline btn-sm gap-1.5"
                    onClick={() => sendText(s)}
                    disabled={streaming}
                  >
                    <Sparkles size={13} /> {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex items-start gap-2 justify-end">
                <div className="bg-secondary text-white rounded-lg rounded-tr-none px-3 py-2 text-[13px] max-w-[80%] whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2">
                <span className="w-[26px] h-[26px] rounded-full bg-ey-yellow grid place-items-center shrink-0">
                  <Bot size={15} className="text-ey-black" />
                </span>
                <div className="bg-base-200 border border-ey-border rounded-lg rounded-tl-none px-3 py-2 text-[13px] max-w-[85%] overflow-x-auto">
                  <MarkdownView content={m.text} className="md-compact" />
                </div>
              </div>
            )
          )}

          {streaming ? (
            <div className="flex items-start gap-2">
              <span className="w-[26px] h-[26px] rounded-full bg-ey-yellow grid place-items-center shrink-0">
                <Bot size={15} className="text-ey-black" />
              </span>
              <div className="bg-base-200 border border-ey-border rounded-lg rounded-tl-none px-3 py-2 text-[12px] max-w-[85%] whitespace-pre-wrap text-ey-gray01">
                {streamText ? streamText.slice(-1500) : (
                  <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> L'orchestrateur réfléchit…</span>
                )}
              </div>
            </div>
          ) : null}

          {/* Proposed actions — the human confirms; the platform executes. */}
          {!streaming && actions.length > 0 ? (
            <div className="ml-[34px] rounded-lg border border-[#f0d8a8] bg-[#FFFBF2] p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#A15C07] uppercase tracking-wide">
                  <Zap size={14} /> Actions proposées — à confirmer
                </span>
                {actions.length > 1 ? (
                  <button className="btn btn-primary btn-xs gap-1.5 ml-auto" onClick={runAll} disabled={acting}>
                    {acting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Tout lancer ({actions.length})
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                {actions.map((a, i) => (
                  <div key={i} className="bg-base-100 border border-ey-border rounded-md p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-base-200 text-ey-gray01">{a.type}</span>
                          {a.phaseId ? <span className="badge badge-ghost badge-sm">{a.phaseId}</span> : null}
                          {a.agent ? <span className="text-[11px] font-semibold text-secondary">{a.agent}</span> : null}
                        </div>
                        <div className="text-[13.5px] font-semibold mt-1">{a.label || ACTION_LABELS[a.type] || a.type}</div>
                        {a.rationale ? <p className="m-0 mt-0.5 text-[12.5px] text-ey-gray01">{a.rationale}</p> : null}
                        {a.instruction ? (
                          <details className="mt-1">
                            <summary className="text-[11.5px] text-ey-gray02 cursor-pointer">Voir la consigne à l'agent</summary>
                            <pre className="m-0 mt-1 text-[11.5px] whitespace-pre-wrap bg-base-200 rounded p-2 border border-ey-border">{a.instruction}</pre>
                          </details>
                        ) : null}
                      </div>
                      <button className="btn btn-primary btn-sm gap-1.5 shrink-0" onClick={() => runAction(a)} disabled={acting}>
                        {acting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Lancer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-2 text-[11.5px] text-ey-gray02">
                Rien n'est lancé tant que vous ne cliquez pas. Ces étapes sont aussi ajoutées à vos
                <b> Tâches « À faire »</b> — lancez-les d'ici ou depuis l'écran Tâches. Vous pouvez aussi répondre pour affiner.
              </p>
            </div>
          ) : null}

          {/* Runs launched from confirmed actions. */}
          {launched.map((l, i) => (
            <div key={`launched-${i}`} className="ml-[34px]">
              {l.runId ? (
                <RunConsole runId={l.runId} label={l.label} />
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[#cdebd9] bg-[#EAF7EE] px-3 py-2 text-[13px]">
                  <CheckCircle2 size={16} className="text-[#168736]" />
                  <span><b>{l.label}</b> lancé{l.groupId ? " (vagues parallèles) — suivez-le dans « Avancement »." : "."}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-ey-border flex gap-2">
          <input
            className="input input-bordered input-sm flex-1"
            placeholder="Posez votre question à l'orchestrateur…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={streaming}
          />
          <button className="btn btn-primary btn-sm btn-square" onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </>
  );
}
