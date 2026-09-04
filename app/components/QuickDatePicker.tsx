"use client";

import { toISODate } from "@/lib/dateHelpers";

const ICON_PROPS = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function shiftDays(base: string | null, delta: number): string {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** -1/오늘/+1 퀵버튼 + 달력 아이콘(클릭하면 네이티브 날짜 선택). 값이 없으면 날짜 텍스트는 선택 전까지 안 보인다. */
export default function QuickDatePicker({
  valueISO,
  onChange,
}: {
  valueISO: string | null;
  onChange: (iso: string) => void;
}) {
  // Prisma DateTime은 "2026-09-03T00:00:00.000Z" 같은 전체 ISO 문자열로 오므로,
  // <input type="date">가 요구하는 "yyyy-MM-dd" 형식으로 항상 잘라서 쓴다.
  const dateOnly = valueISO ? valueISO.slice(0, 10) : null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(shiftDays(dateOnly, -1))}
        className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100 shrink-0"
      >
        -1
      </button>
      <button
        type="button"
        onClick={() => onChange(toISODate(new Date()))}
        className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100 shrink-0"
      >
        오늘
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftDays(dateOnly, 1))}
        className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100 shrink-0"
      >
        +1
      </button>
      <div className="relative shrink-0">
        <div className="flex items-center gap-1 text-xs px-1.5 py-1 rounded-lg border border-neutral-300 text-neutral-500 whitespace-nowrap">
          <CalendarIcon />
          {dateOnly && <span>{dateOnly.slice(5).replace("-", "/")}</span>}
        </div>
        <input
          type="date"
          value={dateOnly ?? ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="날짜"
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
