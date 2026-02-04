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
  const a = anti?.action || anti; // soporta anti antiguo
  if (!a || a === "none") return null;
  if (a === "pause") return "pausa";
  if (a === "break") return "romper bucle";
  if (a === "ground") return "aterrizar";
  if (a === "invert") return "invertir";
  if (a === "shorten") return "acortar";
  return a;
}

function certText(cert) {
  const lvl = cert?.level || "seed";
  if (lvl === "ok") return "ARPI · OK";
  if (lvl === "unstable") return "ARPI · Inestable";
  if (lvl === "blocked") return "ARPI · Bloqueado";
  return "ARPI · Semilla";
}

function detectLangUI(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què|m'ho)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|recuerda|olvida|hoy|voy)\b/.test(t)) return "es";
  return "en";
}

function wanckoBg(au, fallbackD = 0.45) {
  const tone = au?.signals?.tone || "amber";
  const d = au?.signals?.d ?? fallbackD;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  if (tone === "green") return `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  if (tone === "red") return `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  return `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;
}

function hwanckoBg(au, fallbackD = 0.55) {
  // día → violeta → noche (d = luz)
  const tone = au?.signals?.tone || "violet";
  const d = au?.signals?.d ?? fallbackD;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  if (tone === "day") return `radial-gradient(circle at ${pos} 42%, #e9f2ff, #7fb0ff 55%, #2b2b5f 100%)`;
  if (tone === "night") return `radial-gradient(circle at ${pos} 42%, #110a1f, #0b0614 60%, #000000 110%)`;
  return `radial-gradient(circle at ${pos} 42%, #6c2bd9, #2b0b5f 60%, #0a0612 110%)`;
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

  /* ---------------- BACKGROUND ---------------- */
  const bg = useMemo(() => {
    const wFallback = wSession?.cycle?.ok_live != null ? 0.45 : 0.45;
    const hFallback = hSession?.cycle?.ok_live != null ? 0.55 : 0.55;
    return tab === "wancko" ? wanckoBg(wAu, wFallback) : hwanckoBg(hAu, hFallback);
  }, [tab, wAu, hAu, wSession, hSession]);

  /* ---------------- INDICATORS (Wancko) ---------------- */
  const w_d = wAu?.signals?.d ?? (wSession?.last?.signals?.d ?? null);
  const w_W = wAu?.signals?.W ?? (wSession?.last?.signals?.W ?? 0.5);
  const w_band = wAu?.signals?.band ?? wSession?.cycle?.band ?? 1;
  const w_ok = wAu?.signals?.ok ?? wSession?.cycle?.ok_live ?? 0.5;

  /* ---------------- INDICATORS (H-Wancko) ---------------- */
  const h_d = hAu?.signals?.d ?? (hSession?.last?.signals?.d ?? null);
  const h_ok = hAu?.signals?.ok ?? hSession?.cycle?.ok_live ?? 0.55;
  const h_bar = hAu?.signals?.bar ?? 0.5;
  const h_band = hSession?.cycle?.band ?? 1;

  const hTone = hAu?.signals?.tone || "violet";
  const hText = hTone === "night" ? "#eae7ff" : "#0c1020"; // ✅ legible

  /* ---------------- SUBMIT (Wancko) ---------------- */
  async function sendWancko() {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const userText = wInput;
    setWInput(""); // ✅ limpiar input al enviar
    setWChat((prev) => [...prev, { role: "user", text: userText, t: Date.now() }]);

    try {
      const lang = detectLangUI(userText);

      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang },
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: tab === "hwancko" ? hText : "#eaeaea",
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
            <p style={{ opacity: tab === "hwancko" ? 0.78 : 0.65, marginTop: 8 }}>
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
                color: tab === "hwancko" ? hText : "#eaeaea",
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
                color: tab === "hwancko" ? hText : "#eaeaea",
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
                color: tab === "hwancko" ? hText : "#eaeaea",
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
                  background: "rgba(255,255,255,0.22)",
                  color: hText,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.35)"
                }}
              >
                <option value="estoic">Estoic</option>
                <option value="mystic">Mystic</option>
                <option value="warrior">Warrior</option>
                <option value="poet">Poet</option>
              </select>

              <div style={{ opacity: 0.85, fontSize: 13, color: hText }}>
                Band: <b>{h_band}</b> · OK: <b>{h_ok.toFixed(2)}</b>
              </div>
            </>
          )}
        </div>

        {/* AU strip (Wancko) */}
        {tab === "wancko" && (wAu || wSession?.last) && (
          <div style={{ marginTop: 16, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span> {(wAu || wSession?.last)?.mode || "—"} ·{" "}
              <span style={{ opacity: 0.6 }}>Screen:</span> {(wAu || wSession?.last)?.screen || "—"} ·{" "}
              <span style={{ opacity: 0.6 }}>Matrix:</span> {(wAu || wSession?.last)?.matrix || "—"} ·{" "}
              <span style={{ opacity: 0.6 }}>N:</span> {(wAu || wSession?.last)?.N_level || "—"}
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
                {(wAu?.signals?.sense || wSession?.last?.signals?.sense) === "inverse" ? "lectura inversa" : "lectura directa"}
              </div>

              {antiLabel(wAu?.anti || wAu?.signals?.anti || wSession?.last?.anti || wSession?.last?.signals?.anti) && (
                <div style={{ opacity: 0.6 }}>
                  anti-loop: {antiLabel(wAu?.anti || wAu?.signals?.anti || wSession?.last?.anti || wSession?.last?.signals?.anti)}
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

        {/* AU strip (H-Wancko) */}
        {tab === "hwancko" && (hAu || hSession?.last) && (
          <div style={{ marginTop: 16, opacity: 0.92, fontSize: 13, color: hText }}>
            <div>
              <span style={{ opacity: 0.75 }}>Screen:</span> {(hAu || hSession?.last)?.screen || "—"} ·{" "}
              <span style={{ opacity: 0.75 }}>Matrix:</span> {(hAu || hSession?.last)?.matrix || "—"} ·{" "}
              <span style={{ opacity: 0.75 }}>N:</span> {(hAu || hSession?.last)?.N_level || "—"}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ opacity: 0.75 }}>Luz:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.22)"
                }}
              >
                {h_d != null ? `d=${h_d.toFixed(2)}` : "—"}
              </div>
              <div style={{ opacity: 0.8 }}>
                {hTone === "day" ? "día" : hTone === "night" ? "noche" : "crepúsculo"}
              </div>
            </div>

            {/* Light BAR */}
            <div style={{ marginTop: 10 }}>
              <div style={{ opacity: 0.75, marginBottom: 6 }}>L · Night ↔ Day</div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.28)",
                  borderRadius: 999,
                  position: "relative"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${clamp01(h_bar) * 100}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: hText,
                    transform: "translateX(-50%)",
                    transition: "left 500ms ease"
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
            border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.12)",
            background: tab === "hwancko" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.25)"
          }}
        >
          {activeChat.length === 0 ? (
            <div style={{ opacity: tab === "hwancko" ? 0.85 : 0.6, color: tab === "hwancko" ? hText : "#eaeaea" }}>
              {tab === "wancko"
                ? 'Tip: di algo normal (ej: "Hoy voy a ir a la playa") y luego pregúntame "¿dónde dije que iba?"'
                : "Tip: pregunta “¿quién eres?” y repite el tema: verás que no responde como plantilla."}
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
                        ? "1px solid rgba(255,255,255,0.35)"
                        : "1px solid rgba(255,255,255,0.14)",
                    background:
                      m.role === "user"
                        ? tab === "hwancko"
                          ? "rgba(255,255,255,0.35)"
                          : "rgba(255,255,255,0.10)"
                        : tab === "hwancko"
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(0,0,0,0.22)",
                    color: tab === "hwancko" ? hText : "#eaeaea",
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
            onChange={(e) => (tab === "wancko" ? setWInput(e.target.value) : setHInput(e.target.value))}
            placeholder={tab === "wancko" ? 'Escribe aquí… (ej: "Hoy voy a ir a la playa")' : "Escribe aquí…"}
            rows={4}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              background: tab === "hwancko" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              color: tab === "hwancko" ? hText : "#eaeaea",
              border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.14)",
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
              border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.18)",
              background: tab === "hwancko" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)",
              color: tab === "hwancko" ? hText : "#eaeaea",
              cursor: "pointer"
            }}
          >
            {loading ? "…" : "Send"}
          </button>

          {/* Meta */}
          <div
            style={{
              marginTop: 10,
              opacity: tab === "hwancko" ? 0.88 : 0.5,
              fontSize: 12,
              color: tab === "hwancko" ? hText : "#eaeaea"
            }}
          >
            {tab === "wancko" ? (
              <>
                Turns: {wSession?.turns ?? 0} · Chain: {wSession?.chain?.length ?? 0} · Silences: {wSession?.silenceCount ?? 0}
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
