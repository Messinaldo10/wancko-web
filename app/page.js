"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ✅ Sesiones separadas:
 * - Wancko:  wancko_session_v2 + wancko_chat_v2
 * - H-Wancko: hwancko_session_v2 + hwancko_chat_v2
 */
const LS_W_SESSION = "wancko_session_v2";
const LS_W_CHAT = "wancko_chat_v2";
const LS_H_SESSION = "hwancko_session_v2";
const LS_H_CHAT = "hwancko_chat_v2";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function labelGradiente(d) {
  if (d == null) return "—";
  if (d < 0.3) return "Continuidad";
  if (d < 0.6) return "Crepúsculo";
  return "Ruptura";
}

function antiLabel(anti) {
  if (!anti) return null;
  if (anti === "silence") return "pausa";
  if (anti === "break") return "romper bucle";
  if (anti === "ground") return "aterrizar";
  if (anti === "invert") return "invertir";
  return anti;
}

function certText(cert) {
  const lvl = cert?.level || "seed";
  if (lvl === "ok") return "ARPI · OK";
  if (lvl === "unstable") return "ARPI · Inestable";
  if (lvl === "blocked") return "ARPI · Bloqueado";
  return "ARPI · Semilla";
}

function small(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return Number(x).toFixed(2);
}

/** ---------- Fondo Wancko (color + complejidad + belleza) ---------- */
function wanckoBg(au, session) {
  const tone = au?.signals?.tone || "amber";
  const d = au?.signals?.d ?? 0.45;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  const complexity = au?.signals?.complexity ?? Math.log2(2 + (session?.turns ?? 0)) / 6;
  const beauty = au?.signals?.beauty ?? 0.55;

  // Capas:
  // 1) base color
  let base;
  if (tone === "green") base = `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  else if (tone === "red") base = `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  else base = `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;

  // 2) complexity grain (algorítmico): más turns -> más líneas
  const c = clamp01(complexity);
  const lineA = 6 + Math.round(c * 14); // 6..20
  const alphaA = 0.05 + c * 0.10; // 0.05..0.15
  const grain = `repeating-linear-gradient(
    135deg,
    rgba(255,255,255,${alphaA}) 0px,
    rgba(255,255,255,${alphaA}) 1px,
    rgba(0,0,0,0) ${lineA}px,
    rgba(0,0,0,0) ${lineA + 6}px
  )`;

  // 3) beauty glow (log): más belleza -> foco suave
  const b = clamp01(beauty);
  const glowAlpha = 0.06 + b * 0.10;
  const glow = `radial-gradient(circle at 55% 30%, rgba(255,255,255,${glowAlpha}), rgba(0,0,0,0) 55%)`;

  return `${glow}, ${grain}, ${base}`;
}

/** ---------- Fondo H-Wancko (día → violeta → noche + complejidad/belleza) ---------- */
function hwanckoBg(au, session) {
  const tone = au?.signals?.tone || "violet";
  const d = au?.signals?.d ?? 0.55;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  const complexity = au?.signals?.complexity ?? Math.log2(2 + (session?.turns ?? 0)) / 6;
  const beauty = au?.signals?.beauty ?? 0.55;

  let base;
  if (tone === "day") {
    base = `radial-gradient(circle at ${pos} 42%, #f6fbff, #b8d6ff 55%, #4b56a6 110%)`;
  } else if (tone === "night") {
    base = `radial-gradient(circle at ${pos} 42%, #140b27, #07040f 65%, #000000 120%)`;
  } else {
    base = `radial-gradient(circle at ${pos} 42%, #7d3cff, #2a0b52 65%, #070410 120%)`;
  }

  // complexity lines (darker, subtle)
  const c = clamp01(complexity);
  const lineA = 8 + Math.round(c * 16);
  const alphaA = 0.05 + c * 0.09;
  const grain = `repeating-linear-gradient(
    45deg,
    rgba(0,0,0,${alphaA}) 0px,
    rgba(0,0,0,${alphaA}) 1px,
    rgba(0,0,0,0) ${lineA}px,
    rgba(0,0,0,0) ${lineA + 8}px
  )`;

  // beauty highlight
  const b = clamp01(beauty);
  const glowAlpha = 0.08 + b * 0.10;
  const glow = `radial-gradient(circle at 40% 22%, rgba(255,255,255,${glowAlpha}), rgba(0,0,0,0) 55%)`;

  return `${glow}, ${grain}, ${base}`;
}

function detectLangUI(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|recuerda|olvida)\b/.test(t)) return "es";
  return "en";
}

