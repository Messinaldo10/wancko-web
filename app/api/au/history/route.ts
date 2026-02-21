import { NextResponse } from "next/server";
import { readHistory } from "../../../../lib/auhash/persistence";

export async function GET() {
  const history = readHistory();
  return NextResponse.json(history);
}