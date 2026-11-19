"use client";

import { useEffect, useState } from "react";
import { koreaDate, roundedHours } from "@/lib/workTime";
import WorkTimeInlineInput from "./WorkTimeInlineInput";

export type ReviewTimeDraft = { date: string; hours: number | null; previousHours: number | null; timerActive: boolean };

export default function ReviewTimeInput({ taskId, draft, onChange, disabled }: {
  taskId: string; draft: ReviewTimeDraft | null; onChange: (next: ReviewTimeDraft) => void; disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const date = koreaDate();
    const query = new URLSearchParams({ taskId, date, includeReviewTime: "pending" });
    fetch(`/api/work-time?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const { day, timer, reviewTime } = await response.json();
      if (controller.signal.aborted) return;
      if (!day || !timer || !reviewTime) throw new Error();
      const active = timer.taskId === taskId;
      const hours = reviewTime.available ? roundedHours(reviewTime.seconds) : day.hours;
      setMessage(active ? "측정 중인 시간은 검토로 넘길 때 정산합니다." : reviewTime.available ? "" : reviewTime.reason);
      setFailed(false);
      onChange({ date, hours: active ? null : hours, previousHours: day.hours, timerActive: active });
    }).catch(() => { if (!controller.signal.aborted) { setMessage("소요시간을 불러오지 못했습니다."); setFailed(true); } });
    return () => controller.abort();
  }, [taskId, attempt, onChange]);

  return <div className="mb-3 text-xs text-neutral-600">
    <div className="flex items-center gap-2"><span>오늘 소요시간</span>
      {draft && !draft.timerActive && <WorkTimeInlineInput taskName="검토 업무" hours={draft.hours} disabled={disabled} active={false} ready card
        onSave={async hours => { onChange({ ...draft, hours: roundedHours(hours * 3600) }); return true; }} />}
      {!draft && !failed && <span role="status">계산 중…</span>}
    </div>
    {draft && !draft.timerActive && draft.previousHours !== null && draft.previousHours !== draft.hours &&
      <button type="button" disabled={disabled} onClick={() => onChange({ ...draft, hours: draft.previousHours })} className="mt-1 underline">
        기존 {draft.previousHours}시간 유지
      </button>}
    {message && <p role="status" className="mt-1">{message} {failed && <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button>}</p>}
  </div>;
}
