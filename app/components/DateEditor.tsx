"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatRelativeDate, formatAbsoluteDate, formatDateOffset } from "@/lib/relativeDate";
import { toISODate } from "@/lib/dateHelpers";

export default function DateEditor({
  label,
  valueISO,
  onChange,
  emphasize,
  className,
  open,
  onToggle,
  clearable = false,
  displayMode = "relative",
  hideLabel = false,
  portal = false,
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
  /** 값이 있을 때 날짜 삭제 버튼을 표시한다. 필수 날짜에는 사용하지 않는다. */
  clearable?: boolean;
  displayMode?: "relative" | "absolute" | "short" | "offset";
  /** 카드의 요약 줄에서는 날짜만 보이고 필드 이름은 접근성 이름으로 유지한다. */
  hideLabel?: boolean;
  /** 스크롤되는 표 안에서도 날짜 선택창이 잘리지 않도록 별도 레이어에 표시한다. */
  portal?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onToggle]);

  useEffect(() => {
    if (!open || !portal) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect(), panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.left, innerWidth - panel.width - 8)),
        top: Math.max(8, anchor.bottom + 4 + panel.height <= innerHeight - 8 ? anchor.bottom + 4 : anchor.top - panel.height - 4),
      });
    };
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, portal]);

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

  const popover = open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={`${label.replace(/[\[\]]/g, "")} 날짜 수정`}
          style={portal ? { left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden", maxWidth: "calc(100vw - 16px)" } : undefined}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onToggle(); triggerRef.current?.focus(); } }}
          className={`${portal ? "fixed z-[95] flex-wrap" : "absolute left-0 top-full z-20 mt-1 flex-nowrap"} flex items-center gap-1 whitespace-nowrap bg-white border border-neutral-200 rounded-lg shadow-md p-1.5`}>

          <button type="button" onClick={() => step(-1)} title="현재 날짜에서 하루 빼기" className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100">-1</button>
          <button type="button" onClick={resetToToday} className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100">오늘</button>
          <button type="button" onClick={() => step(1)} title="현재 날짜에서 하루 더하기" className="text-xs w-9 text-center py-0.5 rounded-lg border border-neutral-300 hover:bg-neutral-100">+1</button>
          <input type="date" aria-label={label ? `${label.replace(/[\[\]]/g, "")} 날짜 선택` : "날짜 선택"}
            defaultValue={valueISO ? toISODate(new Date(valueISO)) : ""} onChange={(e) => e.target.value && set(e.target.value)}
            className="text-xs border border-neutral-300 rounded-lg px-1 py-0.5" />
          {clearable && valueISO && <button type="button" onClick={() => set("")} title="날짜 삭제" aria-label={label ? `${label.replace(/[\[\]]/g, "")} 날짜 삭제` : "날짜 삭제"}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m2 0-1 14H7L6 6" /></svg>
          </button>}
        </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={event => {
          if (portal) { setPortalTarget(event.currentTarget.closest('[role="dialog"][aria-modal="true"]') ?? document.body); setPosition(null); }
          onToggle();
        }}
        title={valueISO ? formatAbsoluteDate(valueISO) : undefined}
        className={`text-xs underline decoration-dotted ${
          emphasize ? "text-red-600 font-medium hover:text-red-700" : "text-neutral-400 hover:text-neutral-600"
        } ${className ?? ""}`}
      >
        {hideLabel && !valueISO ? label : <><span className={hideLabel ? "sr-only" : undefined}>{label} </span>{valueISO ? displayMode === "offset" ? formatDateOffset(valueISO) : displayMode === "short" ? valueISO.slice(5, 10).replace("-", ".") : displayMode === "absolute" ? formatAbsoluteDate(valueISO) : formatRelativeDate(valueISO) : "미설정"}</>}
      </button>
      {portal ? portalTarget && createPortal(popover, portalTarget) : popover}
    </div>
  );
}
