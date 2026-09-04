"use client";

import { useDraggable } from "@dnd-kit/core";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData } from "@/lib/clientTypes";
import TaskCard, { type DateField } from "./TaskCard";

export default function KanbanCard({
  task,
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
  onOpenRawText,
}: {
  task: Task;
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
  onOpenRawText?: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50, opacity: 0.6 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className="relative h-full">
      <button
        {...listeners}
        {...attributes}
        className="absolute left-1.5 top-1.5 text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing text-sm leading-none z-10 touch-none"
        title="드래그해서 상태 변경"
        aria-label="드래그해서 상태 변경"
      >
        ⠿
      </button>
      <ul className={`list-none h-full ${isDragging ? "opacity-50" : ""}`}>
        <TaskCard
          task={task}
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
          onOpenRawText={onOpenRawText}
        />
      </ul>
    </div>
  );
}
