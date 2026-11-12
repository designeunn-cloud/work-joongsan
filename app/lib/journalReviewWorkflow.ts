import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getReviewWorkflowCutoff, usesReviewWorkflow } from "./reviewWorkflowServer";

type ReviewTask = {
  id: string;
  status: string;
  createdAt: Date | string;
  reviewDate?: Date | string | null;
  completedAt?: Date | string | null;
  statusChangedAt?: Date | string | null;
};
type StatusEvent = {
  taskId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date;
};

/** Journal dates always mean midnight through 23:59:59.999 in Korea. */
export function reviewJournalDayRange(dateISO: string): { start: Date; end: Date } {
  const start = new Date(`${dateISO}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
}

function time(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function stateAt(task: ReviewTask, events: readonly StatusEvent[], end: Date) {
  const endTime = end.getTime();
  const past = events.filter(event => event.createdAt.getTime() <= endTime);
  const last = past.at(-1);
  if (last?.toStatus) {
    const closure = last.toStatus === "done"
      ? past.findLast(event => event.toStatus === "done" && event.fromStatus !== "done")
      : null;
    return { status: last.toStatus, changedAt: closure?.createdAt ?? last.createdAt };
  }
  // A later change still tells us which state existed before that change.
  const initial = events[0]?.fromStatus;
  if (initial) return { status: initial, changedAt: null };
  if (events.length) return { status: "planned", changedAt: null };
  // Defensive fallback for an imported task without status history.
  const completed = time(task.completedAt);
  if (completed !== null && completed <= endTime) return { status: "done", changedAt: new Date(completed) };
  const changed = time(task.statusChangedAt);
  if (changed !== null && changed <= endTime) return { status: task.status, changedAt: new Date(changed) };
  const reviewed = time(task.reviewDate);
  return { status: reviewed !== null && reviewed <= endTime ? "submitted" : "planned", changedAt: null };
}

async function statusEvents(taskIds: string[], db: Prisma.TransactionClient) {
  if (!taskIds.length) return new Map<string, StatusEvent[]>();
  const events = await db.activityLog.findMany({
    where: { taskId: { in: taskIds }, toStatus: { not: null } },
    select: { taskId: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const byTask = new Map<string, StatusEvent[]>();
  for (const event of events) {
    if (event.taskId) {
      const entries = byTask.get(event.taskId) ?? [];
      entries.push(event);
      byTask.set(event.taskId, entries);
    }
  }
  return byTask;
}

/** Only newly created, already reviewed work carries forward until final closure. */
export async function reviewedJournalTaskIds(
  dateISO: string, db: Prisma.TransactionClient = prisma,
): Promise<string[]> {
  const cutoff = await getReviewWorkflowCutoff(db);
  if (!cutoff) return [];
  const { start, end } = reviewJournalDayRange(dateISO);
  const tasks = await db.task.findMany({
    where: { createdAt: { gte: cutoff, lte: end }, reviewDate: { lte: end } },
    select: { id: true, status: true, createdAt: true, reviewDate: true, completedAt: true, statusChangedAt: true },
  });
  const byTask = await statusEvents(tasks.map(task => task.id), db);
  return tasks.filter(task => {
    const state = stateAt(task, byTask.get(task.id) ?? [], end);
    return state.status !== "done" || (state.changedAt !== null && state.changedAt >= start);
  }).map(task => task.id);
}

/** Historical journal rows use that day's status; legacy task values are untouched. */
export async function withJournalReviewState<T extends ReviewTask>(
  tasks: readonly T[], dateISO: string, db: Prisma.TransactionClient = prisma,
): Promise<Array<T & { reviewWorkflow: boolean }>> {
  const cutoff = await getReviewWorkflowCutoff(db);
  const current = tasks.filter(task => usesReviewWorkflow(task, cutoff));
  const byTask = await statusEvents(current.map(task => task.id), db);
  const { end } = reviewJournalDayRange(dateISO);
  return tasks.map(task => usesReviewWorkflow(task, cutoff)
    ? { ...task, status: stateAt(task, byTask.get(task.id) ?? [], end).status, reviewWorkflow: true }
    : { ...task, reviewWorkflow: false });
}
