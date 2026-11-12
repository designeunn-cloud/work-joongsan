"use client";

import type { ReactNode } from "react";
import type { Task } from "@/lib/clientTypes";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/statusConfig";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/relativeDate";
import { baseName } from "@/lib/ruleBasedInterpret";
import Modal from "./Modal";

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

function EditIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 text-sm">
      <span className="w-16 shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 text-neutral-800">{value}</span>
    </div>
  );
}

function formatDateRow(iso: string | null): string | null {
  if (!iso) return null;
  return `${formatAbsoluteDate(iso)} · ${formatRelativeDate(iso)}`;
}

/** 연결된 업무(관련 업무)를 클릭했을 때 보여주는 읽기 전용 요약 카드 — 수정 아이콘을 누르면 실제 수정 폼으로 넘어간다. */
export default function TaskDetailModal({
  task,
  onClose,
  onEdit,
}: {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
}) {
  const colors = STATUS_COLORS[task.status];
  const tags = task.tags ? task.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const subtitle = [task.brand, task.productName].filter(Boolean).join(" · ");

  return (
    <Modal onClose={onClose} widthClassName="max-w-md">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${colors.bg} ${colors.text}`}>
          {STATUS_LABELS[task.status]}
        </span>
        <button
          onClick={onEdit}
          title="수정"
          aria-label="수정"
          className="p-2 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 shrink-0"
        >
          <EditIcon />
        </button>
      </div>

      <h2 className="text-lg font-bold text-neutral-900 mb-1">{task.requestContent}</h2>
      {subtitle && <p className="text-sm text-neutral-400 mb-4">{subtitle}</p>}

      <div className="divide-y divide-neutral-100 border-t border-b border-neutral-100">
        <Row label="담당자" value={`${baseName(task.assignee)}${task.department ? ` · ${task.department}` : ""}`} />
        <Row label="프로젝트" value={task.project?.name} />
        <Row label="플랫폼" value={task.platform} />
        <Row
          label="태그"
          value={
            tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                    #{t}
                  </span>
                ))}
              </div>
            )
          }
        />
        <Row label="요청일" value={formatDateRow(task.requestDate)} />
        <Row label="시작일" value={formatDateRow(task.startDate)} />
        <Row label={task.reviewWorkflow ? "실제 완료일" : "검토일"} value={formatDateRow(task.reviewDate)} />
        <Row label={task.reviewWorkflow ? "최종종료일" : "종료일"} value={formatDateRow(task.endDate)} />
        <Row label="마감일" value={formatDateRow(task.dueDate)} />
        <Row label="메모" value={task.memo && <span className="whitespace-pre-wrap">{task.memo}</span>} />
        <Row label="폴더" value={<span className="text-xs text-neutral-400 break-all">{task.folderName}</span>} />
      </div>

      <div className="flex justify-end pt-4">
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100">
          닫기
        </button>
      </div>
    </Modal>
  );
}
