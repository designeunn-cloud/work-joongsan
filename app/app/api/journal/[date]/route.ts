import { NextResponse } from "next/server";
import { getDailyJournal, isValidJournalDate } from "@/lib/dailyJournal";
import { queueReviewCarryDay } from "@/lib/reviewCarrySync";

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidJournalDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)" }, { status: 400 });
  }

  const journal = await getDailyJournal(date);
  await queueReviewCarryDay(date).catch(error => console.error("[journal] 검토 업무 동기화 예약 실패", error));
  return NextResponse.json(journal);
}
