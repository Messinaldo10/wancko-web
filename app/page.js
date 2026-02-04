"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Sesiones separadas
 */
const LS_W_SESSION = "wancko_session_v2";
const LS_W_CHAT = "wancko_chat_v2";
const LS_H_SESSION = "hwancko_session_v2";
const LS_H_CHAT = "hwancko_chat_v2";

/* ---------------- utils ---------------- */

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function labelGradiente(d) {
  if (d == null) return "—";
  if (d < 0.3) return "Continuidad";
  if (d < 0.6) return "Crepúsculo";
  return "Ruptura";
}

function certText(cert) {
  const lvl = cert?.level || "seed";
  if (lvl === "ok") return "ARPI · OK";
  if (lvl === "unstable") return "ARPI · Inestable";
  if (lvl === "blocked") return "ARPI · Bloqueado";
  return "ARPI · Semilla";
}

/* ---------------- backgrounds ---------------- */

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
  // usa au.tone y au.S (C-2)
  const tone = au?.tone || "twilight";
  const S = au?.S ?? 0.5;
  const pos = `${Math.round(clamp01(S) * 100)}%`;

  if (tone === "day") {
    return `radial-gradient(circle at ${pos} 42%, #ffffff, #dbe6ff 55%, #8fb0ff 100%)`;
  }
  if (tone === "night") {
    return `radial-gradient(circle at ${pos} 42%, #1a102a, #0b0614 60%, #000000 110%)`;
  }
  // twilight
  return `radial-gradient(circle at ${pos} 42%, #7a5cff, #3b1a6e 60%, #0a0612 110%)`;
}

/* ---------------- language detect (UI) ---------------- */

function detectLangUI(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|recuerda)\b/.test(t)) return "es";
  return "en";
}

/* ===================================================== */

