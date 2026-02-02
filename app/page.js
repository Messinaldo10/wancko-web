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
  const [mirror, setMirror] = useState(0); // -1..+1

  const [loading, setLoading] = useState(false);

  /* ---------------- SESSION ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        if (parsed.juramento) setJuramento(parsed.juramento);
        if (typeof parsed.mirror === "number") setMirror(parsed.mirror);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    } catch {}
  }, [session]);

  /* ---------------- AU VISUAL ---------------- */

  const d = au?.signals?.d ?? null;
  const w = au?.signals?.W ?? 0.5;

  const bg = useMemo(() => {
    // Estado inicial “intermedio”: si no hay au todavía
    if (!au) {
      return `radial-gradient(circle at 50% 40%, #2b2414, #14110b 60%)`;
    }

    const tone = au?.signals?.tone || "amber";
    const dd = au?.signals?.d ?? 0.45;

    if (tone === "green") {
      return `radial-gradient(circle at ${dd * 100}% 40%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${dd * 100}% 40%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${dd * 100}% 40%, #3a3216, #14110b 60%)`;
  }, [au]);

  const gradientLabel = useMemo(() => {
    if (d === null) return "—";
    if (d < 0.3) return "Continuidad";
    if (d < 0.6) return "Crepúsculo";
    return "Ruptura";
  }, [d]);

  const senseLabel =
    au?.signals?.sense === "inverse" ? "lectura inversa" : "lectura directa";

  /* ---------------- ARPI ---------------- */

  const certText = useMemo(() => {
    const lvl = cert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [cert]);

  const mirrorLabel = useMemo(() => {
    // espejo intermedio al inicio
    if (!session || !Array.isArray(session.log) || session.log.length < 2) {
      return "Espejo · Centro";
    }
    if (mirror >= 0.25) return "Espejo · OK";
    if (mirror <= -0.25) return "Espejo · NOK";
    return "Espejo · Centro";
  }, [mirror, session]);

  const mirrorPos = useMemo(() => {
    // map -1..+1 to 0..100
    const v = typeof mirror === "number" ? mirror : 0;
    return Math.round(((v + 1) / 2) * 100);
  }, [mirror]);

  /* ---------------- SUBMIT (doble acto real) ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    try {
      let historicalText = null;

      // Acto 1 (solo si eliges H-Wancko)
      if (mode === "historical") {
        const hRes = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, archetype })
        });
        const hData = await hRes.json();
        historicalText = hData.output || "";
      }

      // Acto 2 (siempre Wancko, para trayectoria + AU)
      const wRes = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          lang: navigator.language,
          juramento,
          historical: historicalText,
          session: session || null
        })
      });

      const wData = await wRes.json();

      setOutput(wData.output === null ? "—" : wData.output);
      setAu(wData.au || null);
      setSession(wData.session || null);
      setCert(wData.cert || null);

      if (typeof wData.mirror === "number") setMirror(wData.mirror);
      else if (typeof wData.session?.mirror === "number") setMirror(wData.session.mirror);
    } catch {
      setOutput("Wancko could not respond.");
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
        transition: "background 600ms ease"
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.65, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* CONTROLES */}
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
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

          {/* ARPI badge */}
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

          {/* Espejo badge */}
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
            {mirrorLabel}
          </div>
        </div>

        {/* Juramento */}
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

        {/* AU STRIP + Indicadores */}
        {au && (
          <div style={{ marginTop: 22, opacity: 0.92, fontSize: 13 }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span> {au.mode} ·{" "}
              <span style={{ opacity: 0.6 }}>Screen:</span> {au.screen} ·{" "}
              <span style={{ opacity: 0.6 }}>Matrix:</span> {au.matrix} ·{" "}
              <span style={{ opacity: 0.6 }}>N:</span> {au.N_level}
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <div style={{ opacity: 0.6 }}>Gradiente AU:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.25)"
                }}
              >
                {gradientLabel}
                {d !== null ? ` · d=${d.toFixed(2)}` : ""}
              </div>

              <div style={{ opacity: 0.6 }}>{senseLabel}</div>

              {au.anti && (
                <div style={{ opacity: 0.6 }}>
                  anti-loop: {au.anti}
                </div>
              )}
            </div>

            {/* W BAR */}
            <div style={{ marginTop: 12 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>
                W · Reason ↔ Truth
              </div>
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
                    left: `${Math.round(w * 100)}%`,
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

            {/* ESPEJO BAR */}
            <div style={{ marginTop: 12 }}>
              <div style={{ opacity: 0.6, marginBottom: 6 }}>
                Espejo · NOK ↔ OK
              </div>
              <div
                style={{
                  height: 10,
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: 999,
                  position: "relative"
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${mirrorPos}%`,
                    top: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.85)",
                    transform: "translateX(-50%)",
                    transition: "left 600ms ease"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* INPUT */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Expose what matters."
          rows={5}
          style={{
            width: "100%",
            marginTop: 28,
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
          {loading ? "…" : "Expose"}
        </button>

        {/* OUTPUT */}
        <div
          style={{
            marginTop: 32,
            minHeight: 56,
            fontSize: 18,
            whiteSpace: "pre-wrap",
            opacity: output === "—" ? 0.45 : 1
          }}
        >
          {output}
        </div>

        {/* META */}
        <div style={{ marginTop: 20, opacity: 0.45, fontSize: 12 }}>
          Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0} ·
          Log: {session?.log?.length ?? 0}
        </div>
      </div>
    </main>
  );
}
