"use client";

import { useState } from "react";

export default function JuramentoPage() {
  const [data, setData] = useState<any>(null);

  async function fetchData() {
    const res = await fetch("/api/juramento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const json = await res.json();
    setData(json);
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Juramento – Marco Entrópico</h1>

      <button onClick={fetchData}>
        Evaluar Estado
      </button>

      {data && (
        <>
          <h2>Frame</h2>
          <pre>{JSON.stringify(data.frame, null, 2)}</pre>

          <h2>Operaciones N</h2>
          <pre>{JSON.stringify(data.ops, null, 2)}</pre>

          <h2>Métricas Dimensionales</h2>
          <pre>{JSON.stringify(data.metrics, null, 2)}</pre>

          <h2>Diagnóstico</h2>
          <pre>{JSON.stringify(data.ui, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
