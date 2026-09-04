"use client";

import { useEffect, useRef, useState } from "react";
import { thisWeekMonday, toISODate, compareByDueDateUrgentFirst } from "@/lib/dateHelpers";
import { baseName } from "@/lib/ruleBasedInterpret";
import { STATUS_COLORS } from "@/lib/statusConfig";
import type { Task, Leave } from "@/lib/clientTypes";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]; // Date.getDay() 인덱스용

/** 같은 날짜에 세부할일 마커가 여러 개 몰렸을 때 옆으로 밀어주는 간격(px). 마커 점 자체가
 * w-3(12px)이라 이보다 좁으면 점끼리 겹쳐서 뒤에 있는 마커를 클릭/호버할 수 없게 된다. */
const MARKER_SLOT_PX = 14;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

/**
 * 주말을 뺀 "영업일" 인덱스로 변환한다(0 = monday). monday는 항상 월요일이라 그 자체가 평일이다.
 * 주말 날짜가 들어오면(정상적으로는 거의 없음) 탐색 방향상 가장 가까운 평일 인덱스에 자연히
 * 스냅된다 — 표시 위치 계산용일 뿐 실제 저장된 날짜는 바꾸지 않는다.
 */
function businessDayIndex(date: Date, monday: Date): number {
  const cursor = new Date(monday);
  let idx = 0;
  const target = startOfDay(date);
  if (target > startOfDay(cursor)) {
    while (startOfDay(cursor) < target) {
      cursor.setDate(cursor.getDate() + 1);
      if (!isWeekend(cursor)) idx++;
    }
  } else if (target < startOfDay(cursor)) {
    while (startOfDay(cursor) > target) {
      cursor.setDate(cursor.getDate() - 1);
      if (!isWeekend(cursor)) idx--;
    }
  }
  return idx;
}

/** 월요일 기준 영업일 인덱스(음수/6 이상도 포함)를 실제 날짜로 되돌린다. */
function businessIndexToDate(idx: number, monday: Date): Date {
  const cursor = new Date(monday);
  let remaining = idx;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) remaining--;
  }
  while (remaining < 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (!isWeekend(cursor)) remaining++;
  }
  return cursor;
}

function dayIndex(iso: string, monday: Date): number {
  return businessDayIndex(new Date(iso), monday);
}

function clampIdx(i: number): number {
  return Math.max(0, Math.min(6, i));
}

interface SubtaskMarker {
  id: string;
  idx: number;
  done: boolean;
  content: string;
}

/** 같은 영업일 칸에 여러 마커가 몰리면 옆으로 살짝씩 밀어 겹치지 않게 한다. */
function layoutMarkers(markers: SubtaskMarker[]): Array<SubtaskMarker & { slot: number }> {
  const counts = new Map<number, number>();
  return markers.map((m) => {
    const slot = counts.get(m.idx) ?? 0;
    counts.set(m.idx, slot + 1);
    return { ...m, slot };
  });
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  mode: DragMode;
  startClientX: number;
  origStart: number;
  origEnd: number;
  liveStart: number;
  liveEnd: number;
}

