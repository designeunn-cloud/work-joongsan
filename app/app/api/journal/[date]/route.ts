import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeDay, finalizePastDays, livePreviewTaskIds } from "@/lib/dailyJournalSnapshot";
import { toISODate } from "@/lib/dateHelpers";

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)" }, { status: 400 });
  }

  const now = new Date();
  const todayISO = toISODate(now);

  if (date >= todayISO) {
    // 오늘 또는 미래는 아직 확정되지 않았으므로 저장하지 않고 매번 실시간으로 계산한다.
    // (오후 10시 이후 등록되었거나 주말로 밀린 업무를 미리 보려면 그 날짜로 넘겨서 봐야 한다.)
    const taskIds = await livePreviewTaskIds(date);
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, include: { subtasks: true } });
    return NextResponse.json({ dateISO: date, preview: true, tasks });
  }

  await finalizePastDays(now); // 아직 못 고정한 지난 날짜들 따라잡기
  await finalizeDay(date); // 그래도 없으면(따라잡기 범위 밖 등) 지금 즉시 고정
  const journal = await prisma.dailyJournal.findUnique({
    where: { dateISO: date },
    include: { entries: { include: { task: { include: { subtasks: true } } } } },
  });
  return NextResponse.json({ dateISO: date, preview: false, tasks: journal?.entries.map((e) => e.task) ?? [] });
}
