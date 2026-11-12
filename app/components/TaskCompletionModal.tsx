"use client";
import { useEffect, useRef, useState } from "react";
import type { MasterData, Project, Task } from "@/lib/clientTypes";
import { PRODUCTION_TYPES } from "@/lib/productionTypes";
import { getTaskDeadline, getTaskDeadlineField } from "@/lib/taskDeadline";
import { COMMENT_OPTIONS, composeStatusComment, getDefaultStatusCommentOption, recordsStatusComments, type CommentOption } from "@/lib/statusComments";
import { koreaDate } from "@/lib/workTime";
import Modal from "./Modal";
import TaskIdentityEditor from "./TaskIdentityEditor";
import InlineChoiceEditor from "./InlineChoiceEditor";
import WorkTimeInlineInput from "./WorkTimeInlineInput";
import DateEditor from "./DateEditor";
import { roundedHours } from "@/lib/workTime";
import { needsFirstReview, FIRST_REVIEW_REQUIRED } from "@/lib/statusConfig";

const inputClass = "mt-1 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60";

export default function TaskCompletionModal({ task, master, projects, onClose, onSaved }: {
  task: Task; master: MasterData; projects: Project[]; onClose: () => void; onSaved: () => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [firstDeliveryDate, setFirstDeliveryDate] = useState(koreaDate);
  const [projectId, setProjectId] = useState("");
  const [productionType, setProductionType] = useState("");
  const [assignee, setAssignee] = useState("");
  const [productName, setProductName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [hours, setHours] = useState("");
  const [outputLocation, setOutputLocation] = useState(task.outputLocation ?? "");
  const [timeState, setTimeState] = useState<{ hours: number | null; active: boolean; date: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const saving = useRef(false);
  const effectiveProject = projectId ? projects.find(project => project.id === projectId) : task.project;
  const commentsEnabled = recordsStatusComments({ project: effectiveProject, requestContent: task.requestContent });
  const [option, setOption] = useState<CommentOption | "">(getDefaultStatusCommentOption(task.status, "done"));
  const [detail, setDetail] = useState("");
  const comment = composeStatusComment(option, detail);
  const missing = !task.projectId || !task.productionType || !task.assignee?.trim() || !task.productName?.trim() || !getTaskDeadline(task) || timeState?.hours === null;
  const directCompletion = task.status === "planned" || task.status === "in_progress";
  const deliveryRequired = needsFirstReview(task) && directCompletion;
  const reviewRequired = needsFirstReview(task) && !directCompletion;

  useEffect(() => {
    if (reviewRequired) return;
    const controller = new AbortController(), date = koreaDate();
    fetch(`/api/work-time?taskId=${encodeURIComponent(task.id)}&date=${date}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!data.day) throw new Error(); setTimeState({ hours: data.day.hours, active: data.timer?.taskId === task.id, date }); setLoadError(""); })
      .catch(cause => { if (cause.name !== "AbortError") setLoadError("소요시간을 확인하지 못했습니다. 다시 불러와주세요."); });
    return () => controller.abort();
  }, [task.id, attempt, reviewRequired]);

  async function save() {
    if (saving.current || !timeState || reviewRequired) return;
    if (deliveryRequired && (!firstDeliveryDate || firstDeliveryDate > koreaDate())) {
      setError("최초 전달일을 오늘 또는 이전 날짜로 선택해주세요.");
      return;
    }
    const body: Record<string, unknown> = { status: "done", outputLocation: outputLocation.trim() || null };
    if (deliveryRequired) body.firstDeliveryDateISO = firstDeliveryDate;
    if (projectId) body.projectId = projectId;
    if (productionType) body.productionType = productionType;
    if (assignee.trim()) body.assignee = assignee.trim();
    if (productName.trim()) body.productName = productName.trim();
    if (deadline) body[`${getTaskDeadlineField(task)}ISO`] = deadline;
    if (hours.trim()) body.completionHours = Number(hours);
    if (commentsEnabled) body.statusComment = comment;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "완료 처리하지 못했습니다.");
      for (const event of ["journal-updated", "journal-sync-requested", "work-time-updated"]) window.dispatchEvent(new Event(event));
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "다시 저장해주세요."); }
    finally { saving.current = false; setBusy(false); }
  }

  if (reviewRequired) return <Modal label="검토 후 완료" onClose={onClose} widthClassName="max-w-sm">
    <h2 className="text-base font-semibold text-neutral-900">검토 후 완료</h2>
    <p className="mt-2 break-words text-sm text-neutral-700">{task.requestContent}</p>
    <p role="status" className="mt-3 text-sm leading-6 text-neutral-700">{FIRST_REVIEW_REQUIRED}</p>
    <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="min-h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">확인</button></div>
  </Modal>;

  return <Modal label="업무 완료" onClose={() => { if (!busy) onClose(); }} closeOnBackdropClick={!busy} widthClassName="max-w-lg">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-neutral-900">업무 완료</h2><p className="mt-1 break-words text-sm text-neutral-600">{task.requestContent}</p></div><button type="button" disabled={busy} aria-label="완료 창 닫기" onClick={onClose} className="min-h-9 rounded-lg px-2 text-sm text-neutral-600 hover:bg-neutral-100">닫기</button></div>
    <div>
      <fieldset disabled={busy} className="space-y-4">
        {deliveryRequired && <label className="block text-xs font-medium text-neutral-700">최초 전달일
          <input type="date" aria-label="최초 전달일" required max={koreaDate()} value={firstDeliveryDate} onChange={event => setFirstDeliveryDate(event.target.value)} className={inputClass}/>
          <span className="mt-1 block font-normal text-neutral-600">실제 완료일로 기록됩니다.</span>
        </label>}
        {missing && <><p className="text-xs leading-5 text-neutral-600">미등록 항목을 확인하고 필요한 내용을 입력해주세요.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!task.projectId && <div><InlineChoiceEditor label="프로젝트" value={projectId} emptyLabel="프로젝트" options={[{ value: "", label: "선택 안 함" }, ...projects.map(project => ({ value: project.id, label: project.name }))]} onSave={async value => { setProjectId(value); }}/></div>}
          {!task.productionType && <InlineChoiceEditor label="작업구분" value={productionType} emptyLabel="작업구분" options={[{ value: "", label: "선택 안 함" }, ...PRODUCTION_TYPES.map(type => ({ value: type, label: type }))]} onSave={async value => { setProductionType(value); }}/>}
          {!task.assignee?.trim() && <TaskIdentityEditor taskId={task.id} taskName={task.requestContent} field="assignee" value={assignee} options={master.assignees.map(item => item.name)} onChange={setAssignee}/>}
          {!task.productName?.trim() && <TaskIdentityEditor taskId={task.id} taskName={task.requestContent} field="productName" value={productName} options={master.products.map(item => item.code)} onChange={setProductName}/>}
          {!getTaskDeadline(task) && <DateEditor label="요청일" hideLabel valueISO={deadline || null} displayMode="short" className="min-h-8 !text-red-700" open={dateOpen} onToggle={() => setDateOpen(value => !value)} onChange={setDeadline}/>}
          {timeState?.hours === null && <div><WorkTimeInlineInput taskName={task.requestContent} hours={hours === "" ? null : Number(hours)} disabled={busy} active={timeState.active} ready card onSave={async value => { setHours(String(roundedHours(value * 3600))); return true; }}/>{timeState.active && <p className="mt-1 text-xs text-neutral-600">측정 중인 시간은 완료할 때 종료·저장됩니다.</p>}</div>}
        </div></>}
        {!timeState && !loadError && <p role="status" className="text-xs text-neutral-600">소요시간 확인 중…</p>}
        {loadError && <p role="alert" className="text-xs text-red-700">{loadError} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></p>}
        <label className="block text-xs font-medium text-neutral-700">폴더 위치 <span className="font-normal text-neutral-500">(선택)</span><input type="text" maxLength={4000} value={outputLocation} onChange={event => setOutputLocation(event.target.value)} placeholder="폴더 경로나 공유 링크" className={inputClass}/><span className="mt-1 block font-normal text-neutral-600">비워두어도 완료할 수 있어요. 입력한 위치는 일지와 시트에 반영됩니다.</span></label>
        {commentsEnabled && <div><label className="block text-xs font-medium text-neutral-700">완료 코멘트<select value={option} onChange={event => setOption(event.target.value as CommentOption | "")} className={inputClass}><option value="">선택 안 함</option>{COMMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label><input aria-label="완료 코멘트 추가 설명" maxLength={200} value={detail} onChange={event => setDetail(event.target.value)} placeholder="추가 설명 (선택)" className={inputClass}/></div>}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-neutral-200 pt-4"><button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-lg px-4 text-sm text-neutral-600 hover:bg-neutral-100">취소</button><button type="button" onClick={() => void save()} disabled={busy || !timeState || (commentsEnabled && comment.length > 200)} className="min-h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "저장 중…" : "저장하고 완료"}</button></div>
    </div>
  </Modal>;
}
