"use client";

import { useEffect, useMemo, useState } from "react";

const LS_KEY = "wancko_session_v2";
const LS_LOG = "wancko_log_v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);

  const [au, setAu] = useState(null);
  const [h, setH] = useState(null);

  const [session, setSession] = useState(null);
  const [juramento, setJuramento] = useState(null);

  const [mode, setMode] = useState("wancko"); // wancko | historical
  const [archetype, setArchetype] = useState("estoic");

  const [cert, setCert] = useState(null);
  const [mirror, setMirror] = useState({ score: 0, status: "seed" });
  const [profile, setProfile] = useState(null);

  const [log, setLog] = useState([]); // registro local de mensajes
  const [loading, setLoading] = useState(false);

  /* ---------------- LOAD SESSION + LOG ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        if (parsed?.juramento) setJuramento(parsed.juramento);

        // ✅ para que al refrescar no quede “vacío”
        if (parsed?.last) {
          // reconstruimos una AU mínima para mostrar barras/strip
          setAu({
            mode: "GC",
            screen: "RAV",
            matrix: parsed.last.matrix || "3412",
            sense: parsed.last.sense || "direct",
            intervention: "Answer",
            N_level: parsed.last.N || "N3",
            signals: {
              d: parsed.last.d ?? 0.5,
              W: parsed.last.W ?? 0.5,
              tone: (parsed.last.d ?? 0.5) <= 0.28 ? "green" : (parsed.last.d ?? 0.5) >= 0.68 ? "red" : "amber",
              sense: parsed.last.sense || "direct"
            }
          });
        }
        if (typeof parsed?.mirror === "number") {
          const m = parsed.mirror;
          setMirror({ score: m, status: m >= 0.35 ? "ok" : m <= -0.45 ? "nok" : "seed" });
        }
        if (parsed?.profile) setProfile(parsed.profile);
      }
    } catch {}
    try {
      const rawLog = localStorage.getItem(LS_LOG);
      if (rawLog) setLog(JSON.parse(rawLog) || []);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(LS_KEY, JSON.stringify({ ...session, juramento }));
    } catch {}
  }, [session, juramento]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LOG, JSON.stringify(log.slice(-200)));
    } catch {}
  }, [log]);

  /* ---------------- VISUAL (background depends on mode) ---------------- */

  const activeSignals = useMemo(() => {
    if (mode === "historical") return h?.signals || null;
    return au?.signals || null;
  }, [mode, au, h]);

  const bg = useMemo(() => {
    const sig = activeSignals;
    const tone = sig?.tone || "amber";
    const d = typeof sig?.d === "number" ? sig.d : 0.5;

    // radial con desplazamiento por d, y tono por “tone”
    if (tone === "green") {
      return `radial-gradient(circle at ${d * 100}% 40%, #0e3a22, #07160f 62%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${d * 100}% 40%, #3a0e0e, #1a0707 62%)`;
    }
    return `radial-gradient(circle at ${d * 100}% 40%, #3a3216, #14110b 62%)`;
  }, [activeSignals]);

  /* ---------------- AU labels ---------------- */

  const wanckoD = au?.signals?.d ?? null;
  const wanckoW = au?.signals?.W ?? 0.5;

  const hD = h?.signals?.d ?? null;
  const hW = h?.signals?.W ?? 0.5;

  const gradientLabel = (d) => {
    if (d === null || typeof d !== "number") return "—";
    if (d < 0.3) return "Continuidad";
    if (d < 0.6) return "Crepúsculo";
    return "Ruptura";
  };

  const mirrorText = useMemo(() => {
    const st = mirror?.status || "seed";
    if (st === "ok") return "Espejo AU · OK";
    if (st === "nok") return "Espejo AU · NOK";
    return "Espejo AU · Semilla";
  }, [mirror]);

  const certText = useMemo(() => {
    const lvl = cert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [cert]);

  /* ---------------- helpers log ---------------- */

  function pushLog(item) {
    setLog((prev) => [...prev, item].slice(-200));
  }

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setOutput(null);

    const userText = input;
    setInput("");

    // log user message
    pushLog({
      t: Date.now(),
      role: "user",
      mode,
      juramento: juramento || null,
      archetype: mode === "historical" ? archetype : null,
      text: userText
    });

    try {
      // 1) Wancko siempre calcula estado (sirve como base espejo)
      const wRes = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userText,
          lang: navigator.language,
          juramento,
          session: session || null
        })
      });

      const wData = await wRes.json();

      // actualiza Wancko
      setAu(wData.au || null);
      setSession(wData.session || null);
      setCert(wData.cert || null);
      setMirror(wData.mirror || { score: 0, status: "seed" });
      setProfile(wData.profile || null);

      // 2) Si estamos en H-Wancko, ahora sí H recibe espejo y mantiene sujeto
      if (mode === "historical") {
        const hRes = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: userText,
            lang: navigator.language,
            archetype,
            wancko: {
              matrix: wData?.au?.matrix || "3412",
              signals: wData?.au?.signals || { d: 0.5, W: 0.5 },
              mirror: wData?.mirror || { score: 0, status: "seed" },
              profile: wData?.profile || null
            }
          })
        });

        const hData = await hRes.json();
        setH(hData.h || null);

        const finalOut = hData.output === null ? "—" : hData.output;
        setOutput(finalOut);

        pushLog({
          t: Date.now(),
          role: "assistant",
          mode: "historical",
          archetype,
          text: finalOut,
          meta: { h: hData.h || null }
        });
      } else {
        // Wancko solo
        const finalOut = wData.output === null ? "—" : wData.output;
        setOutput(finalOut);

        pushLog({
          t: Date.now(),
          role: "assistant",
          mode: "wancko",
          juramento: juramento || null,
          text: finalOut,
          meta: { au: wData.au || null }
        });
      }
    } catch {
      setOutput("Wancko could not respond.");
      pushLog({
        t: Date.now(),
        role: "assistant",
        mode,
        text: "Wancko could not respond."
      });
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#eaeaea",
        fontFamily: "system-ui",
        padding: "72px 24px",
        transition: "background 650ms ease"
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.65, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* MODO + ESPEJO + ARPI */}
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              fontSize: 13,
              opacity: 0.95
            }}
          >
            {mirrorText}{typeof mirror?.score === "number" ? ` · m=${mirror.score.toFixed(2)}` : ""}
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
            {certText}
          </div>
        </div>

        {/* JURAMENTO (solo Wancko) */}
        {mode === "wancko" && (
          <select
            value={juramento || ""}
            onChange={(e) => setJuramento(e.target.value || null)}
            style={{
              marginTop: 16,
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

        {/* STRIPS (Wancko vs H) */}
        <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {au && (
            <div style={{ opacity: 0.92, fontSize: 13 }}>
              <div>
                <span style={{ opacity: 0.6 }}>Wancko ·</span>{" "}
                <span style={{ opacity: 0.6 }}>Mode:</span> {au.mode} ·{" "}
                <span style={{ opacity: 0.6 }}>Screen:</span> {au.screen} ·{" "}
                <span style={{ opacity: 0.6 }}>Matrix:</span> {au.matrix} ·{" "}
                <span style={{ opacity: 0.6 }}>N:</span> {au.N_level}
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
                  {gradientLabel(wanckoD)}{wanckoD !== null ? ` · d=${wanckoD.toFixed(2)}` : ""}
                </div>

                <div style={{ opacity: 0.6 }}>
                  {au.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa"}
                </div>

                {au?.anti && (
                  <div style={{ opacity: 0.6 }}>
                    anti-loop: {au.anti}
                  </div>
                )}
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
                      left: `${wanckoW * 100}%`,
                      top: -4,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      transform: "translateX(-50%)",
                      transition: "left 520ms ease"
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {mode === "historical" && h && (
            <div style={{ opacity: 0.92, fontSize: 13 }}>
              <div>
                <span style={{ opacity: 0.6 }}>H-Wancko ·</span>{" "}
                <span style={{ opacity: 0.6 }}>Arquetipo:</span> {h.archetype} ·{" "}
                <span style={{ opacity: 0.6 }}>Matrix:</span> {h.matrix}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ opacity: 0.6 }}>Gradiente espejo:</div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.25)"
                  }}
                >
                  {gradientLabel(hD)}{hD !== null ? ` · d=${hD.toFixed(2)}` : ""}
                </div>
                <div style={{ opacity: 0.6 }}>W espejo</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ opacity: 0.6, marginBottom: 6 }}>W · Subject ↔ Object</div>
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
                      left: `${hW * 100}%`,
                      top: -4,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      transform: "translateX(-50%)",
                      transition: "left 520ms ease"
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* INPUT */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "historical" ? "Expose what matters (H-Wancko will mirror it)." : "Expose what matters."}
          rows={5}
          style={{
            width: "100%",
            marginTop: 26,
            padding: 14,
            fontSize: 16,
            background: "rgba(0,0,0,0.35)",
            color: "#eaeaea",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 12
          }}
          disabled={loading}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
            {loading ? "…" : "Expose"}
          </button>

          {profile && (
            <div style={{ marginTop: 14, opacity: 0.55, fontSize: 12 }}>
              Perfil AU: bias={profile.bias_matrix} · vd={profile.volatility?.toFixed?.(2) ?? "—"}
            </div>
          )}
        </div>

        {/* OUTPUT */}
        <div
          style={{
            marginTop: 28,
            minHeight: 56,
            fontSize: 18,
            whiteSpace: "pre-wrap",
            opacity: output === "—" ? 0.45 : 1
          }}
        >
          {output}
        </div>

        {/* META */}
        <div style={{ marginTop: 18, opacity: 0.45, fontSize: 12 }}>
          Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0} · Answers: {session?.answerCount ?? 0} · Silences: {session?.silenceCount ?? 0}
        </div>

        {/* LOG VIEW (simple, para el siguiente paso) */}
        <div style={{ marginTop: 26, opacity: 0.92 }}>
          <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 10 }}>
            Registro local (últimos {Math.min(log.length, 20)}):
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {log.slice(-20).map((m, idx) => (
              <div
                key={`${m.t}-${idx}`}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: m.role === "user" ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.06)"
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
                  {m.role === "user" ? "Tú" : "Wancko"} · {new Date(m.t).toLocaleString()} · {m.mode}
                  {m.juramento ? ` · ${m.juramento}` : ""}
                  {m.archetype ? ` · ${m.archetype}` : ""}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
