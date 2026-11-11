"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, type TaskStatus } from "@/lib/statusConfig";
import { COMMENT_OPTIONS, composeStatusComment, getDefaultStatusCommentOption, type CommentOption } from "@/lib/statusComments";
import { getDefaultWorkType, isWorkType, WORK_TYPE_LABELS, type WorkType } from "@/lib/workTypes";
import Modal from "./Modal";
import { TaskCompletionContext } from "./TaskCompletionContext";

export default function StatusChangeEditor({ taskId, status, workType, onSaved, showWorkTypeLabel = true, commentsEnabled = true }: {
  taskId: string; status: TaskStatus; workType?: WorkType | null; onSaved: (status: TaskStatus) => void;
  showWorkTypeLabel?: boolean;
  commentsEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const requestCompletion = useContext(TaskCompletionContext);
  const [target, setTarget] = useState<TaskStatus | null>(null);
  const [option, setOption] = useState<CommentOption | "">("");
  const [detail, setDetail] = useState("");
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | "reset">(getDefaultWorkType(status, workType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const colors = STATUS_COLORS[status];
  const comment = commentsEnabled ? composeStatusComment(option, detail) : "";
  const resetting = status === "in_progress" && target === "in_progress" && selectedWorkType === "reset";
  const commentOnly = target === status && !resetting;

  function close() { setOpen(false); setTarget(null); setOption(""); setDetail(""); setError(""); }
  function openEditor() {
    setSelectedWorkType(getDefaultWorkType(status, workType));
    setOpen(true);
    if (status === "in_progress" && commentsEnabled) {
      setTarget(status);
      setOption(getDefaultStatusCommentOption(status, status));
    }
  }
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)") ?? []);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  async function save() {
    if (!target || saving || comment.length > 200 || (commentOnly && !comment)) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, ...(commentsEnabled ? { statusComment: comment } : {}),
          ...(resetting ? { resetWorkStart: true } : target === "in_progress" && target !== status ? { workType: selectedWorkType } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "상태 변경에 실패했습니다.");
      close(); onSaved(target);
    } catch (e) { setError(e instanceof Error ? e.message : "상태 변경에 실패했습니다."); }
    finally { setSaving(false); }
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1.5">
      <button type="button" disabled={saving} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => open ? close() : openEditor()}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${colors.bg} ${colors.text} hover:opacity-80`}>{STATUS_LABELS[status]}</button>
      {showWorkTypeLabel && status === "in_progress" && isWorkType(workType) && <span className="text-xs text-neutral-500">{WORK_TYPE_LABELS[workType]}</span>}
      {open && createPortal(<Modal onClose={() => { if (!saving) close(); }} closeOnBackdropClick={!saving} widthClassName="max-w-sm">
        <div ref={panel} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} tabIndex={-1} className="outline-none">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={`${dialogId}-title`} className="text-sm font-semibold text-neutral-800">{commentsEnabled ? "상태 및 코멘트" : "상태 변경"}</h2>
          <button type="button" aria-label="상태 변경 창 닫기" disabled={saving} onClick={close} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50">×</button>
        </div>
        <div className="flex flex-wrap gap-2">{STATUS_ORDER.filter((s) => s !== status || s === "in_progress").map((s) => <button type="button" key={s} disabled={saving}
          onClick={() => { if (s === "done" && requestCompletion) { close(); requestCompletion(taskId); return; } if (target !== s) { setOption(getDefaultStatusCommentOption(status, s)); setSelectedWorkType(getDefaultWorkType(status, workType)); } setTarget(s); setError(""); }} aria-pressed={target === s}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-shadow ${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text} ${STATUS_COLORS[s].border} ${target === s ? "ring-2 ring-current ring-offset-1" : "hover:opacity-80"}`}>{STATUS_LABELS[s]}</button>)}</div>
        {target && <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {target === "in_progress" && <>
            <label className="mb-1 block text-xs text-neutral-500">작업 구분
              <select aria-label="진행중 작업 구분" value={selectedWorkType} disabled={saving} onChange={(e) => {
                const value = e.target.value as WorkType | "reset";
                setSelectedWorkType(value);
                setOption(value === "reset" ? "" : getDefaultStatusCommentOption(status, status));
              }} className="mb-2 mt-1 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm">
                {Object.entries(WORK_TYPE_LABELS).map(([value, label]) => <option key={value} value={value} disabled={status === "in_progress" && value !== (isWorkType(workType) ? workType : "initial")}>{label}</option>)}
                {status === "in_progress" && <option value="reset">작업 날짜 갱신</option>}
              </select>
            </label>
            {!commentOnly && <p className="mb-2 text-xs leading-5 text-neutral-500">{resetting ? "저장하는 시각으로 시작일을 갱신합니다. 이전 기록은 남기고, 작업기간은 이 시점부터 다시 계산합니다." : "저장하면 작업 착수 시점이 이력에 기록됩니다."}</p>}
          </>}
          {commentOnly && <p className="mb-2 text-xs leading-5 text-neutral-500">진행중 상태를 유지하며 코멘트를 이력에 기록합니다.</p>}
          {commentsEnabled && <><label className="mb-1 block text-xs text-neutral-500">{commentOnly ? "코멘트" : "코멘트 (선택)"}</label>
          <select aria-label="상태 변경 코멘트 유형" value={option} disabled={saving} onChange={(e) => setOption(e.target.value as CommentOption | "")}
            className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm">
            <option value="">선택 안 함</option>{COMMENT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input aria-label="상태 변경 코멘트" maxLength={200} disabled={saving} value={detail} onChange={(e) => setDetail(e.target.value)}
            required={option === "기타" || (commentOnly && !option)} placeholder={option === "기타" || (commentOnly && !option) ? "코멘트를 직접 입력해 주세요" : target === "in_progress" && !commentOnly && selectedWorkType === "revision" ? "수정 사유 (선택)" : "추가 설명 (선택)"}
            className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
          <span className={`mt-1 block text-xs ${comment.length > 200 ? "text-red-600" : "text-neutral-400"}`}>{comment.length}/200</span></>}
          <div className="mt-2 flex justify-end gap-2 text-xs">
            <button type="button" disabled={saving} onClick={close} className="px-2 py-1.5 text-neutral-500">취소</button>
            <button type="submit" disabled={saving || comment.length > 200 || (commentOnly && !comment)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-50">{saving ? "저장 중…" : resetting ? "작업 날짜 갱신" : commentOnly ? "코멘트 저장" : "변경 저장"}</button>
          </div>
        </form>}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </Modal>, document.body)}
    </div>
  );
}
