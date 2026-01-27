"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setOutput(null);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input })
      });

      const data = await res.json();

      // AU rule: silence is valid but visible
      if (data.output === null) {
        setOutput("—");
      } else {
        setOutput(data.output);
      }
    } catch (e) {
      setOutput("Wancko could not respond.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "80px 24px",
        fontFamily: "system-ui"
      }}
    >
      <h1>Wancko</h1>
      <p style={{ opacity: 0.7 }}>
        Natural assistant aligned with AU.
      </p>

      {/* INPUT */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Expose what matters."
        rows={5}
        style={{
          width: "100%",
          marginTop: 32,
          padding: 12,
          fontSize: 16
        }}
        disabled={loading}
      />

      {/* ACTION */}
      <button
        onClick={submit}
        disabled={loading}
        style={{
          marginTop: 16,
          padding: "10px 16px",
          fontSize: 16,
          cursor: "pointer"
        }}
      >
        {loading ? "…" : "Expose"}
      </button>

      {/* RESPONSE */}
      <div
        style={{
          marginTop: 40,
          minHeight: 40,
          fontSize: 18,
          whiteSpace: "pre-wrap",
          opacity: output === "—" ? 0.4 : 1
        }}
      >
        {output}
      </div>
    </main>
  );
}
