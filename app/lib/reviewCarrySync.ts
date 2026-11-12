import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDailyJournal } from "./dailyJournal";
import { getGoogleSheetsJournalConfig } from "./googleSheetsJournal";
import { queueJournalChanges } from "./journalAutoSync";
import { journalToday } from "./journalMemoSync";
import { getReviewWorkflowPolicy, usesReviewWorkflow } from "./reviewWorkflowServer";

const marker = path.join(process.cwd(), ".journal-auto-sync", "review-carry-day.json");
type CarryTask = { createdAt: Date | string; status: string; reviewDate: Date | string | null; reviewWorkflow?: boolean };

export function hasReviewCarry(tasks: readonly CarryTask[], cutoff: Date | null) {
  return tasks.some(task => (task.reviewWorkflow ?? usesReviewWorkflow(task, cutoff)) && task.reviewDate && task.status !== "done");
}

/** An idle review day still needs one sync; this never adds manual membership. */
export async function queueReviewCarryDay(dateISO = journalToday()) {
  if (dateISO !== journalToday()) return;
  const policy = await getReviewWorkflowPolicy();
  if (!policy.cutoff && !policy.taskStarts.size) return;
  try {
    const previous = JSON.parse(await readFile(marker, "utf8")) as { dateISO?: string };
    if (previous.dateISO === dateISO) return;
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!await getGoogleSheetsJournalConfig()) return;
  const journal = await getDailyJournal(dateISO);
  if (!hasReviewCarry(journal.tasks, policy.cutoff)) return;
  await queueJournalChanges([{ dateISO }]);
  await mkdir(path.dirname(marker), { recursive: true });
  const temporary = `${marker}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ dateISO }));
  await rename(temporary, marker);
}
