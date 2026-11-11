type CompletionDate = string | Date | null | undefined;

export type CompletionSortableTask = {
  id: string;
  completedAt?: CompletionDate;
  endDate?: CompletionDate;
  statusChangedAt?: CompletionDate;
  createdAt?: CompletionDate;
};

function timestamp(value: CompletionDate): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Keep the completion date used by Kanban, falling back only when it is unavailable. */
export function completionSortTime(task: CompletionSortableTask): number | null {
  return timestamp(task.completedAt) ?? timestamp(task.endDate) ?? timestamp(task.statusChangedAt);
}

function newestFirst(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** Missing dates stay last; registration and ID make equal completion times stable. */
export function compareCompletedNewest(a: CompletionSortableTask, b: CompletionSortableTask): number {
  return newestFirst(completionSortTime(a), completionSortTime(b))
    || newestFirst(timestamp(a.createdAt), timestamp(b.createdAt))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
