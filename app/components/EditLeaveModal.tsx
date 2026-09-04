"use client";

import { useState } from "react";
import type { Leave, LeaveType } from "@/lib/clientTypes";
import { Field } from "./Primitives";
import Modal from "./Modal";

const LEAVE_TYPES: LeaveType[] = ["연차", "오전반차", "오후반차", "오전반반차", "오후반반차", "외부일정", "반반차"];

export interface EditLeaveInput {
  startDateISO: string;
  endDateISO: string;
  type: LeaveType;
  memo: string;
}

export default function EditLeaveModal({
  leave,
  onCancel,
  onSubmit,
  onDelete,
}: {
  leave: Leave;
  onCancel: () => void;
  onSubmit: (data: EditLeaveInput) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<LeaveType>(leave.type);
  const [startDateISO, setStartDateISO] = useState(leave.startDate.slice(0, 10));
  const [endDateISO, setEndDateISO] = useState(leave.endDate.slice(0, 10));
  const [memo, setMemo] = useState(leave.memo ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isRangeCapable = type === "연차" || type === "외부일정";
  const isHalfDay = !isRangeCapable;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        startDateISO,
        endDateISO: isHalfDay ? startDateISO : endDateISO,
        type,
        memo,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onCancel} widthClassName="max-w-sm">
      <h2 className="text-lg font-bold mb-4">휴가 수정</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="유형">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2">
            <Field label={isHalfDay ? "날짜" : "시작일"}>
              <input
                type="date"
                value={startDateISO}
                onChange={(e) => setStartDateISO(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                required
              />
            </Field>
            {!isHalfDay && (
              <Field label="종료일">
                <input
                  type="date"
                  value={endDateISO}
                  onChange={(e) => setEndDateISO(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                />
              </Field>
            )}
          </div>

          <Field label="메모 (선택)">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </Field>

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-red-600 hover:underline"
            >
              삭제
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </form>
    </Modal>
  );
}
