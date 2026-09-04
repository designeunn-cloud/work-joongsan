export type TaskStatus = "in_progress" | "review" | "done";

export const STATUS_ORDER: TaskStatus[] = ["in_progress", "review", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  in_progress: "진행중",
  review: "검토",
  done: "완료",
};

export const STATUS_COLORS: Record<TaskStatus, { text: string; bg: string; border: string; dot: string }> = {
  in_progress: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
  review: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  done: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
};
