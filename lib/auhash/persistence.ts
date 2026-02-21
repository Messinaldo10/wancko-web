import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "au-history.json");

export function appendTick(tick: any) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    data.push(tick);

    // limitar tamaño a últimos 2000 registros
    const trimmed = data.slice(-2000);

    fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("Persistence error:", err);
  }
}

export function readHistory() {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}