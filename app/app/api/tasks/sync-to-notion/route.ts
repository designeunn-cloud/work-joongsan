import { NextResponse } from "next/server";
import { syncAllTasksToNotion } from "@/lib/notionSync";

export async function POST() {
  try {
    const result = await syncAllTasksToNotion();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
