export type TaskStatus = "planned" | "in_progress" | "review" | "done";

// Keep persisted keys compatible: planned = 대기, review = 보류.
export const STATUS_ORDER: TaskStatus[] = ["planned", "in_progress", "done", "review"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  planned: "대기",
  in_progress: "진행중",
  review: "보류",
  done: "완료",
};

export const STATUS_COLORS: Record<TaskStatus, { text: string; bg: string; border: string; dot: string }> = {
  planned: { text: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-400" },
  in_progress: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
  review: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  done: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
};
