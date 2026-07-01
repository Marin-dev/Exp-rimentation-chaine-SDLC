import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageCircle, Bot } from "lucide-react";
import { Api } from "../api.js";
import { Avatar } from "./ui.jsx";

export default function ChatPanel({ phaseId, agentLabel, profile, profileObj, onRunDone, seed }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const accRef = useRef("");
  const esRef = useRef(null);
  const scrollRef = useRef(null);
  const lastSeed = useRef(null);
  const streamingRef = useRef(false);

  useEffect(() => () => esRef.current && esRef.current.close(), []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  // A "consigne type" clicked in the phase screen lands here and is sent.
  useEffect(() => {
    if (seed && seed.nonce !== lastSeed.current && seed.text) {
      lastSeed.current = seed.nonce;
      sendText(seed.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

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
    accRef.current = "";

    Api.chat(phaseId, text, history, profile)
      .then(({ runId }) => {
        const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);
        esRef.current = es;
        let finished = false;
        const finalize = (notify) => {
          if (finished) return;
          finished = true;
          const finalText = accRef.current.replace(/^\[Démarrage\][^\n]*\n?/, "").trim();
          setMessages((prev) => [...prev, { role: "agent", text: finalText || "(pas de réponse)" }]);
          setStreaming(false);
          streamingRef.current = false;
          setStreamText("");
          es.close();
          if (notify) onRunDone && onRunDone();
        };
        es.onmessage = (e) => {
          let msg;
          try { msg = JSON.parse(e.data); } catch { return; }
          if (msg.type === "log") {
            accRef.current += msg.chunk;
            setStreamText(accRef.current);
          } else if (msg.type === "ingested") {
            finalize(true);
          }
        };
        // If the stream drops before "ingested" (network error, run died early), don't hang forever.
        es.onerror = () => { if (streamingRef.current) finalize(false); else es.close(); };
      })
      .catch((err) => {
        setMessages((prev) => [...prev, { role: "agent", text: `Erreur : ${err.message}` }]);
        setStreaming(false);
        streamingRef.current = false;
      });
  }

  return (
    <div className="border border-ey-border rounded-lg flex flex-col bg-base-100" style={{ height: 460 }}>
      <div className="px-4 py-2.5 border-b border-ey-border flex items-center gap-2">
        <MessageCircle size={16} className="text-ey-gray01" />
        <span className="text-[13px] font-bold">Discuter avec {agentLabel}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && !streaming ? (
          <p className="text-ey-gray01 text-[12.5px] m-0">
            Posez une question à {agentLabel}, demandez-lui de produire ou de mettre à jour un
            document, ou donnez-lui une nouvelle information pour cette étape.
          </p>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex items-start gap-2 justify-end">
              <div className="bg-secondary text-white rounded-lg rounded-tr-none px-3 py-2 text-[13px] max-w-[80%] whitespace-pre-wrap">
                {m.text}
              </div>
              {profileObj ? <Avatar profile={profileObj} size={26} /> : null}
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span className="w-[26px] h-[26px] rounded-full bg-ey-yellow grid place-items-center shrink-0">
                <Bot size={15} className="text-ey-black" />
              </span>
              <div className="bg-base-200 border border-ey-border rounded-lg rounded-tl-none px-3 py-2 text-[13px] max-w-[85%] whitespace-pre-wrap">
                {m.text}
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
              {streamText ? streamText.slice(-1200) : (
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {agentLabel} réfléchit…</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-3 border-t border-ey-border flex gap-2">
        <input
          className="input input-bordered input-sm flex-1"
          placeholder={`Message à ${agentLabel}…`}
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
  );
}
