import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
export const REVIEW_WORKFLOW_POLICY = "review-v1";

/** A deployment cutoff is stored once; existing task rows are never migrated. */
export async function getReviewWorkflowCutoff(db: Database = prisma): Promise<Date | null> {
  let rows: Array<{ activatedAt: string }>;
  try {
    rows = await db.$queryRaw<Array<{ activatedAt: string }>>`SELECT activatedAt FROM TaskWorkflowPolicy WHERE name = ${REVIEW_WORKFLOW_POLICY}`;
  } catch (error) {
    // Old installations can run before the additive migration is applied.
    // Other database failures must remain visible instead of silently changing policy.
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*(?:main\.)?TaskWorkflowPolicy\b/i.test(message)) return null;
    throw error;
  }
  if (!rows[0]) return null;
  const cutoff = new Date(rows[0].activatedAt);
  if (!Number.isFinite(cutoff.getTime())) throw new Error("검토 업무 적용 시점이 올바르지 않습니다.");
  return cutoff;
}

export function usesReviewWorkflow(task: { createdAt: Date | string }, cutoff: Date | null): boolean {
  if (!cutoff) return false;
  const createdAt = new Date(task.createdAt).getTime();
  return Number.isFinite(createdAt) && createdAt >= cutoff.getTime();
}

export async function withReviewWorkflow<T extends { createdAt: Date | string }>(
  tasks: readonly T[], db: Database = prisma,
): Promise<Array<T & { reviewWorkflow: boolean }>> {
  const cutoff = await getReviewWorkflowCutoff(db);
  return tasks.map(task => ({ ...task, reviewWorkflow: usesReviewWorkflow(task, cutoff) }));
}
