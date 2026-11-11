import { prisma } from "@/lib/prisma";
import { roundedHours, splitDays } from "@/lib/workTime";
import type { Prisma } from "@prisma/client";
import { automaticTimeState, disableAutomaticTime, recalculateAutomaticTime } from "./autoWorkTime";

type DB = Prisma.TransactionClient;
type Timer = { taskId: string | null; runningSince: string | null };
type Day = { source: string; seconds: number };
export async function timerState(db: DB) {
  const rows = await db.$queryRaw<Timer[]>`SELECT taskId, runningSince FROM WorkTimer WHERE id = 'active'`;
  const timer = rows[0] ?? { taskId: null, runningSince: null };
  const task = timer.taskId ? await db.task.findUnique({ where: { id: timer.taskId }, select: { requestContent: true } }) : null;
  return { ...timer, ...(timer.taskId && !task ? { taskId: null, runningSince: null } : {}), taskName: task?.requestContent ?? "", serverNow: new Date().toISOString() };
}
export async function dayState(db: DB, taskId: string, dateISO: string) {
  const detail = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO, taskId } } });
  const meta = await db.$queryRaw<Day[]>`SELECT source, seconds FROM WorkTimeDay WHERE taskId = ${taskId} AND dateISO = ${dateISO}`;
  const matches = detail?.hours != null && meta[0] && roundedHours(meta[0].seconds) === detail.hours;
  const automatic = await automaticTimeState(db, dateISO);
  const isAutomatic = automatic?.taskId === taskId;
  return { hours: detail?.hours ?? null, source: isAutomatic ? "auto" : matches ? meta[0].source : detail?.hours != null ? "manual" : null, seconds: isAutomatic ? (detail?.hours ?? 0) * 3600 : matches ? meta[0].seconds : (detail?.hours ?? 0) * 3600, automatic: isAutomatic, autoTaskId: automatic?.taskId ?? null, autoTaskName: automatic?.taskName ?? "" };
}
export async function saveDay(db: DB, taskId: string, dateISO: string, seconds: number, source: string) {
  await disableAutomaticTime(db, taskId, dateISO);
  await db.dailyJournalDetail.upsert({ where: { dateISO_taskId: { dateISO, taskId } }, create: { dateISO, taskId, hours: roundedHours(seconds) }, update: { hours: roundedHours(seconds) } });
  await db.$executeRaw`INSERT INTO WorkTimeDay (taskId, dateISO, source, seconds) VALUES (${taskId}, ${dateISO}, ${source}, ${seconds}) ON CONFLICT(taskId,dateISO) DO UPDATE SET source=excluded.source, seconds=excluded.seconds`;
  await recalculateAutomaticTime(db, dateISO);
}
export async function settle(db: DB, timer: Timer, now: Date) {
  if (!timer.taskId || !timer.runningSince) return;
  for (const day of splitDays(new Date(timer.runningSince), now)) {
    // A timer started on an earlier day can cross into an already configured automatic day.
    // Its derived balance must never be counted as measured time or disable the setting.
    if ((await automaticTimeState(db, day.dateISO))?.taskId === timer.taskId) {
      await recalculateAutomaticTime(db, day.dateISO);
      continue;
    }
    const current = await dayState(db, timer.taskId, day.dateISO);
    await saveDay(db, timer.taskId, day.dateISO, Math.min(86400, current.seconds + day.seconds), current.source === "manual" || current.source === "mixed" ? "mixed" : "timer");
  }
  await db.$executeRaw`INSERT INTO WorkTimeSegment (id, taskId, startedAt, endedAt) VALUES (${crypto.randomUUID()}, ${timer.taskId}, ${timer.runningSince}, ${now.toISOString()})`;
}
export { prisma };
