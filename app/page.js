"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LS_KEY = "wancko_session_v2";
const LS_CHAT = "wancko_chat_v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Wancko
  const [au, setAu] = useState(null);
  const [cert, setCert] = useState({ level: "seed" });
  const [cap, setCap] = useState(null);

  // H-Wancko
  const [hSignals, setHSignals] = useState({ L: 0.52, tone: "violet" });

  // Session compartida (facts + chain + h_chain)
  const [session, setSession] = useState(null);

  // modos
  const [mode, setMode] = useState("wancko"); // wancko | historical
  const [juramento, setJuramento] = useState(null);
  const [archetype, setArchetype] = useState("estoic");

  // chat
  const [chat, setChat] = useState([]);

  const endRef = useRef(null);

  /* ---------------- LOAD ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        if (parsed?.juramento) setJuramento(parsed.juramento);
      }
    } catch {}

    try {
      const rawChat = localStorage.getItem(LS_CHAT);
      if (rawChat) setChat(JSON.parse(rawChat));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    } catch {}
  }, [session]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_CHAT, JSON.stringify(chat.slice(-80)));
    } catch {}
  }, [chat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, loading]);

  /* ---------------- VISUALS ---------------- */

  // Wancko bg por d/tone
  const wanckoBg = useMemo(() => {
    const tone = au?.signals?.tone || "amber";
    const d = au?.signals?.d ?? 0.45;

    if (tone === "green") {
      return `radial-gradient(circle at ${d * 100}% 42%, #0f4428, #06130c 62%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${d * 100}% 42%, #4a1212, #140606 62%)`;
    }
    return `radial-gradient(circle at ${d * 100}% 42%, #3b3317, #120f08 62%)`;
  }, [au]);

  // H-Wancko bg por L/tone (día -> violeta -> noche)
  const hBg = useMemo(() => {
    const L = hSignals?.L ?? 0.52;
    const tone = hSignals?.tone || "violet";
    const x = Math.round(L * 100);

    if (tone === "day") {
      return `radial-gradient(circle at ${x}% 38%, rgba(180,220,255,0.55), rgba(35,60,90,0.85) 64%)`;
    }
    if (tone === "night") {
      return `radial-gradient(circle at ${x}% 38%, rgba(30,20,60,0.75), rgba(6,6,18,0.92) 66%)`;
    }
    return `radial-gradient(circle at ${x}% 38%, rgba(150,95,190,0.58), rgba(18,10,26,0.9) 66%)`;
  }, [hSignals]);

  const bg = mode === "historical" ? hBg : wanckoBg;

  const d = au?.signals?.d ?? null;
  const W = au?.signals?.W ?? 0.5;
  const gradientLabel = useMemo(() => {
    if (d === null) return "—";
    if (d < 0.3) return "Continuidad";
    if (d < 0.6) return "Crepúsculo";
    return "Ruptura";
  }, [d]);

  const senseLabel = au?.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa";

  const certText = useMemo(() => {
    const lvl = cert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [cert]);

  const factsPreview = useMemo(() => {
    const f = session?.facts && typeof session.facts === "object" ? session.facts : {};
    const keys = Object.keys(f);
    if (!keys.length) return "—";
    return keys.slice(0, 6).join(", ") + (keys.length > 6 ? "…" : "");
  }, [session]);

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    const text = input.trim();

    // push user msg
    setChat((c) => [...c, { role: "user", text, t: Date.now(), mode }]);
    setInput(""); // ✅ limpiar input
    setLoading(true);

    try {
      const endpoint = mode === "historical" ? "/api/h-wancko" : "/api/wancko";

      const payload =
        mode === "historical"
          ? { input: text, archetype, session: session || null }
          : { input: text, juramento, session: session || null };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      // actualizar session compartida
      if (data.session) setSession(data.session);

      if (mode === "historical") {
        // H-Wancko
        if (data.signals) setHSignals(data.signals);
        setAu(null);
        setCert({ level: "seed" });
        setCap(null);

        setChat((c) => [
          ...c,
          { role: "assistant", text: data.output ?? "—", t: Date.now(), mode: "historical" }
        ]);
      } else {
        // Wancko
        setAu(data.au || null);
        setCert(data.cert || { level: "seed" });
        setCap(data.capabilities || null);

        setChat((c) => [
          ...c,
          { role: "assistant", text: data.output ?? "—", t: Date.now(), mode: "wancko" }
        ]);
      }
    } catch {
      setChat((c) => [...c, { role: "assistant", text: "—", t: Date.now(), mode }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function clearAll() {
    setChat([]);
    setAu(null);
    setCert({ level: "seed" });
    setCap(null);
    setHSignals({ L: 0.52, tone: "violet" });
    setSession(null);
    setJuramento(null);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_CHAT);
    } catch {}
  }

  /* ---------------- UI ---------------- */

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#eaeaea",
        fontFamily: "system-ui",
        padding: "64px 18px",
        transition: "background 600ms ease"
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, letterSpacing: 0.2 }}>Wancko</h1>
            <p style={{ opacity: 0.65, marginTop: 8, marginBottom: 0 }}>
              AU assistant · conversación con memoria declarativa (opt-in).
            </p>
          </div>

          <button
            onClick={clearAll}
            style={{
              alignSelf: "flex-start",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.28)",
              color: "#eaeaea",
              cursor: "pointer",
              opacity: 0.9
            }}
          >
            Reset sesión
          </button>
        </div>

        {/* CONTROLES */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{
              padding: 10,
              background: "rgba(0,0,0,0.35)",
              color: "#eaeaea",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)"
            }}
          >
            <option value="wancko">Wancko</option>
            <option value="historical">H-Wancko</option>
          </select>

          {mode === "historical" && (
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
          )}

          {mode === "wancko" && (
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
          )}

          {/* BADGES */}
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
            {mode === "wancko" ? certText : "H-AU · espejo"}
          </div>

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
            Facts: {factsPreview}
          </div>
        </div>

        {/* INDICADORES */}
        <div style={{ marginTop: 16 }}>
          {mode === "wancko" ? (
            <div style={{ padding: 14, borderRadius: 16, background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                <span style={{ opacity: 0.6 }}>Mode:</span> {au?.mode || "—"} ·{" "}
                <span style={{ opacity: 0.6 }}>Screen:</span> {au?.screen || "—"} ·{" "}
                <span style={{ opacity: 0.6 }}>Matrix:</span> {au?.matrix || "—"} ·{" "}
                <span style={{ opacity: 0.6 }}>N:</span> {au?.N_level || "—"}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                <div style={{ opacity: 0.6 }}>Gradiente AU:</div>
                <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.25)" }}>
                  {gradientLabel}{d !== null ? ` · d=${d.toFixed(2)}` : ""}
                </div>
                <div style={{ opacity: 0.6 }}>{senseLabel}</div>
                {au?.signals?.anti ? <div style={{ opacity: 0.6 }}>anti-loop: {au.signals.anti}</div> : null}
              </div>

              {/* W BAR */}
              <div style={{ marginTop: 12 }}>
                <div style={{ opacity: 0.6, marginBottom: 6, fontSize: 13 }}>W · Reason ↔ Truth</div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 999, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${W * 100}%`,
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

              {/* Capacidades */}
              {cap && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.35 }}>
                  <div>• {cap.memory}</div>
                  <div>• {cap.limits}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 14, borderRadius: 16, background: "rgba(0,0,0,0.24)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                <span style={{ opacity: 0.6 }}>Arquetipo:</span> {archetype} ·{" "}
                <span style={{ opacity: 0.6 }}>Luz:</span> {(hSignals?.L ?? 0.52).toFixed(2)} ·{" "}
                <span style={{ opacity: 0.6 }}>Tono:</span> {hSignals?.tone || "violet"}
              </div>

              {/* L BAR */}
              <div style={{ marginTop: 12 }}>
                <div style={{ opacity: 0.6, marginBottom: 6, fontSize: 13 }}>L · Día ↔ Noche</div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.15)", borderRadius: 999, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${(hSignals?.L ?? 0.52) * 100}%`,
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

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                H-Wancko no “cura” ni aconseja: sostiene una voz humana arquetípica.
              </div>
            </div>
          )}
        </div>

        {/* CHAT */}
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 18,
            background: "rgba(0,0,0,0.22)",
            border: "1px solid rgba(255,255,255,0.12)",
            minHeight: 260
          }}
        >
          {chat.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 14 }}>
              Escribe algo. Para memoria: <span style={{ opacity: 0.9 }}>“Recuerda: el animal es el gorila”</span>.
              <br />
              Para enviar: <span style={{ opacity: 0.9 }}>Ctrl+Enter</span>.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {chat.slice(-60).map((m, i) => {
                const isUser = m.role === "user";
                const isH = m.mode === "historical";
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "78%",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: isUser
                        ? "rgba(255,255,255,0.12)"
                        : isH
                        ? "rgba(170,110,220,0.16)"
                        : "rgba(0,0,0,0.28)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      whiteSpace: "pre-wrap",
                      fontSize: 15,
                      lineHeight: 1.35
                    }}
                  >
                    {m.text}
                  </div>
                );
              })}
              {loading && (
                <div style={{ opacity: 0.55, fontSize: 14, paddingLeft: 6 }}>…</div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* INPUT */}
        <div style={{ marginTop: 14 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === "historical" ? "Habla con el arquetipo…" : "Expose what matters…"}
            rows={4}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              background: "rgba(0,0,0,0.35)",
              color: "#eaeaea",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 14
            }}
            disabled={loading}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              onClick={submit}
              disabled={loading}
              style={{
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

            <div style={{ opacity: 0.55, fontSize: 12, alignSelf: "center" }}>
              Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0} · H-Chain: {session?.h_chain?.length ?? 0}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
