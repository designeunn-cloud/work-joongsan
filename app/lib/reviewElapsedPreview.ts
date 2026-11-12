export type ReviewElapsedPreview = {
  available: boolean;
  seconds: number;
  totalSeconds: number;
  startedAt: string | null;
  reviewedAt: string | null;
  reason?: string;
};

export async function getReviewElapsedPreview(taskId: string, date: string): Promise<ReviewElapsedPreview> {
  const query = new URLSearchParams({ taskId, date, includeReviewTime: "1" });
  const response = await fetch(`/api/work-time?${query}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "진행→검토 시간을 불러오지 못했습니다. 다시 시도해주세요.");
  const preview = result.reviewTime as ReviewElapsedPreview | undefined;
  if (!preview || typeof preview.available !== "boolean" || !Number.isFinite(preview.seconds)
    || preview.seconds < 0 || preview.seconds > 86400 || !Number.isFinite(preview.totalSeconds) || preview.totalSeconds < 0) {
    throw new Error("진행→검토 시간을 확인하지 못했습니다. 다시 시도해주세요.");
  }
  return preview;
}
