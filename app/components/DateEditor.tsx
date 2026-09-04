"use client";

import { useEffect, useRef } from "react";
import { formatRelativeDate, formatAbsoluteDate } from "@/lib/relativeDate";
import { toISODate } from "@/lib/dateHelpers";

export default function DateEditor({
  label,
  valueISO,
  onChange,
  emphasize,
  className,
  open,
  onToggle,
}: {
  label: string;
  valueISO: string | null;
  onChange: (iso: string) => void;
  /** 마감일처럼 기한이 지나면 강조 표시할 때 true */
  emphasize?: boolean;
  className?: string;
  /** 프리셋 팝오버가 열려있는지 (부모가 제어 — 시작일/종료일/마감일 중 하나만 열리게 하기 위함) */
  open: boolean;
  onToggle: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onToggle]);

  function set(iso: string) {
    onChange(iso);
    onToggle();
  }

  /** 현재 값 기준으로 하루씩 증감 (팝오버는 열어둔 채로 — 연속 클릭 가능) */
  function step(deltaDays: number) {
    const base = valueISO ? new Date(valueISO) : new Date();
    base.setDate(base.getDate() + deltaDays);
    onChange(toISODate(base));
  }

  function resetToToday() {
    onChange(toISODate(new Date()));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={onToggle}
        title={valueISO ? formatAbsoluteDate(valueISO) : undefined}
        className={`text-xs underline decoration-dotted ${
          emphasize ? "text-red-600 font-medium hover:text-red-700" : "text-neutral-400 hover:text-neutral-600"
        } ${className ?? ""}`}
      >
        {label} {valueISO ? formatRelativeDate(valueISO) : "미설정"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex items-center gap-1 flex-nowrap whitespace-nowrap bg-white border border-neutral-200 rounded-lg shadow-md p-1.5">

          <button
            onClick={() => step(-1)}
            title="현재 날짜에서 하루 빼기"
            className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
          >
            -1
          </button>
          <button
            onClick={resetToToday}
            className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
          >
            오늘
          </button>
          <button
            onClick={() => step(1)}
            title="현재 날짜에서 하루 더하기"
            className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
          >
            +1
          </button>
          <input
            type="date"
            defaultValue={valueISO ? toISODate(new Date(valueISO)) : toISODate(new Date())}
            onChange={(e) => e.target.value && set(e.target.value)}
            className="text-xs border border-neutral-300 rounded-lg px-1 py-0.5"
          />
        </div>
      )}
    </div>
  );
}
