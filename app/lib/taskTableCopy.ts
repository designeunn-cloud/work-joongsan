import type { Task } from "./clientTypes";
import { getTaskDeadline } from "./taskDeadline";

export type TableDateBasis = "startDate" | "requestDate" | "completedAt";
export type TablePeriodMode = "month" | "quarter";
export type TaskCopyFormat = "title" | "title_product";

type PeriodTask = Pick<Task, "status" | "startDate" | "requestDate" | "completedAt" | "endDate"> & Partial<Pick<Task, "dueDate">>;
const seoulDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
});

export function getSeoulDateParts(value: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = seoulDateFormatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")!.value),
    month: Number(parts.find((part) => part.type === "month")!.value),
  };
}

export function getTaskPeriodDate(task: PeriodTask, basis: TableDateBasis) {
  if (basis === "completedAt") return task.status === "done" ? task.completedAt ?? task.endDate : null;
  if (basis === "requestDate") return getTaskDeadline(task);
  return task[basis];
}

export function matchesTaskPeriod(task: PeriodTask, filters: {
  basis: TableDateBasis; mode: TablePeriodMode;
  year: number | "all"; month: number | "all"; quarter: number | "all";
}) {
  const parts = getSeoulDateParts(getTaskPeriodDate(task, filters.basis));
  if (!parts) return filters.basis === "startDate" && task.startDate === null && filters.year === "all"
    && (filters.mode === "quarter" ? filters.quarter === "all" : filters.month === "all");
  if (filters.year !== "all" && parts.year !== filters.year) return false;
  if (filters.mode === "quarter") return filters.quarter === "all" || Math.ceil(parts.month / 3) === filters.quarter;
  return filters.month === "all" || parts.month === filters.month;
}

/** 화면에 표시된 순서를 유지하며 업무 하나를 한 줄(엑셀 한 셀)로 복사한다. */
export function buildTaskCopyText(tasks: Array<Pick<Task, "requestContent" | "productName">>, format: TaskCopyFormat) {
  const oneLine = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
  return tasks.map((task) => {
    const title = oneLine(task.requestContent);
    const product = oneLine(task.productName);
    return format === "title_product" && product ? `${title} · ${product}` : title;
  }).join("\n");
}
