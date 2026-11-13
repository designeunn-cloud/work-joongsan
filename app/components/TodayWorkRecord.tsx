"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { roundedHours } from "@/lib/workTime";

type RecordState = {
  date: string; version: string | null; content: string; hours: number | null; totalHours: number;
  automatic: boolean; timerActive: boolean; timerRunning: boolean; timerStartedAt: string | null; timerHours: number;
};
type SavedRecord = { date: string; content: string; hours: number; totalHours: number };
const inputClass = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-indigo-600";
const secondaryClass = "min-h-10 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50";

export default function TodayWorkRecord({ taskId, taskName, status, onSaved }: {
  taskId: string; taskName: string; status: string; onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (status !== "in_progress") return null;
  return <span className="inline-flex shrink-0" data-card-interactive onClick={event => event.stopPropagation()}>
    <button type="button" aria-haspopup="dialog" aria-label={`${taskName} 오늘 작업 기록`} onClick={() => setOpen(true)}
      className="min-h-8 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600">오늘 작업 기록</button>
    {open && <TodayWorkRecordModal key={taskId} taskId={taskId} taskName={taskName} onClose={() => setOpen(false)} onSaved={onSaved} />}
  </span>;
}

export function TodayWorkRecordModal({ taskId, taskName, onClose, onSaved }: {
  taskId: string; taskName: string; onClose: () => void; onSaved?: () => void;
}) {
  const [record, setRecord] = useState<RecordState | null>(null);
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedRecord | null>(null);
  const saving = useRef(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const endpoint = `/api/tasks/${encodeURIComponent(taskId)}/work-record`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) { setRecord(data); setContent(data.content); setHours(data.hours == null ? "" : String(data.hours)); setLoading(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "기록을 불러오지 못했습니다."); setLoading(false); }
    });
    return () => controller.abort();
  }, [endpoint, attempt]);
  useEffect(() => { if (!loading && record) contentRef.current?.focus(); }, [loading, record]);
  function reload() { setLoading(true); setError(""); setAttempt(value => value + 1); }
  const validHours = hours.trim() !== "" && Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 24;
  const chosenHours = record?.timerActive ? record.timerHours : validHours ? roundedHours(Number(hours) * 3600) : null;
  async function save() {
    if (saving.current || !record || !content.trim() || (!record.timerActive && !validHours)) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        date: record.date, version: record.version, content, mode: record.timerActive ? "timer" : "manual",
        ...(record.timerActive ? { timerStartedAt: record.timerStartedAt } : { hours: Number(hours) }),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "오늘 작업을 저장하지 못했습니다.");
      setSaved(result);
      for (const name of ["work-time-updated", "journal-updated", "journal-membership-updated", "journal-sync-requested"]) window.dispatchEvent(new Event(name));
      onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal label="오늘 작업 기록" onClose={() => { if (!saving.current) onClose(); }} closeOnBackdropClick={!busy} widthClassName="max-w-lg">
    <h2 className="text-lg font-semibold text-neutral-900">오늘 작업 기록</h2>
    <p className="mt-1 break-words text-sm text-neutral-700">{taskName}</p>
    {saved ? <>
      <div role="status" className="mt-5 space-y-2">
        <p className="font-medium text-emerald-700">오늘 일지에 저장했습니다.</p>
        <p className="text-sm text-neutral-700">{saved.date} · 진행중</p>
        <p className="text-sm font-medium tabular-nums text-neutral-900">오늘 {saved.hours}시간 · 업무 누적 {saved.totalHours}시간</p>
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{saved.content}</p>
      </div>
      <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className={secondaryClass}>닫기</button></div>
    </> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {loading ? <p role="status" className="py-6 text-sm text-neutral-600">오늘 기록을 불러오는 중…</p> : record && <>
        <p className="mt-3 text-xs leading-5 text-neutral-600">{record.date} · 진행중으로 오늘 작업분을 기록합니다.</p>
        <fieldset disabled={busy} className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-neutral-700">오늘 작업 내용
            <textarea ref={contentRef} required maxLength={40000} rows={4} value={content} onChange={event => setContent(event.target.value)} placeholder="예: A 시안 작업" className={`${inputClass} resize-y`} />
          </label>
          {record.timerActive ? <div className="space-y-1 text-sm text-neutral-700">
            <p className="font-medium">{record.timerRunning ? "측정 중인 시간" : "일시정지한 측정시간"}으로 저장</p>
            <p className="tabular-nums">오늘 합계 약 {record.timerHours}시간</p>
            <p className="text-xs leading-5 text-neutral-600">저장할 때 측정을 종료하고 오늘 일지에 반영합니다. 실행 중인 측정값은 저장 시점까지 계산합니다.</p>
          </div> : <div>
            <label className="block text-sm font-medium text-neutral-700">오늘 총 소요시간 (시간)
              <input type="number" min="0" max="24" step="any" inputMode="decimal" required value={hours} onChange={event => setHours(event.target.value)} placeholder="예: 2" className={inputClass} />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">{[0.5, 1, 2, 4, 8].map(value => <button key={value} type="button" onClick={() => setHours(String(value))} className={secondaryClass}>{value}시간</button>)}</div>
            <p className="mt-2 text-xs leading-5 text-neutral-600">오늘 작업한 전체 시간을 입력하세요. 다시 저장하면 오늘 합계를 수정합니다. 0.1시간 단위로 올림합니다.</p>
            {record.automatic && <p className="mt-1 text-xs leading-5 text-neutral-600">현재 자동 계산된 {record.hours}시간입니다. 저장하면 오늘 시간은 직접 입력으로 바뀝니다.</p>}
          </div>}
          {chosenHours !== null && <p className="text-sm font-medium tabular-nums text-neutral-800">저장 후 오늘 {chosenHours}시간{record.timerActive ? " 예상" : ""}</p>}
        </fieldset>
      </>}
      {error && <div role="alert" className="mt-3 space-y-2 text-sm text-red-700"><p>{error}</p><button type="button" disabled={busy || loading} onClick={reload} className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-600">최신 기록 다시 불러오기</button></div>}
      <div className="mt-5 flex justify-end gap-2 border-t border-neutral-200 pt-4">
        <button type="button" disabled={busy} onClick={onClose} className={secondaryClass}>취소</button>
        <button type="submit" disabled={busy || loading || !record || !content.trim() || (!record.timerActive && !validHours)} className="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50">{busy ? "저장 중…" : record?.timerActive ? "측정 종료하고 기록" : "오늘 작업 저장"}</button>
      </div>
    </form>}
  </Modal>;
}
