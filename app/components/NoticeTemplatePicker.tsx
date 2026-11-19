"use client";
import { useCallback, useEffect, useState } from "react";
import type { NoticeTemplate, NoticeTemplateInput } from "@/lib/noticeTemplates";

type Draft = Omit<NoticeTemplateInput, "name">;
const control = "min-h-9 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50";
function SaveIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM7 3v6h9V3M7 21v-8h10v8" />
  </svg>;
}
const iconControl = `${control} inline-flex h-10 w-10 shrink-0 items-center justify-center p-0 text-indigo-700 hover:bg-indigo-50`;

export default function NoticeTemplatePicker({ draft, hasDraft, disabled, onLoad, getDraft }: {
  draft: Draft;
  hasDraft: boolean;
  disabled: boolean;
  onLoad: (template: NoticeTemplate) => void;
  getDraft?: () => Draft;
}) {
  const [templates, setTemplates] = useState<NoticeTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = templates.find(template => template.id === selectedId);
  const hasChanges = !!selected && (selected.source !== draft.source || selected.projectId !== draft.projectId
    || selected.requestContent !== draft.requestContent || selected.productionType !== draft.productionType
    || (selected.assignee ?? "") !== (draft.assignee ?? "") || (selected.dueDateISO ?? "") !== (draft.dueDateISO ?? "")
    || (selected.splitByProduct ?? false) !== (draft.splitByProduct ?? false) || (selected.dateConfirmed ?? false) !== (draft.dateConfirmed ?? false)
    || JSON.stringify(selected.productNames ?? []) !== JSON.stringify(draft.productNames ?? []));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/notice-templates", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error(data.error || "저장한 공지를 불러오지 못했습니다.");
      if (!signal?.aborted) { setTemplates(data); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "저장한 공지를 불러오지 못했습니다.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load saved server data on mount; updates happen after the request.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function apply(template = selected) {
    if (!template) return false;
    if (hasDraft && !window.confirm("작성 중인 내용을 선택한 공지로 바꿀까요? 담당자·요청일을 포함한 모든 항목을 저장한 내용으로 불러옵니다.")) return;
    onLoad(template); setError(""); setMessage("저장한 공지를 불러왔습니다.");
    return true;
  }
  async function save(method: "POST" | "PUT" | "DELETE") {
    if (saving || disabled) return;
    if (method !== "POST" && !selected) return;
    if (method === "PUT" && !window.confirm(editorOpen && !saveAsNew ? `‘${selected!.name}’ 이름을 ‘${name}’(으)로 변경할까요?` : `‘${selected!.name}’ 저장본을 현재 입력 내용으로 수정할까요?`)) return;
    if (method === "DELETE" && !window.confirm(`‘${selected!.name}’ 저장본을 삭제할까요? 작성 중인 내용과 등록된 업무는 유지됩니다.`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/notice-templates", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "DELETE" ? { id: selectedId } : { ...(method === "PUT" && editorOpen && !saveAsNew ? selected : getDraft?.() ?? draft), name, ...(method === "PUT" ? { id: selectedId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "공지를 저장하지 못했습니다.");
      if (method === "DELETE") {
        setTemplates(previous => previous.filter(template => template.id !== selectedId));
        setSelectedId(""); setName("");
      } else {
        setTemplates(previous => [data, ...previous.filter(template => template.id !== data.id)]);
        setSelectedId(data.id); setName(data.name);
      }
      setEditorOpen(false);
      setMessage(method === "DELETE" ? "저장본을 삭제했습니다." : method === "PUT" ? "저장본을 수정했습니다. 등록된 업무는 변경되지 않습니다." : "자주 쓰는 공지로 저장했습니다. 업무 등록은 아래 버튼에서 진행해주세요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "공지를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <fieldset disabled={disabled || saving} className="space-y-3 border-b border-neutral-200 pb-4">
    <legend className="mb-2 text-sm font-semibold text-neutral-800">자주 쓰는 공지</legend>
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-medium text-neutral-700">저장한 공지
        <select value={selectedId} disabled={loading} onChange={event => {
          const template = templates.find(template => template.id === event.target.value);
          if (template && !apply(template)) return;
          setSelectedId(event.target.value); setName(template?.name ?? "");
          setEditorOpen(false);
        }} className={`${control} mt-1 h-10 w-full min-w-0`}>
          <option value="">{loading ? "불러오는 중…" : templates.length ? "공지 선택" : "저장한 공지가 없습니다"}</option>
          {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label>
      <button type="button" className={iconControl} aria-label="불러오기" title="불러오기" disabled={!selected || loading} onClick={() => apply()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
      </button>
      {!editorOpen && <button type="button" className={iconControl} aria-label={selected ? "저장본에 변경 반영" : "현재 내용 저장"} title={selected ? "저장본에 변경 반영" : "현재 내용 저장"} disabled={!!selected && !hasChanges} onClick={() => {
        if (selected) void save("PUT");
        else { setSaveAsNew(true); setEditorOpen(true); setMessage(""); }
      }}><SaveIcon /></button>}
    </div>
    {selected && !editorOpen && <details className="text-xs text-neutral-600">
      <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-indigo-600">공지 관리</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={control} onClick={() => { setSaveAsNew(true); setEditorOpen(true); setMessage(""); }}>다른 이름으로 저장</button>
        <button type="button" className={control} onClick={() => { setSaveAsNew(false); setEditorOpen(true); setMessage(""); }}>이름 변경</button>
        <button type="button" className={control} onClick={() => void save("DELETE")}>저장본 삭제</button>
      </div>
    </details>}
    {editorOpen && <div className="space-y-2">
      <label className="block text-xs font-medium text-neutral-700">공지 이름
        <input value={name} maxLength={100} onChange={event => setName(event.target.value)} className={`${control} mt-1 w-full`} placeholder="예: 배송 지연 안내" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={iconControl} aria-label={saveAsNew ? "새 공지로 저장" : "선택한 저장본 수정"} title={saveAsNew ? "새 공지로 저장" : "선택한 저장본 수정"} disabled={!name.trim()} onClick={() => void save(saveAsNew ? "POST" : "PUT")}><SaveIcon /></button>
        <button type="button" className={control} onClick={() => setEditorOpen(false)}>닫기</button>
      </div>
    </div>}
    {saving && <p role="status" className="text-xs text-neutral-600">저장 내용을 변경하는 중…</p>}
    {message && <p role="status" className="text-xs leading-5 text-emerald-700">{message}</p>}
    {error && <div className="flex flex-wrap items-center gap-2 text-xs"><p role="alert" className="text-red-700">{error}</p><button type="button" disabled={loading} onClick={() => { setLoading(true); void load(); }} className={control}>목록 새로고침</button></div>}
  </fieldset>;
}
