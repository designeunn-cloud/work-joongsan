import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { toISODate } from "./dateHelpers";
import { reviewedJournalTaskIds } from "./journalReviewWorkflow";

function dayRangeFor(dateISO: string): { start: Date; end: Date } {
  const [y, m, d] = dateISO.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Registered or worked on this date; unfinished status alone does not imply work. */
async function eligibleTaskIdsForDate(dateISO: string, db: Prisma.TransactionClient = prisma): Promise<string[]> {
  const { start, end } = dayRangeFor(dateISO);
  const activity = await db.activityLog.findMany({
    where: { createdAt: { gte: start, lte: end }, taskId: { not: null }, field: { in: [
      "status", "workStart", "workStartReset", "statusComment", "subtasks", "memo", "productionType",
      "requestContent", "projectId", "department", "requestDate", "dueDate", "endDate",
    ] } },
    select: { taskId: true },
  });
  const worked = new Set(activity.map(item => item.taskId));
  const candidates = await db.task.findMany({
    where: { createdAt: { lte: end } },
    select: { id: true, createdAt: true, completedAt: true },
  });
  const recorded = candidates
    .filter((t) => {
      if (t.completedAt && t.completedAt >= start && t.completedAt <= end) return true;
      return t.createdAt >= start || worked.has(t.id);
    })
    .map((t) => t.id);
  return [...new Set([...recorded, ...await reviewedJournalTaskIds(dateISO, db)])];
}

/**
 * 지난 날짜의 목록을 고정한다. 기존 목록은 보존하고, 당일 완료했지만 누락된 업무만 보충한다.
 * ("오늘"과 미래는 아직 확정된 게 아니므로 여기서 다루지 않는다 — livePreviewTaskIds 참고)
 */
export async function finalizeDay(dateISO: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const exists = await tx.dailyJournal.findUnique({
      where: { dateISO },
      include: { entries: { select: { taskId: true } } },
    });
    if (exists) {
      const { start, end } = dayRangeFor(dateISO);
      const completed = await tx.task.findMany({
        where: { createdAt: { lte: end }, completedAt: { gte: start, lte: end } },
        select: { id: true },
      });
      const recorded = new Set(exists.entries.map((entry) => entry.taskId));
      const reviewed = await reviewedJournalTaskIds(dateISO, tx);
      const missing = [...new Set([...completed.map(task => task.id), ...reviewed])]
        .filter(taskId => !recorded.has(taskId));
      if (missing.length) {
        await tx.dailyJournal.update({
          where: { id: exists.id },
          data: { entries: { create: missing.map((taskId) => ({ taskId })) } },
        });
      }
      return;
    }
    const taskIds = await eligibleTaskIdsForDate(dateISO, tx);
    await tx.dailyJournal.create({
      data: { dateISO, entries: { create: taskIds.map((taskId) => ({ taskId })) } },
    });
  });
}

/**
 * 아직 고정되지 않은 지난 날짜들을 전부 고정한다(오늘은 제외 — 오늘은 하루가 끝나야 고정된다).
 * 워쳐가 상시 실행되며 주기적으로 호출해서, 자정이 지나 새 날짜가 시작되면 어제치를 자동으로 고정한다.
 */
export async function finalizePastDays(now: Date = new Date()): Promise<void> {
  const todayISO = toISODate(now);
  const latest = await prisma.dailyJournal.findFirst({ orderBy: { dateISO: "desc" } });
  // 이 기능이 처음 도입된 경우엔 그 이전 과거까지 소급하지 않고 어제부터 시작한다.
  let cursor = latest ? addDaysISO(latest.dateISO, 1) : addDaysISO(todayISO, -1);
  while (cursor < todayISO) {
    await finalizeDay(cursor);
    cursor = addDaysISO(cursor, 1);
  }
}

/**
 * 아직 끝나지 않은 날짜(오늘 또는 미래)의 실시간 목록 — 저장하지 않고 매번 새로 계산한다.
 * 등록 시각과 요일에 관계없이 당일 등록·완료 업무를 포함한다.
 */
export async function livePreviewTaskIds(dateISO: string): Promise<string[]> {
  return eligibleTaskIdsForDate(dateISO);
}
