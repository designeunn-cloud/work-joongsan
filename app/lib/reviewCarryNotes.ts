import type { Prisma } from "@prisma/client";
import { isReviewPendingLine, recordsStatusComments } from "./statusComments";
import { koreaDate } from "./workTime";

type ReviewTask = {
  id: string; status: string; requestContent?: string; project?: { name?: string | null } | null;
  statusChangedAt?: Date | string | null; reviewDate?: Date | string | null;
};

/** Only carry the pending label that was recorded during this particular review. */
export async function reviewCarryNotes(db: Pick<Prisma.TransactionClient, "dailyJournalDetail">, tasks: readonly ReviewTask[], dateISO: string) {
  const starts = new Map<string, string>();
  for (const task of tasks) {
    const start = task.statusChangedAt ?? task.reviewDate;
    if (task.status !== "submitted" || !start || !recordsStatusComments(task)) continue;
    const day = koreaDate(new Date(start));
    if (day < dateISO) starts.set(task.id, day);
  }
  const carry = new Set<string>();
  if (!starts.size) return carry;
  const previous = await db.dailyJournalDetail.findMany({
    where: { taskId: { in: [...starts.keys()] }, dateISO: { gte: [...starts.values()].sort()[0], lt: dateISO }, notes: { contains: "담당자 확인중" } },
    select: { taskId: true, dateISO: true, notes: true },
  });
  for (const row of previous) {
    if (row.dateISO >= starts.get(row.taskId)! && row.notes?.split(/\r?\n/).some(isReviewPendingLine)) carry.add(row.taskId);
  }
  return carry;
}
