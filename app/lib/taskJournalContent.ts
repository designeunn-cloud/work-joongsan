import type { Prisma } from "@prisma/client";
import { journalToday } from "./journalMemoSync";
import { reviewCarryNotes } from "./reviewCarryNotes";
import { dailyNoteText, recordsStatusComments, visibleStatusNotes } from "./statusComments";

export async function taskJournalContent(db: Pick<Prisma.TransactionClient, "dailyJournalDetail">, tasks: Parameters<typeof reviewCarryNotes>[1], dateISO = journalToday()) {
  const ids = tasks.map(task => task.id);
  const details = ids.length ? await db.dailyJournalDetail.findMany({
    where: { dateISO, taskId: { in: ids } }, select: { taskId: true, content: true, notes: true },
  }) : [];
  const byTask = new Map(details.map(detail => [detail.taskId, detail]));
  const carry = await reviewCarryNotes(db, tasks, dateISO);
  return new Map(tasks.map(task => {
    const detail = byTask.get(task.id);
    const notes = dailyNoteText(detail?.notes, carry.has(task.id));
    return [task.id, { todayWorkContent: detail?.content ?? null, todayWorkDate: dateISO,
      todayNotes: visibleStatusNotes(notes, recordsStatusComments(task)) }];
  }));
}
