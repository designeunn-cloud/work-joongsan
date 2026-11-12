import { NextResponse } from "next/server";
import { prisma, timerState, dayState, saveDay, settle } from "@/lib/workTimeServer";
import { isValidJournalDate } from "@/lib/dailyJournal";
import { recordJournalChange } from "@/lib/journalChangeTracker";
import { koreaDate } from "@/lib/workTime";
import { automaticTimeState, setAutomaticTime } from "@/lib/autoWorkTime";
import { getReviewElapsedTime } from "@/lib/reviewElapsedTime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const taskId = q.get("taskId"), date = q.get("date");
    const validDay = taskId && isValidJournalDate(date);
    if (q.get("includeReviewTime") === "1" && !validDay) {
      return NextResponse.json({ error: "시간을 계산할 업무와 날짜를 확인해주세요." }, { status: 400 });
    }
    return NextResponse.json({
      timer: await timerState(prisma),
      ...(validDay ? { day: await dayState(prisma, taskId, date) } : {}),
      ...(validDay && q.get("includeReviewTime") === "1" ? { reviewTime: await getReviewElapsedTime(prisma, taskId, date) } : {}),
    });
  } catch { return NextResponse.json({ error: "소요시간을 불러오지 못했습니다." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 저장해주세요." }, { status: 403 });
  const b = await request.json().catch(() => null);
  if (!b || !["start", "pause", "resume", "stop", "manual", "auto"].includes(b.action)) return NextResponse.json({ error: "올바른 작업을 선택해주세요." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async db => {
      // Acquire the singleton write lock before reading, including across browser tabs.
      await db.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
      await db.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
      const timer = await timerState(db);
      const now = new Date();
      if (b.action === "auto") {
        if (typeof b.taskId !== "string" || !isValidJournalDate(b.date) || typeof b.enabled !== "boolean") throw new Error("자동 설정할 업무와 날짜를 확인해주세요.");
        if (b.enabled && timer.taskId === b.taskId && b.date === koreaDate(now)) throw new Error("측정을 종료한 뒤 자동 시간을 설정해주세요.");
        await setAutomaticTime(db, b.taskId, b.date, b.enabled);
      } else if (b.action === "manual") {
        if (typeof b.taskId !== "string" || !isValidJournalDate(b.date) || typeof b.minutes !== "number" || !Number.isFinite(b.minutes) || b.minutes < 0 || b.minutes > 1440 || !["replace", "add"].includes(b.mode)) throw new Error("0~1440분을 입력해주세요.");
        if (!await db.task.findUnique({ where: { id: b.taskId } })) throw new Error("업무가 없습니다.");
        if (timer.taskId === b.taskId) throw new Error("측정을 종료한 뒤 시간을 수정해주세요.");
        const current = await dayState(db, b.taskId, b.date);
        const seconds = b.minutes * 60 + (b.mode === "add" ? current.seconds : 0);
        if (seconds > 86400) throw new Error("하루 소요시간은 24시간 이내로 입력해주세요.");
        await saveDay(db, b.taskId, b.date, seconds, b.mode === "add" && (current.source === "timer" || current.source === "mixed") ? "mixed" : "manual");
      } else if (b.action === "start") {
        if (timer.taskId) throw new Error("하단의 기존 측정을 먼저 종료해주세요.");
        if (typeof b.taskId !== "string" || !await db.task.findUnique({ where: { id: b.taskId } })) throw new Error("업무가 없습니다.");
        if ((await automaticTimeState(db, koreaDate(now)))?.taskId === b.taskId) throw new Error("자동 시간을 해제한 뒤 시간 측정을 시작해주세요.");
        await db.$executeRaw`UPDATE WorkTimer SET taskId = ${b.taskId}, runningSince = ${now.toISOString()} WHERE id = 'active'`;
      } else {
        if (!timer.taskId || timer.taskId !== b.taskId) throw new Error("측정 상태가 변경되었습니다. 다시 확인해주세요.");
        if (b.action === "resume") {
          if (timer.runningSince) throw new Error("이미 측정 중입니다.");
          if ((await automaticTimeState(db, koreaDate(now)))?.taskId === b.taskId) throw new Error("자동 시간을 해제한 뒤 시간 측정을 재개해주세요.");
          await db.$executeRaw`UPDATE WorkTimer SET runningSince = ${now.toISOString()} WHERE id = 'active'`;
        } else {
          await settle(db, timer, now);
          if (b.action === "stop") await db.$executeRaw`UPDATE WorkTimer SET taskId = NULL, runningSince = NULL WHERE id = 'active'`;
          else await db.$executeRaw`UPDATE WorkTimer SET runningSince = NULL WHERE id = 'active'`;
        }
      }
      if (["start", "resume"].includes(b.action)) await recordJournalChange({ dateISO: koreaDate(now), taskId: b.taskId });
      return { timer: await timerState(db) };
    });
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "저장하지 못했습니다. 다시 시도해주세요." }, { status: 409 }); }
}
