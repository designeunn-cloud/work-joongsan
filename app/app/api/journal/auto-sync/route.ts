import { NextResponse } from "next/server";
import { getJournalAutoSyncStatus, queueJournalChanges, scheduleJournalAutoSync } from "@/lib/journalAutoSync";
import { journalToday } from "@/lib/journalMemoSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getJournalAutoSyncStatus();
  if (status.pending && !status.running && !status.error) scheduleJournalAutoSync();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 다시 시도해주세요." }, { status: 403 });
  await queueJournalChanges([{ dateISO: journalToday() }]);
  scheduleJournalAutoSync(0);
  // Scheduling is enough: retries must never delay or block the app's own saves.
  return NextResponse.json(await getJournalAutoSyncStatus());
}
