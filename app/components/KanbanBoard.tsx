"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { STATUS_ORDER, type TaskStatus } from "@/lib/statusConfig";
import { compareByDueDateUrgentFirst } from "@/lib/dateHelpers";
import type { Task, MasterData } from "@/lib/clientTypes";
import KanbanColumn from "./KanbanColumn";
import RawTextModal from "./RawTextModal";
import type { DateField } from "./TaskCard";

export default function KanbanBoard({
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [rawTextTask, setRawTextTask] = useState<Task | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const taskId = event.active.id as string;
    const newStatus = event.over?.id as TaskStatus | undefined;
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) onUpdateStatus(taskId, newStatus);
  }

  const tasksByStatus = STATUS_ORDER.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status).sort(compareByDueDateUrgentFirst),
  }));
  // 검토/완료는 카드가 없으면 컬럼 자체를 숨겨 빈 박스가 화면을 차지하지 않게 한다.
  // 진행중은 기본 상태라 전체가 0개인 초기 상태에도 항상 표시한다.
  const visibleColumns = tasksByStatus.filter(({ status, tasks: t }) => status === "in_progress" || t.length > 0);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        {visibleColumns.map(({ status, tasks: columnTasks }) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columnTasks}
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
            onOpenRawText={setRawTextTask}
          />
        ))}
      </div>
      {rawTextTask && rawTextTask.rawExtractedText && (
        <RawTextModal
          fileName={rawTextTask.sourceFileName}
          rawText={rawTextTask.rawExtractedText}
          onClose={() => setRawTextTask(null)}
        />
      )}
    </DndContext>
  );
}
