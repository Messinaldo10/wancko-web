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

  const [loading, setLoading] = useState(false);

  /* ---------------- SESSION ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        if (parsed.juramento) setJuramento(parsed.juramento);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    } catch {}
  }, [session]);

  /* ---------------- AU VISUAL ---------------- */

  const bg = useMemo(() => {
    const tone = au?.signals?.tone || "amber";
    const d = au?.signals?.d ?? 0.45;

    if (tone === "green") {
      return `radial-gradient(circle at ${d * 100}% 40%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${d * 100}% 40%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${d * 100}% 40%, #3a3216, #14110b 60%)`;
  }, [au]);

  /* ---------------- GRADIENTE AU ---------------- */

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

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    try {
      let historicalText = null;

      // 1) H-WANCKO (acto 1)
      if (mode === "historical") {
        const hRes = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, archetype })
        });
        const hData = await hRes.json();
        historicalText = hData.output || "";
      }

      // 2) WANCKO (acto 2)
      const wRes = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
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
    } catch {
      setOutput("Wancko could not respond.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- ARPI ---------------- */

  const certText = useMemo(() => {
    const lvl = cert?.level || "seed";
    if (lvl === "ok") return "ARPI · OK";
    if (lvl === "unstable") return "ARPI · Inestable";
    if (lvl === "blocked") return "ARPI · Bloqueado";
    return "ARPI · Semilla";
  }, [cert]);

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
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.65, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* MODO */}
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

          {/* ARPI */}
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

        {/* JURAMENTO */}
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

        {/* AU STRIP + GRADIENTE + W */}
        {au && (
          <div style={{ marginTop: 22, opacity: 0.9, fontSize: 13 }}>
            <div>
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
                {gradientLabel}{d !== null ? ` · d=${d.toFixed(2)}` : ""}
              </div>

              <div style={{ opacity: 0.6 }}>{senseLabel}</div>

              {au.signals?.anti && (
                <div style={{ opacity: 0.6 }}>anti-loop: {au.signals.anti}</div>
              )}
            </div>

            {/* W BAR (vuelve a estar) */}
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
        {au && (
          <div style={{ marginTop: 20, opacity: 0.45, fontSize: 12 }}>
            Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0}
          </div>
        )}
      </div>
    </main>
  );
}
