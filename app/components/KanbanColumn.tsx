"use client";

import { useDroppable } from "@dnd-kit/core";
import { STATUS_LABELS, STATUS_COLORS, type TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData } from "@/lib/clientTypes";
import KanbanCard from "./KanbanCard";
import type { DateField } from "./TaskCard";

export default function KanbanColumn({
  status,
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
  status: TaskStatus;
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
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = STATUS_COLORS[status];

  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 rounded-xl border p-3 flex flex-col gap-2 min-h-[240px] transition-colors ${
        isOver ? `${colors.bg} ${colors.border}` : "border-neutral-200 bg-neutral-50/50"
      }`}
    >
      <h3 className={`text-sm font-semibold flex items-center gap-2 ${colors.text}`}>
        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        {STATUS_LABELS[status]}
        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-white text-neutral-500">{tasks.length}</span>
      </h3>
      <div className="grid grid-cols-2 gap-2 items-stretch">
        {tasks.map((t) => (
          <KanbanCard
            key={t.id}
            task={t}
            master={master}
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
        ))}
        {tasks.length === 0 && (
          <p className="col-span-2 text-xs text-neutral-500 text-center py-6 border border-dashed border-neutral-200 rounded-lg">
            없음
          </p>
        )}
      </div>
    </div>
  );
}
