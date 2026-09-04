/** 마감일 미설정 항목을 맨 앞에, 나머지는 마감일이 가까운(급한) 순으로 정렬한다. */
export function compareByDueDateUrgentFirst(a: { dueDate: string | null }, b: { dueDate: string | null }): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return -1;
  if (!b.dueDate) return 1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function thisWeekMonday(from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

export function nextWeekMonday(from = new Date()): Date {
  const d = thisWeekMonday(from);
  d.setDate(d.getDate() + 7);
  return d;
}

export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/** 시작일에 영업일(주말 제외) n일을 더한다. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

/**
 * 부서별 기본 업무 소요기간으로 종료일(목표 완료일)을 계산한다.
 * 영업부: 당일(0일) / 무역부·무역팀: 영업일 5일(주말 제외) / 마케팅팀·마케팅부: 3주(21일).
 * 해당 없는 부서는 시작일과 동일하게 둔다.
 */
export function computeDefaultEndDate(startDate: Date, department: string | null | undefined): Date {
  if (department?.includes("영업")) return new Date(startDate);
  if (department?.includes("무역")) return addBusinessDays(startDate, 5);
  if (department?.includes("마케팅")) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 21);
    return d;
  }
  return new Date(startDate);
}
