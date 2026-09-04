import { useState } from "react";
import { daysLate } from "@/lib/bucketTasks";
import { baseName } from "@/lib/ruleBasedInterpret";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData } from "@/lib/clientTypes";
import DateEditor from "./DateEditor";
import SubtaskSection from "./SubtaskSection";
import StatusSegment from "./StatusSegment";
import { Pill } from "./Primitives";

export type DateField = "startDate" | "reviewDate" | "endDate" | "dueDate";

/** 품목이 콤마로 여러 개 들어있으면(DB엔 전부 저장돼있음) 카드엔 2개까지만, 3개부터는 "N종"으로 줄인다. */
function formatProductNames(productName: string | null): string | null {
  if (!productName) return null;
  const items = productName.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  if (items.length <= 2) return items.join(", ");
  return `${items.length}종`;
}

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function FolderIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FollowUpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 3v10a2 2 0 0 0 2 2h9" />
      <path d="M16 11l4 4-4 4" />
      <circle cx="5" cy="3" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function TaskCard({
  task,
  master,
  showOverdueBadge,
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
  task: Task;
  master: MasterData;
  showOverdueBadge: boolean;
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
  const [openDateField, setOpenDateField] = useState<DateField | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [draftContent, setDraftContent] = useState(task.requestContent);

  function startEditingContent() {
    setDraftContent(task.requestContent);
    setEditingContent(true);
  }

  function commitContent() {
    const trimmed = draftContent.trim();
    if (trimmed && trimmed !== task.requestContent) onUpdateContent(task.id, trimmed);
    setEditingContent(false);
  }
  const done = task.status === "done";
  const late = showOverdueBadge && !done ? daysLate(task.startDate) : 0;
  const productNamesLabel = formatProductNames(task.productName);
  const STATUS_ACCENT: Record<TaskStatus, string> = {
    in_progress: "border-l-blue-300",
    review: "border-l-orange-300",
    done: "border-l-emerald-300",
  };
  const accent = late > 0 ? "border-l-red-400" : STATUS_ACCENT[task.status];
  // 마감일이 내일까지 남았거나(daysLate === -1), 오늘이거나, 아직 정해지지 않았거나, 이미 지났으면 강조(빨간색) 표시한다.
  const dueEmphasize = !done && (!task.dueDate || daysLate(task.dueDate) >= -1);

  return (
    <li
      className={`@container h-full border border-l-4 rounded-xl px-4 py-3 transition-shadow ${accent} ${
        done ? "border-neutral-200 bg-neutral-50 opacity-70" : "border-neutral-200 bg-white shadow-sm hover:shadow-md"
      }`}
    >
      {showOverdueBadge && late > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <Pill dot="bg-red-500" text={`D+${late}`} className="bg-red-50 text-red-700" />
        </div>
      ) : null}

      {/* 진행중 -------- 폴더/휴지통 아이콘 */}
      <div className="flex items-center justify-between gap-2">
        <StatusSegment status={task.status} onChange={(s) => onUpdateStatus(task.id, s)} />
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onOpenFolder(task.id)}
            title="폴더 열기"
            aria-label="폴더 열기"
            className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
          >
            <FolderIcon />
          </button>
          <button
            onClick={() => onEdit(task)}
            title="수정"
            aria-label="수정"
            className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
          >
            <EditIcon />
          </button>
          {onCreateFollowUp && (
            <button
              onClick={() => onCreateFollowUp(task)}
              title="후속작업 등록 (수정요청 등)"
              aria-label="후속작업 등록"
              className="p-2 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <FollowUpIcon />
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`"${task.requestContent}" 업무를 삭제할까요? 되돌릴 수 없습니다.`)) onDelete(task.id);
            }}
            title="삭제"
            aria-label="삭제"
            className="p-2 rounded-lg border border-neutral-200 text-neutral-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* 업무명·품명·담당자 / 시작일·검토일·종료일·마감일 — 카드 폭이 넉넉하면(검토·완료 칸이 없어
          카드가 넓어졌을 때 등) 한 줄로 합쳐지고, 좁으면 두 줄(업무명 줄 / 날짜 줄)로 나뉜다 */}
      <div className="mt-1.5 grid grid-cols-1 @[680px]:grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 @[680px]:items-center">
        <div className="flex justify-between items-center  jutify-betwwen gap-2 min-w-0">
          {editingContent ? (
            <input
              autoFocus
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              onBlur={commitContent}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitContent();
                if (e.key === "Escape") setEditingContent(false);
              }}
              className="text-[15px] font-semibold text-neutral-900 border border-indigo-300 rounded px-1 py-0.5 outline-none min-w-0 flex-1"
            />
          ) : (
            <span
              onDoubleClick={startEditingContent}
              title="더블클릭해서 수정"
              className="text-[15px] font-semibold text-neutral-900 truncate cursor-text"
            >
              {task.requestContent}
            </span>
          )}
          <span className="text-sm text-neutral-400 shrink-0">
            {productNamesLabel && <span title={task.productName ?? undefined}>{productNamesLabel}</span>}
            {productNamesLabel && " · "}
            {baseName(task.assignee)}
          </span>
        </div>
        <div className="flex flex-row justify-between gap-1 @[680px]:flex-row @[680px]:items-center @[680px]:gap-4">
          <div className="flex gap-3 ">
            <DateEditor
              label="[시작일]"
              valueISO={task.startDate}
              open={openDateField === "startDate"}
              onToggle={() => setOpenDateField((f) => (f === "startDate" ? null : "startDate"))}
              onChange={(iso) => onUpdateDate(task.id, "startDate", iso)}
            />
            
            <DateEditor
              label="[종료일]"
              valueISO={task.endDate}
              open={openDateField === "endDate"}
              onToggle={() => setOpenDateField((f) => (f === "endDate" ? null : "endDate"))}
              onChange={(iso) => onUpdateDate(task.id, "endDate", iso)}
            />
          </div>
          <div className="flex gap-3">
          {task.reviewDate && (
            <DateEditor
              label="[검토일]"
              valueISO={task.reviewDate}
              open={openDateField === "reviewDate"}
              onToggle={() => setOpenDateField((f) => (f === "reviewDate" ? null : "reviewDate"))}
              onChange={(iso) => onUpdateDate(task.id, "reviewDate", iso)}
            />
          )}
          <DateEditor
            label="[마감일]"
            valueISO={task.dueDate}
            emphasize={dueEmphasize}
            open={openDateField === "dueDate"}
            onToggle={() => setOpenDateField((f) => (f === "dueDate" ? null : "dueDate"))}
            onChange={(iso) => onUpdateDate(task.id, "dueDate", iso)}
          />
        </div>
          </div>
         
      </div>

      <hr className="my-2 border-neutral-100" />

      {task.tags && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {task.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
              #{t}
            </span>
          ))}
        </div>
      )}
      {task.memo && <div className="text-xs text-neutral-400 mb-1.5 line-clamp-2">{task.memo}</div>}

      {(task.relatedTask || task.followUps.length > 0) && (
        <div className="flex items-start gap-2 mb-1.5">
          <span className="text-xs text-neutral-500 shrink-0 pt-0.5">연결된 업무</span>
          <div className="flex flex-wrap gap-1">
            {task.relatedTask && (
              <button
                onClick={() => onJumpToTask?.(task.relatedTask!.id)}
                title="원본 업무로 이동"
                className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 truncate max-w-[220px]"
              >
                ↳ {task.relatedTask.requestContent}
              </button>
            )}
            {task.followUps.map((f) => (
              <button
                key={f.id}
                onClick={() => onJumpToTask?.(f.id)}
                title="후속작업으로 이동"
                className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 truncate max-w-[220px]"
              >
                → {f.requestContent}
              </button>
            ))}
          </div>
        </div>
      )}

      <SubtaskSection task={task} master={master} onSubtasksChanged={onSubtasksChanged} />
    </li>
  );
}
