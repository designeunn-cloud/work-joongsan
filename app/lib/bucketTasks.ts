import type { TaskStatus } from "./statusConfig";

export type BucketKey = "overdue" | "today" | "tomorrow" | "upcoming";

export const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue: "지연됨",
  today: "오늘",
  tomorrow: "내일",
  upcoming: "예정",
};

interface TaskLike {
  startDate: string | null;
  status: TaskStatus;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysLate(startDateISO: string | null, now: Date = new Date()): number {
  if (!startDateISO) return 0;
  const diff = startOfDay(now) - startOfDay(new Date(startDateISO));
  return Math.round(diff / 86400000);
}

export function bucketTasks<T extends TaskLike>(tasks: T[], now: Date = new Date()): Record<BucketKey, T[]> {
  const todayKey = startOfDay(now);
  const tomorrowKey = todayKey + 86400000;

  const buckets: Record<BucketKey, T[]> = { overdue: [], today: [], tomorrow: [], upcoming: [] };

  for (const task of tasks) {
    if (task.status === "done") continue;
    if (!task.startDate) { buckets.upcoming.push(task); continue; }
    const dayKey = startOfDay(new Date(task.startDate));
    if (dayKey < todayKey) buckets.overdue.push(task);
    else if (dayKey === todayKey) buckets.today.push(task);
    else if (dayKey === tomorrowKey) buckets.tomorrow.push(task);
    else buckets.upcoming.push(task);
  }

  const byStartDateAsc = (a: T, b: T) => (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity);
  buckets.overdue.sort(byStartDateAsc);
  buckets.today.sort(byStartDateAsc);
  buckets.tomorrow.sort(byStartDateAsc);
  buckets.upcoming.sort(byStartDateAsc);

  return buckets;
}
