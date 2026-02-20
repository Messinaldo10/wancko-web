"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";

type Tick = {
  tMs: number;
  Psi: number;
  R: number;
  T: number;
  P: number;
  E: number;
  Er: number;
  phase: number;
  rot: any;
  dom: any;
  m4: any;
  hash: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function AUDashboardPage() {
  const [intent, setIntent] = useState<"performance" | "natural">("performance");
  const [dd, setDd] = useState(0.3);
  const [pg, setPg] = useState(0.2);
  const [cc, setCc] = useState(0.1);
  const [ms, setMs] = useState(250);

  const [ticks, setTicks] = useState<Tick[]>([]);
  const [latest, setLatest] = useState<Tick | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const url = useMemo(() => {
    const u = new URL("/api/au/stream", window.location.origin);
    u.searchParams.set("intent", intent);
    u.searchParams.set("dd", String(dd));
    u.searchParams.set("pg", String(pg));
    u.searchParams.set("cc", String(cc));
    u.searchParams.set("ms", String(ms));
    return u.toString();
  }, [intent, dd, pg, cc, ms]);

  useEffect(() => {
    esRef.current?.close();

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (ev) => {
      const t = JSON.parse(ev.data) as Tick;
      setLatest(t);
      setTicks((prev) => {
        const next = [...prev, t];
        // mantener últimas 240 muestras (~1 min si ms=250)
        return next.length > 240 ? next.slice(next.length - 240) : next;
      });
    };

    es.onerror = () => {
      // si falla, cerramos; el usuario puede tocar un slider y reabrirá
      es.close();
    };

    return () => es.close();
  }, [url]);

  // mini sparkline sin librerías (SVG)
  function Spark({ data, min, max }: { data: number[]; min: number; max: number }) {
    const w = 520, h = 90, pad = 6;
    if (data.length < 2) return <div className="text-sm opacity-60">sin datos…</div>;

    const xs = data.map((_, i) => pad + (i * (w - 2 * pad)) / (data.length - 1));
    const ys = data.map((v) => {
      const nv = (clamp(v, min, max) - min) / (max - min || 1);
      return pad + (1 - nv) * (h - 2 * pad);
    });

    const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");

    return (
      <svg width={w} height={h} className="rounded-xl bg-white/5">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  const series = useMemo(() => {
    const Psi = ticks.map(t => t.Psi);
    const R = ticks.map(t => t.R);
    const T = ticks.map(t => t.T);
    const P = ticks.map(t => t.P);
    const Er = ticks.map(t => t.Er);
    const phase = ticks.map(t => t.phase);
    return { Psi, R, T, P, Er, phase };
  }, [ticks]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="space-y-1">
        <div className="text-2xl font-semibold">AU Dashboard</div>
        <div className="text-sm opacity-70">Live Ψ / R / T / P / Entropía / Fase</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 space-y-3">
          <div className="font-medium">Controles</div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm opacity-80">intent</span>
            <select
              className="bg-black/30 rounded-lg px-3 py-2"
              value={intent}
              onChange={(e) => setIntent(e.target.value as any)}
            >
              <option value="performance">performance</option>
              <option value="natural">natural</option>
            </select>
          </label>

          <div className="space-y-2">
            <div className="text-sm opacity-80">dd: {dd.toFixed(2)}</div>
            <input type="range" min="0" max="1" step="0.01" value={dd} onChange={(e) => setDd(Number(e.target.value))} className="w-full" />
          </div>

          <div className="space-y-2">
            <div className="text-sm opacity-80">pg: {pg.toFixed(2)}</div>
            <input type="range" min="0" max="1" step="0.01" value={pg} onChange={(e) => setPg(Number(e.target.value))} className="w-full" />
          </div>

          <div className="space-y-2">
            <div className="text-sm opacity-80">cc: {cc.toFixed(2)}</div>
            <input type="range" min="0" max="1" step="0.01" value={cc} onChange={(e) => setCc(Number(e.target.value))} className="w-full" />
          </div>

          <div className="space-y-2">
            <div className="text-sm opacity-80">ms: {ms} (interval)</div>
            <input type="range" min="50" max="2000" step="50" value={ms} onChange={(e) => setMs(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white/5 space-y-3 lg:col-span-2">
          <div className="font-medium">Último tick</div>
          {!latest ? (
            <div className="text-sm opacity-60">conectando…</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-xl p-3 bg-black/30">Ψ<br /><b>{latest.Psi.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">R<br /><b>{latest.R.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">T<br /><b>{latest.T.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">P<br /><b>{latest.P.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">Entropía r<br /><b>{latest.Er.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">Fase<br /><b>{latest.phase.toFixed(3)}</b></div>
              <div className="rounded-xl p-3 bg-black/30">Dominance<br /><b>{latest.dom?.whoDominates}/{latest.dom?.channel}</b></div>
              <div className="rounded-xl p-3 bg-black/30">Rotación<br /><b>{latest.rot?.type}</b></div>
              <div className="rounded-xl p-3 bg-black/30 md:col-span-2">Hash<br /><b className="break-all">{latest.hash}</b></div>
              <div className="rounded-xl p-3 bg-black/30 md:col-span-2">M4<br /><b className="break-all">{JSON.stringify(latest.m4)}</b></div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 space-y-2">
          <div className="font-medium">Ψ</div>
          <Spark data={series.Psi} min={0} max={1} />
        </div>

        <div className="rounded-2xl p-4 bg-white/5 space-y-2">
          <div className="font-medium">P</div>
          <Spark data={series.P} min={0} max={1} />
        </div>

        <div className="rounded-2xl p-4 bg-white/5 space-y-2">
          <div className="font-medium">R</div>
          <Spark data={series.R} min={-2} max={2} />
        </div>

        <div className="rounded-2xl p-4 bg-white/5 space-y-2">
          <div className="font-medium">T</div>
          <Spark data={series.T} min={-10} max={10} />
        </div>

        <div className="rounded-2xl p-4 bg-white/5 space-y-2 lg:col-span-2">
          <div className="font-medium">Entropía ratio + Fase</div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm opacity-80">Entropía ratio</div>
              <Spark data={series.Er} min={0} max={1} />
            </div>
            <div>
              <div className="text-sm opacity-80">Fase</div>
              <Spark data={series.phase} min={0} max={1} />
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs opacity-60">
        Abre esta página y mueve sliders: el motor reacciona en vivo. URL stream: <span className="break-all">{url}</span>
      </div>
    </div>
  );
}