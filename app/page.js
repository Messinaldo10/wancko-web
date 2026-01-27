"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!input) return;
    setLoading(true);
    setOutput(null);

    const res = await fetch("/api/wancko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });

    const data = await res.json();
    if (data.output === null) {
  setOutput("—");
} else {
  setOutput(data.output);
}

    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px" }}>
      <h1>Wancko</h1>
      <p><em>Natural assistance aligned with AU.</em></p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Expose what matters."
        rows={5}
        style={{ width: "100%", marginTop: 24 }}
      />

      <button onClick={submit} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? "…" : "Expose"}
      </button>

      {output && (
        <div style={{ marginTop: 32, opacity: 0.9 }}>
          {output}
        </div>
      )}
    </main>
  );
}
