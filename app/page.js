"use client";

import { useEffect, useMemo, useState } from "react";

const LS_KEY = "wancko_session_v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);

  const [au, setAu] = useState(null);
  const [session, setSession] = useState(null);
  const [juramento, setJuramento] = useState(null);

  const [mode, setMode] = useState("wancko"); // wancko | historical
  const [archetype, setArchetype] = useState("estoic");

  const [cert, setCert] = useState(null); // { level }
  const [mirror, setMirror] = useState(null); // { score, status }

  // H-Wancko UI
  const [hText, setHText] = useState(null);
  const [hMeta, setHMeta] = useState(null);
  const [hSignals, setHSignals] = useState(null);

  // simple transcript
  const [transcript, setTranscript] = useState([]); // [{t, who, text, tag}]

  const [loading, setLoading] = useState(false);

  /* ---------------- SESSION LOAD/PERSIST ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        if (parsed.juramento) setJuramento(parsed.juramento);
        if (Array.isArray(parsed.transcript)) setTranscript(parsed.transcript);
        if (parsed.mirror) setMirror(parsed.mirror);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (session) {
        const merged = {
          ...session,
          juramento: juramento || session.juramento || null,
          transcript,
          mirror
        };
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
      }
    } catch {}
  }, [session, juramento, transcript, mirror]);

  /* ---------------- LABELS ---------------- */

  const certText = useMemo(() => {
    const lvl = cert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [cert]);

  const mirrorText = useMemo(() => {
    const st = mirror?.status || "seed";
    if (st === "ok") return "ESPEJO · OK";
    if (st === "unstable") return "ESPEJO · Inestable";
    if (st === "nok") return "ESPEJO · NOK";
    return "ESPEJO · Semilla";
  }, [mirror]);

  /* ---------------- WANCKO VISUAL ---------------- */

  const d = au?.signals?.d ?? null;
  const w = au?.signals?.W ?? 0.5;

  const gradientLabel = useMemo(() => {
    if (d === null) return "—";
    if (d < 0.3) return "Continuidad";
    if (d < 0.6) return "Crepúsculo";
    return "Ruptura";
  }, [d]);

  const senseLabel =
    au?.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa";

  const bg = useMemo(() => {
    // Wancko BG (AU)
    const tone = au?.signals?.tone || "amber";
    const dd = au?.signals?.d ?? 0.5;

    if (tone === "green") {
      return `radial-gradient(circle at ${dd * 100}% 42%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${dd * 100}% 42%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${dd * 100}% 42%, #3a3216, #14110b 60%)`;
  }, [au]);

  /* ---------------- H-WANCKO VISUAL (separado) ---------------- */

  const hD = hSignals?.d ?? null;
  const hW = hSignals?.W ?? 0.5;

  const hLabel = useMemo(() => {
    if (hD === null) return "—";
    if (hD < 0.3) return "H · Continuidad";
    if (hD < 0.6) return "H · Crepúsculo";
    return "H · Ruptura";
  }, [hD]);

  const hBg = useMemo(() => {
    const tone = hSignals?.tone || "amber";
    const dd = hSignals?.d ?? 0.5;
    // paleta complementaria (más fría)
    if (tone === "green") {
      return `radial-gradient(circle at ${dd * 100}% 35%, #0b2b3a, #06131a 62%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${dd * 100}% 35%, #2b0b3a, #14061a 62%)`;
    }
    return `radial-gradient(circle at ${dd * 100}% 35%, #1b1b2a, #0b0b14 62%)`;
  }, [hSignals]);

  const mainBg = mode === "historical" ? hBg : bg;

  /* ---------------- SUBMIT (acto 1 + acto 2) ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    const userText = input;
    setInput(""); // ✅ recupera “texto desaparece al escribir”: limpiamos input al enviar

    // transcript: user
    setTranscript((prev) => [
      ...prev.slice(-29),
      { t: Date.now(), who: "you", text: userText }
    ]);

    try {
      let historicalText = null;

      // ACTO 1: H-Wancko si corresponde
      if (mode === "historical") {
        const hRes = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: userText, archetype })
        });
        const hData = await hRes.json();

        historicalText = hData.output || "";
        setHText(hData.output || null);
        setHMeta(hData.meta || null);
        setHSignals(hData.signals || null);

        if (historicalText) {
          setTranscript((prev) => [
            ...prev.slice(-29),
            { t: Date.now(), who: "h", text: historicalText, tag: archetype }
          ]);
        }
      } else {
        // si no estamos en H, limpiamos su UI
        setHText(null);
        setHMeta(null);
        setHSignals(null);
      }

      // ACTO 2: Wancko siempre (interpreta)
      const wRes = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userText,
          juramento,
          historical: historicalText,
          session: session || null
        })
      });

      const wData = await wRes.json();

      // output: "" => disolve (no render)
      const out = wData.output === null ? "—" : wData.output;
      setOutput(out);

      setAu(wData.au || null);
      setSession(wData.session || null);
      setCert(wData.cert || null);
      setMirror(wData.mirror || null);

      if (out !== "" && out !== null && typeof out === "string" && out.length) {
        setTranscript((prev) => [
          ...prev.slice(-29),
          { t: Date.now(), who: "wancko", text: out }
        ]);
      } else if (out === "—") {
        setTranscript((prev) => [
          ...prev.slice(-29),
          { t: Date.now(), who: "wancko", text: "—", tag: "silence" }
        ]);
      }
    } catch {
      setOutput("Wancko could not respond.");
      setTranscript((prev) => [
        ...prev.slice(-29),
        { t: Date.now(), who: "wancko", text: "Wancko could not respond.", tag: "error" }
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  const showWanckoIndicators = !!au && mode === "wancko";
  const showHIndicators = mode === "historical";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: mainBg,
        color: "#eaeaea",
        fontFamily: "system-ui",
        padding: "64px 18px",
        transition: "background 600ms ease"
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Wancko</h1>
            <p style={{ opacity: 0.65, marginTop: 8 }}>
              Natural assistant aligned with AU.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 13,
                opacity: 0.92
              }}
            >
              {certText}
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 13,
                opacity: 0.92
              }}
            >
              {mirrorText}{typeof mirror?.score === "number" ? ` · p=${mirror.score.toFixed(2)}` : ""}
            </div>
          </div>
        </div>

        {/* MODO */}
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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
        </div>

        {/* JURAMENTO */}
        {mode === "wancko" && (
          <select
            value={juramento || ""}
            onChange={(e) => setJuramento(e.target.value || null)}
            style={{
              marginTop: 12,
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

        {/* INDICADORES WANCKO */}
        {showWanckoIndicators && (
          <div style={{ marginTop: 18, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span> {au.mode} ·{" "}
              <span style={{ opacity: 0.6 }}>Screen:</span> {au.screen} ·{" "}
              <span style={{ opacity: 0.6 }}>Matrix:</span> {au.matrix} ·{" "}
              <span style={{ opacity: 0.6 }}>N:</span> {au.N_level} ·{" "}
              <span style={{ opacity: 0.6 }}>Intent:</span> {au.intervention}
              {au.anti ? (
                <>
                  {" "}· <span style={{ opacity: 0.6 }}>anti:</span> {au.anti}
                </>
              ) : null}
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
                {gradientLabel}{d !== null ? ` · d=${d.toFixed(2)}` : ""}
              </div>
              <div style={{ opacity: 0.6 }}>{senseLabel}</div>
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
                    left: `${w * 100}%`,
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

        {/* INDICADORES H-WANCKO */}
        {showHIndicators && (
          <div style={{ marginTop: 18, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>H-voice:</span> {hMeta?.archetype || archetype} ·{" "}
              <span style={{ opacity: 0.6 }}>user-matrix:</span> {hMeta?.matrix || "—"} ·{" "}
              <span style={{ opacity: 0.6 }}>mirror:</span> {hMeta?.mirror || "—"}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ opacity: 0.6 }}>Gradiente H:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.25)"
                }}
              >
                {hLabel}{hD !== null ? ` · d=${hD.toFixed(2)}` : ""}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>H · Subjective ↔ Objective</div>
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
                    transition: "left 500ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TRANSCRIPT (modo conversacional recuperado) */}
        <div
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.18)"
          }}
        >
          <div style={{ opacity: 0.6, fontSize: 12, marginBottom: 10 }}>
            Conversación (últimos {Math.min(30, transcript.length)} turnos)
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {transcript.slice(-30).map((m) => {
              const isYou = m.who === "you";
              const isH = m.who === "h";
              const isW = m.who === "wancko";

              const bgc = isYou
                ? "rgba(255,255,255,0.10)"
                : isH
                ? "rgba(120,160,255,0.10)"
                : "rgba(255,220,120,0.08)";

              const brd = isYou
                ? "rgba(255,255,255,0.16)"
                : isH
                ? "rgba(120,160,255,0.18)"
                : "rgba(255,220,120,0.14)";

              const align = isYou ? "flex-end" : "flex-start";

              return (
                <div key={m.t + ":" + m.who} style={{ display: "flex", justifyContent: align }}>
                  <div
                    style={{
                      maxWidth: "90%",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: `1px solid ${brd}`,
                      background: bgc,
                      whiteSpace: "pre-wrap",
                      opacity: m.text === "—" ? 0.55 : 1
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>
                      {isYou ? "Tú" : isH ? `H-Wancko · ${m.tag || ""}` : "Wancko"}
                    </div>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* INPUT */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "historical" ? "Escribe (acto 1: H) → (acto 2: Wancko)" : "Expose what matters."}
          rows={4}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 14,
            fontSize: 16,
            background: "rgba(0,0,0,0.35)",
            color: "#eaeaea",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 12
          }}
          disabled={loading}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
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
            {loading ? "…" : mode === "historical" ? "Acto doble" : "Expose"}
          </button>

          <button
            onClick={() => {
              setTranscript([]);
              setSession(null);
              setAu(null);
              setCert(null);
              setMirror(null);
              setHText(null);
              setHMeta(null);
              setHSignals(null);
              setOutput(null);
              try { localStorage.removeItem(LS_KEY); } catch {}
            }}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.18)",
              color: "rgba(255,255,255,0.75)",
              cursor: "pointer"
            }}
          >
            Reset local
          </button>
        </div>

        {/* OUTPUT (solo “última intervención”; la conversación ya está arriba) */}
        {output !== null && output !== "" && (
          <div
            style={{
              marginTop: 18,
              minHeight: 26,
              fontSize: 16,
              whiteSpace: "pre-wrap",
              opacity: output === "—" ? 0.55 : 1
            }}
          >
            {output}
          </div>
        )}

        {/* META */}
        <div style={{ marginTop: 16, opacity: 0.45, fontSize: 12 }}>
          Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0} · Silences: {session?.silenceCount ?? 0} · Answers: {session?.answerCount ?? 0}
        </div>
      </div>
    </main>
  );
}
