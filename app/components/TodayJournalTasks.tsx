"use client";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { koreaDate } from "@/lib/workTime";
import { STATUS_LABELS } from "@/lib/statusConfig";
import { journalTaskChoices, type JournalTaskFilter } from "@/lib/journalTaskChoices";
const button = "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50";
type Choice = { id: string; requestContent: string; assignee: string; productName: string | null; projectName?: string | null; status: string; createdAt: string; dueDate: string | null; included: boolean; manual: boolean; excluded: boolean };
type StandingProject = { id: string; name: string; taskId: string; included: boolean };
export function JournalExcludeButton({ taskId, date, disabled = false, compact = false }: { taskId: string; date: string; disabled?: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function exclude() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/journal/${date}/membership`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds: [taskId] }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      window.dispatchEvent(new Event("journal-membership-updated"));
    } catch (e) { setError(e instanceof Error ? e.message : "제외하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <><button type="button" disabled={disabled || busy} onClick={() => void exclude()} aria-label="일지에서 제외" title="이 날짜의 일지에서만 제외합니다. 작성 내용과 원본 업무는 보존됩니다." className="min-h-8 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50">{busy ? "제외 중…" : compact ? "제외" : "일지에서 제외"}</button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</>;
}
export default function TodayJournalTasks({ taskId, disabled = false }: { taskId?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Choice[]>([]);
  const [projects, setProjects] = useState<StandingProject[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JournalTaskFilter>("unfinished");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const date = koreaDate();
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener("journal-membership-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("journal-membership-updated", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!open && !taskId) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      setLoading(true); setError("");
      fetch(`/api/journal/${date}/membership`, { signal: controller.signal }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; }).then(data => { setTasks(data.tasks); setProjects(data.projects ?? []); setReady(true); }).catch(e => { if (!controller.signal.aborted) { setReady(false); setError(e instanceof Error ? e.message : "업무를 불러오지 못했습니다."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(id); controller.abort(); };
  }, [open, taskId, date, version]);
  const included = !!taskId && tasks.some(task => task.id === taskId && task.included);
  async function add(ids: string[], projectIds: string[] = []) {
    if ((!ids.length && !projectIds.length) || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/journal/${date}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds: ids, ...(projectIds.length ? { projectIds } : {}) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSelected([]); setSelectedProjects([]); setOpen(false); window.dispatchEvent(new Event("journal-membership-updated"));
    } catch (e) { setError(e instanceof Error ? e.message : "추가하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  const choices = journalTaskChoices(tasks, statusFilter, query);
  return <div className={taskId ? "my-3" : ""}>
    <button type="button" className={button} disabled={disabled || busy || (!!taskId && (!ready || loading || included))} onClick={() => { if (taskId) void add([taskId]); else { setSelected([]); setSelectedProjects([]); setQuery(""); setStatusFilter("unfinished"); setOpen(true); } }}>{taskId ? loading || !ready ? "오늘 일지 확인 중…" : included ? "오늘 일지에 포함됨" : "오늘 일지에 포함" : "업무 추가"}</button>
    {error && !open && <p role="alert" className="mt-1 text-xs text-red-700">{error} <button type="button" className="underline" onClick={() => setVersion(v => v + 1)}>다시 시도</button></p>}
    {open && <Modal onClose={() => { if (!busy) setOpen(false); }} widthClassName="max-w-xl">
      <h2 className="text-base font-semibold text-neutral-900">오늘 일지에 업무 추가</h2>
      {!loading && projects.length > 0 && <section className="mt-4" aria-label="항시 업무">
        <h3 className="text-sm font-medium text-neutral-900">항시 업무</h3>
        <p className="mt-1 text-xs leading-5 text-neutral-600">필요한 날마다 추가해 그날의 내용과 소요시간을 기록합니다.</p>
        <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200">{projects.map(project => <li key={project.id}>
          <label className={`flex items-start gap-3 px-3 py-3 text-sm ${project.included ? "bg-neutral-50 text-neutral-500" : "cursor-pointer hover:bg-indigo-50/40"}`}>
            <input type="checkbox" checked={selectedProjects.includes(project.id)} disabled={project.included || busy} aria-label={`${project.name} 항시 업무 추가`} onChange={event => setSelectedProjects(previous => event.target.checked ? [...previous, project.id] : previous.filter(id => id !== project.id))} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
            <span className="min-w-0 flex-1 break-words font-medium">{project.name}</span><span className="shrink-0 text-xs text-neutral-600">{project.included ? "포함됨" : ""}</span>
          </label>
        </li>)}</ul>
      </section>}
      <p className="mt-2 text-xs leading-5 text-neutral-600">{date} · 진행중 → 대기 → 보류 순으로, 같은 상태에서는 마감일이 가까운 업무부터 표시합니다. 마감일이 없거나 이미 포함된 업무는 뒤에 표시합니다.</p>
      <label className="mt-3 block text-xs font-medium text-neutral-700">업무 상태
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as JournalTaskFilter)} className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600">
          <option value="unfinished">미완료 (진행중·대기·보류)</option>
          <option value="in_progress">진행중</option>
          <option value="planned">대기</option>
          <option value="review">보류</option>
          <option value="done">완료</option>
          <option value="all">전체</option>
        </select>
      </label>
      <label className="mt-3 block text-xs font-medium text-neutral-700">업무 검색
        <input autoFocus placeholder="업무명·프로젝트·제품명·담당자 검색" value={query} onChange={e => setQuery(e.target.value)} className="mb-3 mt-1 min-h-10 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600" />
      </label>
      {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
      {loading ? <p role="status" className="py-6 text-sm text-neutral-600">업무를 불러오는 중…</p> : <ul className="max-h-[45vh] divide-y divide-neutral-200 overflow-auto rounded-lg border border-neutral-200">
        {choices.map(task => <li key={task.id}><label className={`flex items-start gap-3 px-3 py-3 text-sm ${task.included ? "bg-neutral-50 text-neutral-500" : "cursor-pointer hover:bg-indigo-50/40"}`}><input type="checkbox" checked={selected.includes(task.id)} disabled={task.included || busy} aria-label={`${task.requestContent} 일지에 추가`} onChange={e => setSelected(previous => e.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"/><span className="min-w-0 flex-1 break-words"><span className="block font-medium">{task.requestContent}</span><span className="mt-1 block text-xs text-neutral-600">{[task.projectName, task.productName, task.assignee, STATUS_LABELS[task.status as keyof typeof STATUS_LABELS], task.dueDate ? `마감 ${koreaDate(new Date(task.dueDate))}` : "마감일 없음"].filter(Boolean).join(" · ")}</span></span><span className="shrink-0 text-xs text-neutral-600">{task.included ? "포함됨" : task.excluded ? "제외됨" : ""}</span></label></li>)}
        {!choices.length && <li className="px-3 py-6 text-sm text-neutral-600">{query.trim() ? "검색 결과가 없습니다. 검색어나 업무 상태를 바꿔보세요." : "해당 상태의 업무가 없습니다. 다른 업무 상태나 전체를 선택해주세요."}</li>}
      </ul>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => setOpen(false)}>닫기</button><button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50" disabled={busy || loading || !(selected.length + selectedProjects.length)} onClick={() => void add(selected, selectedProjects)}>{busy ? "추가 중…" : `선택한 ${selected.length + selectedProjects.length}건 추가`}</button></div>
    </Modal>}
  </div>;
}
