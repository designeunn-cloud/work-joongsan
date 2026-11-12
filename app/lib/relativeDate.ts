const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 오늘을 기준으로 지난 날짜는 -N, 남은 날짜는 +N으로 표시한다. */
export function formatDateOffset(iso: string, now: Date = new Date()): string {
  const dayDiff = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86400000);
  if (!Number.isFinite(dayDiff)) return "미설정";
  return dayDiff === 0 ? "오늘" : dayDiff > 0 ? `+${dayDiff}` : String(dayDiff);
}

function mondayOfWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

/**
 * "내일", "다음주 월요일", "저번주 금요일" 같은 상대 날짜 라벨을 만든다.
 * 지지난주보다 더 멀거나 다다음주보다 더 먼 날짜는 절대 날짜(M월 d일)로 폴백한다.
 */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const dayDiff = Math.round((startOfDay(target) - startOfDay(now)) / 86400000);

  if (dayDiff === 0) return "오늘";
  if (dayDiff === 1) return "내일";
  if (dayDiff === 2) return "모레";
  if (dayDiff === -1) return "어제";
  if (dayDiff === -2) return "그제";

  const weekDiff = Math.round((mondayOfWeek(target) - mondayOfWeek(now)) / (7 * 86400000));
  const weekdayLabel = `${WEEKDAY_LABELS[target.getDay()]}요일`;

  if (weekDiff === 0) return `이번주 ${weekdayLabel}`;
  if (weekDiff === 1) return `다음주 ${weekdayLabel}`;
  if (weekDiff === -1) return `저번주 ${weekdayLabel}`;

  return target.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR");
}
