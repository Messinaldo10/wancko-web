type Signals = {
  d: number;
  W: number;
  band: number;
  ok: number;
  tone: string;
  complexity: number;
  beauty: number;
};

export default function AUSignals({
  title,
  signals,
}: {
  title: string;
  signals: Signals;
}) {
  function pct(x: number) {
    return Math.round(x * 100);
  }

  return (
    <div style={{ marginTop: 30 }}>
      <h3>{title}</h3>

      <ul>
        <li>d (decidibilidad): {pct(signals.d)}%</li>
        <li>W (razón ↔ verdad): {pct(signals.W)}%</li>
        <li>okScore interno: {pct(signals.ok)}%</li>
        <li>complexity: {pct(signals.complexity)}%</li>
        <li>beauty: {pct(signals.beauty)}%</li>
        <li>band: {signals.band}</li>
        <li>tone: {signals.tone}</li>
      </ul>
    </div>
  );
}
