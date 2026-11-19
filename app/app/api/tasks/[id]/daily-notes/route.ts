import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidJournalDate } from "@/lib/dailyJournal";
import { syncMemoToToday } from "@/lib/journalMemoSync";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 저장해주세요." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isValidJournalDate(body?.dateISO) || typeof body.notes !== "string" || body.notes.length > 10000) {
    return NextResponse.json({ error: "날짜를 확인하고 비고는 10,000자 이내로 입력해주세요." }, { status: 400 });
  }
  return prisma.$transaction(async tx => {
    if (!await tx.task.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
    await syncMemoToToday(tx, id, body.notes, body.dateISO);
    return NextResponse.json({ todayNotes: body.notes });
  });
}
