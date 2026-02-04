"use client";

import { useEffect, useMemo, useState } from "react";

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

function wanckoBg(au) {
  const tone = au?.signals?.tone || "amber";
  const d = au?.signals?.d ?? 0.45;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  if (tone === "green")
    return `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  if (tone === "red")
    return `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  return `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;
}

function hwanckoBg(au) {
  // ✅ C-2: día → violeta → noche (S = luz)
  const tone = au?.tone || au?.signals?.tone || "twilight";
  const S = au?.S ?? au?.signals?.d ?? 0.55;
  const pos = `${Math.round(clamp01(S) * 100)}%`;

  if (tone === "day")
    return `radial-gradient(circle at ${pos} 42%, #e9f2ff, #7fb0ff 55%, #2b2b5f 100%)`;
  if (tone === "night")
    return `radial-gradient(circle at ${pos} 42%, #110a1f, #0b0614 60%, #000000 110%)`;
  // twilight
  return `radial-gradient(circle at ${pos} 42%, #6c2bd9, #2b0b5f 60%, #0a0612 110%)`;
}

function detectLangUI(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|recuerda|olvida)\b/.test(t))
    return "es";
  return "en";
}

export default function Home() {
  const [tab, setTab] = useState("wancko"); // "wancko" | "hwancko"

  // Wancko
  const [wInput, setWInput] = useState("");
  const [wSession, setWSession] = useState(null);
  const [wAu, setWAu] = useState(null);
  const [wCert, setWCert] = useState(null);
  const [wChat, setWChat] = useState([]); // [{role, text, t}]
  const [juramento, setJuramento] = useState(null);

  // H-Wancko
  const [hInput, setHInput] = useState("");
  const [hSession, setHSession] = useState(null);
  const [hAu, setHAu] = useState(null);
  const [hChat, setHChat] = useState([]);
  const [archetype, setArchetype] = useState("estoic");

  const [loading, setLoading] = useState(false);

  /* ---------------- LOAD ---------------- */
  useEffect(() => {
    try {
      const s1 = localStorage.getItem(LS_W_SESSION);
      const c1 = localStorage.getItem(LS_W_CHAT);
      if (s1) {
        const parsed = JSON.parse(s1);
        setWSession(parsed);
        if (parsed?.juramento) setJuramento(parsed.juramento);
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
      if (wSession)
        localStorage.setItem(
          LS_W_SESSION,
          JSON.stringify({ ...wSession, juramento })
        );
      localStorage.setItem(LS_W_CHAT, JSON.stringify(wChat));
    } catch {}
  }, [wSession, wChat, juramento]);

  useEffect(() => {
    try {
      if (hSession) localStorage.setItem(LS_H_SESSION, JSON.stringify(hSession));
      localStorage.setItem(LS_H_CHAT, JSON.stringify(hChat));
    } catch {}
  }, [hSession, hChat]);

  /* ---------------- BACKGROUND ---------------- */
  const bg = useMemo(() => {
    return tab === "wancko" ? wanckoBg(wAu) : hwanckoBg(hAu);
  }, [tab, wAu, hAu]);

  /* ---------------- INDICATORS ---------------- */
  // Wancko
  const w_d = wAu?.signals?.d ?? null;
  const w_W = wAu?.signals?.W ?? 0.5;
  const w_band = wAu?.signals?.band ?? wSession?.cycle?.band ?? 1;
  const w_ok = wAu?.signals?.ok ?? wSession?.cycle?.ok_live ?? 0.5;

  // ✅ H-Wancko C-2
  const h_S = hAu?.S ?? null; // luz
  const h_tone = hAu?.tone || "twilight";
  const h_band = hAu?.band ?? hSession?.cycle?.band ?? 1;
  const h_ok = hAu?.ok ?? hSession?.cycle?.ok_live ?? 0.5;

  /* ---------------- SUBMIT (Wancko) ---------------- */
  async function sendWancko() {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const now = Date.now();
    const userText = wInput;
    setWInput(""); // ✅ limpiar input al enviar

    setWChat((prev) => [...prev, { role: "user", text: userText, t: now }]);

    try {
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

      setWAu(data.au || null);
      setWSession(data.session || null);
      setWCert(data.cert || null);

      const out = data.output === null ? "—" : data.output;
      setWChat((prev) => [...prev, { role: "assistant", text: out, t: Date.now() }]);
    } catch {
      setWChat((prev) => [
        ...prev,
        { role: "assistant", text: "Wancko could not respond.", t: Date.now() }
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- SUBMIT (H-Wancko) ---------------- */
  async function sendHWancko() {
    if (!hInput.trim() || loading) return;
    setLoading(true);

    const now = Date.now();
    const userText = hInput;
    setHInput(""); // ✅ limpiar input al enviar

    setHChat((prev) => [...prev, { role: "user", text: userText, t: now }]);

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

      // ✅ C-2: { output, au, session }
      setHAu(data.au || null);
      setHSession(data.session || null);

      const out = data.output === null ? "—" : data.output;
      setHChat((prev) => [...prev, { role: "assistant", text: out, t: Date.now() }]);
    } catch {
      setHChat((prev) => [
        ...prev,
        { role: "assistant", text: "H-Wancko could not respond.", t: Date.now() }
      ]);
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

  // ✅ Legibilidad H-Wancko (texto claro SIEMPRE)
  const isH = tab === "hwancko";
  const mainTextColor = isH ? "#f2f2f6" : "#eaeaea";
  const subTextOpacity = isH ? 0.82 : 0.65;

  // ✅ Estilo control H-Wancko (más contrastado)
  const hPanelBorder = "1px solid rgba(255,255,255,0.22)";
  const hPanelBg = "rgba(0,0,0,0.25)";
  const hUserBubbleBg = "rgba(255,255,255,0.14)";
  const hAssistantBubbleBg = "rgba(0,0,0,0.30)";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: mainTextColor,
        fontFamily: "system-ui",
        padding: "68px 20px",
        transition: "background 650ms ease"
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, letterSpacing: 0.2 }}>
              {tab === "wancko" ? "Wancko" : "H-Wancko"}
            </h1>
            <p style={{ opacity: subTextOpacity, marginTop: 8 }}>
              {tab === "wancko"
                ? "Natural assistant aligned with AU."
                : "Historical operator. Human voice. Mirror AU."}
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
                color: mainTextColor,
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
                background: tab === "hwancko" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.22)",
                color: mainTextColor,
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
                color: mainTextColor,
                cursor: "pointer"
              }}
              title="Borrar conversación de este modo"
            >
              Reset
            </button>

            {/* ARPI badge visible solo en Wancko */}
            {tab === "wancko" && (
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
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {tab === "wancko" ? (
            <>
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

              <div style={{ opacity: 0.7, fontSize: 13 }}>
                Band: <b>{w_band}</b> · OK: <b>{w_ok.toFixed(2)}</b>
              </div>
            </>
          ) : (
            <>
              <select
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                style={{
                  padding: 10,
                  background: "rgba(0,0,0,0.30)",
                  color: "#f2f2f6",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.22)"
                }}
              >
                <option value="estoic">Estoic</option>
                <option value="mystic">Mystic</option>
                <option value="warrior">Warrior</option>
                <option value="poet">Poet</option>
              </select>

              <div style={{ opacity: 0.85, fontSize: 13 }}>
                Band: <b>{h_band}</b> · OK: <b>{h_ok.toFixed(2)}</b>
              </div>
            </>
          )}
        </div>

        {/* AU strip (si hay au) */}
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

              {wAu.signals?.anti && (
                <div style={{ opacity: 0.6 }}>
                  anti-loop: {antiLabel(wAu.signals.anti)}
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

        {/* ✅ H-Wancko strip (C-2) con legibilidad + barra S */}
        {tab === "hwancko" && hAu && (
          <div style={{ marginTop: 16, opacity: 0.95, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.75 }}>Screen:</span> {hAu.screen || "—"} ·{" "}
              <span style={{ opacity: 0.75 }}>Matrix:</span> {hAu.matrix || "—"} ·{" "}
              <span style={{ opacity: 0.75 }}>N:</span> {hAu.N_level || "—"} ·{" "}
              <span style={{ opacity: 0.75 }}>Luz:</span>{" "}
              {h_tone === "day" ? "día" : h_tone === "night" ? "noche" : "crepúsculo"}
            </div>

            {/* S BAR */}
            <div style={{ marginTop: 10 }}>
              <div style={{ opacity: 0.75, marginBottom: 6 }}>S · Subjetividad ↔ Objetividad</div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.18)",
                  borderRadius: 999,
                  position: "relative"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${clamp01(h_S ?? 0.5) * 100}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transform: "translateX(-50%)",
                    transition: "left 650ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Chat */}
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 16,
            border: isH ? hPanelBorder : "1px solid rgba(255,255,255,0.12)",
            background: isH ? hPanelBg : "rgba(0,0,0,0.25)"
          }}
        >
          {activeChat.length === 0 ? (
            <div style={{ opacity: isH ? 0.82 : 0.6 }}>
              {tab === "wancko"
                ? 'Tip: "Recuerda: animal = la cabra"'
                : "Tip: repite una idea y observa cómo cambia la luz (S) y el tono."}
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
                    border: isH
                      ? "1px solid rgba(255,255,255,0.18)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background:
                      m.role === "user"
                        ? isH
                          ? hUserBubbleBg
                          : "rgba(255,255,255,0.10)"
                        : isH
                        ? hAssistantBubbleBg
                        : "rgba(0,0,0,0.22)",
                    color: mainTextColor,
                    whiteSpace: "pre-wrap"
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
            onChange={(e) =>
              tab === "wancko" ? setWInput(e.target.value) : setHInput(e.target.value)
            }
            placeholder={
              tab === "wancko"
                ? 'Escribe aquí… (ej: "Recuerda: ciudad = Barcelona")'
                : "Escribe aquí…"
            }
            rows={4}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              background: isH ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.35)",
              color: mainTextColor,
              border: isH ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12
            }}
            disabled={loading}
          />

          <button
            onClick={tab === "wancko" ? sendWancko : sendHWancko}
            disabled={loading}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              fontSize: 16,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.22)",
              background: isH ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
              color: mainTextColor,
              cursor: "pointer"
            }}
          >
            {loading ? "…" : "Send"}
          </button>

          {/* Meta */}
          <div
            style={{
              marginTop: 10,
              opacity: isH ? 0.85 : 0.5,
              fontSize: 12,
              color: mainTextColor
            }}
          >
            {tab === "wancko" ? (
              <>
                Turns: {wSession?.turns ?? 0} · Chain: {wSession?.chain?.length ?? 0} ·
                Silences: {wSession?.silenceCount ?? 0}
              </>
            ) : (
              <>
                Turns: {hSession?.turns ?? 0} · Chain: {hSession?.chain?.length ?? 0}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
