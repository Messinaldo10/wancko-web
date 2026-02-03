"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LS_W = "wancko_session_v1";
const LS_H = "h_wancko_session_v1";
const LS_W_CHAT = "wancko_chat_v1";
const LS_H_CHAT = "h_wancko_chat_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  // UI mode
  const [view, setView] = useState("wancko"); // "wancko" | "hwancko"

  // Shared input/output (per view)
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Wancko state
  const [wOutput, setWOutput] = useState(null);
  const [wAu, setWAu] = useState(null);
  const [wSession, setWSession] = useState(null);
  const [juramento, setJuramento] = useState(null);
  const [wCert, setWCert] = useState(null);
  const [wChat, setWChat] = useState([]); // [{role:"user"|"assistant", text, t}]

  // H-Wancko state
  const [hOutput, setHOutput] = useState(null);
  const [hMeta, setHMeta] = useState(null); // meta.au + meta.signals
  const [archetype, setArchetype] = useState("estoic");
  const [hChat, setHChat] = useState([]);

  const bottomRef = useRef(null);

  /* ---------------- LOAD (separado) ---------------- */

  useEffect(() => {
    const ws = safeParse(localStorage.getItem(LS_W), null);
    const hs = safeParse(localStorage.getItem(LS_H), null);
    const wc = safeParse(localStorage.getItem(LS_W_CHAT), []);
    const hc = safeParse(localStorage.getItem(LS_H_CHAT), []);

    setWSession(ws);
    if (ws?.juramento) setJuramento(ws.juramento);

    setWChat(wc);
    setHChat(hc);

    // (H no guarda session en servidor; solo chat local)
    setHMeta(null);
  }, []);

  useEffect(() => {
    try {
      if (wSession) localStorage.setItem(LS_W, JSON.stringify(wSession));
    } catch {}
  }, [wSession]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_W_CHAT, JSON.stringify(wChat.slice(-80)));
    } catch {}
  }, [wChat]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_H_CHAT, JSON.stringify(hChat.slice(-80)));
    } catch {}
  }, [hChat]);

  useEffect(() => {
    // auto-scroll al final cuando llega respuesta
    try {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {}
  }, [wOutput, hOutput, wChat, hChat, view]);

  /* ---------------- BACKGROUNDS ---------------- */

  // Wancko background (AU)
  const wBg = useMemo(() => {
    const tone = wAu?.signals?.tone || "amber";
    const d = wAu?.signals?.d ?? 0.45;

    if (tone === "green") {
      return `radial-gradient(circle at ${d * 100}% 40%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${d * 100}% 40%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${d * 100}% 40%, #3a3216, #14110b 60%)`;
  }, [wAu]);

  // H-Wancko background (day → violet → night)
  const hBg = useMemo(() => {
    const d = hMeta?.signals?.d ?? 0.5;
    const tone = hMeta?.signals?.tone || "twilight";

    // tonos base
    if (tone === "day") {
      return `radial-gradient(circle at ${d * 100}% 40%, #e8f4ff, #b9d8ff 55%, #6b93ff 100%)`;
    }
    if (tone === "night") {
      return `radial-gradient(circle at ${d * 100}% 40%, #1a1033, #0c081a 60%)`;
    }
    // twilight violeta
    return `radial-gradient(circle at ${d * 100}% 40%, #6f3cff, #22103d 60%)`;
  }, [hMeta]);

  const bg = view === "wancko" ? wBg : hBg;

  /* ---------------- LABELS ---------------- */

  const wD = wAu?.signals?.d ?? null;
  const wW = wAu?.signals?.W ?? 0.5;

  const wGradientLabel = useMemo(() => {
    if (wD === null) return "—";
    if (wD < 0.3) return "Continuidad";
    if (wD < 0.6) return "Crepúsculo";
    return "Ruptura";
  }, [wD]);

  const wSenseLabel =
    wAu?.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa";

  const hD = hMeta?.signals?.d ?? null;
  const hW = hMeta?.signals?.W ?? 0.55;

  const hGradientLabel = useMemo(() => {
    if (hD === null) return "—";
    if (hD <= 0.3) return "Día";
    if (hD >= 0.7) return "Noche";
    return "Crepúsculo";
  }, [hD]);

  /* ---------------- CERT (WANCKO) ---------------- */

  const certText = useMemo(() => {
    const lvl = wCert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [wCert]);

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setLoading(true);

    // Limpia input al enviar (lo que echabas de menos)
    setInput("");

    try {
      if (view === "wancko") {
        // añade al chat local
        setWChat((c) => [...c.slice(-79), { role: "user", text: userText, t: Date.now() }]);

        const res = await fetch("/api/wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: userText,
            juramento,
            session: wSession || null
          })
        });

        const data = await res.json();

        setWOutput(data.output === null ? "—" : data.output);
        setWAu(data.au || null);
        setWSession(data.session || null);
        setWCert(data.cert || null);

        // persist juramento en session local
        if (data.session && juramento) {
          const next = { ...data.session, juramento };
          setWSession(next);
        }

        setWChat((c) => [...c.slice(-79), { role: "assistant", text: data.output ?? "—", t: Date.now() }]);
      } else {
        setHChat((c) => [...c.slice(-79), { role: "user", text: userText, t: Date.now() }]);

        const res = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: userText,
            archetype
          })
        });

        const data = await res.json();

        setHOutput(data.output === null ? "—" : data.output);
        setHMeta(data.meta || null);

        setHChat((c) => [...c.slice(-79), { role: "assistant", text: data.output ?? "—", t: Date.now() }]);
      }
    } catch {
      if (view === "wancko") {
        setWOutput("Wancko could not respond.");
        setWChat((c) => [...c.slice(-79), { role: "assistant", text: "Wancko could not respond.", t: Date.now() }]);
      } else {
        setHOutput("—");
        setHChat((c) => [...c.slice(-79), { role: "assistant", text: "—", t: Date.now() }]);
      }
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI helpers ---------------- */

  const activeChat = view === "wancko" ? wChat : hChat;
  const title = view === "wancko" ? "Wancko" : "H-Wancko";
  const subtitle =
    view === "wancko"
      ? "Natural assistant aligned with AU."
      : "Historical operator · subjectivity → objectivity (AU mirror).";

  function clearChat() {
    if (view === "wancko") {
      setWChat([]);
      setWOutput(null);
    } else {
      setHChat([]);
      setHOutput(null);
      setHMeta(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: view === "hwancko" ? "#0b0b12" : "#eaeaea",
        fontFamily: "system-ui",
        padding: "72px 24px",
        transition: "background 600ms ease"
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>{title}</h1>
            <p style={{ opacity: 0.75, marginTop: 8 }}>{subtitle}</p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={view}
              onChange={(e) => setView(e.target.value)}
              style={{
                padding: 10,
                background: "rgba(0,0,0,0.35)",
                color: "#eaeaea",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="wancko">Wancko</option>
              <option value="hwancko">H-Wancko</option>
            </select>

            <button
              onClick={clearChat}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                color: "#eaeaea",
                cursor: "pointer",
                opacity: 0.9
              }}
            >
              Clear chat
            </button>
          </div>
        </div>

        {/* CONTROLES */}
        {view === "wancko" ? (
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={juramento || ""}
              onChange={(e) => setJuramento(e.target.value || null)}
              style={{
                padding: 10,
                background: "rgba(0,0,0,0.35)",
                color: "#eaeaea",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="">No juramento</option>
              <option value="disciplina">Disciplina</option>
              <option value="ansiedad">Ansiedad</option>
              <option value="límites">Límites</option>
              <option value="excesos">Excesos</option>
              <option value="soltar">Soltar</option>
            </select>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 13,
                opacity: 0.9
              }}
            >
              {certText}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              style={{
                padding: 10,
                background: "rgba(0,0,0,0.35)",
                color: "#eaeaea",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)"
              }}
            >
              <option value="estoic">Estoic</option>
              <option value="mystic">Mystic</option>
              <option value="warrior">Warrior</option>
              <option value="poet">Poet</option>
            </select>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 13,
                opacity: 0.9,
                color: "#eaeaea"
              }}
            >
              Gradiente H: {hGradientLabel}{hD !== null ? ` · d=${hD.toFixed(2)}` : ""}
            </div>
          </div>
        )}

        {/* INDICADORES */}
        {view === "wancko" && wAu && (
          <div style={{ marginTop: 18, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span> {wAu.mode} ·{" "}
              <span style={{ opacity: 0.6 }}>Screen:</span> {wAu.screen} ·{" "}
              <span style={{ opacity: 0.6 }}>Matrix:</span> {wAu.matrix} ·{" "}
              <span style={{ opacity: 0.6 }}>N:</span> {wAu.N_level}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ opacity: 0.6 }}>Gradiente AU:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.25)"
                }}
              >
                {wGradientLabel}{wD !== null ? ` · d=${wD.toFixed(2)}` : ""}
              </div>

              <div style={{ opacity: 0.6 }}>{wSenseLabel}</div>

              {wAu.anti && <div style={{ opacity: 0.6 }}>anti-loop: {wAu.anti}</div>}
            </div>

            {/* W BAR */}
            <div style={{ marginTop: 12 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>W · Reason ↔ Truth</div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 999,
                  position: "relative"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${wW * 100}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transform: "translateX(-50%)",
                    transition: "left 500ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {view === "hwancko" && hMeta && (
          <div style={{ marginTop: 18, opacity: 0.92, fontSize: 13, color: "#eaeaea" }}>
            <div>
              <span style={{ opacity: 0.7 }}>Archetype:</span> {hMeta.archetype} ·{" "}
              <span style={{ opacity: 0.7 }}>Matrix:</span> {hMeta.au?.matrix} ·{" "}
              <span style={{ opacity: 0.7 }}>Screen:</span> {hMeta.au?.screen}
            </div>

            {/* H BAR */}
            <div style={{ marginTop: 12 }}>
              <div style={{ opacity: 0.75, marginBottom: 6 }}>Wᴴ · Clarity ↔ Mystery</div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.22)",
                  borderRadius: 999,
                  position: "relative"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${hW * 100}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transform: "translateX(-50%)",
                    transition: "left 500ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* CHAT */}
        <div
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.22)"
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            Conversación ({activeChat.length})
          </div>

          <div style={{ maxHeight: 300, overflow: "auto", paddingRight: 6 }}>
            {activeChat.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>
                Empieza con: <span style={{ opacity: 0.95 }}>“Recuerda: el animal es …”</span> o pregunta algo.
              </div>
            ) : (
              activeChat.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 10,
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start"
                  }}
                >
                  <div
                    style={{
                      maxWidth: "78%",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: m.role === "user" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                      opacity: 0.98
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* INPUT */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={view === "wancko" ? "Expose what matters." : "Speak to the archetype."}
          rows={4}
          style={{
            width: "100%",
            marginTop: 18,
            padding: 14,
            fontSize: 16,
            background: "rgba(0,0,0,0.35)",
            color: "#eaeaea",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 12
          }}
          disabled={loading}
        />

        <button
          onClick={submit}
          disabled={loading}
          style={{
            marginTop: 14,
            padding: "10px 16px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            color: "#eaeaea",
            cursor: "pointer"
          }}
        >
          {loading ? "…" : "Send"}
        </button>

        {/* OUTPUT (última respuesta) */}
        <div
          style={{
            marginTop: 20,
            minHeight: 38,
            fontSize: 16,
            whiteSpace: "pre-wrap",
            opacity: (view === "wancko" ? wOutput : hOutput) === "—" ? 0.55 : 1
          }}
        >
          {view === "wancko" ? wOutput : hOutput}
        </div>

        {/* META */}
        {view === "wancko" && (
          <div style={{ marginTop: 12, opacity: 0.45, fontSize: 12 }}>
            Turns: {wSession?.turns ?? 0} · Chain: {wSession?.chain?.length ?? 0}
          </div>
        )}
      </div>
    </main>
  );
}
