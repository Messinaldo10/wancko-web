// app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Lang = "es" | "ca" | "en";

type AU = {
  mode: "wancko" | "hwancko";
  screen: "natural";
  matrix: "AU";
  N_level: number;
  anti?: "silence" | "break";
  signals: {
    d: number;
    W: number;
    ok: number;
    band: number;
    tone: "green" | "amber" | "red" | "day" | "violet" | "night";
    complexity: number;
    beauty: number;
    dominance: number;
    diversity: number;
    stability: number;
  };
};

type SessionBase = {
  id: string;
  turns: number;
  lang: Lang;
  chain: string[];
};

type WanckoSession = SessionBase & {
  silenceCount: number;
  memory: unknown;
};

type HWanckoSession = SessionBase & {
  memory: unknown;
  archetype?: "estoic" | "mystic" | "warrior" | "poet";
};

type ChatMsg = { role: "user" | "assistant"; text: string; t: number };

const LS_W_SESSION = "wancko_session_v2";
const LS_W_CHAT = "wancko_chat_v2";
const LS_H_SESSION = "hwancko_session_v2";
const LS_H_CHAT = "hwancko_chat_v2";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function labelGradiente(d: number | null | undefined): string {
  if (d == null) return "—";
  if (d < 0.33) return "Continuidad";
  if (d < 0.66) return "Crepúsculo";
  return "Ruptura";
}

function antiLabel(anti: string | null | undefined): string | null {
  if (!anti) return null;
  if (anti === "silence") return "pausa";
  if (anti === "break") return "romper bucle";
  return anti;
}

function small(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return Number(x).toFixed(2);
}

function detectLangUI(text: string): Lang {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|por qué|recuerda|olvida)\b/.test(t)) return "es";
  return "en";
}

/** ---------- Fondo Wancko (derivado de señales AU) ---------- */
function wanckoBg(au: AU | null, session: WanckoSession | null): string {
  const tone = au?.signals?.tone || "amber";
  const d = au?.signals?.d ?? 0.45;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  const complexity = au?.signals?.complexity ?? clamp01(Math.log2(2 + (session?.turns ?? 0)) / 8);
  const beauty = au?.signals?.beauty ?? 0.5;

  let base: string;
  if (tone === "green") base = `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  else if (tone === "red") base = `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  else base = `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;

  const c = clamp01(complexity);
  const lineA = 6 + Math.round(c * 14);
  const alphaA = 0.05 + c * 0.10;
  const grain = `repeating-linear-gradient(
    135deg,
    rgba(255,255,255,${alphaA}) 0px,
    rgba(255,255,255,${alphaA}) 1px,
    rgba(0,0,0,0) ${lineA}px,
    rgba(0,0,0,0) ${lineA + 6}px
  )`;

  const b = clamp01(beauty);
  const glowAlpha = 0.06 + b * 0.10;
  const glow = `radial-gradient(circle at 55% 30%, rgba(255,255,255,${glowAlpha}), rgba(0,0,0,0) 55%)`;

  return `${glow}, ${grain}, ${base}`;
}

/** ---------- Fondo H-Wancko (derivado de señales AU) ---------- */
function hwanckoBg(au: AU | null, session: HWanckoSession | null): string {
  const tone = au?.signals?.tone || "violet";
  const d = au?.signals?.d ?? 0.55;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  const complexity = au?.signals?.complexity ?? clamp01(Math.log2(2 + (session?.turns ?? 0)) / 8);
  const beauty = au?.signals?.beauty ?? 0.5;

  let base: string;
  if (tone === "day") {
    base = `radial-gradient(circle at ${pos} 42%, #f6fbff, #b8d6ff 55%, #4b56a6 110%)`;
  } else if (tone === "night") {
    base = `radial-gradient(circle at ${pos} 42%, #140b27, #07040f 65%, #000000 120%)`;
  } else {
    base = `radial-gradient(circle at ${pos} 42%, #7d3cff, #2a0b52 65%, #070410 120%)`;
  }

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

  const b = clamp01(beauty);
  const glowAlpha = 0.08 + b * 0.10;
  const glow = `radial-gradient(circle at 40% 22%, rgba(255,255,255,${glowAlpha}), rgba(0,0,0,0) 55%)`;

  return `${glow}, ${grain}, ${base}`;
}

