export const SHIPPING_NOTICE_REQUEST = "배송지연공지";

export interface NoticeDate {
  raw: string;
  iso: string | null;
  inferredYear: boolean;
}

export function isValidDateISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function findShippingNoticeProject<T extends { name: string }>(projects: T[]): T | undefined {
  return projects.find((project) => ["배송지연공지", "배송공지지연"].includes(project.name.replace(/\s/g, "")));
}

/** 입고 날짜는 참고용으로만 해석한다. 업무의 요청일·마감일로 사용하지 않는다. */
export function parseShippingNotice(text: string, productCodes: string[], currentYear: number) {
  const dates: NoticeDate[] = [];
  const datePattern = /(?<!\d)(?:(\d{4})\s*(?:[./-]\s*|년\s*))?(\d{1,2})\s*(?:[./-]\s*|월\s*)(\d{1,2})\s*일?(?!\d)/g;
  const withoutDates = text.replace(datePattern, (raw: string, year: string | undefined, month: string, day: string) => {
    const iso = `${year ?? currentYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const value = isValidDateISO(iso) ? iso : null;
    if (!dates.some((date) => value ? date.iso === value : date.raw === raw.trim())) {
      dates.push({ raw: raw.trim(), iso: value, inferredYear: !year });
    }
    return " ";
  });

  const matches: Array<{ code: string; index: number; end: number }> = [];
  const canonicalCodes = new Map(productCodes.map((code) => [code.toUpperCase(), code]));
  // 등록된 품명은 한글 이름도 찾고, 모델 코드는 대소문자를 구분하지 않는다.
  for (const code of productCodes) {
    if (!code.trim()) continue;
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "gi");
    for (const match of withoutDates.matchAll(pattern)) matches.push({ code, index: match.index, end: match.index + match[0].length });
  }
  // 품명 목록에 없는 WSB4705, SC101 같은 코드도 후보로 보여주어 누락을 막는다.
  for (const match of withoutDates.matchAll(/(?<![a-z0-9])[a-z]{1,12}[-]?\d{2,8}[a-z0-9-]*(?![a-z0-9])/gi)) {
    const code = match[0].toUpperCase();
    matches.push({ code: canonicalCodes.get(code) ?? code, index: match.index, end: match.index + match[0].length });
  }
  matches.sort((a, b) => a.index - b.index || b.code.length - a.code.length);
  const nonOverlapping: typeof matches = [];
  for (const match of matches) {
    if (!nonOverlapping.some((existing) => match.index < existing.end && match.end > existing.index)) nonOverlapping.push(match);
  }
  const productNames = [...new Set(nonOverlapping.map((match) => match.code))];
  const unknownProductNames = productNames.filter((code) => !canonicalCodes.has(code.toUpperCase()));
  const needsDateConfirmation = dates.length !== 1 || dates.some((date) => !date.iso);
  return { productNames, unknownProductNames, dates, needsDateConfirmation };
}
