import type { Prisma } from "@prisma/client";
import { recordJournalChange } from "./journalChangeTracker";

type DB = Prisma.TransactionClient;
type AutomaticDay = { taskId: string; taskName: string };

/** A date is the unique key, so concurrent tabs cannot choose two automatic tasks. */
export async function automaticTimeState(db: DB, dateISO: string) {
  const rows = await db.$queryRaw<AutomaticDay[]>`SELECT a.taskId, t.requestContent AS taskName FROM WorkTimeAuto a JOIN Task t ON t.id = a.taskId WHERE a.dateISO = ${dateISO}`;
  return rows[0] ?? null;
}

/** Leave the most recently calculated hours as a normal editable value. */
export async function disableAutomaticTime(db: DB, taskId: string, dateISO: string) {
  const removed = await db.$executeRaw`DELETE FROM WorkTimeAuto WHERE dateISO = ${dateISO} AND taskId = ${taskId}`;
  if (removed) {
    await db.$executeRaw`UPDATE WorkTimeDay SET source = 'manual' WHERE taskId = ${taskId} AND dateISO = ${dateISO} AND source = 'auto'`;
    await recordJournalChange({ dateISO, taskId });
  }
  return removed > 0;
}

/** Refresh only derived hours. Caller must use the same transaction as the source edit. */
export async function recalculateAutomaticTime(db: DB, dateISO: string) {
  const automatic = await automaticTimeState(db, dateISO);
  if (!automatic) return null;
  const excluded = await db.$queryRaw<Array<{ included: number }>>`SELECT included FROM JournalTaskSelection WHERE dateISO = ${dateISO} AND taskId = ${automatic.taskId}`;
  if (excluded[0]?.included === 0) {
    await disableAutomaticTime(db, automatic.taskId, dateISO);
    return null;
  }
  const totals = await db.$queryRaw<Array<{ hours: number }>>`SELECT COALESCE(SUM(d.hours), 0) AS hours FROM DailyJournalDetail d JOIN Task t ON t.id = d.taskId LEFT JOIN JournalTaskSelection s ON s.dateISO = d.dateISO AND s.taskId = d.taskId WHERE d.dateISO = ${dateISO} AND d.taskId <> ${automatic.taskId} AND (s.included IS NULL OR s.included <> 0)`;
  // Keep subtraction stable without rounding another task's entered hours away.
  const hours = Math.max(0, Math.round((8 - Number(totals[0]?.hours ?? 0)) * 1e9) / 1e9);
  const current = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO, taskId: automatic.taskId } }, select: { hours: true } });
  const metadata = await db.$queryRaw<Array<{ source: string; seconds: number }>>`SELECT source, seconds FROM WorkTimeDay WHERE taskId = ${automatic.taskId} AND dateISO = ${dateISO}`;
  if (current?.hours !== hours || metadata[0]?.source !== "auto" || metadata[0]?.seconds !== hours * 3600) {
    await db.dailyJournalDetail.upsert({ where: { dateISO_taskId: { dateISO, taskId: automatic.taskId } }, create: { dateISO, taskId: automatic.taskId, hours }, update: { hours } });
    await db.$executeRaw`INSERT INTO WorkTimeDay (taskId, dateISO, source, seconds) VALUES (${automatic.taskId}, ${dateISO}, 'auto', ${hours * 3600}) ON CONFLICT(taskId,dateISO) DO UPDATE SET source = excluded.source, seconds = excluded.seconds`;
    await recordJournalChange({ dateISO, taskId: automatic.taskId });
  }
  return { ...automatic, hours };
}

export async function setAutomaticTime(db: DB, taskId: string, dateISO: string, enabled: boolean) {
  if (!await db.task.findUnique({ where: { id: taskId }, select: { id: true } })) throw new Error("업무가 없습니다.");
  const current = await automaticTimeState(db, dateISO);
  if (enabled) {
    if (current && current.taskId !== taskId) throw new Error(`${dateISO}에는 ‘${current.taskName}’ 업무가 자동으로 설정되어 있습니다. 해당 업무의 자동 설정을 먼저 해제해주세요.`);
    await db.$executeRaw`INSERT OR IGNORE INTO WorkTimeAuto (dateISO, taskId) VALUES (${dateISO}, ${taskId})`;
    // Choosing automatic time explicitly adds this task, including a previously excluded task.
    await db.$executeRaw`INSERT INTO JournalTaskSelection (dateISO, taskId, included) VALUES (${dateISO}, ${taskId}, 1) ON CONFLICT(dateISO,taskId) DO UPDATE SET included = 1`;
    await recalculateAutomaticTime(db, dateISO);
    await recordJournalChange({ dateISO, taskId });
  } else {
    await disableAutomaticTime(db, taskId, dateISO);
  }
}