export default function Home() {
  const [tab, setTab] = useState<"wancko" | "hwancko">("wancko");

  const [wInput, setWInput] = useState<string>("");
  const [wSession, setWSession] = useState<WanckoSession | null>(null);
  const [wAu, setWAu] = useState<AU | null>(null);
  const [wChat, setWChat] = useState<ChatMsg[]>([]);

  const [hInput, setHInput] = useState<string>("");
  const [hSession, setHSession] = useState<HWanckoSession | null>(null);
  const [hAu, setHAu] = useState<AU | null>(null);
  const [hChat, setHChat] = useState<ChatMsg[]>([]);
  const [archetype, setArchetype] = useState<"estoic" | "mystic" | "warrior" | "poet">("estoic");

  const [loading, setLoading] = useState<boolean>(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  /* LOAD */
  useEffect(() => {
    try {
      const s1 = localStorage.getItem(LS_W_SESSION);
      const c1 = localStorage.getItem(LS_W_CHAT);
      if (s1) setWSession(JSON.parse(s1));
      if (c1) setWChat(JSON.parse(c1));

      const s2 = localStorage.getItem(LS_H_SESSION);
      const c2 = localStorage.getItem(LS_H_CHAT);
      if (s2) setHSession(JSON.parse(s2));
      if (c2) setHChat(JSON.parse(c2));
    } catch {}
  }, []);

  /* SAVE */
  useEffect(() => {
    try {
      if (wSession) localStorage.setItem(LS_W_SESSION, JSON.stringify(wSession));
      localStorage.setItem(LS_W_CHAT, JSON.stringify(wChat));
    } catch {}
  }, [wSession, wChat]);

  useEffect(() => {
    try {
      if (hSession) localStorage.setItem(LS_H_SESSION, JSON.stringify(hSession));
      localStorage.setItem(LS_H_CHAT, JSON.stringify(hChat));
    } catch {}
  }, [hSession, hChat]);

  /* AUTOSCROLL */
  useEffect(() => {
    try {
      if (!chatRef.current) return;
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    } catch {}
  }, [tab, wChat, hChat]);

  const bg = useMemo(() => {
    return tab === "wancko" ? wanckoBg(wAu, wSession) : hwanckoBg(hAu, hSession);
  }, [tab, wAu, hAu, wSession, hSession]);

  const activeChat = tab === "wancko" ? wChat : hChat;

  async function sendWancko() {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const userText = wInput;
    setWInput("");
    setWChat((prev) => [...prev, { role: "user", text: userText, t: Date.now() }]);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": detectLangUI(userText) },
        body: JSON.stringify({ input: userText, session: wSession }),
      });
      const data = await res.json();
      setWAu(data.au || null);
      setWSession(data.session || null);

      const out = data.output ?? "—";
      setWChat((prev) => [...prev, { role: "assistant", text: String(out), t: Date.now() }]);
    } catch {
      setWChat((prev) => [...prev, { role: "assistant", text: "Wancko could not respond.", t: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendHWancko() {
    if (!hInput.trim() || loading) return;
    setLoading(true);

    const userText = hInput;
    setHInput("");
    setHChat((prev) => [...prev, { role: "user", text: userText, t: Date.now() }]);

    try {
      const lang = detectLangUI(userText);
      const res = await fetch("/api/h-wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang },
        body: JSON.stringify({ input: userText, archetype, session: hSession }),
      });
      const data = await res.json();
      setHAu(data.au || null);
      setHSession(data.session || null);

      const out = data.output ?? "—";
      setHChat((prev) => [...prev, { role: "assistant", text: String(out), t: Date.now() }]);
    } catch {
      setHChat((prev) => [...prev, { role: "assistant", text: "H-Wancko could not respond.", t: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  function clearActive() {
    if (tab === "wancko") {
      setWChat([]);
      setWSession(null);
      setWAu(null);
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

  const auNow = tab === "wancko" ? wAu : hAu;
  const dNow = auNow?.signals?.d ?? null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: fg,
        fontFamily: "system-ui",
        padding: "68px 20px",
        transition: "background 650ms ease",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, letterSpacing: 0.2 }}>{tab === "wancko" ? "Wancko" : "H-Wancko"}</h1>
            <p style={{ opacity: isHW ? 0.8 : 0.65, marginTop: 8, maxWidth: 540 }}>
              {tab === "wancko"
                ? "Operador AU (objetividad AU). Señales derivadas de memoria + interacción (sin hardcode)."
                : "Operador espejo (subjetividad AU). Luz día/violeta/noche derivada del motor."}
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
                cursor: "pointer",
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
                cursor: "pointer",
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
                cursor: "pointer",
              }}
              title="Borrar conversación de este modo"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {tab === "hwancko" ? (
            <>
              <select
                value={archetype}
                onChange={(e) => setArchetype(e.target.value as any)}
                style={{
                  padding: 10,
                  background: "rgba(255,255,255,0.28)",
                  color: "#0c1020",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.38)",
                }}
              >
                <option value="estoic">Estoic</option>
                <option value="mystic">Mystic</option>
                <option value="warrior">Warrior</option>
                <option value="poet">Poet</option>
              </select>

              <div style={{ opacity: 0.9, fontSize: 13, color: "#0c1020" }}>
                Band: <b>{hAu?.signals?.band ?? 1}</b> · OK: <b>{small(hAu?.signals?.ok)}</b> · Complejidad:{" "}
                <b>{small(hAu?.signals?.complexity)}</b> · Belleza: <b>{small(hAu?.signals?.beauty)}</b>
                {hAu?.anti ? <> · anti: <b>{antiLabel(hAu.anti)}</b></> : null}
              </div>
            </>
          ) : (
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              Band: <b>{wAu?.signals?.band ?? 1}</b> · OK: <b>{small(wAu?.signals?.ok)}</b> · Complejidad:{" "}
              <b>{small(wAu?.signals?.complexity)}</b> · Belleza: <b>{small(wAu?.signals?.beauty)}</b>
              {wAu?.anti ? <> · anti: <b>{antiLabel(wAu.anti)}</b></> : null}
            </div>
          )}
        </div>

        {/* AU strip */}
        <div style={{ marginTop: 16, opacity: isHW ? 0.95 : 0.9, fontSize: 13, color: isHW ? "#0c1020" : "#eaeaea" }}>
          <div>
            <span style={{ opacity: isHW ? 0.7 : 0.6 }}>Mode:</span> {auNow?.mode ?? "—"} ·{" "}
            <span style={{ opacity: isHW ? 0.7 : 0.6 }}>Matrix:</span> {auNow?.matrix ?? "—"} ·{" "}
            <span style={{ opacity: isHW ? 0.7 : 0.6 }}>N:</span> {auNow?.N_level ?? 0}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ opacity: isHW ? 0.75 : 0.6 }}>Gradiente AU:</div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: isHW ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
                background: isHW ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)",
              }}
            >
              {labelGradiente(dNow)}{dNow != null ? ` · d=${dNow.toFixed(2)}` : ""}
            </div>
          </div>

          {/* W BAR */}
          {tab === "wancko" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>W · Reason ↔ Truth</div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 999,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${clamp01(wAu?.signals?.W ?? 0.5) * 100}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transform: "translateX(-50%)",
                    transition: "left 500ms ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>

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
            overflowY: "auto",
          }}
        >
          {activeChat.length === 0 ? (
            <div style={{ opacity: tab === "hwancko" ? 0.85 : 0.6 }}>
              {tab === "wancko"
                ? 'Tip: di “Avui aniré a la platja” y luego cambia el tema para ver diversidad.'
                : 'Tip: pregunta por identidad/memoria para ver “night”.'}
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
                    lineHeight: 1.35,
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
            placeholder={tab === "wancko" ? "Escribe aquí… (ej: Avui aniré a la platja)" : "Escribe aquí…"}
            rows={4}
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              background: tab === "hwancko" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)",
              color: tab === "hwancko" ? "#0c1020" : "#eaeaea",
              border: tab === "hwancko" ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              outline: "none",
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
                cursor: "pointer",
              }}
            >
              {loading ? "…" : "Send"}
            </button>

            <div style={{ marginTop: 12, opacity: tab === "hwancko" ? 0.9 : 0.6, fontSize: 12, color: fg }}>
              {tab === "wancko" ? (
                <>
                  Turns: {wSession?.turns ?? 0} · Chain: {wSession?.chain?.length ?? 0} · Silences:{" "}
                  {wSession?.silenceCount ?? 0} · Lang: <b>{wSession?.lang ?? "—"}</b>{" "}
                  <span style={{ opacity: 0.75 }}>· Ctrl/⌘+Enter</span>
                </>
              ) : (
                <>
                  Turns: {hSession?.turns ?? 0} · Chain: {hSession?.chain?.length ?? 0} · Lang:{" "}
                  <b>{hSession?.lang ?? "—"}</b> <span style={{ opacity: 0.8 }}>· Ctrl/⌘+Enter</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
