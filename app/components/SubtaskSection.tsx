"use client";

import { useEffect, useState, useCallback } from "react";
import { formatRelativeDate, formatAbsoluteDate } from "@/lib/relativeDate";
import { toISODate } from "@/lib/dateHelpers";
import { daysLate } from "@/lib/bucketTasks";
import type { Task, MasterData, Subtask } from "@/lib/clientTypes";
import QuickDatePicker from "./QuickDatePicker";

function shiftDays(base: string | null, delta: number): string {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

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

export default function SubtaskSection({
  task,
  master,
  onSubtasksChanged,
}: {
  task: Task;
  master: MasterData;
  /** 세부할일이 추가/삭제/변경될 때 상위 업무 목록(간트차트 등)도 즉시 갱신하도록 알린다. */
  onSubtasksChanged?: () => void;
}) {
  void master;
  const [open, setOpen] = useState(() => task.subtasks.length > 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [dueDateISO, setDueDateISO] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks`);
    setSubtasks(await res.json());
    setLoaded(true);
  }, [task.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 펼칠 때 최초 1회 서버에서 세부할일 로드
    if (open && !loaded) load();
  }, [open, loaded, load]);

  async function toggleDone(subtask: Subtask) {
    await fetch(`/api/subtasks/${subtask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !subtask.done }),
    });
    load();
    onSubtasksChanged?.();
  }

  async function removeSubtask(id: string) {
    await fetch(`/api/subtasks/${id}`, { method: "DELETE" });
    load();
    onSubtasksChanged?.();
  }

  async function updateDueDate(id: string, dueDateISO: string) {
    await fetch(`/api/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDateISO }),
    });
    load();
    onSubtasksChanged?.();
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, dueDateISO: dueDateISO || undefined }),
    });
    setContent("");
    setDueDateISO("");
    setShowAddForm(false);
    load();
    onSubtasksChanged?.();
  }

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setOpen((v) => {
              const next = !v;
              // 펼칠 땐 입력 폼도 바로 보여주고, 접을 땐 같이 초기화한다.
              setShowAddForm(next);
              return next;
            });
          }}
          className="flex-1 text-left text-xs text-neutral-500 hover:text-neutral-800"
        >
          세부할일 {loaded ? `(${doneCount}/${subtasks.length})` : ""} {open ? "" : ""}
        </button>
        {!showAddForm && (
          <button
            onClick={() => {
              setOpen(true);
              setShowAddForm(true);
            }}
            aria-label="세부할일 추가"
            title="세부할일 추가"
            className="text-sm w-5 h-5 shrink-0 rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100 leading-none"
          >
            +
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5 bg-neutral-50 rounded-lg px-2.5 py-2">
          {showAddForm && (
            <form onSubmit={addSubtask} className="flex items-center gap-1 flex-wrap">
              <input
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="세부할일 내용"
                className="text-xs border border-neutral-300 rounded-lg px-2 py-1 flex-1 min-w-[80px]"
              />
              <QuickDatePicker valueISO={dueDateISO || null} onChange={setDueDateISO} />
            </form>
          )}

          {subtasks.map((s) => {
            // 마감일이 내일까지 남았거나 이미 지났으면(daysLate >= -1) 강조(빨간색) 표시한다.
            const dueSoonOrLate = !s.done && !!s.dueDate && daysLate(s.dueDate) >= -1;
            return (
            <div
              key={s.id}
              className="group/row ml-0.4 flex items-center gap-1.5 text-xs rounded-md -mx-1 px-1 py-1 hover:bg-white"
            >
              <div
                onClick={() => toggleDone(s)}
                className="group/name flex items-center gap-1 min-w-0 cursor-pointer"
              >
                <input type="checkbox" checked={s.done} readOnly className="shrink-0 pointer-events-none" />
                <span
                  className={
                    s.done
                      ? "line-through text-neutral-400"
                      : dueSoonOrLate
                      ? "text-red-600 font-medium"
                      : "text-neutral-700"
                  }
                >
                  {s.content}
                </span>
                {!s.done && s.dueDate && (
                  <span
                    className={`shrink-0 ${dueSoonOrLate ? "text-red-600 font-medium" : "text-neutral-400"}`}
                    title={formatAbsoluteDate(s.dueDate)}
                  >
                    · {formatRelativeDate(s.dueDate)}
                  </span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {s.done && s.completedAt ? (
                  <span className="text-emerald-600" title={formatAbsoluteDate(s.completedAt)}>
                    · 완료 {formatRelativeDate(s.completedAt)}
                  </span>
                ) : (
                  <div className="hidden group-hover/row:flex items-center gap-1">
                    <button
                      onClick={() => updateDueDate(s.id, shiftDays(s.dueDate, -1))}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => updateDueDate(s.id, toISODate(new Date()))}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
                    >
                      오늘
                    </button>
                    <button
                      onClick={() => updateDueDate(s.id, shiftDays(s.dueDate, 1))}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
                    >
                      +1
                    </button>
                    <div className="relative shrink-0 w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-600">
                      <CalendarIcon />
                      <input
                        type="date"
                        value={s.dueDate ? s.dueDate.slice(0, 10) : ""}
                        onChange={(e) => e.target.value && updateDueDate(s.id, e.target.value)}
                        aria-label="마감일"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => removeSubtask(s.id)}
                  aria-label="세부할일 삭제"
                  title="삭제"
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50 leading-none"
                >
                  −
                </button>
              </div>
            </div>
            );
          })}

          {loaded && subtasks.length === 0 && !showAddForm && (
            <p className="text-xs text-neutral-400 py-0.5">할일을 등록해주세요.</p>
          )}
        </div>
      )}
    </div>
  );
}
