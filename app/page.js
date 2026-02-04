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

  if (tone === "green") return `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  if (tone === "red") return `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  return `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;
}

function hwanckoBg(au) {
  // día → violeta → noche (d = luz)
  const tone = au?.signals?.tone || "violet";
  const d = au?.signals?.d ?? 0.55;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  if (tone === "day") return `radial-gradient(circle at ${pos} 42%, #f4fbff, #b8d7ff 55%, #3a3a7a 110%)`;
  if (tone === "night") return `radial-gradient(circle at ${pos} 42%, #0b0614, #06030d 60%, #000000 120%)`;
  return `radial-gradient(circle at ${pos} 42%, #7a38ff, #2b0b5f 60%, #07050f 120%)`;
}

function detectLangUI(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|recuerda|olvida)\b/.test(t)) return "es";
  return "en";
}

// Render “memoria activa” SIN mostrar valores sensibles por defecto.
// Mostramos tipos y las claves más probables (y si quieres, luego añadimos toggle para revelar).
function extractMemorySummary(session) {
  const csa = session?.csa;
  if (!csa || typeof csa !== "object") return { items: [], total: 0 };

  const items = [];
  const entities = csa.entities || {};
  const facts = csa.facts || {};

  // entities: show top 1–2 per type (only label + weight/ttl)
  for (const [type, bucket] of Object.entries(entities)) {
    const arr = Object.entries(bucket || {}).map(([value, meta]) => ({
      type,
      value,
      w: meta?.weight ?? 0,
      ttl: meta?.ttl ?? 0,
      last: meta?.lastTurn ?? 0
    }));
    arr.sort((a, b) => (b.w + b.ttl * 0.02) - (a.w + a.ttl * 0.02));
    arr.slice(0, 2).forEach((x) => items.push(x));
  }

  // facts: show keys only
  for (const [k, v] of Object.entries(facts)) {
    items.push({ type: "fact", value: k, w: v?.weight ?? 0, ttl: v?.ttl ?? 0, last: v?.lastTurn ?? 0 });
  }

  items.sort((a, b) => (b.w + b.ttl * 0.02) - (a.w + a.ttl * 0.02));
  const top = items.slice(0, 6);

  return { items: top, total: items.length };
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
    return tab === "wancko" ? wanckoBg(wAu) : hwanckoBg(hAu);
  }, [tab, wAu, hAu]);

  /* ---------------- INDICATORS ---------------- */
  const w_d = wAu?.signals?.d ?? null;
  const w_W = wAu?.signals?.W ?? 0.5;
  const w_band = wSession?.cycle?.band ?? 2;
  const w_ok = wSession?.cycle?.ok_live ?? 0.5;

  const h_d = hAu?.signals?.d ?? null;
  const h_band = hSession?.cycle?.band ?? 2;
  const h_ok = hSession?.cycle?.ok_live ?? 0.5;

  // H foreground: depends on tone (night needs light text)
  const hTone = hAu?.signals?.tone || "violet";
  const hFg = hTone === "night" ? "#eaeaea" : "#0c1020";
  const hSubFg = hTone === "night" ? "rgba(255,255,255,0.78)" : "rgba(12,16,32,0.78)";

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
        headers: { "Content-Type": "application/json", "Accept-Language": detectLangUI(userText) },
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

  const wMem = useMemo(() => extractMemorySummary(wSession), [wSession]);
  const hMem = useMemo(() => extractMemorySummary(hSession), [hSession]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: tab === "hwancko" ? hFg : "#eaeaea",
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
            <p style={{ opacity: tab === "hwancko" ? 0.82 : 0.65, marginTop: 8, color: tab === "hwancko" ? hSubFg : "rgba(234,234,234,0.65)" }}>
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
                color: tab === "hwancko" ? hFg : "#eaeaea",
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
                color: tab === "hwancko" ? hFg : "#eaeaea",
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
                color: tab === "hwancko" ? hFg : "#eaeaea",
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
                  background: hTone === "night" ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.22)",
                  color: hFg,
                  borderRadius: 10,
                  border: hTone === "night" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.35)"
                }}
              >
                <option value="estoic">Estoic</option>
                <option value="mystic">Mystic</option>
                <option value="warrior">Warrior</option>
                <option value="poet">Poet</option>
              </select>

              <div style={{ opacity: 0.85, fontSize: 13, color: hSubFg }}>
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

            {/* Memory active */}
            <div style={{ marginTop: 12, opacity: 0.85 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>
                Memoria activa · {wMem.total}
              </div>
              {wMem.items.length === 0 ? (
                <div style={{ opacity: 0.6 }}>—</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {wMem.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.22)",
                        fontSize: 12
                      }}
                      title={`ttl=${it.ttl} · w=${(it.w ?? 0).toFixed(2)}`}
                    >
                      {it.type}:{String(it.value).slice(0, 22)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "hwancko" && hAu && (
          <div style={{ marginTop: 16, opacity: 0.92, fontSize: 13, color: hFg }}>
            <div>
              <span style={{ opacity: 0.75 }}>Screen:</span> {hAu.screen} ·{" "}
              <span style={{ opacity: 0.75 }}>Matrix:</span> {hAu.matrix} ·{" "}
              <span style={{ opacity: 0.75 }}>N:</span> {hAu.N_level}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ opacity: 0.75 }}>Luz:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: hTone === "night" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.35)",
                  background: hTone === "night" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.22)"
                }}
              >
                {h_d != null ? `d=${h_d.toFixed(2)}` : "—"}
              </div>
              <div style={{ opacity: 0.8 }}>
                {hTone === "day" ? "día" : hTone === "night" ? "noche" : "crepúsculo"}
              </div>
            </div>

            {/* Memory active */}
            <div style={{ marginTop: 12, opacity: 0.9 }}>
              <div style={{ opacity: 0.8, marginBottom: 6 }}>
                Memoria activa · {hMem.total}
              </div>
              {hMem.items.length === 0 ? (
                <div style={{ opacity: 0.75 }}>—</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {hMem.items.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: hTone === "night" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.35)",
                        background: hTone === "night" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.22)",
                        fontSize: 12
                      }}
                      title={`ttl=${it.ttl} · w=${(it.w ?? 0).toFixed(2)}`}
                    >
                      {it.type}:{String(it.value).slice(0, 22)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat */}
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 16,
            border: tab === "hwancko" ? (hTone === "night" ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.35)") : "1px solid rgba(255,255,255,0.12)",
            background: tab === "hwancko"
              ? (hTone === "night" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)")
              : "rgba(0,0,0,0.25)"
          }}
        >
          {activeChat.length === 0 ? (
            <div style={{ opacity: tab === "hwancko" ? 0.82 : 0.6, color: tab === "hwancko" ? hSubFg : undefined }}>
              {tab === "wancko"
                ? 'Tip: di algo natural ("Hoy voy a ir a la playa") y luego pregúntame dónde vas.'
                : "Tip: pregunta lo mismo varias veces y mira cómo cambia la luz."}
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
                        ? (hTone === "night" ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.35)")
                        : "1px solid rgba(255,255,255,0.14)",
                    background:
                      m.role === "user"
                        ? tab === "hwancko"
                          ? (hTone === "night" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.35)")
                          : "rgba(255,255,255,0.10)"
                        : tab === "hwancko"
                        ? (hTone === "night" ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.18)")
                        : "rgba(0,0,0,0.22)",
                    color: tab === "hwancko" ? hFg : "#eaeaea",
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
              background: tab === "hwancko"
                ? (hTone === "night" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)")
                : "rgba(0,0,0,0.35)",
              color: tab === "hwancko" ? hFg : "#eaeaea",
              border: tab === "hwancko"
                ? (hTone === "night" ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.45)")
                : "1px solid rgba(255,255,255,0.14)",
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
              border: tab === "hwancko"
                ? (hTone === "night" ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.55)")
                : "1px solid rgba(255,255,255,0.18)",
              background: tab === "hwancko"
                ? (hTone === "night" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)")
                : "rgba(255,255,255,0.08)",
              color: tab === "hwancko" ? hFg : "#eaeaea",
              cursor: "pointer"
            }}
          >
            {loading ? "…" : "Send"}
          </button>

          {/* Meta */}
          <div style={{ marginTop: 10, opacity: tab === "hwancko" ? 0.88 : 0.5, fontSize: 12, color: tab === "hwancko" ? hSubFg : "#eaeaea" }}>
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
