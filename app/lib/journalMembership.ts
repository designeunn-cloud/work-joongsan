import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { recordJournalChange } from "./journalChangeTracker";
// included: 0 = excluded, 1 = manually added, 2 = activity recorded on this date.
export type JournalSelection = { taskId: string; included: number };
export async function journalSelections(dateISO: string, db: Prisma.TransactionClient = prisma) {
  return db.$queryRaw<JournalSelection[]>`SELECT taskId, included FROM JournalTaskSelection WHERE dateISO = ${dateISO}`;
}
export async function setJournalSelection(dateISO: string, taskId: string, included: boolean, db: Prisma.TransactionClient = prisma) {
  await db.$executeRaw`INSERT INTO JournalTaskSelection (dateISO, taskId, included) VALUES (${dateISO}, ${taskId}, ${included ? 1 : 0}) ON CONFLICT(dateISO, taskId) DO UPDATE SET included = excluded.included`;
  await recordJournalChange({ dateISO });
}
