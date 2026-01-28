"use client";

import { useEffect, useMemo, useState } from "react";

const LS_KEY = "wancko_session_v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);
  const [au, setAu] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);

  // load session once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);

  // persist session
  useEffect(() => {
    try {
      if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    } catch {}
  }, [session]);

  const bg = useMemo(() => {
    const tone = au?.signals?.tone || "amber";
    if (tone === "green") return "linear-gradient(135deg, #07160f, #0b2b1a)";
    if (tone === "red") return "linear-gradient(135deg, #1a0707, #2b0b0b)";
    return "linear-gradient(135deg, #14110b, #2b2414)";
  }, [au]);

  const w = au?.signals?.W ?? 0.5; // 0..1

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
    } catch (e) {
      setOutput("Wancko could not respond.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#eaeaea",
        fontFamily: "system-ui",
        padding: "72px 24px"
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Wancko</h1>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          Natural assistant aligned with AU.
        </p>

        {/* AU strip (discrete) */}
        <div style={{ marginTop: 20, opacity: 0.85, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <span style={{ opacity: 0.6 }}>Mode:</span>{" "}
              {au?.mode || "—"}{" "}
              <span style={{ opacity: 0.6, marginLeft: 8 }}>Screen:</span>{" "}
              {au?.screen || "—"}{" "}
              <span style={{ opacity: 0.6, marginLeft: 8 }}>Matrix:</span>{" "}
              {au?.matrix || "—"}{" "}
              <span style={{ opacity: 0.6, marginLeft: 8 }}>N:</span>{" "}
              {au?.N_level || "—"}
            </div>
          </div>

          {/* W bar */}
          <div style={{ marginTop: 10 }}>
            <div style={{ opacity: 0.6, marginBottom: 6 }}>
              W (Reason ↔ Truth)
            </div>
            <div style={{ height: 10, background: "rgba(255,255,255,0.12)", borderRadius: 999 }}>
              <div
                style={{
                  width: `${Math.round(w * 100)}%`,
                  height: "100%",
                  background: "rgba(255,255,255,0.55)",
                  borderRadius: 999
                }}
              />
            </div>
          </div>
        </div>

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

        <div
          style={{
            marginTop: 30,
            minHeight: 48,
            fontSize: 18,
            whiteSpace: "pre-wrap",
            opacity: output === "—" ? 0.45 : 1
          }}
        >
          {output}
        </div>

        <div style={{ marginTop: 18, opacity: 0.5, fontSize: 12 }}>
          Turns: {session?.turns ?? 0} · Answers: {session?.answerCount ?? 0} · Silences: {session?.silenceCount ?? 0}
        </div>
      </div>
    </main>
  );
}
