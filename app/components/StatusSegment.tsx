"use client";

import { useState } from "react";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, type TaskStatus } from "@/lib/statusConfig";

export default function StatusSegment({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const others = STATUS_ORDER.filter((s) => s !== status);

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
    <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden shrink-0">
      {others.map((s) => {
        const colors = STATUS_COLORS[s];
        return (
          <button
            key={s}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
            className="text-xs px-2.5 py-1.5 font-medium bg-white text-neutral-600 hover:bg-neutral-50 transition-colors"
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
  );
}
