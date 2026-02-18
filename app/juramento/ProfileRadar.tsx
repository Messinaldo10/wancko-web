type Profile = {
  empleado: number;
  propietario: number;
  partner: number;
  espiritual: number;
};

export default function ProfileRadar({ profile }: { profile: Profile }) {
  const entries = Object.entries(profile);

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <strong>{key}</strong>
          <div
            style={{
              height: 10,
              background: "#eee",
              position: "relative",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${value}%`,
                height: "100%",
                background: "#6a11cb",
              }}
            />
          </div>
          <small>{value}%</small>
        </div>
      ))}
    </div>
  );
}
