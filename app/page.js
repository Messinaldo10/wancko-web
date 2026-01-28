"use client";

import { useEffect, useMemo, useState } from "react";

const LS_KEY = "wancko_session_v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);
  const [au, setAu] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ---------------- SESSION ---------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setSession(JSON.parse(raw));
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
    const W = au?.signals?.W ?? 0.5;

    // Gradiente AU = tono + desplazamiento por W
    if (tone === "green") {
      return `radial-gradient(circle at ${W * 100}% 40%, #0e3a22, #07160f 60%)`;
    }
    if (tone === "red") {
      return `radial-gradient(circle at ${W * 100}% 40%, #3a0e0e, #1a0707 60%)`;
    }
    return `radial-gradient(circle at ${W * 100}% 40%, #3a3216, #14110b 60%)`;
  }, [au]);

  const w = au?.signals?.W ?? 0.5; // 0..1

  /* ---------------- SUBMIT ---------------- */

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          lang: navigator.language,
          session: session || null
        })
      });

      const data = await res.json();
      setOutput(data.output === null ? "—" : data.output);
      setAu(data.au || null);
      setSession(data.session || null);
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
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.65, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* AU STRIP */}
        <div style={{ marginTop: 22, opacity: 0.85, fontSize: 13 }}>
          <div>
            <span style={{ opacity: 0.6 }}>Mode:</span> {au?.mode || "—"} ·{" "}
            <span style={{ opacity: 0.6 }}>Screen:</span> {au?.screen || "—"} ·{" "}
            <span style={{ opacity: 0.6 }}>Matrix:</span> {au?.matrix || "—"} ·{" "}
            <span style={{ opacity: 0.6 }}>N:</span> {au?.N_level || "—"}
          </div>

          {/* W BAR CONTINUA */}
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
            opacity: output === "—" ? 0.45 : 1,
            transition: "opacity 300ms ease"
          }}
        >
          {output}
        </div>

        {/* META */}
        <div style={{ marginTop: 20, opacity: 0.45, fontSize: 12 }}>
          Turns: {session?.turns ?? 0} · Answers: {session?.answerCount ?? 0} ·
          Silences: {session?.silenceCount ?? 0}
        </div>
      </div>
    </main>
  );
}
