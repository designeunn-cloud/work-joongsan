import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
export const REVIEW_WORKFLOW_POLICY = "review-v1";
export const REVIEW_WORKFLOW_TASK_PREFIX = "review-task:";
export const REVIEW_WORKFLOW_DELIVERY_PREFIX = "review-delivery:";

export type ReviewWorkflowSnapshot = {
  status: string;
  reviewDate: string | null;
  endDate: string | null;
  completedAt: string | null;
};
export type ReviewWorkflowPolicy = {
  cutoff: Date | null;
  taskStarts: Map<string, Date>;
  taskSnapshots: Map<string, ReviewWorkflowSnapshot>;
  confirmedDeliveries: Set<string>;
};
type WorkflowTask = { id?: string; createdAt: Date | string; reviewDate?: Date | string | null };
type PolicyRow = { name: string; activatedAt: string; legacySnapshot?: string | null };

function readSnapshot(json: string): ReviewWorkflowSnapshot {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("기존 업무 상태 기록이 올바르지 않습니다.");
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.status !== "string" || !snapshot.status
    || ["reviewDate", "endDate", "completedAt"].some(field => snapshot[field] !== null
      && (typeof snapshot[field] !== "string" || !Number.isFinite(new Date(snapshot[field] as string).getTime())))) {
    throw new Error("기존 업무 상태 기록이 올바르지 않습니다.");
  }
  return snapshot as ReviewWorkflowSnapshot;
}

/** Global registration cutoff and explicitly enrolled existing tasks share one additive policy table. */
export async function getReviewWorkflowPolicy(db: Database = prisma): Promise<ReviewWorkflowPolicy> {
  const policy: ReviewWorkflowPolicy = { cutoff: null, taskStarts: new Map(), taskSnapshots: new Map(), confirmedDeliveries: new Set() };
  let rows: PolicyRow[];
  try {
    try {
      rows = await db.$queryRaw<PolicyRow[]>`SELECT name, activatedAt, legacySnapshot FROM TaskWorkflowPolicy WHERE name = ${REVIEW_WORKFLOW_POLICY} OR name LIKE ${`${REVIEW_WORKFLOW_TASK_PREFIX}%`} OR name LIKE ${`${REVIEW_WORKFLOW_DELIVERY_PREFIX}%`}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such column:\s*(?:\w+\.)?legacySnapshot\b/i.test(message)) throw error;
      rows = await db.$queryRaw<PolicyRow[]>`SELECT name, activatedAt FROM TaskWorkflowPolicy WHERE name = ${REVIEW_WORKFLOW_POLICY} OR name LIKE ${`${REVIEW_WORKFLOW_TASK_PREFIX}%`} OR name LIKE ${`${REVIEW_WORKFLOW_DELIVERY_PREFIX}%`}`;
    }
  } catch (error) {
    // Old installations can run before the additive migration is applied.
    // Other database failures must remain visible instead of silently changing policy.
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*(?:main\.)?TaskWorkflowPolicy\b/i.test(message)) return policy;
    throw error;
  }
  for (const row of rows) {
    const activatedAt = new Date(row.activatedAt);
    if (!Number.isFinite(activatedAt.getTime())) throw new Error("검토 업무 적용 시점이 올바르지 않습니다.");
    if (row.name === REVIEW_WORKFLOW_POLICY) policy.cutoff = activatedAt;
    else if (row.name.startsWith(REVIEW_WORKFLOW_TASK_PREFIX)) {
      const taskId = row.name.slice(REVIEW_WORKFLOW_TASK_PREFIX.length);
      if (!taskId) throw new Error("검토 업무 적용 대상이 올바르지 않습니다.");
      policy.taskStarts.set(taskId, activatedAt);
      if (row.legacySnapshot) policy.taskSnapshots.set(taskId, readSnapshot(row.legacySnapshot));
    } else if (row.name.startsWith(REVIEW_WORKFLOW_DELIVERY_PREFIX)) {
      const taskId = row.name.slice(REVIEW_WORKFLOW_DELIVERY_PREFIX.length);
      if (!taskId) throw new Error("최초 전달일 확인 대상이 올바르지 않습니다.");
      policy.confirmedDeliveries.add(taskId);
    }
  }
  return policy;
}

export async function getReviewWorkflowCutoff(db: Database = prisma): Promise<Date | null> {
  return (await getReviewWorkflowPolicy(db)).cutoff;
}

export function usesReviewWorkflow(task: { createdAt: Date | string }, cutoff: Date | null): boolean {
  if (!cutoff) return false;
  const createdAt = new Date(task.createdAt).getTime();
  return Number.isFinite(createdAt) && createdAt >= cutoff.getTime();
}

export function getReviewWorkflowStart(task: WorkflowTask, policy: ReviewWorkflowPolicy): Date | null {
  const globalStart = usesReviewWorkflow(task, policy.cutoff) ? policy.cutoff : null;
  const taskStart = task.id ? policy.taskStarts.get(task.id) ?? null : null;
  if (!globalStart) return taskStart;
  return taskStart && taskStart.getTime() < globalStart.getTime() ? taskStart : globalStart;
}

/** A legacy hold date needs explicit delivery confirmation to count before enrollment. */
export function getReviewWorkflowFirstDate(task: WorkflowTask, policy: ReviewWorkflowPolicy): Date | null {
  if (!task.reviewDate) return null;
  const date = new Date(task.reviewDate);
  if (!Number.isFinite(date.getTime())) return null;
  const start = getReviewWorkflowStart(task, policy);
  if (start && !usesReviewWorkflow(task, policy.cutoff) && date.getTime() < start.getTime()
    && !(task.id && policy.confirmedDeliveries.has(task.id))) return null;
  return date;
}

export async function withReviewWorkflow<T extends WorkflowTask>(
  tasks: readonly T[], db: Database = prisma, asOf: Date = new Date(),
): Promise<Array<T & { reviewWorkflow: boolean }>> {
  const policy = await getReviewWorkflowPolicy(db);
  return tasks.map(task => {
    const start = getReviewWorkflowStart(task, policy);
    const reviewWorkflow = !!start && start.getTime() <= asOf.getTime();
    const staleReviewDate = reviewWorkflow && task.reviewDate && !getReviewWorkflowFirstDate(task, policy);
    return { ...task, reviewWorkflow, ...(staleReviewDate ? { reviewDate: null } : {}) };
  });
}
