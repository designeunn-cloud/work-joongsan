import { isWeekend } from "@/lib/dateHelpers";

// 연차(하루~여러 날 범위)를 제외한 나머지 유형은 항상 하루 단위이고 차감 일수가 고정돼 있다.
const FIXED_DAY_VALUES: Record<string, number> = {
  "오전반차": 0.4,
  "오후반차": 0.4,
  "오전반반차": 0.2,
  "오후반반차": 0.2,
  "반반차": 0.2,
};

function businessDaysBetweenInclusive(startISO: string, endISO: string): number {
  const cursor = new Date(startISO);
  const end = new Date(endISO);
  let count = 0;
  while (cursor.getTime() <= end.getTime()) {
    if (!isWeekend(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** 등록/수정 시 실제 저장할 종료일(ISO)과 차감 일수를 계산한다. */
export function computeLeaveDays(startDateISO: string, endDateISO: string | undefined, type: string) {
  const fixedDays = FIXED_DAY_VALUES[type];
  const isSingleDay = fixedDays !== undefined;
  const endISO = isSingleDay ? startDateISO : endDateISO || startDateISO;
  const days = isSingleDay ? fixedDays : businessDaysBetweenInclusive(startDateISO, endISO);
  return { endISO, days };
}
