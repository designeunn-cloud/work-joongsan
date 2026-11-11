import type { Prisma } from "@prisma/client";

export function journalToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** A task memo edit updates today's notes only; other dates remain independent. */
export async function syncMemoToToday(tx: Prisma.TransactionClient, taskId: string, next: string, today = journalToday()) {
  await tx.dailyJournalDetail.upsert({ where: { dateISO_taskId: { dateISO: today, taskId } }, create: { dateISO: today, taskId, notes: next }, update: { notes: next } });
}

/** Append only this day's comment, preserving independently edited journal notes. */
export async function appendCommentToJournal(tx: Prisma.TransactionClient, taskId: string, comment: string, dateISO: string) {
  const where = { dateISO_taskId: { dateISO, taskId } };
  const detail = await tx.dailyJournalDetail.findUnique({ where });
  const notes = [detail?.notes?.trim(), comment].filter(Boolean).join("\n");
  await tx.dailyJournalDetail.upsert({ where, create: { dateISO, taskId, notes }, update: { notes } });
}
