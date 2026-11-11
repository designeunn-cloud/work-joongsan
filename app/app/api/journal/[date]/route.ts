import { NextResponse } from "next/server";
import { getDailyJournal, isValidJournalDate } from "@/lib/dailyJournal";

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidJournalDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)" }, { status: 400 });
  }

  return NextResponse.json(await getDailyJournal(date));
}
