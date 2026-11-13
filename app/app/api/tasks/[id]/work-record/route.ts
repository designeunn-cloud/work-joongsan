import { NextResponse } from "next/server";
import { prisma, dayState, saveDay, settle, timerState } from "@/lib/workTimeServer";
import { koreaDate, roundedHours, splitDays } from "@/lib/workTime";
import { buildJournalTableRows } from "@/lib/journalTable";
import { setJournalSelection } from "@/lib/journalMembership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  try {
    return await prisma.$transaction(async db => {
      const task = await db.task.findUnique({ where: { id }, include: { subtasks: { orderBy: { createdAt: "asc" } } } });
      if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      if (task.status !== "in_progress") return NextResponse.json({ error: "진행중 업무에서 오늘 작업을 기록할 수 있습니다." }, { status: 409 });
      const now = new Date(), date = koreaDate(now);
      const detail = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: date, taskId: id } } });
      const day = await dayState(db, id, date), timer = await timerState(db);
      const total = await db.dailyJournalDetail.aggregate({ where: { taskId: id }, _sum: { hours: true } });
      const active = timer.taskId === id;
      const pending = active && timer.runningSince ? splitDays(new Date(timer.runningSince), now)
        .filter(part => part.dateISO === date).reduce((sum, part) => sum + part.seconds, 0) : 0;
      return NextResponse.json({
        date, version: detail?.updatedAt.toISOString() ?? null,
        content: buildJournalTableRows([task], date, detail ? [detail] : [])[0].content,
        hours: day.hours, totalHours: Math.round((total._sum.hours ?? 0) * 10) / 10,
        automatic: day.automatic, timerActive: active, timerRunning: active && !!timer.runningSince,
        timerStartedAt: active ? timer.runningSince : null,
        timerHours: roundedHours(Math.min(86400, day.seconds + (day.automatic ? 0 : pending))),
      });
    });
  } catch {
    return NextResponse.json({ error: "오늘 작업 기록을 불러오지 못했습니다. 다시 시도해주세요." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 저장해주세요." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.content !== "string" || !body.content.trim() || body.content.length > 40000
    || !(body.version === null || typeof body.version === "string")
    || !["manual", "timer"].includes(body.mode)
    || (body.mode === "manual" && (typeof body.hours !== "number" || !Number.isFinite(body.hours) || body.hours < 0 || body.hours > 24))) {
    return NextResponse.json({ error: "작업 내용과 오늘 총 소요시간(0~24시간)을 확인해주세요." }, { status: 400 });
  }
  try {
    return await prisma.$transaction(async db => {
      await db.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
      await db.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
      const now = new Date(), date = koreaDate(now);
      if (body.date !== date) return NextResponse.json({ error: "날짜가 바뀌었습니다. 오늘 기록을 다시 불러와주세요." }, { status: 409 });
      const task = await db.task.findUnique({ where: { id } });
      if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      if (task.status !== "in_progress") return NextResponse.json({ error: "업무 상태가 바뀌었습니다. 진행중 업무에서 기록해주세요." }, { status: 409 });
      const where = { dateISO_taskId: { dateISO: date, taskId: id } };
      const detail = await db.dailyJournalDetail.findUnique({ where });
      if ((detail?.updatedAt.toISOString() ?? null) !== body.version) {
        return NextResponse.json({ error: "오늘 기록이 다른 곳에서 변경되었습니다. 최신 기록을 다시 불러와주세요." }, { status: 409 });
      }
      const timer = await timerState(db);
      if (body.mode === "timer") {
        if (timer.taskId !== id || timer.runningSince !== body.timerStartedAt) {
          return NextResponse.json({ error: "측정 상태가 바뀌었습니다. 최신 기록을 다시 불러와주세요." }, { status: 409 });
        }
        await settle(db, timer, now);
        await db.$executeRaw`UPDATE WorkTimer SET taskId = NULL, runningSince = NULL WHERE id = 'active'`;
      } else {
        if (timer.taskId === id) return NextResponse.json({ error: "측정 중인 업무입니다. 다시 불러온 뒤 측정 종료하고 기록을 선택해주세요." }, { status: 409 });
        // A repeated save edits today's total, rather than adding it a second time.
        const day = await dayState(db, id, date);
        if (day.hours !== body.hours || day.automatic) await saveDay(db, id, date, body.hours * 3600, "manual");
      }
      await db.dailyJournalDetail.upsert({ where, create: { taskId: id, dateISO: date, content: body.content }, update: { content: body.content } });
      await setJournalSelection(date, id, true, db);
      const saved = await dayState(db, id, date);
      const total = await db.dailyJournalDetail.aggregate({ where: { taskId: id }, _sum: { hours: true } });
      return NextResponse.json({ date, content: body.content, hours: saved.hours ?? 0, totalHours: Math.round((total._sum.hours ?? 0) * 10) / 10 });
    }, { timeout: 15000 });
  } catch {
    return NextResponse.json({ error: "오늘 작업을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해주세요." }, { status: 500 });
  }
}
