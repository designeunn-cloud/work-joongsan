import type { TaskStatus } from "./statusConfig";

export const WORK_TYPE_LABELS = { initial: "최초 작업", revision: "추가 수정" } as const;
export type WorkType = keyof typeof WORK_TYPE_LABELS;

export function isWorkType(value: unknown): value is WorkType {
  return value === "initial" || value === "revision";
}

export function getDefaultWorkType(from: TaskStatus, current?: string | null): WorkType {
  if (from === "done") return "revision";
  return isWorkType(current) ? current : "initial";
}
