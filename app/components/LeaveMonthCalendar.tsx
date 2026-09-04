"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Leave, LeaveType } from "@/lib/clientTypes";
import { isWeekend, toISODate } from "@/lib/dateHelpers";

const TYPE_OPTIONS: LeaveType[] = ["연차", "오전반차", "오후반차", "오전반반차", "오후반반차", "외부일정"];

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "연차": { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  "오전반차": { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  "오후반차": { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  "오전반반차": { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  "오후반반차": { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  "반반차": { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  "외부일정": { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
};

// 연차/외부일정만 여러 날짜로 드래그 확장 가능 (반차류는 항상 하루).
const RANGE_CAPABLE_TYPES = new Set<string>(["연차", "외부일정"]);

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const LANE_HEIGHT = 22;
const BARS_TOP_OFFSET = 26;

interface DayCell {
  dateISO: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  weekend: boolean;
}

interface Segment {
  leave: Leave;
  colStart: number;
  colEnd: number;
  isStartSegment: boolean;
  isEndSegment: boolean;
  lane: number;
}

interface DragState {
  leaveId: string;
  edge: "start" | "end";
  originStartISO: string;
  originEndISO: string;
  hoverISO: string;
}

type ContextMenuState =
  | { kind: "existing"; leaveId: string; currentType: LeaveType; x: number; y: number }
  | { kind: "create"; dateISO: string; x: number; y: number };

function buildWeeks(year: number, month: number): DayCell[][] {
  const first = new Date(year, month - 1, 1);
  const gridStart = new Date(year, month - 1, 1 - first.getDay());
  const weeks: DayCell[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        dateISO: toISODate(cursor),
        dayOfMonth: cursor.getDate(),
        inCurrentMonth: cursor.getMonth() === month - 1,
        weekend: isWeekend(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function computeSegmentsForWeek(week: DayCell[], leaves: Leave[], dragState: DragState | null): Segment[] {
  const weekStart = week[0].dateISO;
  const weekEnd = week[6].dateISO;
  const raw: Omit<Segment, "lane">[] = [];
  for (const leave of leaves) {
    let startISO = leave.startDate.slice(0, 10);
    let endISO = leave.endDate.slice(0, 10);
    if (dragState && dragState.leaveId === leave.id) {
      if (dragState.edge === "start") startISO = dragState.hoverISO;
      else endISO = dragState.hoverISO;
    }
    const overlapStart = startISO > weekStart ? startISO : weekStart;
    const overlapEnd = endISO < weekEnd ? endISO : weekEnd;
    if (overlapStart > overlapEnd) continue;
    const colStart = week.findIndex((c) => c.dateISO === overlapStart);
    const colEnd = week.findIndex((c) => c.dateISO === overlapEnd);
    if (colStart === -1 || colEnd === -1) continue;
    raw.push({
      leave,
      colStart,
      colEnd,
      isStartSegment: overlapStart === startISO,
      isEndSegment: overlapEnd === endISO,
    });
  }
  raw.sort((a, b) => a.colStart - b.colStart);
  const laneEnds: number[] = [];
  const segments: Segment[] = [];
  for (const seg of raw) {
    let lane = laneEnds.findIndex((end) => end < seg.colStart);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.colEnd);
    } else {
      laneEnds[lane] = seg.colEnd;
    }
    segments.push({ ...seg, lane });
  }
  return segments;
}

function leaveCoversDate(leaves: Leave[], dateISO: string): boolean {
  return leaves.some((l) => l.startDate.slice(0, 10) <= dateISO && dateISO <= l.endDate.slice(0, 10));
}

export default function LeaveMonthCalendar({
  year,
  month,
  leaves,
  onCreate,
  onResizeLeave,
  onChangeType,
  onDeleteLeave,
}: {
  year: number;
  month: number;
  leaves: Leave[];
  onCreate: (dateISO: string, type: LeaveType, memo: string) => void;
  onResizeLeave: (id: string, startISO: string, endISO: string) => void;
  onChangeType: (id: string, type: LeaveType) => void;
  onDeleteLeave: (id: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  // 더블클릭으로 외부일정을 등록할 때만 쓰는 메모 입력 칸 (연차 등록은 우클릭 메뉴에서 유형 선택만으로 즉시 등록됨).
  const [openExternalCell, setOpenExternalCell] = useState<string | null>(null);
  const [createInputValue, setCreateInputValue] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  function closeCreate() {
    setOpenExternalCell(null);
    setCreateInputValue("");
  }

  // 열려있는 등록 칸 바깥(다른 칸/영역)을 클릭하면 입력을 취소한다 (DateEditor.tsx와 동일한 pointerdown 바깥 클릭 감지 패턴).
  useEffect(() => {
    if (!openExternalCell) return;
    function handlePointerDown(e: PointerEvent) {
      const cell = (e.target as HTMLElement).closest("[data-date]") as HTMLElement | null;
      if (!cell || cell.dataset.date !== openExternalCell) closeCreate();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openExternalCell]);

  useEffect(() => {
    if (!contextMenu) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!dragState) return;
    function handlePointerMove(e: PointerEvent) {
      const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
        "[data-date]"
      ) as HTMLElement | null;
      if (!cell || cell.dataset.weekend === "true") return;
      const dateISO = cell.dataset.date!;
      setDragState((prev) => {
        if (!prev) return prev;
        if (prev.edge === "end" && dateISO < prev.originStartISO) return prev;
        if (prev.edge === "start" && dateISO > prev.originEndISO) return prev;
        return { ...prev, hoverISO: dateISO };
      });
    }
    function handlePointerUp() {
      setDragState((prev) => {
        if (prev) {
          const startISO = prev.edge === "start" ? prev.hoverISO : prev.originStartISO;
          const endISO = prev.edge === "end" ? prev.hoverISO : prev.originEndISO;
          onResizeLeave(prev.leaveId, startISO, endISO);
        }
        return null;
      });
    }
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, onResizeLeave]);

  function startResize(e: React.PointerEvent, leave: Leave, edge: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setDragState({
      leaveId: leave.id,
      edge,
      originStartISO: leave.startDate.slice(0, 10),
      originEndISO: leave.endDate.slice(0, 10),
      hoverISO: edge === "start" ? leave.startDate.slice(0, 10) : leave.endDate.slice(0, 10),
    });
  }

  function openContextMenu(e: React.MouseEvent, leave: Leave) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ kind: "existing", leaveId: leave.id, currentType: leave.type, x: e.clientX, y: e.clientY });
  }

  function openCreateMenu(e: React.MouseEvent, dateISO: string) {
    e.preventDefault();
    setContextMenu({ kind: "create", dateISO, x: e.clientX, y: e.clientY });
  }

  return (
    <div className="select-none">
      <p className="text-xs text-neutral-400 mb-2">
        우클릭: 유형 선택해서 등록 · 더블클릭: 외부일정 등록(메모) · 가장자리 드래그: 기간 조정
      </p>
      <div className="grid grid-cols-7 text-center text-xs text-neutral-400 mb-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="flex flex-col gap-px bg-neutral-200 rounded-lg overflow-hidden border border-neutral-200">
        {weeks.map((week, wi) => {
          const segments = computeSegmentsForWeek(week, leaves, dragState);
          const laneCount = segments.length > 0 ? Math.max(...segments.map((s) => s.lane + 1)) : 0;
          return (
            <div
              key={wi}
              className="grid grid-cols-7 relative bg-white"
              style={{ minHeight: BARS_TOP_OFFSET + Math.max(laneCount, 1) * LANE_HEIGHT + 4 }}
            >
              {week.map((cell) => {
                const covered = leaveCoversDate(leaves, cell.dateISO);
                const isOpen = openExternalCell === cell.dateISO;
                const eligible = !cell.weekend && cell.inCurrentMonth && !covered && !isOpen;
                return (
                  <div
                    key={cell.dateISO}
                    data-date={cell.dateISO}
                    data-weekend={cell.weekend ? "true" : "false"}
                    onContextMenu={eligible ? (e) => openCreateMenu(e, cell.dateISO) : undefined}
                    onDoubleClick={eligible ? () => setOpenExternalCell(cell.dateISO) : undefined}
                    className={`relative px-1.5 pt-1 pb-1 border-r border-b border-neutral-100 last:border-r-0 ${
                      cell.weekend ? "bg-neutral-50" : "bg-white"
                    } ${eligible ? "cursor-pointer hover:bg-indigo-50/40" : ""}`}
                  >
                    <span
                      className={`text-xs ${
                        !cell.inCurrentMonth
                          ? "text-neutral-300"
                          : cell.weekend
                          ? "text-neutral-300"
                          : "text-neutral-500"
                      }`}
                    >
                      {cell.dayOfMonth}
                    </span>
                    {isOpen && (
                      <input
                        autoFocus
                        value={createInputValue}
                        onChange={(e) => setCreateInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onCreate(cell.dateISO, "외부일정", createInputValue.trim());
                            closeCreate();
                          } else if (e.key === "Escape") {
                            closeCreate();
                          }
                        }}
                        placeholder="외부일정 메모(선택) 후 Enter"
                        className="mt-1 w-full text-xs border border-indigo-300 rounded px-1 py-0.5 outline-none"
                      />
                    )}
                  </div>
                );
              })}

              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: BARS_TOP_OFFSET }}>
                {segments.map((seg) => {
                  const colors = TYPE_COLORS[seg.leave.type] ?? TYPE_COLORS["연차"];
                  const label = [seg.leave.type, seg.leave.memo].filter(Boolean).join(" · ");
                  const rangeLabel =
                    seg.leave.startDate.slice(0, 10) === seg.leave.endDate.slice(0, 10)
                      ? seg.leave.startDate.slice(0, 10)
                      : `${seg.leave.startDate.slice(0, 10)} ~ ${seg.leave.endDate.slice(0, 10)}`;
                  return (
                    <div
                      key={`${seg.leave.id}-${seg.colStart}`}
                      title={`${rangeLabel} · ${seg.leave.days}일${seg.leave.memo ? ` · ${seg.leave.memo}` : ""}`}
                      onContextMenu={(e) => openContextMenu(e, seg.leave)}
                      className={`absolute h-[18px] flex items-center px-1.5 text-[11px] truncate border pointer-events-auto ${colors.bg} ${colors.text} ${colors.border} ${
                        seg.isStartSegment ? "rounded-l" : ""
                      } ${seg.isEndSegment ? "rounded-r" : ""}`}
                      style={{
                        left: `${(seg.colStart / 7) * 100}%`,
                        width: `${((seg.colEnd - seg.colStart + 1) / 7) * 100}%`,
                        top: seg.lane * LANE_HEIGHT,
                      }}
                    >
                      {RANGE_CAPABLE_TYPES.has(seg.leave.type) && seg.isStartSegment && (
                        <div
                          onPointerDown={(e) => startResize(e, seg.leave, "start")}
                          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize"
                        />
                      )}
                      <span className="truncate">{label}</span>
                      {RANGE_CAPABLE_TYPES.has(seg.leave.type) && seg.isEndSegment && (
                        <div
                          onPointerDown={(e) => startResize(e, seg.leave, "end")}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu && contextMenu.kind === "existing" && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 50 }}
          className="bg-white border border-neutral-200 rounded-lg shadow-md py-1 w-32 text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => {
                onChangeType(contextMenu.leaveId, t);
                setContextMenu(null);
              }}
              className={`w-full text-left px-3 py-1.5 hover:bg-neutral-100 ${
                t === contextMenu.currentType ? "font-semibold text-indigo-600" : "text-neutral-700"
              }`}
            >
              {t}
            </button>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <button
            onClick={() => {
              if (confirm("이 휴가 기록을 삭제할까요?")) onDeleteLeave(contextMenu.leaveId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      )}

      {contextMenu && contextMenu.kind === "create" && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 50 }}
          className="bg-white border border-neutral-200 rounded-lg shadow-md py-1 w-32 text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => {
                onCreate(contextMenu.dateISO, t, "");
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 text-neutral-700"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
