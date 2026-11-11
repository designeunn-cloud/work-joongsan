"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type TextareaHTMLAttributes, type SetStateAction } from "react";
import Modal from "./Modal";
import JournalSubtaskDropdown from "./JournalSubtaskDropdown";
import { journalSyncFingerprint } from "@/lib/journalSyncState";
import TodayJournalTasks, { JournalExcludeButton } from "./TodayJournalTasks";
import JournalColumnSettings from "./JournalColumnSettings";
import { JOURNAL_COLUMNS, JOURNAL_LAYOUT_KEY, columnWidth, defaultJournalLayout, restoreJournalLayout, type JournalColumn } from "@/lib/journalColumns";
import { toISODate } from "@/lib/dateHelpers";
import { JOURNAL_AUTHORS, journalRowsToTsv, formatJournalHours, toggleJournalSubtaskContent, withJournalWorkTitle, type JournalTableRow } from "@/lib/journalTable";
import { WorkTimeEditor } from "@/components/WorkTime";
import GoogleSheetsJournalSettings from "@/components/GoogleSheetsJournalSettings";
import ProductionTypeEditor from "@/components/ProductionTypeEditor";

type TextDraftKey = "author" | "projectName" | "content" | "hours" | "notes" | "outputLocation";
type JournalEditField = "projectName" | "content" | "notes" | "outputLocation";
type Draft = Partial<Record<TextDraftKey, string>> & { selectedSubtaskIds?: string[] };
type Drafts = Record<string, Record<string, Draft>>;
const DRAFT_STORAGE_KEY = "work-app-journal-drafts-v1";
const COMPETITOR_RESEARCH_SHEET_URL = "https://docs.google.com/spreadsheets/d/1r-m-mm-TxtNRctcFcNzMpuoir8riuAwh1fzZsyySDu8/edit?pli=1&gid=1984931867#gid=1984931867";
const secondaryButton = "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function JournalEntryInput({ autoSize, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoSize: boolean }) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element || !autoSize) return;
    const fit = () => {
      element.style.height = "0px";
      const style = getComputedStyle(element);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      element.style.height = `${Math.ceil(element.scrollHeight + borders)}px`;
    };
    fit();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; fit(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [autoSize, props.value, props.className]);
  return <textarea {...props} ref={input} />;
}

function sameSelection(left: string[], right: string[]) {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((id, index) => id === sortedRight[index]);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function validHours(value: string) { return value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 24); }

function restoreDrafts(): Drafts {
  const parsed: unknown = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const restored: Drafts = {};
  for (const [date, entries] of Object.entries(parsed)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const [id, fields] of Object.entries(entries)) {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
      const draft: Draft = {};
      const values = fields as Record<string, unknown>;
      for (const key of ["author", "content", "hours", "notes", "outputLocation"] as const) {
        if (typeof values[key] === "string") draft[key] = values[key];
      }
      if (Array.isArray(values.selectedSubtaskIds) && values.selectedSubtaskIds.length <= 500
        && values.selectedSubtaskIds.every((id) => typeof id === "string" && /^c[a-z0-9]{24}$/.test(id))) {
        draft.selectedSubtaskIds = [...new Set(values.selectedSubtaskIds as string[])];
      }
      if (Object.keys(draft).length) (restored[date] ??= {})[id] = draft;
    }
  }
  return restored;
}

