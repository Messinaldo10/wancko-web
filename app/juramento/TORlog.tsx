type TorEvent = {
  t: number;
  action: string;
  token?: string;
  domain: string;
  causes: string[];
  effects: string[];
};

export default function TorLog({
  title,
  events,
}: {
  title: string;
  events: TorEvent[];
}) {
  return (
    <div style={{ marginTop: 40 }}>
      <h3>{title}</h3>

      {events.length === 0 && <p>No events</p>}

      {events.slice(-10).reverse().map((e, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #444",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <div><strong>Action:</strong> {e.action}</div>
          <div><strong>Token:</strong> {e.token}</div>
          <div><strong>Domain:</strong> {e.domain}</div>
          <div><strong>Causes:</strong> {e.causes?.join(", ")}</div>
          <div><strong>Effects:</strong> {e.effects?.join(", ")}</div>
        </div>
      ))}
    </div>
  );
}