export default function Home() {
  const [tab, setTab] = useState("wancko"); // "wancko" | "hwancko"

  // Wancko
  const [wInput, setWInput] = useState("");
  const [wSession, setWSession] = useState(null);
  const [wAu, setWAu] = useState(null);
  const [wCert, setWCert] = useState(null);
  const [wHai, setWHai] = useState(null);
  const [wBaski, setWBaski] = useState(null);
  const [wChat, setWChat] = useState([]); // [{role, text, t}]
  const [juramento, setJuramento] = useState("");

  // H-Wancko
  const [hInput, setHInput] = useState("");
  const [hSession, setHSession] = useState(null);
  const [hAu, setHAu] = useState(null);
  const [hChat, setHChat] = useState([]);
  const [archetype, setArchetype] = useState("estoic");

  const [loading, setLoading] = useState(false);

  const chatRef = useRef(null);

  /* ---------------- LOAD ---------------- */
  useEffect(() => {
    try {
      const s1 = localStorage.getItem(LS_W_SESSION);
      const c1 = localStorage.getItem(LS_W_CHAT);
      if (s1) {
        const parsed = JSON.parse(s1);
        setWSession(parsed);
        if (parsed?.juramento != null) setJuramento(parsed.juramento || "");
      }
      if (c1) setWChat(JSON.parse(c1));

      const s2 = localStorage.getItem(LS_H_SESSION);
      const c2 = localStorage.getItem(LS_H_CHAT);
      if (s2) setHSession(JSON.parse(s2));
      if (c2) setHChat(JSON.parse(c2));
    } catch {}
  }, []);

  /* ---------------- SAVE ---------------- */
  useEffect(() => {
    try {
      if (wSession) localStorage.setItem(LS_W_SESSION, JSON.stringify({ ...wSession, juramento }));
      localStorage.setItem(LS_W_CHAT, JSON.stringify(wChat));
    } catch {}
  }, [wSession, wChat, juramento]);

  useEffect(() => {
    try {
      if (hSession) localStorage.setItem(LS_H_SESSION, JSON.stringify(hSession));
      localStorage.setItem(LS_H_CHAT, JSON.stringify(hChat));
    } catch {}
  }, [hSession, hChat]);

  /* ---------------- AUTOSCROLL ---------------- */
  useEffect(() => {
    try {
      if (!chatRef.current) return;
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    } catch {}
  }, [tab, wChat, hChat]);

  /* ---------------- BACKGROUND ---------------- */
  const bg = useMemo(() => {
    return tab === "wancko" ? wanckoBg(wAu, wSession) : hwanckoBg(hAu, hSession);
  }, [tab, wAu, hAu, wSession, hSession]);

  /* ---------------- INDICATORS (Wancko) ---------------- */
  const w_d = wAu?.signals?.d ?? null;
  const w_W = wAu?.signals?.W ?? 0.5;
  const w_band = wAu?.signals?.band ?? 1;
  const w_ok = wAu?.signals?.ok ?? 0.55;

  const w_complexity = wAu?.signals?.complexity ?? (Math.log2(2 + (wSession?.turns ?? 0)) / 6);
  const w_beauty = wAu?.signals?.beauty ?? 0.55;

  /* ---------------- INDICATORS (H-Wancko) ---------------- */
  const h_d = hAu?.signals?.d ?? null;
  const h_band = hAu?.signals?.band ?? 1;
  const h_ok = hAu?.signals?.ok ?? 0.55;
  const h_complexity = hAu?.signals?.complexity ?? (Math.log2(2 + (hSession?.turns ?? 0)) / 6);
  const h_beauty = hAu?.signals?.beauty ?? 0.55;

  /* ---------------- SUBMIT (Wancko) ---------------- */
  async function sendWancko() {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const userText = wInput;
    setWInput(""); // ✅ limpiar input al enviar
    setWChat((prev) => [...prev, { role: "user", text: userText, t: Date.now() }]);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": detectLangUI(userText) },
        body: JSON.stringify({
          input: userText,
          juramento: juramento || null,
          session: wSession || null
        })
      });

      const data = await res.json();

      setWAu(data.au || null);
      setWSession(data.session || null);
      setWCert(data.cert || null);
      setWHai(data.hai || null);
      setWBaski(data.baski || null);

      const out = data.output === null ? "—" : data.output;
      setWChat((prev) => [...prev, { role: "assistant", text: out, t: Date.now() }]);
    } catch {
      setWChat((prev) => [...prev, { role: "assistant", text: "Wancko could not respond.", t: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- SUBMIT (H-Wancko) ---------------- */
  async function sendHWancko() {
    if (!hInput.trim() || loading) return;
    setLoading(true);

    const userText = hInput;
    setHInput(""); // ✅ limpiar input al enviar
    setHChat((prev) => [...prev, { role: "user", text: userText, t: Date.now() }]);

    try {
      const lang = detectLangUI(userText);

      const res = await fetch("/api/h-wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang },
        body: JSON.stringify({
          input: userText,
          archetype,
          session: hSession || null
        })
      });

      const data = await res.json();

      setHAu(data.au || null);
      setHSession(data.session || null);

      const out = data.output === null ? "—" : data.output;
      setHChat((prev) => [...prev, { role: "assistant", text: out, t: Date.now() }]);
    } catch {
      setHChat((prev) => [...prev, { role: "assistant", text: "H-Wancko could not respond.", t: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI helpers ---------------- */
  const activeChat = tab === "wancko" ? wChat : hChat;

  function clearActive() {
    if (tab === "wancko") {
      setWChat([]);
      setWSession(null);
      setWAu(null);
      setWCert(null);
      setWHai(null);
      setWBaski(null);
      try {
        localStorage.removeItem(LS_W_CHAT);
        localStorage.removeItem(LS_W_SESSION);
      } catch {}
    } else {
      setHChat([]);
      setHSession(null);
      setHAu(null);
      try {
        localStorage.removeItem(LS_H_CHAT);
        localStorage.removeItem(LS_H_SESSION);
      } catch {}
    }
  }

  const isHW = tab === "hwancko";
  const fg = isHW ? "#0c1020" : "#eaeaea";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: fg,
        fontFamily: "system-ui",
        padding: "68px 20px",
        transition: "background 650ms ease"
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, letterSpacing: 0.2 }}>
              {tab === "wancko" ? "Wancko" : "H-Wancko"}
            </h1>
            <p style={{ opacity: isHW ? 0.8 : 0.65, marginTop: 8, maxWidth: 540 }}>
              {tab === "wancko"
                ? "Operador AU (objetividad AU). Memoria por glifos. Color y barra dependen del hilo."
                : "Operador histórico espejo (subjetividad AU). Luz día/violeta/noche. Voz humana por figura."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setTab("wancko")}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: tab === "wancko" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.22)",
                color: fg,
                cursor: "pointer"
              }}
            >
              Wancko
            </button>
            <button
              onClick={() => setTab("hwancko")}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: tab === "hwancko" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)",
                color: fg,
                cursor: "pointer"
              }}
            >
              H-Wancko
            </button>

            <button
              onClick={clearActive}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.22)",
                color: fg,
                cursor: "pointer"
              }}
              title="Borrar conversación de este modo"
            >
              Reset
            </button>

            {/* Badges (Wancko) */}
            {tab === "wancko" && (
              <>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.22)",
                    fontSize: 13,
                    opacity: 0.92
                  }}
                >
                  {certText(wCert)}
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.22)",
                    fontSize: 13,
                    opacity: 0.9
                  }}
                  title="HAI · valor/acuerdo cruzado"
                >
                  HAI · {small(wHai?.v)}
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.22)",
                    fontSize: 13,
                    opacity: 0.9
                  }}
                  title="Baski · control cruzado"
                >
                  Baski · {small(wBaski?.c)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {tab === "wancko" ? (
            <>
              <select
                value={juramento}
                onChange={(e) => setJuramento(e.target.value)}
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

              <div style={{ opacity: 0.75, fontSize: 13 }}>
                Band: <b>{w_band}</b> · OK: <b>{small(w_ok)}</b> · Complejidad: <b>{small(w_complexity)}</b> · Belleza: <b>{small(w_beauty)}</b>
              </div>
            </>
          ) : (
            <>
              <select
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                style={{
                  padding: 10,
                  background: "rgba(255,255,255,0.28)",
                  color: "#0c1020",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.38)"
                }}
              >
                <option value="estoic">Estoic</option>
                <option value="mystic">Mystic</option>
                <option value="warrior">Warrior</option>
                <option value="poet">Poet</option>
              </select>

              <div style={{ opacity: 0.9, fontSize: 13, color: "#0c1020" }}>
                Band: <b>{h_band}</b> · OK: <b>{small(h_ok)}</b> · Complejidad: <b>{small(h_complexity)}</b> · Belleza: <b>{small(h_beauty)}</b>
              </div>
            </>
          )}
        </div>

        {/* AU strip */}
        {tab === "wancko" && wAu && (
          <div style={{ marginTop: 16, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span> {wAu.mode} ·{" "}
              <span style={{ opacity: 0.6 }}>Screen:</span> {wAu.screen} ·{" "}
              <span style={{ opacity: 0.6 }}>Matrix:</span> {wAu.matrix} ·{" "}
              <span style={{ opacity: 0.6 }}>N:</span> {wAu.N_level}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ opacity: 0.6 }}>Gradiente AU:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.25)"
                }}
              >
                {labelGradiente(w_d)}{w_d != null ? ` · d=${w_d.toFixed(2)}` : ""}
              </div>

              <div style={{ opacity: 0.6 }}>
                {wAu.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa"}
              </div>

              {wAu.anti && (
                <div style={{ opacity: 0.6 }}>
                  anti-loop: {antiLabel(wAu.anti)}
                </div>
              )}
            </div>

            {/* W BAR */}
            <div style={{ marginTop: 10 }}>
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
                    left: `${clamp01(w_W) * 100}%`,
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

        {tab === "hwancko" && hAu && (
          <div style={{ marginTop: 16, opacity: 0.95, fontSize: 13, color: "#0c1020" }}>
            <div>
              <span style={{ opacity: 0.7 }}>Screen:</span> {hAu.screen} ·{" "}
              <span style={{ opacity: 0.7 }}>Matrix:</span> {hAu.matrix} ·{" "}
              <span style={{ opacity: 0.7 }}>N:</span> {hAu.N_level}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ opacity: 0.75 }}>Luz:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.40)",
                  background: "rgba(255,255,255,0.28)"
                }}
              >
                {h_d != null ? `d=${h_d.toFixed(2)}` : "—"}
              </div>
              <div style={{ opacity: 0.8 }}>
                {hAu.signals?.tone === "day" ? "día" : hAu.signals?.tone === "night" ? "noche" : "crepúsculo"}
              </div>
            </div>
          </div>
        )}

        {/* Chat */}
        <div
          ref={chatRef}
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 16,
            border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.38)" : "1px solid rgba(255,255,255,0.12)",
            background: tab === "hwancko" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)",
            maxHeight: "52vh",
            overflowY: "auto"
          }}
        >
          {activeChat.length === 0 ? (
            <div style={{ opacity: tab === "hwancko" ? 0.85 : 0.6 }}>
              {tab === "wancko"
                ? 'Tip: di cosas normales y luego pregunta: "¿Dónde dije que iba?" (memoria por glifos).'
                : 'Tip: pregunta "¿Quién eres?" y repite para ver cómo cambia la luz y la voz sin volverse máquina.'}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeChat.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "86%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border:
                      tab === "hwancko"
                        ? "1px solid rgba(255,255,255,0.40)"
                        : "1px solid rgba(255,255,255,0.14)",
                    background:
                      m.role === "user"
                        ? tab === "hwancko"
                          ? "rgba(255,255,255,0.45)"
                          : "rgba(255,255,255,0.10)"
                        : tab === "hwancko"
                        ? "rgba(255,255,255,0.26)"
                        : "rgba(0,0,0,0.22)",
                    color: tab === "hwancko" ? "#0c1020" : "#eaeaea",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.35
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ marginTop: 14 }}>
          <textarea
            value={tab === "wancko" ? wInput : hInput}
            onChange={(e) => (tab === "wancko" ? setWInput(e.target.value) : setHInput(e.target.value))}
            placeholder={tab === "wancko" ? "Escribe aquí… (ej: Hoy voy a ir a la playa)" : "Escribe aquí…"}
            rows={4}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              background: tab === "hwancko" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)",
              color: tab === "hwancko" ? "#0c1020" : "#eaeaea",
              border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              outline: "none"
            }}
            disabled={loading}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                tab === "wancko" ? sendWancko() : sendHWancko();
              }
            }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={tab === "wancko" ? sendWancko : sendHWancko}
              disabled={loading}
              style={{
                marginTop: 12,
                padding: "10px 16px",
                fontSize: 16,
                borderRadius: 12,
                border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.60)" : "1px solid rgba(255,255,255,0.18)",
                background: tab === "hwancko" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.08)",
                color: tab === "hwancko" ? "#0c1020" : "#eaeaea",
                cursor: "pointer"
              }}
            >
              {loading ? "…" : "Send"}
            </button>

            <div style={{ marginTop: 12, opacity: tab === "hwancko" ? 0.9 : 0.6, fontSize: 12, color: fg }}>
              {tab === "wancko" ? (
                <>
                  Turns: {wSession?.turns ?? 0} · Chain: {wSession?.chain?.length ?? 0} · Silences: {wSession?.silenceCount ?? 0} · Lang: <b>{wSession?.lang ?? "—"}</b>
                  {" · "}
                  <span style={{ opacity: 0.75 }}>Ctrl/⌘+Enter para enviar</span>
                </>
              ) : (
                <>
                  Turns: {hSession?.turns ?? 0} · Chain: {hSession?.chain?.length ?? 0} · Lang: <b>{hSession?.lang ?? "—"}</b>
                  {" · "}
                  <span style={{ opacity: 0.8 }}>Ctrl/⌘+Enter para enviar</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
