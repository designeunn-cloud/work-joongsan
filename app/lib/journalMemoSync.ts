import type { Prisma } from "@prisma/client";

export function journalToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Seed only the registration day's note, including tasks created from imported files. */
export function withInitialDailyNotes<T extends object>(data: T) {
  const memo = "memo" in data ? data.memo : null;
  return typeof memo === "string" && memo.trim()
    ? { ...data, journalDetails: { create: { dateISO: journalToday(), notes: memo } } }
    : data;
}

/** A task memo edit updates today's notes only; other dates remain independent. */
export async function syncMemoToToday(tx: Prisma.TransactionClient, taskId: string, next: string, today = journalToday()) {
  await tx.dailyJournalDetail.upsert({ where: { dateISO_taskId: { dateISO: today, taskId } }, create: { dateISO: today, taskId, notes: next }, update: { notes: next } });
}

/** Append only this day's comment, preserving independently edited journal notes. */
export async function appendCommentToJournal(tx: Prisma.TransactionClient, taskId: string, comment: string, dateISO: string,
  append = (notes: string | null | undefined, text: string) => [notes?.trim(), text].filter(Boolean).join("\n")) {
  const where = { dateISO_taskId: { dateISO, taskId } };
  const detail = await tx.dailyJournalDetail.findUnique({ where });
  const notes = append(detail?.notes, comment);
  await tx.dailyJournalDetail.upsert({ where, create: { dateISO, taskId, notes }, update: { notes } });
}
