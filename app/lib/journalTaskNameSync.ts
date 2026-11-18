import type { Prisma } from "@prisma/client";
import { journalWorkTitle, replaceJournalTitle } from "./journalTable";
import { recordJournalChange } from "./journalChangeTracker";

type NamedTask = { id: string; requestContent: string; productName?: string | null };

/** Runs inside the task update transaction so every screen sees one saved name. */
export async function syncTaskNameToJournals(tx: Prisma.TransactionClient, before: NamedTask, next: NamedTask) {
  if (before.requestContent === next.requestContent) return;
  const details = await tx.dailyJournalDetail.findMany({ where: { taskId: before.id } });
  const entries = await tx.dailyJournalEntry.findMany({
    where: { taskId: before.id }, select: { dailyJournal: { select: { dateISO: true } } },
  });
  const selections = await tx.$queryRaw<Array<{ dateISO: string }>>`SELECT dateISO FROM JournalTaskSelection WHERE taskId = ${before.id} AND included > 0`;
  const title = journalWorkTitle(next);
  const previous = [before.requestContent, journalWorkTitle(before)];
  for (const detail of details) {
    if (detail.content === null) continue;
    const content = replaceJournalTitle(detail.content, previous, title);
    if (content !== detail.content) await tx.dailyJournalDetail.update({ where: { id: detail.id }, data: { content } });
  }
  const dates = new Set([...details.map(detail => detail.dateISO), ...entries.map(entry => entry.dailyJournal.dateISO), ...selections.map(selection => selection.dateISO)]);
  for (const dateISO of dates) await recordJournalChange({ dateISO });
}
