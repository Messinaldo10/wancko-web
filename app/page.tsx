"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
   Tipos básicos UI
========================================================= */

type SignalTone = "green" | "red" | "amber" | "day" | "night" | "violet";

type AUView = {
  mode?: string;
  screen?: string;
  matrix?: string;
  N_level?: number;
  anti?: string;
  signals?: {
    d?: number;
    W?: number;
    band?: number;
    ok?: number;
    tone?: SignalTone;
    complexity?: number;
    beauty?: number;
    sense?: string;
  };
};

type SessionView = {
  turns?: number;
  chain?: string[];
  silenceCount?: number;
  lang?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  t: number;
};

/* ========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function small(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return Number(x).toFixed(2);
}

function detectLangUI(text: string): string {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t)) return "es";
  return "en";
}

/* =========================================================
   Fondo Wancko
========================================================= */

function wanckoBg(
  au: AUView | null,
  session: SessionView | null
): string {
  const tone = au?.signals?.tone ?? "amber";
  const d = au?.signals?.d ?? 0.45;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  let base: string;

  if (tone === "green") {
    base = `radial-gradient(circle at ${pos} 42%, #0e3a22, #07160f 62%)`;
  } else if (tone === "red") {
    base = `radial-gradient(circle at ${pos} 42%, #3a0e0e, #1a0707 62%)`;
  } else {
    base = `radial-gradient(circle at ${pos} 42%, #3a3216, #14110b 62%)`;
  }

  return base;
}

/* =========================================================
   Fondo H-Wancko
========================================================= */

function hwanckoBg(
  au: AUView | null,
  session: SessionView | null
): string {
  const tone = au?.signals?.tone ?? "violet";
  const d = au?.signals?.d ?? 0.55;
  const pos = `${Math.round(clamp01(d) * 100)}%`;

  if (tone === "day") {
    return `radial-gradient(circle at ${pos} 42%, #f6fbff, #b8d6ff 55%, #4b56a6 110%)`;
  }

  if (tone === "night") {
    return `radial-gradient(circle at ${pos} 42%, #140b27, #07040f 65%, #000000 120%)`;
  }

  return `radial-gradient(circle at ${pos} 42%, #7d3cff, #2a0b52 65%, #070410 120%)`;
}

/* ========================================================= */

export default function Home() {
  const [tab, setTab] = useState<"wancko" | "hwancko">("wancko");

  const [wInput, setWInput] = useState<string>("");
  const [wSession, setWSession] = useState<SessionView | null>(null);
  const [wAu, setWAu] = useState<AUView | null>(null);
  const [wChat, setWChat] = useState<ChatMessage[]>([]);

  const [hInput, setHInput] = useState<string>("");
  const [hSession, setHSession] = useState<SessionView | null>(null);
  const [hAu, setHAu] = useState<AUView | null>(null);
  const [hChat, setHChat] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState<boolean>(false);

  const chatRef = useRef<HTMLDivElement | null>(null);

  /* ================= BACKGROUND ================= */

  const bg = useMemo(() => {
    return tab === "wancko"
      ? wanckoBg(wAu, wSession)
      : hwanckoBg(hAu, hSession);
  }, [tab, wAu, hAu, wSession, hSession]);

  /* ================= SUBMIT WANCKO ================= */

  async function sendWancko(): Promise<void> {
    if (!wInput.trim() || loading) return;
    setLoading(true);

    const text = wInput;
    setWInput("");
    setWChat((prev) => [
      ...prev,
      { role: "user", text, t: Date.now() },
    ]);

    try {
      const res = await fetch("/api/wancko", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": detectLangUI(text),
        },
        body: JSON.stringify({
          input: text,
          session: wSession,
        }),
      });

      const data = await res.json();

      setWAu(data.au ?? null);
      setWSession(data.session ?? null);

      setWChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.output ?? "—",
          t: Date.now(),
        },
      ]);
    } catch {
      setWChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Wancko error.",
          t: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ================= SUBMIT H-WANCKO ================= */

  async function sendHWancko(): Promise<void> {
    if (!hInput.trim() || loading) return;
    setLoading(true);

    const text = hInput;
    setHInput("");
    setHChat((prev) => [
      ...prev,
      { role: "user", text, t: Date.now() },
    ]);

    try {
      const res = await fetch("/api/h-wancko", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": detectLangUI(text),
        },
        body: JSON.stringify({
          input: text,
          session: hSession,
        }),
      });

      const data = await res.json();

      setHAu(data.au ?? null);
      setHSession(data.session ?? null);

      setHChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.output ?? "—",
          t: Date.now(),
        },
      ]);
    } catch {
      setHChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "H-Wancko error.",
          t: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ========================================================= */

  const activeChat = tab === "wancko" ? wChat : hChat;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#eaeaea",
        padding: 40,
        transition: "background 600ms ease",
      }}
    >
      <h1>{tab === "wancko" ? "Wancko" : "H-Wancko"}</h1>

      <button
        onClick={() =>
          setTab(tab === "wancko" ? "hwancko" : "wancko")
        }
      >
        Switch
      </button>

      <div
        ref={chatRef}
        style={{
          marginTop: 20,
          padding: 12,
          border: "1px solid #333",
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {activeChat.map((m, i) => (
          <div key={i}>
            <b>{m.role}:</b> {m.text}
          </div>
        ))}
      </div>

      <textarea
        value={tab === "wancko" ? wInput : hInput}
        onChange={(e) =>
          tab === "wancko"
            ? setWInput(e.target.value)
            : setHInput(e.target.value)
        }
        rows={3}
        style={{ width: "100%", marginTop: 12 }}
      />

      <button
        onClick={
          tab === "wancko" ? sendWancko : sendHWancko
        }
        disabled={loading}
      >
        Send
      </button>
    </main>
  );
}
