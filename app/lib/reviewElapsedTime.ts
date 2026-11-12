import type { Prisma } from "@prisma/client";

export type ReviewElapsedEvent = {
  id: string;
  field: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date | string;
};

export type ReviewElapsedTime = {
  available: boolean;
  seconds: number;
  totalSeconds: number;
  startedAt: string | null;
  reviewedAt: string | null;
  reason?: string;
};

function unavailable(reason: string, values: Partial<ReviewElapsedTime> = {}): ReviewElapsedTime {
  return { available: false, seconds: 0, totalSeconds: 0, startedAt: null, reviewedAt: null, ...values, reason };
}

/** The latest completed work/review interval, intersected with a Korean calendar day. */
export function calculateReviewElapsedTime(
  events: readonly ReviewElapsedEvent[], dateISO: string, now = new Date(),
): ReviewElapsedTime {
  const calendar = new Date(`${dateISO}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !Number.isFinite(calendar.getTime())
    || calendar.toISOString().slice(0, 10) !== dateISO) return unavailable("날짜를 확인해주세요.");

  const history = events.filter(event => event.toStatus && event.field !== "statusComment")
    .map(event => ({ ...event, time: new Date(event.createdAt).getTime() }))
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const reviewIndex = history.findLastIndex(event => event.fromStatus === "in_progress" && event.toStatus === "submitted");
  if (reviewIndex < 0) return unavailable("진행중에서 검토로 변경한 기록이 없습니다.");
  const review = history[reviewIndex];
  if (!Number.isFinite(review.time) || review.time > now.getTime()) {
    return unavailable("검토 상태의 변경 시각을 확인해주세요.");
  }

  let start: (typeof history)[number] | undefined;
  for (let index = reviewIndex - 1; index >= 0; index--) {
    const event = history[index];
    if (event.fromStatus === event.toStatus && event.field !== "workStartReset" && event.field !== "workStart") continue;
    // Do not borrow a start from an earlier cycle when a transition is missing.
    if (event.toStatus !== "in_progress") break;
    start = event;
    break;
  }
  if (!start || !Number.isFinite(start.time) || start.time >= review.time) {
    return unavailable("검토 이전의 진행 시작 기록을 확인해주세요.", { reviewedAt: new Date(review.time).toISOString() });
  }

  const totalSeconds = (review.time - start.time) / 1000;
  const dayStart = new Date(`${dateISO}T00:00:00+09:00`).getTime();
  const seconds = Math.max(0, (Math.min(review.time, dayStart + 86_400_000) - Math.max(start.time, dayStart)) / 1000);
  const interval = { totalSeconds, startedAt: new Date(start.time).toISOString(), reviewedAt: new Date(review.time).toISOString() };
  return seconds > 0
    ? { available: true, seconds, ...interval }
    : unavailable("선택한 날짜에는 이 구간의 시간이 없습니다.", interval);
}

/** A preview only: no work-time values, timers, task states or journals are changed. */
export async function getReviewElapsedTime(
  db: Pick<Prisma.TransactionClient, "activityLog">, taskId: string, dateISO: string, now = new Date(),
): Promise<ReviewElapsedTime> {
  const events = await db.activityLog.findMany({
    where: { taskId, toStatus: { not: null } },
    select: { id: true, field: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return calculateReviewElapsedTime(events, dateISO, now);
}
