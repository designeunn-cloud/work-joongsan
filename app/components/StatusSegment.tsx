"use client";

import { useState } from "react";
import { taskStatusOptions, needsFirstReview, FIRST_REVIEW_REQUIRED, STATUS_LABELS, STATUS_COLORS, type TaskStatus } from "@/lib/statusConfig";

export default function StatusSegment({
  status,
  onChange,
  reviewWorkflow = false,
  reviewDate,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  reviewWorkflow?: boolean;
  reviewDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const others = taskStatusOptions(reviewWorkflow).filter((s) => s !== status);
  const reviewRequired = needsFirstReview({ reviewWorkflow, reviewDate }) && status !== "planned" && status !== "in_progress";

  if (!open) {
    const colors = STATUS_COLORS[status];
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${colors.bg} ${colors.text} hover:opacity-80 shrink-0`}
      >
        {STATUS_LABELS[status]}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
    <div className="inline-flex flex-wrap rounded-lg border border-neutral-200 overflow-hidden shrink-0">
      {others.map((s) => {
        const colors = STATUS_COLORS[s];
        return (
          <button
            key={s}
            disabled={s === "done" && reviewRequired}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
            className="text-xs px-2.5 py-1.5 font-medium bg-white text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${colors.dot}`} />
            {STATUS_LABELS[s]}
          </button>
        );
      })}
      <button
        onClick={() => setOpen(false)}
        className="text-xs px-2 py-1.5 text-neutral-500 hover:text-neutral-700"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
    {reviewRequired && <p className="text-xs text-neutral-600">{FIRST_REVIEW_REQUIRED}</p>}
    </div>
  );
}