function GanttBar({
  task,
  monday,
  startIdx,
  endIdx,
  dueIdx,
  subtaskMarkers,
  onCommit,
  onToggleSubtask,
}: {
  task: Task;
  monday: Date;
  startIdx: number;
  endIdx: number;
  /** 이번 주(0~6) 범위를 벗어나도(마감일이 훨씬 뒤라도) 원래 인덱스 그대로 넘어온다. */
  dueIdx: number | null;
  /** 이번 주 안에 마감일이 있는 세부할일들 (범위 밖은 아예 전달되지 않음). */
  subtaskMarkers: SubtaskMarker[];
  onCommit: (taskId: string, startISO: string, endISO: string) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** 행(막대/오버레이/마커 점 전체)에 마우스가 올라와 있는지. 팝업은 이게 true일 때만 보인다 —
   * 호버 미리보기와 클릭 순환이 서로 다른 항목을 가리켜 말풍선이 두 개 뜨는 걸 막기 위해,
   * "무엇을 보여줄지"는 오직 cycleId 하나로만 정하고 이건 "보이냐 마느냐"만 담당한다. */
  const [isHovering, setIsHovering] = useState(false);
  /** 반복 클릭하면 미완료 세부할일을 순서대로 하나씩 짚어서 보여주기 위한 포인터. 마감일이 없어서
   * 캘린더 상 위치가 없는 세부할일도 순환 대상에 포함되므로, 배열 인덱스가 아니라 id로 추적한다. */
  const [cycleId, setCycleId] = useState<string | null>(null);
  /** 막대를 실제로 드래그해서 날짜가 바뀐 직후엔, 뒤이어 브라우저가 쏘는 click 이벤트가 세부할일
   * 순환까지 같이 발동시키지 않도록 막는 플래그. */
  const draggedRef = useRef(false);

  const liveStart = drag ? drag.liveStart : startIdx;
  const liveEnd = drag ? drag.liveEnd : endIdx;
  const clampedStart = clampIdx(liveStart);
  const clampedEnd = clampIdx(liveEnd);
  const colors = STATUS_COLORS[task.status];

  // 마감일이 이번 주 범위 안이면 그 위치에, 범위 밖(더 뒤)이면 차트 마지막 칸에 마름모를 둔다
  // — 이번 주 화면만 봐도 "이 업무에 마감일이 있다"는 걸 알 수 있게 하기 위함.
  const dueWithinWeek = dueIdx !== null && dueIdx >= 0 && dueIdx <= 6;
  const dueBeyondWeek = dueIdx !== null && dueIdx > 6;
  const dueMarkerIdx = dueWithinWeek ? dueIdx : dueBeyondWeek ? 6 : null;
  // 종료일 다음 칸부터 마감일(또는 이번 주 끝)까지 연한 색으로 채워서 마감일까지 남은 기간을 보여준다.
  const showExtension = dueIdx !== null && dueIdx > clampedEnd;
  const extensionEndIdx = dueBeyondWeek ? 6 : dueIdx;

  function idxToISO(idx: number): string {
    return toISODate(businessIndexToDate(idx, monday));
  }

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    e.preventDefault();
    draggedRef.current = false;
    setDrag({ mode, startClientX: e.clientX, origStart: startIdx, origEnd: endIdx, liveStart: startIdx, liveEnd: endIdx });
  }

  useEffect(() => {
    if (!drag) return;
    const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;
    const pxPerDay = trackWidth / 7;
    const { startClientX, mode, origStart, origEnd } = drag;

    function onMove(e: PointerEvent) {
      const deltaDays = Math.round((e.clientX - startClientX) / pxPerDay);
      setDrag((d) => {
        if (!d) return d;
        if (mode === "move") return { ...d, liveStart: origStart + deltaDays, liveEnd: origEnd + deltaDays };
        if (mode === "resize-start") return { ...d, liveStart: Math.min(origStart + deltaDays, origEnd) };
        return { ...d, liveEnd: Math.max(origEnd + deltaDays, origStart) };
      });
    }

    function onUp() {
      setDrag((d) => {
        const moved = !!d && (d.liveStart !== d.origStart || d.liveEnd !== d.origEnd);
        draggedRef.current = moved;
        // 실제로 움직이지 않은 단순 클릭이면(세부할일 순환 클릭 등) 굳이 같은 날짜로 재저장하지 않는다.
        if (moved) onCommit(task.id, idxToISO(d!.liveStart), idxToISO(d!.liveEnd));
        return null;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.mode, drag?.startClientX]);

  const showStartHandle = startIdx >= 0 && startIdx <= 6;
  const showEndHandle = endIdx >= 0 && endIdx <= 6;

  const laidOutMarkers = layoutMarkers(subtaskMarkers);

  // 클릭 순환은 "마감일이 있어서 이번 주에 점으로 찍힌 것"뿐 아니라, 마감일이 아예 없어서 캘린더
  // 상 위치를 못 잡는 미완료 세부할일까지 포함한다 — task.subtasks 원래 순서를 그대로 따른다.
  const pendingSubtasks = task.subtasks.filter((s) => !s.done);
  const undatedPending = pendingSubtasks.filter((s) => !s.dueDate);
  const hasCycleTargets = pendingSubtasks.length > 0;
  // 아직 한 번도 클릭 안 했으면 목록 첫 미완료 항목을 기본으로 보여준다 — "표시할 항목"은
  // 항상 이 하나로만 결정하고, 보이냐 마느냐만 isHovering이 담당한다(팝업이 두 개 뜨지 않게).
  const activeId = cycleId ?? pendingSubtasks[0]?.id ?? null;

  function handleRowMouseEnter() {
    setIsHovering(true);
  }

  function handleRowMouseLeave() {
    setIsHovering(false);
  }

  function handleRowClick() {
    // 막대를 드래그해서 날짜를 옮긴 직후에 뒤따라오는 click은 순환에서 제외한다.
    if (draggedRef.current) return;
    // 완료 여부를 바꾸는 게 아니라, 미완료 세부할일들을 순서대로 하나씩 짚어서 보여준다.
    // 정확한 점을 클릭했을 땐(마커 자체의 onClick) 그쪽이 우선 처리되고 여긴 안 탄다.
    if (pendingSubtasks.length === 0) return;
    const pos = pendingSubtasks.findIndex((s) => s.id === activeId);
    const nextPos = pos === -1 ? 0 : (pos + 1) % pendingSubtasks.length;
    setCycleId(pendingSubtasks[nextPos].id);
  }

  return (
    <div
      ref={trackRef}
      className="relative py-3 border-b border-neutral-100"
      style={{ gridColumn: "2 / span 7" }}
      onMouseEnter={hasCycleTargets ? handleRowMouseEnter : undefined}
      onMouseLeave={hasCycleTargets ? handleRowMouseLeave : undefined}
    >
      {/* 이번 주 5일 / 다음 주 2일 경계선 */}
      <div className="absolute inset-y-0 border-l border-neutral-100 pointer-events-none" style={{ left: `${(5 / 7) * 100}%` }} />
      {hasCycleTargets && <div className="absolute inset-0 cursor-pointer" onClick={handleRowClick} />}
      <div
        onPointerDown={(e) => beginDrag("move", e)}
        onClick={hasCycleTargets ? handleRowClick : undefined}
        className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${colors.dot} opacity-70 cursor-grab active:cursor-grabbing select-none`}
        style={{
          left: `${(clampedStart / 7) * 100}%`,
          width: `${((clampedEnd - clampedStart + 1) / 7) * 100}%`,
          touchAction: "none",
        }}
        title={`${baseName(task.assignee)} · ${task.requestContent}`}
      >
        {showStartHandle && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag("resize-start", e);
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-4 cursor-ew-resize"
            style={{ touchAction: "none" }}
          />
        )}
        {showEndHandle && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag("resize-end", e);
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-4 cursor-ew-resize"
            style={{ touchAction: "none" }}
          />
        )}
      </div>
      {showExtension && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${colors.dot} opacity-25 pointer-events-none`}
          style={{
            left: `${((clampedEnd + 1) / 7) * 100}%`,
            width: `${((extensionEndIdx! - clampedEnd) / 7) * 100}%`,
          }}
        />
      )}
      {dueMarkerIdx !== null && (
        <div
          className="absolute top-1/2 w-2 h-2 rotate-45 bg-red-500 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
          style={{ left: `${((dueMarkerIdx + 1) / 7) * 100}%` }}
          title={dueBeyondWeek ? "마감일이 이번 주 이후에 있음" : "마감일"}
        />
      )}
      {laidOutMarkers.map((m, i) => (
        <div
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSubtask(m.id, !m.done);
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center cursor-pointer z-10"
          style={{ left: `calc(${((m.idx + 0.5) / 7) * 100}% + ${m.slot * MARKER_SLOT_PX}px)`, top: "calc(50% + 9px)" }}
        >
          <span
            className={`block w-1.5 h-1.5 rounded-full ${
              m.done ? "bg-neutral-400 opacity-40" : "bg-neutral-300 border border-neutral-400"
            }`}
          />
          {isHovering && activeId === m.id && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg pointer-events-none">
              {task.requestContent} · {m.content}
              {m.done ? " (완료)" : ""}
            </div>
          )}
        </div>
      ))}
      {/* 마감일이 없어서 캘린더 상 위치가 없는 세부할일이 순환으로 짚혔을 때는, 막대 시작점 위에
          고정으로 툴팁을 띄운다 — 날짜가 없으니 점(마커) 자체는 그릴 곳이 없다. */}
      {(() => {
        if (!isHovering) return null;
        const undatedTarget = undatedPending.find((s) => s.id === activeId);
        if (!undatedTarget) return null;
        return (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
            style={{ left: `${(clampedStart / 7) * 100}%`, top: "calc(50% + 9px)" }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg">
              {task.requestContent} · {undatedTarget.content} (마감일 없음)
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function GanttChart({
  tasks,
  leaves,
  onUpdateRange,
  onEditLeave,
  onToggleSubtask,
}: {
  tasks: Task[];
  leaves: Leave[];
  onUpdateRange: (id: string, startISO: string, endISO: string) => void;
  onEditLeave: (leave: Leave) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = new Date(thisWeekMonday());
  monday.setDate(monday.getDate() + weekOffset * 7);
  // 주말은 건너뛰고 이번 주 월~금(5일) + 다음 주 월~화(2일), 총 7 영업일을 보여준다.
  const days = Array.from({ length: 7 }, (_, i) => businessIndexToDate(i, monday));
  const todayISO = toISODate(new Date());
  const rangeLabel = `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 – ${days[6].getMonth() + 1}월 ${days[6].getDate()}일`;

  const rows = tasks
    .filter((t) => t.status !== "done")
    .map((t) => {
      const startIdx = dayIndex(t.startDate, monday);
      const endIdx = dayIndex(t.endDate ?? t.startDate, monday);
      const dueIdx = t.dueDate ? dayIndex(t.dueDate, monday) : null;
      const barVisible = startIdx <= 6 && endIdx >= 0;
      const dueVisible = dueIdx !== null && dueIdx >= 0 && dueIdx <= 6;
      const subtaskMarkers: SubtaskMarker[] = t.subtasks
        .filter((s) => s.dueDate)
        .map((s) => ({ id: s.id, idx: dayIndex(s.dueDate!, monday), done: s.done, content: s.content }))
        .filter((m) => m.idx >= 0 && m.idx <= 6);
      if (!barVisible && !dueVisible && subtaskMarkers.length === 0) return null;
      // 마감일이 이번 주 범위 밖(더 뒤)이어도 null로 지우지 않고 그대로 넘긴다 — GanttBar가
      // "이번 주엔 안 보이지만 마감일이 있다"는 걸 차트 마지막 칸에 표시할 수 있게 하기 위함.
      return { task: t, startIdx, endIdx, dueIdx, subtaskMarkers };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => compareByDueDateUrgentFirst(a.task, b.task));

  // 이번 주(영업일 7칸)에 걸치는 휴가만 골라서 "내 휴가" 행 하나로 보여준다. 없으면 행 자체를 숨긴다.
  const leaveSegments = leaves
    .map((l) => {
      const startIdx = dayIndex(l.startDate, monday);
      const endIdx = dayIndex(l.endDate, monday);
      if (startIdx > 6 || endIdx < 0) return null;
      return { leave: l, startIdx: clampIdx(startIdx), endIdx: clampIdx(endIdx) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-700">간트차트 (주간)</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="이전주"
          >
            ◀
          </button>
          <span className="text-sm font-semibold text-neutral-700">{rangeLabel}</span>
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="다음주"
          >
            ▶
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            >
              이번주로
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2 text-xs text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 rounded-full bg-blue-400" /> 시작일~종료일 (드래그로 조정)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rotate-45 bg-red-500" /> 마감일
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 rounded-full bg-blue-400 opacity-25" /> 마감일까지 남은 기간
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 rounded-full bg-pink-300" /> 내 휴가
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300 border border-neutral-400" /> 세부할일 미완료
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 opacity-40" /> 세부할일 완료
        </span>
      </div>

      <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-x-0 text-xs">
        <div />
        {days.map((d, i) => {
          const isToday = toISODate(d) === todayISO;
          return (
            <div
              key={i}
              className={`text-center py-1.5 border-b-2 font-medium ${
                isToday ? "border-indigo-400 text-indigo-600" : "border-neutral-200 text-neutral-500"
              } ${i === 5 ? "border-l border-l-neutral-200" : ""}`}
            >
              {WEEKDAY_LABELS[d.getDay()]} <span className="text-neutral-400">{d.getMonth() + 1}/{d.getDate()}</span>
            </div>
          );
        })}

        {leaveSegments.length > 0 && (
          <div className="contents">
            <div className="py-2 pr-2 truncate border-b border-neutral-100 font-medium text-pink-600">내 휴가</div>
            <div className="relative py-2 border-b border-neutral-100" style={{ gridColumn: "2 / span 7" }}>
              <div
                className="absolute inset-y-0 border-l border-neutral-100 pointer-events-none"
                style={{ left: `${(5 / 7) * 100}%` }}
              />
              {leaveSegments.map(({ leave, startIdx, endIdx }) => (
                <button
                  key={leave.id}
                  onClick={() => onEditLeave(leave)}
                  className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-pink-300 hover:bg-pink-400 cursor-pointer"
                  style={{ left: `${(startIdx / 7) * 100}%`, width: `${((endIdx - startIdx + 1) / 7) * 100}%` }}
                  title={`${leave.type}${leave.memo ? ` · ${leave.memo}` : ""} (클릭해서 수정)`}
                />
              ))}
            </div>
          </div>
        )}

        {rows.length === 0 && leaveSegments.length === 0 && (
          <div className="col-span-8 text-center text-neutral-300 py-6">이번 주에 표시할 업무가 없습니다.</div>
        )}

        {rows.map(({ task, startIdx, endIdx, dueIdx, subtaskMarkers }) => (
          <div key={task.id} className="contents">
            <div className="py-3 pr-2 truncate border-b border-neutral-100">
              <div className="font-medium text-neutral-700 truncate">{task.requestContent}</div>
              <div className="text-neutral-400 truncate">{baseName(task.assignee)}</div>
            </div>
            <GanttBar
              task={task}
              monday={monday}
              startIdx={startIdx}
              endIdx={endIdx}
              dueIdx={dueIdx}
              subtaskMarkers={subtaskMarkers}
              onCommit={onUpdateRange}
              onToggleSubtask={onToggleSubtask}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