export default function DailyJournal() {
  const [syncStamps, setSyncStamps] = useState<Record<string, { hash: string; at: string }>>({});
  const [syncFailed, setSyncFailed] = useState(false);
  const autoSaveFailed = useRef("");
  useEffect(() => {
    const update = (event: Event) => setSyncStamps((event as CustomEvent).detail);
    window.addEventListener("journal-auto-synced", update);
    return () => window.removeEventListener("journal-auto-synced", update);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("journal-focus", { detail: true }));
    return () => { window.dispatchEvent(new CustomEvent("journal-focus", { detail: false })); };
  }, []);
  const [layout, setLayoutState] = useState(defaultJournalLayout);
  const layoutRef = useRef(layout);
  const [layoutReady, setLayoutReady] = useState(false);
  const fitToScreen = true;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const resizing = useRef<{ id: string; x: number; width: number; scale: number } | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = restoreJournalLayout(JSON.parse(localStorage.getItem(JOURNAL_LAYOUT_KEY) || "null"));
        layoutRef.current = saved;
        setLayoutState(saved);
      } catch { /* 읽기에 실패해도 저장된 배치를 기본값으로 덮어쓰지 않는다. */ }
      try { const stamps = JSON.parse(localStorage.getItem("journal-sync-stamps-v1") || "{}"); if (stamps && typeof stamps === "object" && !Array.isArray(stamps)) setSyncStamps(stamps); } catch { /* 화면에서 상태를 다시 확인한다. */ }
      setLayoutReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  // Persist only explicit user changes. Fast Refresh reruns effects, so an effect
  // must never save the temporary default layout before restoration completes.
  function setLayout(update: SetStateAction<JournalColumn[]>) {
    if (!layoutReady) return;
    const next = typeof update === "function" ? update(layoutRef.current) : update;
    try { localStorage.setItem(JOURNAL_LAYOUT_KEY, JSON.stringify(next)); }
    catch { /* 저장소가 차단돼도 현재 화면의 조절값은 유지한다. */ }
    layoutRef.current = next;
    setLayoutState(next);
  }
  const visibleColumns = layout.filter(column => column.visible).map(column => ({ ...JOURNAL_COLUMNS.find(item => item.id === column.id)!, ...column }));
  const tableWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0);
  function resizeColumn(id: string, width: number) {
    setLayout(previous => {
      const visible = previous.filter(column => column.visible);
      const index = visible.findIndex(column => column.id === id);
      const current = visible[index];
      const neighbor = visible[index + 1] ?? visible[index - 1];
      if (!current) return previous;
      if (!neighbor) return previous.map(column => column.id === id ? { ...column, width: columnWidth(width) } : column);
      const requested = columnWidth(width) - current.width;
      const delta = Math.max(80 - current.width, neighbor.width - 900, Math.min(requested, 900 - current.width, neighbor.width - 80));
      return previous.map(column => column.id === id ? { ...column, width: current.width + delta } : column.id === neighbor.id ? { ...column, width: neighbor.width - delta } : column);
    });
  }
  function startResize(event: PointerEvent<HTMLButtonElement>, id: string, width: number) {
    event.preventDefault(); const table = event.currentTarget.closest("table")!; const scale = tableWidth / table.getBoundingClientRect().width; resizing.current = { id, x: event.clientX, width, scale }; event.currentTarget.setPointerCapture(event.pointerId);
  }
  const todayISO = toISODate(new Date());
  const [timeVersion, setTimeVersion] = useState(0);
  const [dateISO, setDateISO] = useState(todayISO);
  const [manualTaskIds, setManualTaskIds] = useState<string[]>([]);
  const [rows, setRows] = useState<JournalTableRow[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [draftsReady, setDraftsReady] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedDate, setLoadedDate] = useState("");
  const loadedDateRef = useRef("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productionSaving, setProductionSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registration, setRegistration] = useState<{ message: string; url: string } | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; spreadsheetUrl: string } | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 날짜/화면 전환 중 입력한 일지 초안을 복원한다.
      setDrafts(restoreDrafts());
    } catch { /* 저장소를 쓸 수 없어도 일지 저장은 가능하다. */ }
    setDraftsReady(true);
  }, []);

  useEffect(() => {
    if (!draftsReady) return;
    try { sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts)); } catch { /* DB 저장 기능은 유지한다. */ }
    if (!Object.values(drafts).some((entries) => Object.keys(entries).length)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, draftsReady]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/journal/google-sheets", { signal: controller.signal }).then((res) => {
      if (!res.ok) throw new Error();
      return res.json();
    }).then(setGoogleStatus).catch(() => {
      if (!controller.signal.aborted) setError("구글 연결 상태를 확인하지 못했습니다. 화면을 새로고침해주세요.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (loadedDateRef.current !== dateISO) {
        setLoading(true); setError(""); setRegistration(null); setCopied(false); setSaved(false);
      }
      try {
        const response = await fetch(`/api/journal/${dateISO}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.rows)) throw new Error(data.error || "업무일지를 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          setManualTaskIds(data.manualTaskIds ?? []); setRows(data.rows); setPreview(!!data.preview); setLoadedDate(dateISO); loadedDateRef.current = dateISO;
        }
      } catch (cause) {
        if (!controller.signal.aborted) { setRows([]); setLoadedDate(""); setError(cause instanceof Error ? cause.message : "업무일지를 불러오지 못했습니다."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [dateISO, timeVersion]);

  useEffect(() => {
    const update = () => setTimeVersion(v => v + 1);
    window.addEventListener("work-time-updated", update);
    window.addEventListener("journal-membership-updated", update);
    window.addEventListener("tasks-updated", update);
    window.addEventListener("focus", update);
    return () => { window.removeEventListener("work-time-updated", update); window.removeEventListener("journal-membership-updated", update); window.removeEventListener("tasks-updated", update); window.removeEventListener("focus", update); };
  }, []);


  const dayDrafts = drafts[dateISO] ?? {};
  const editedCount = rows.filter((row) => Object.keys(dayDrafts[row.taskId] ?? {}).length).length;
  const otherDraftDates = Object.entries(drafts).filter(([date, entries]) => date !== dateISO && Object.keys(entries).length).map(([date]) => date).sort();
  const hasInvalidHours = rows.some((row) => !validHours(dayDrafts[row.taskId]?.hours ?? formatJournalHours(row.hours)));
  const currentRows = useMemo(() => rows.map((row) => {
    const draft = drafts[dateISO]?.[row.taskId];
    return { ...row, ...draft, content: withJournalWorkTitle(draft?.content ?? row.content, row.workTitle ?? row.taskName), hours: draft?.hours === undefined ? row.hours : draft.hours.trim() === "" ? null : Number(draft.hours) };
  }), [rows, drafts, dateISO]);
  const unavailable = loading || loadedDate !== dateISO || !draftsReady;
  const syncHash = `${googleStatus?.spreadsheetUrl ?? ""}|${journalSyncFingerprint(currentRows)}`;
  const lastSync = syncStamps[dateISO];
  const sheetState = !googleStatus?.configured ? "미연결" : registering ? "동기화 중" : syncFailed ? "다시 확인 필요" : unavailable ? "확인 중" : lastSync?.hash === syncHash ? "반영 완료" : lastSync ? "변경사항 있음" : "확인 기록 없음";
  const busy = saving || productionSaving || registering;
  function updateProduction(taskId: string, productionType: JournalTableRow["productionType"]) {
    setRows(previous => previous.map(row => row.taskId === taskId ? { ...row, productionType } : row)); setCopied(false);
  }

  function edit(row: JournalTableRow, key: TextDraftKey, value: string) {
    setSaved(false); setCopied(false);
    setDrafts((previous) => {
      const dateDrafts = { ...previous[dateISO] };
      const draft = { ...dateDrafts[row.taskId], [key]: value };
      const original = key === "hours" ? formatJournalHours(row.hours) : row[key];
      if (value === original) delete draft[key];
      if (Object.keys(draft).length) dateDrafts[row.taskId] = draft;
      else delete dateDrafts[row.taskId];
      return { ...previous, [dateISO]: dateDrafts };
    });
  }

  function selectSubtask(row: JournalTableRow, subtask: JournalTableRow["subtasks"][number], checked: boolean) {
    setSaved(false); setCopied(false);
    setDrafts((previous) => {
      const dateDrafts = { ...previous[dateISO] };
      const draft = { ...dateDrafts[row.taskId] };
      const next = toggleJournalSubtaskContent(draft.content ?? row.content,
        draft.selectedSubtaskIds ?? row.selectedSubtaskIds ?? [], subtask, checked, row.subtasks ?? [], row.workTitle ?? row.taskName);
      if (next.content === row.content) delete draft.content;
      else draft.content = next.content;
      if (sameSelection(next.selectedSubtaskIds, row.selectedSubtaskIds ?? [])) delete draft.selectedSubtaskIds;
      else draft.selectedSubtaskIds = next.selectedSubtaskIds;
      if (Object.keys(draft).length) dateDrafts[row.taskId] = draft;
      else delete dateDrafts[row.taskId];
      return { ...previous, [dateISO]: dateDrafts };
    });
  }

  async function save(): Promise<boolean> {
    if (unavailable || saving || productionSaving || hasInvalidHours) return false;
    if (!editedCount) return true;
    setSaving(true); setError(""); setSaved(false);
    const changes = rows.filter((row) => dayDrafts[row.taskId]).map((row) => {
      const draft = dayDrafts[row.taskId];
      return { taskId: row.taskId, ...draft, ...(draft.hours === undefined ? {} : { hours: draft.hours.trim() === "" ? null : Number(draft.hours) }) };
    });
    try {
      const response = await fetch(`/api/journal/${dateISO}/rows`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: changes }),
      });
      const data = await response.json();
      if (!response.ok || data.dateISO !== dateISO || !Array.isArray(data.rows)) throw new Error(data.error || "업무일지를 저장하지 못했습니다.");
      setRows(data.rows);
      window.dispatchEvent(new Event("journal-updated"));
      setDrafts((previous) => {
        const remaining = { ...previous[dateISO] };
        for (const change of changes) delete remaining[change.taskId];
        return { ...previous, [dateISO]: remaining };
      });
      setSaved(true);
      autoSaveFailed.current = "";
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "업무일지를 저장하지 못했습니다. 입력한 내용을 유지했습니다."); return false; }
    finally { setSaving(false); }
  }

  const saveAutomatically = useEffectEvent(async (draftKey: string) => {
    if (!await save()) autoSaveFailed.current = draftKey;
  });
  const draftKey = `${dateISO}:${JSON.stringify(dayDrafts)}`;
  useEffect(() => {
    if (unavailable || busy || !editedCount || hasInvalidHours || autoSaveFailed.current === draftKey) return;
    const timer = setTimeout(() => void saveAutomatically(draftKey), 1000);
    return () => clearTimeout(timer);
  }, [draftKey, unavailable, busy, editedCount, hasInvalidHours]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(journalRowsToTsv(currentRows, undefined, false));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { setError("표를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해주세요."); }
  }

  async function registerGoogleSheet() {
    if (unavailable || registering || saving || productionSaving || hasInvalidHours || !googleStatus?.configured) return;
    setRegistering(true); setSyncFailed(false); setError(""); setRegistration(null);
    try {
      if (!await save()) return;
      const response = await fetch("/api/journal/google-sheets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateISO }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "구글 시트에 등록하지 못했습니다.");
      const stamps = { ...syncStamps, [dateISO]: { hash: syncHash, at: new Date().toISOString() } };
      setSyncStamps(stamps);
      try { localStorage.setItem("journal-sync-stamps-v1", JSON.stringify(stamps)); } catch { /* 현재 화면의 상태는 유지한다. */ }
      setRegistration({ message: `${dateISO} 업무일지 12개 항목을 동기화했습니다. 신규 ${data.created}건 · 업데이트 ${data.updated}건 · 삭제 반영 ${data.removed}건`, url: data.url });
    } catch (cause) { setSyncFailed(true); setError(`앱 저장은 완료했습니다. ${cause instanceof Error ? cause.message : "시트 동기화를 다시 시도해주세요."}`); }
    finally { setRegistering(false); }
  }

  async function copyAndOpenResearchSheet() {
    try {
      await navigator.clipboard.writeText(currentRows.map((row) => [row.projectName, row.content].filter(Boolean).join("\n")).join("\n"));
      window.open(COMPETITOR_RESEARCH_SHEET_URL, "_blank", "noopener,noreferrer");
    } catch { setError("업무내용을 복사하지 못했습니다. 클립보드 권한을 확인해주세요."); }
  }

  return <section aria-label="일일 업무일지" className="min-w-0" data-journal-view>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">일일 업무일지</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDateISO(date => addDays(date,-1))} disabled={busy} className={secondaryButton} aria-label="이전날">이전</button>
          <input type="date" aria-label="업무일지 날짜" value={dateISO} disabled={busy} onChange={event => { if (event.target.value) { setSyncFailed(false); setDateISO(event.target.value); } }} className="min-h-9 w-36 rounded-lg border border-neutral-300 bg-white px-2 text-sm tabular-nums"/>
          <button type="button" onClick={() => setDateISO(date => addDays(date,1))} disabled={busy} className={secondaryButton} aria-label="다음날">다음</button>
          {dateISO !== todayISO && <button type="button" onClick={() => setDateISO(todayISO)} disabled={busy} className={secondaryButton}>오늘</button>}
          {!unavailable && <span className="text-xs text-neutral-600">{rows.length}건</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="일지 작성과 저장">
        {dateISO === todayISO && <TodayJournalTasks disabled={busy} />}
        <button type="button" onClick={() => void save()} disabled={unavailable || busy || !editedCount || hasInvalidHours} className={secondaryButton} title="처리내용·작성자·비고·결과물 위치를 앱에 저장합니다">{saving ? "저장 중…" : "일지 저장"}</button>
        <button type="button" onClick={() => void registerGoogleSheet()} disabled={unavailable || busy || hasInvalidHours || !googleStatus?.configured} className="min-h-9 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:opacity-50">{registering ? "저장·동기화 중…" : "일지 저장 후 시트 동기화"}</button>
      </div>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-y border-neutral-200 py-2">
      <div role="status" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className={editedCount ? "text-amber-800" : "text-neutral-700"}>앱: {saving ? "저장 중" : unavailable ? "불러오는 중" : editedCount ? `${editedCount}건 저장 전` : saved ? "저장 완료" : "저장됨"}</span>
        <span className={sheetState === "반영 완료" ? "text-emerald-700" : "text-neutral-700"} title={lastSync?.at ? `마지막 동기화: ${new Date(lastSync.at).toLocaleString("ko-KR")}` : undefined}>시트: {sheetState}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="표 표시와 복사">
        <button type="button" onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen} disabled={!layoutReady} className={secondaryButton}>표 설정</button>
        <button type="button" onClick={copy} disabled={unavailable || busy || !rows.length || hasInvalidHours} className={secondaryButton} title="제목 행 없이 숨긴 열을 포함한 12개 항목을 기본 순서로 복사합니다">{copied ? "복사됨" : "내용 복사"}</button>
      </div>
    </div>
    <p id="journal-table-help" className="mb-3 text-xs leading-5 text-neutral-600">프로젝트명은 연결된 프로젝트에서 가져옵니다. 처리내용에는 업무명이 기본으로 들어가며 세부할일을 아래에 추가할 수 있습니다. <strong className="font-medium text-neutral-800">소요시간·작업구분은 즉시 저장</strong>됩니다.</p>
    {otherDraftDates.length > 0 && <div className="mb-3 flex flex-wrap gap-2 text-xs text-amber-800"><span>다른 날짜의 저장 전 초안:</span>{otherDraftDates.map(date => <button type="button" key={date} onClick={() => setDateISO(date)} disabled={busy} className="underline">{date}</button>)}</div>}
    {registration && <p role="status" className="mb-3 text-sm text-emerald-700">{registration.message} <a href={registration.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">시트에서 보기</a></p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {loading ? <p role="status" className="py-6 text-sm text-neutral-600">업무일지를 불러오는 중…</p> : !rows.length ? <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-8 text-sm text-neutral-600">이 날짜에 포함된 업무가 없습니다. 오늘 날짜에서 ‘업무 추가’를 눌러 기록할 업무를 선택하세요.</p> :
      <div role="region" aria-label="업무일지 표" aria-describedby="journal-table-help" tabIndex={0} className={`max-h-[72vh] overflow-auto rounded-lg border border-neutral-300 bg-white focus-visible:outline-2 focus-visible:outline-indigo-600 ${fitToScreen ? "journal-fit" : ""}`}>
        <table className="table-fixed border-separate border-spacing-0 text-left text-xs" style={{ width: fitToScreen ? "100%" : tableWidth, minWidth: fitToScreen ? 0 : tableWidth }}>
          <caption className="sr-only">{dateISO} 업무일지</caption>
          <colgroup>{visibleColumns.map(column => <col key={column.id} style={{ width: fitToScreen ? `${column.width/tableWidth*100}%` : column.width }}/>)}</colgroup>
          <thead className="sticky top-0 z-10"><tr>{visibleColumns.map(column => <th key={column.id} scope="col" className="relative border-b border-r border-neutral-300 bg-neutral-100 px-2 py-3 pr-3 text-center font-semibold text-neutral-800 last:border-r-0">
            {column.label}{(column.index === 7 || column.index === 9) && <span className="mt-1 block text-[10px] font-normal text-neutral-600">즉시 저장</span>}
            <button type="button" disabled={!layoutReady} role="separator" aria-orientation="vertical" aria-label={`${column.label} 열 너비 조절`} aria-valuemin={80} aria-valuemax={900} aria-valuenow={column.width} title="드래그 또는 방향키로 너비 조절" className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none border-r-2 border-transparent hover:border-indigo-500 focus-visible:border-indigo-600 focus-visible:outline-none" onPointerDown={event => startResize(event,column.id,column.width)} onPointerMove={event => { const start = resizing.current; if (start?.id === column.id) resizeColumn(column.id,start.width+(event.clientX-start.x)*start.scale); }} onPointerUp={event => { resizing.current=null; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { resizing.current=null; }} onLostPointerCapture={() => { resizing.current=null; }} onDoubleClick={() => resizeColumn(column.id,JOURNAL_COLUMNS.find(item=>item.id===column.id)!.width)} onKeyDown={event => { if(event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizeColumn(column.id,column.width+(event.key === "ArrowRight"?10:-10)); } }}/>
          </th>)}</tr></thead>
          <tbody>{currentRows.map((row,index) => {
            const draft = dayDrafts[row.taskId];
            const label = `${index+1}행`;
            const source = rows.find(item => item.taskId === row.taskId)!;
            const previewCell = (key: JournalEditField, text: string, placeholder: string) => <div className="journal-inline-field">
              <JournalEntryInput autoSize={key === "content" || key === "notes"} aria-label={`${label} ${placeholder}`} rows={2} readOnly={key === "projectName"} title={key === "projectName" ? "업무에 연결된 프로젝트 이름입니다" : undefined} maxLength={key === "content" ? 40000 : key === "notes" ? 10000 : key === "outputLocation" ? 4000 : 1000} disabled={busy} value={text} placeholder={placeholder} onChange={key === "projectName" ? undefined : event => edit(source,key,event.target.value)} className={`journal-entry ${key === "content" ? "journal-entry-content" : key === "notes" ? "journal-entry-notes" : ""} ${key === "content" && row.subtasks.length > 0 ? "journal-entry-with-subtasks" : ""} w-full min-w-0 resize-none rounded-md border border-neutral-300 bg-white px-2 py-2 leading-5 text-neutral-900 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-indigo-600`} />
            </div>;
            const dateCell = (value: string) => <span className="whitespace-nowrap tabular-nums" title={value || "미입력"} aria-label={value || "미입력"}>{value ? value.slice(5).replace("-",".") : "—"}</span>;
            const cells = [
              <div key="author"><select aria-label={`${label} 작성자`} disabled={busy} value={row.author} onChange={event=>edit(source,"author",event.target.value)} className="w-full min-w-0 rounded border border-neutral-300 bg-white px-1 py-2"><option value="">미선택</option>{JOURNAL_AUTHORS.map(author=><option key={author}>{author}</option>)}</select>{manualTaskIds.includes(row.taskId) && <p className="mt-1 text-center text-[10px] text-neutral-600">직접 추가</p>}</div>,
              <span key="date">{dateCell(row.dateISO)}</span>,
              <span key="category" className="block break-words text-center">{row.workCategory || "미분류"}</span>,
              <div key="project">{previewCell("projectName",row.projectName,"프로젝트 미연결")}</div>,
              <div key="content" className="journal-content-cell">
                {row.subtasks.length > 0 && <div className="journal-subtask-anchor"><JournalSubtaskDropdown row={row} rowLabel={label} disabled={busy} onToggle={(subtask,checked)=>selectSubtask(source,subtask,checked)}/></div>}
                {previewCell("content",row.content,"처리내용 작성")}
              </div>,
              <span key="due">{dateCell(row.dueDate)}</span>,
              <span key="completed">{dateCell(row.completedDate)}</span>,
              <WorkTimeEditor key="hours" taskId={row.taskId} taskName={row.taskName || row.projectName} date={dateISO} hours={row.hours} compact disabled={busy}/>,
              <span key="status" className={`journal-status ${row.status === "완료" ? "text-emerald-700" : row.status === "진행중" ? "text-blue-700" : "text-neutral-700"}`}>{row.status}</span>,
              <ProductionTypeEditor key={`${row.taskId}-${row.productionType ?? "empty"}`} taskId={row.taskId} value={row.productionType} compact disabled={busy} onSavingChange={setProductionSaving} onSaved={value=>updateProduction(row.taskId,value)}/>,
              <div key="notes">{previewCell("notes",row.notes,"비고 입력")}</div>,
              <div key="output">{previewCell("outputLocation",row.outputLocation,"경로 입력")}</div>,
            ];
            return <tr key={row.taskId} className={draft ? "bg-indigo-50/40" : "bg-white"}>{visibleColumns.map(column=><td key={column.id} className="border-b border-r border-neutral-200 px-1 py-2 align-top last:border-r-0">{column.id === "management" ? <div className="text-center"><JournalExcludeButton compact taskId={row.taskId} date={dateISO} disabled={busy}/></div> : cells[column.index]}</td>)}</tr>;
          })}</tbody>
        </table>
      </div>}
    {settingsOpen && <Modal onClose={()=>setSettingsOpen(false)} widthClassName="max-w-2xl"><h2 className="mb-3 text-lg font-semibold text-neutral-900">업무일지 표 설정</h2><p className="mb-3 text-xs text-neutral-600">열 너비는 화면 안에서 비율로 조절됩니다. 가로 스크롤 없이 전체 열을 표시합니다.</p><JournalColumnSettings layout={layout} onChange={setLayout}/><div className="flex justify-end"><button type="button" onClick={()=>setSettingsOpen(false)} className={secondaryButton}>닫기</button></div></Modal>}
    <details className="mt-4 rounded-lg border border-neutral-200 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-neutral-700">작성 규칙·저장 방식 안내</summary><div className="mt-3 space-y-2 text-xs leading-6 text-neutral-600"><p>처리내용·작성자·비고 등은 입력을 멈추면 자동 저장되고 시트에도 반영됩니다. 저장에 실패하면 입력한 초안을 날짜별로 유지합니다.</p><p>소요시간은 입력창에서 저장할 때, 작업구분은 선택할 때 즉시 앱에 반영됩니다. 앱에 저장한 변경은 시트에 자동 반영됩니다. 전송 실패 시 앱 기록을 유지하고 다시 시도합니다.</p><p>완료한 세부할일도 일지에 선택할 수 있으며 직접 고친 문장은 유지됩니다. 날짜는 표에서 월·일로 줄여 보여주며 전체 날짜는 날짜 위에 마우스를 올리거나 복사·시트에서 확인할 수 있습니다. 프로젝트명은 원본 업무의 프로젝트 연결에서 변경할 수 있습니다.</p>{preview && <p>오늘 일지는 업무 정보에서 자동 구성됩니다. 오늘 등록했거나 상태·처리내용·비고·소요시간 등을 기록한 업무가 오늘 일지에 포함됩니다. 미완료라는 이유만으로 다음날에 추가되지는 않습니다. 추가로 기록할 업무는 ‘업무 추가’에서 선택할 수 있습니다.</p>}</div></details>
    <details className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-neutral-700">구글 시트 연결·추가 도구</summary><div className="mt-3"><p className="mb-3 text-xs leading-5 text-neutral-600">입력한 결과물 폴더 위치를 포함한 업무일지를 연결된 시트에 전송합니다. 날짜와 업무 ID가 같은 행을 갱신하고, 삭제·제외된 업무의 앱 등록 내용은 해당 날짜의 시트에서도 지웁니다. 기존 수기 행은 유지합니다.</p><GoogleSheetsJournalSettings configured={googleStatus?.configured ?? false} busy={registering} onConnected={spreadsheetUrl=>setGoogleStatus({configured:true,spreadsheetUrl})}/>{googleStatus && <a href={googleStatus.spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="mr-3 text-xs text-indigo-700 underline underline-offset-2">연결된 시트 열기</a>}<button type="button" onClick={()=>void copyAndOpenResearchSheet()} disabled={unavailable || busy || !rows.length} className={secondaryButton}>업무내용 복사 · 경쟁업체 시트 열기</button></div></details>
  </section>;
}