export default function Home() {
  const [tab, setTab] = useState("wancko"); // wancko | hwancko
  const [loading, setLoading] = useState(false);

  /* -------- Wancko -------- */
  const [wInput, setWInput] = useState("");
  const [wChat, setWChat] = useState([]);
  const [wSession, setWSession] = useState(null);
  const [wAu, setWAu] = useState(null);
  const [wCert, setWCert] = useState(null);
  const [juramento, setJuramento] = useState(null);

  /* -------- H-Wancko -------- */
  const [hInput, setHInput] = useState("");
  const [hChat, setHChat] = useState([]);
  const [hSession, setHSession] = useState(null);
  const [hAu, setHAu] = useState(null);
  const [archetype, setArchetype] = useState("estoic");

  /* ---------------- load ---------------- */
  useEffect(() => {
    try {
      const ws = localStorage.getItem(LS_W_SESSION);
      const wc = localStorage.getItem(LS_W_CHAT);
      if (ws) {
        const parsed = JSON.parse(ws);
        setWSession(parsed);
        if (parsed?.juramento) setJuramento(parsed.juramento);
      }
      if (wc) setWChat(JSON.parse(wc));

      const hs = localStorage.getItem(LS_H_SESSION);
      const hc = localStorage.getItem(LS_H_CHAT);
      if (hs) setHSession(JSON.parse(hs));
      if (hc) setHChat(JSON.parse(hc));
    } catch {}
  }, []);

  /* ---------------- save ---------------- */
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

  /* ---------------- background ---------------- */
  const bg = useMemo(() => {
    return tab === "wancko" ? wanckoBg(wAu) : hwanckoBg(hAu);
  }, [tab, wAu, hAu]);

  /* ---------------- submit Wancko ---------------- */
  async function sendWancko() {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const text = wInput;
    setWInput("");
    setWChat((c) => [...c, { role: "user", text }]);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: text,
          juramento,
          session: wSession
        })
      });

      const data = await res.json();
      setWAu(data.au || null);
      setWSession(data.session || null);
      setWCert(data.cert || null);

      setWChat((c) => [...c, { role: "assistant", text: data.output || "—" }]);
    } catch {
      setWChat((c) => [...c, { role: "assistant", text: "Wancko error." }]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- submit H-Wancko ---------------- */
  async function sendHWancko() {
    if (!hInput.trim() || loading) return;
    setLoading(true);

    const text = hInput;
    setHInput("");
    setHChat((c) => [...c, { role: "user", text }]);

    try {
      const lang = detectLangUI(text);
      const res = await fetch("/api/h-wancko", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": lang
        },
        body: JSON.stringify({
          input: text,
          archetype,
          session: hSession
        })
      });

      const data = await res.json();
      setHAu(data.au || null);
      setHSession(data.session || null);

      setHChat((c) => [...c, { role: "assistant", text: data.output || "—" }]);
    } catch {
      setHChat((c) => [...c, { role: "assistant", text: "H-Wancko error." }]);
    } finally {
      setLoading(false);
    }
  }

  const activeChat = tab === "wancko" ? wChat : hChat;

  /* ---------------- UI ---------------- */
  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: tab === "hwancko" ? "#f2f2f6" : "#eaeaea",
        fontFamily: "system-ui",
        padding: "64px 20px",
        transition: "background 700ms ease"
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>
              {tab === "wancko" ? "Wancko" : "H-Wancko"}
            </h1>
            <p style={{ opacity: 0.7, marginTop: 6 }}>
              {tab === "wancko"
                ? "Operador AU · Objetividad alineada"
                : "Operador histórico · Subjetividad viva"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setTab("wancko")}>Wancko</button>
            <button onClick={() => setTab("hwancko")}>H-Wancko</button>
            {tab === "wancko" && <div>{certText(wCert)}</div>}
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14 }}>
          {tab === "wancko" ? (
            <select value={juramento || ""} onChange={(e) => setJuramento(e.target.value || null)}>
              <option value="">No juramento</option>
              <option value="disciplina">Disciplina</option>
              <option value="ansiedad">Ansiedad</option>
              <option value="límites">Límites</option>
              <option value="excesos">Excesos</option>
              <option value="soltar">Soltar</option>
            </select>
          ) : (
            <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              <option value="estoic">Estoic</option>
              <option value="mystic">Mystic</option>
              <option value="warrior">Warrior</option>
              <option value="poet">Poet</option>
            </select>
          )}
        </div>

        {/* Indicators */}
        {tab === "hwancko" && hAu && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <div>
              Matrix: <b>{hAu.matrix}</b> · Luz:{" "}
              <b>{hAu.tone === "day" ? "día" : hAu.tone === "night" ? "noche" : "crepúsculo"}</b>
            </div>
            <div style={{ marginTop: 6 }}>
              S · Subjetividad
              <div style={{ height: 10, background: "rgba(255,255,255,0.25)", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${clamp01(hAu.S) * 100}%`,
                    height: "100%",
                    background: "#fff",
                    borderRadius: 999,
                    transition: "width 600ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Chat */}
        <div style={{ marginTop: 18 }}>
          {activeChat.map((m, i) => (
            <div
              key={i}
              style={{
                marginBottom: 8,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                padding: "10px 12px",
                borderRadius: 14,
                background:
                  m.role === "user"
                    ? tab === "hwancko"
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(255,255,255,0.12)"
                    : tab === "hwancko"
                    ? "rgba(0,0,0,0.35)"
                    : "rgba(0,0,0,0.25)",
                color: tab === "hwancko" ? "#f2f2f6" : "#eaeaea",
                maxWidth: "85%"
              }}
            >
              {m.text}
            </div>
          ))}
        </div>

        {/* Composer */}
        <textarea
          value={tab === "wancko" ? wInput : hInput}
          onChange={(e) => (tab === "wancko" ? setWInput(e.target.value) : setHInput(e.target.value))}
          rows={4}
          placeholder="Escribe aquí…"
          style={{ width: "100%", marginTop: 12 }}
          disabled={loading}
        />

        <button onClick={tab === "wancko" ? sendWancko : sendHWancko} disabled={loading}>
          {loading ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}
