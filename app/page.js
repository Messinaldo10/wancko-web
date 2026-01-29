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

  const [cert, setCert] = useState(null);
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

  /* ---------------- AU GRADIENT ---------------- */

  const d = au?.signals?.d ?? 0.45;
  const tone = au?.signals?.tone || "amber";

  const bg = useMemo(() => {
    if (tone === "green") {
      return `radial-gradient(circle at ${d * 100}% 40%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${d * 100}% 40%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${d * 100}% 40%, #3a3216, #14110b 60%)`;
  }, [d, tone]); // 🔑 CLAVE: dependencias explícitas

  const gradientLabel = useMemo(() => {
    if (d < 0.3) return "Continuidad";
    if (d < 0.6) return "Crepúsculo";
    return "Ruptura";
  }, [d]);

  const senseLabel =
    au?.signals?.sense === "inverse"
      ? "lectura inversa (2143)"
      : "lectura directa";

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    try {
      let historicalText = null;

      if (mode === "historical") {
        const hRes = await fetch("/api/h-wancko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, archetype })
        });
        const hData = await hRes.json();
        historicalText = hData.output || "";
      }

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
        transition: "background 500ms ease"
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.65, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* MODE */}
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="wancko">Wancko</option>
            <option value="historical">H-Wancko</option>
          </select>

          {mode === "historical" && (
            <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              <option value="estoic">Estoic</option>
              <option value="mystic">Mystic</option>
              <option value="warrior">Warrior</option>
              <option value="poet">Poet</option>
            </select>
          )}

          <div>{certText}</div>
        </div>

        {/* JURAMENTO */}
        {mode === "wancko" && (
          <select
            value={juramento || ""}
            onChange={(e) => setJuramento(e.target.value || null)}
          >
            <option value="">No juramento</option>
            <option value="disciplina">Disciplina</option>
            <option value="ansiedad">Ansiedad</option>
            <option value="límites">Límites</option>
            <option value="excesos">Excesos</option>
            <option value="soltar">Soltar</option>
          </select>
        )}

        {/* AU STRIP */}
        {au && (
          <div style={{ marginTop: 22, fontSize: 13 }}>
            <div>
              Mode: {au.mode} · Screen: {au.screen} · Matrix: {au.matrix} · N:{" "}
              {au.N_level}
            </div>

            <div style={{ marginTop: 8 }}>
              Gradiente AU: {gradientLabel} · d={d.toFixed(2)} · {senseLabel}
              {au.signals?.anti && ` · anti-loop: ${au.signals.anti}`}
            </div>

            {/* BARRA GRADIENTE */}
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 8, background: "rgba(255,255,255,0.15)" }}>
                <div
                  style={{
                    width: `${d * 100}%`,
                    height: "100%",
                    background:
                      d < 0.3 ? "#3ddc97" : d > 0.65 ? "#ff5f5f" : "#ffd36a",
                    transition: "width 400ms ease"
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
          rows={5}
          placeholder="Expose what matters."
        />

        <button onClick={submit} disabled={loading}>
          {loading ? "…" : "Expose"}
        </button>

        {/* OUTPUT */}
        <div style={{ marginTop: 24, minHeight: 48 }}>{output}</div>

        {au && (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.5 }}>
            Turns: {session?.turns ?? 0} · Chain: {session?.chain?.length ?? 0}
          </div>
        )}
      </div>
    </main>
  );
}
