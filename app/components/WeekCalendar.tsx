"use client";

import { useState } from "react";
import { baseName } from "@/lib/ruleBasedInterpret";
import { toISODate, thisWeekMonday } from "@/lib/dateHelpers";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData } from "@/lib/clientTypes";
import TaskCard, { type DateField } from "./TaskCard";

export default function WeekCalendar({
  tasks,
  master,
  onUpdateStatus,
  onOpenFolder,
  onUpdateDate,
  onUpdateContent,
  onEdit,
  onDelete,
  onCreateFollowUp,
  onJumpToTask,
  onSubtasksChanged,
}: {
  tasks: Task[];
  master: MasterData;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onOpenFolder: (id: string) => void;
  onUpdateDate: (id: string, field: DateField, iso: string) => void;
  onUpdateContent: (id: string, content: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onCreateFollowUp?: (task: Task) => void;
  onJumpToTask?: (taskId: string) => void;
  onSubtasksChanged?: () => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const todayISO = toISODate(new Date());
  const expandedTask = tasks.find((t) => t.id === expandedId) ?? null;

  const monday = new Date(thisWeekMonday());
  monday.setDate(monday.getDate() + weekOffset * 7);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const labels = ["월", "화", "수", "목", "금"];
  const rangeLabel = `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 – ${days[4].getMonth() + 1}월 ${days[4].getDate()}일`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setWeekOffset((v) => v - 1);
              setExpandedId(null);
            }}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="이전주"
          >
            ◀
          </button>
          <span className="text-sm font-semibold text-neutral-700">{rangeLabel}</span>
          <button
            onClick={() => {
              setWeekOffset((v) => v + 1);
              setExpandedId(null);
            }}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="다음주"
          >
            ▶
          </button>
        </div>
        {weekOffset !== 0 && (
          <button
            onClick={() => {
              setWeekOffset(0);
              setExpandedId(null);
            }}
            className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
          >
            이번주로
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {days.map((day, i) => {
          const dayISO = toISODate(day);
          const isToday = dayISO === todayISO;
          const dayTasks = tasks.filter((t) => toISODate(new Date(t.startDate)) === dayISO);
          return (
            <div
              key={i}
              className={`min-w-0 rounded-xl border ${
                isToday ? "border-indigo-300 bg-indigo-50/40" : "border-neutral-200 bg-neutral-50/60"
              }`}
            >
              <div
                className={`flex items-baseline gap-1.5 px-2.5 py-2 border-b ${
                  isToday ? "border-indigo-200" : "border-neutral-200"
                }`}
              >
                <span className={`text-sm font-semibold ${isToday ? "text-indigo-600" : "text-neutral-700"}`}>
                  {labels[i]}
                </span>
                <span className={`text-xs ${isToday ? "text-indigo-500" : "text-neutral-400"}`}>
                  {day.getMonth() + 1}/{day.getDate()}
                </span>
              </div>
              <ul className="space-y-1.5 p-2 min-h-[80px]">
                {dayTasks.map((t) => (
                  <CalendarTaskChip
                    key={t.id}
                    task={t}
                    selected={expandedId === t.id}
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  />
                ))}
                {dayTasks.length === 0 && <li className="text-xs text-neutral-300 text-center py-4">없음</li>}
              </ul>
            </div>
          );
        })}
      </div>
      {expandedTask && (
        <ul className="mt-3">
          <TaskCard
            task={expandedTask}
            master={master}
            showOverdueBadge={false}
            onUpdateStatus={onUpdateStatus}
            onOpenFolder={onOpenFolder}
            onUpdateDate={onUpdateDate}
            onUpdateContent={onUpdateContent}
            onEdit={onEdit}
            onDelete={onDelete}
            onCreateFollowUp={onCreateFollowUp}
            onJumpToTask={onJumpToTask}
            onSubtasksChanged={onSubtasksChanged}
          />
        </ul>
      )}
    </div>
  );
}

function CalendarTaskChip({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  const done = task.status === "done";
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border transition-colors ${
          selected
            ? "border-indigo-400 bg-indigo-50"
            : done
            ? "border-neutral-200 bg-white text-neutral-400"
            : "border-neutral-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        <div className={`font-medium truncate ${done ? "line-through" : "text-neutral-800"}`}>{task.requestContent}</div>
        <div className="text-neutral-400 truncate">{baseName(task.assignee)}</div>
      </button>
    </li>
  );
}
