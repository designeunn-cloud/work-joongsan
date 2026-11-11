"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_ORDER, STATUS_LABELS, type TaskStatus } from "@/lib/statusConfig";
import type { Task } from "@/lib/clientTypes";
import { daysLate } from "@/lib/bucketTasks";
import { baseName } from "@/lib/ruleBasedInterpret";
import { formatAbsoluteDate } from "@/lib/relativeDate";
import DateEditor from "./DateEditor";
import StatusSegment from "./StatusSegment";
import MemoModal from "./MemoModal";
import RawTextModal from "./RawTextModal";
import type { DateField } from "./TaskCard";

type ColumnKey =
  | "requestContent"
  | "project"
  | "brand"
  | "assignee"
  | "department"
  | "status"
  | "startDate"
  | "endDate"
  | "reviewDate"
  | "dueDate"
  | "requestDate"
  | "tags"
  | "memo"
  | "rawText"
  | "platform"
  | "productName"
  | "folderName"
  | "actions";

type SortableKey = Exclude<ColumnKey, "tags" | "memo" | "rawText" | "actions">;
type GroupKey = "none" | "status" | "assignee" | "department" | "project" | "brand";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  sortable: boolean;
  toggleable: boolean;
  defaultWidth: number;
  align?: "right";
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: "requestContent", label: "업무명", sortable: true, toggleable: false, defaultWidth: 220 },
  { key: "project", label: "프로젝트", sortable: true, toggleable: true, defaultWidth: 130 },
  { key: "brand", label: "브랜드", sortable: true, toggleable: true, defaultWidth: 100 },
  { key: "assignee", label: "담당자", sortable: true, toggleable: true, defaultWidth: 90 },
  { key: "department", label: "부서", sortable: true, toggleable: true, defaultWidth: 90 },
  { key: "status", label: "상태", sortable: true, toggleable: true, defaultWidth: 90 },
  { key: "startDate", label: "시작일", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "endDate", label: "종료일", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "reviewDate", label: "검토일", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "dueDate", label: "마감일", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "requestDate", label: "요청일", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "tags", label: "태그", sortable: false, toggleable: true, defaultWidth: 140 },
  { key: "memo", label: "메모", sortable: false, toggleable: true, defaultWidth: 60 },
  { key: "rawText", label: "원문", sortable: false, toggleable: true, defaultWidth: 60 },
  { key: "platform", label: "플랫폼", sortable: true, toggleable: true, defaultWidth: 100 },
  { key: "productName", label: "제품명", sortable: true, toggleable: true, defaultWidth: 110 },
  { key: "folderName", label: "폴더", sortable: true, toggleable: true, defaultWidth: 200 },
  { key: "actions", label: "", sortable: false, toggleable: false, defaultWidth: 150, align: "right" },
];

const ALL_KEYS = COLUMN_DEFS.map((c) => c.key);
const TOGGLEABLE_KEYS = COLUMN_DEFS.filter((c) => c.toggleable).map((c) => c.key);
const SORTABLE_KEYS = COLUMN_DEFS.filter((c) => c.sortable).map((c) => c.key);

const VISIBLE_COLUMNS_KEY = "taskTable.visibleColumns";
const COL_WIDTHS_KEY = "taskTable.colWidths";
const COLUMN_ORDER_KEY = "taskTable.columnOrder";
const SORT_KEY_KEY = "taskTable.sortKey";
const SORT_DIR_KEY = "taskTable.sortDir";
const GROUP_BY_KEY = "taskTable.groupBy";

/** 저장된 순서에 이제 없는 컬럼(예: 삭제된 속성)은 걸러내고, 새로 생긴 컬럼은 뒤에 붙인다. */
function sanitizeOrder(order: ColumnKey[]): ColumnKey[] {
  const known = new Set(TOGGLEABLE_KEYS);
  const cleaned = order.filter((k, i) => known.has(k) && order.indexOf(k) === i);
  const missing = TOGGLEABLE_KEYS.filter((k) => !cleaned.includes(k));
  return [...cleaned, ...missing];
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시 (예: 프라이빗 모드)
  }
}

const GROUP_OPTIONS: Array<{ value: GroupKey; label: string }> = [
  { value: "none", label: "그룹 없음" },
  { value: "status", label: "상태별" },
  { value: "assignee", label: "담당자별" },
  { value: "department", label: "부서별" },
  { value: "project", label: "프로젝트별" },
  { value: "brand", label: "브랜드별" },
];

const STATUS_FILTER_OPTIONS: Array<{ value: TaskStatus | "all"; label: string }> = [
  { value: "all", label: "전체" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function FolderIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}
function FollowUpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 3v10a2 2 0 0 0 2 2h9" />
      <path d="M16 11l4 4-4 4" />
      <circle cx="5" cy="3" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function MemoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M9 13h6M9 17h4" />
    </svg>
  );
}
function DocTextIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
      <path d="M8 12h8M8 15h8M8 18h5" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.66 20.66 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.66 20.66 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h13M21 18h0" />
      <circle cx="15" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ko");
}

function sortValueFor(task: Task, key: SortableKey): string | number | null {
  switch (key) {
    case "requestContent":
      return task.requestContent;
    case "project":
      return task.project?.name ?? null;
    case "brand":
      return task.brand;
    case "assignee":
      return task.assignee;
    case "department":
      return task.department;
    case "status":
      return STATUS_ORDER.indexOf(task.status);
    case "startDate":
      return new Date(task.startDate).getTime();
    case "endDate":
      return task.endDate ? new Date(task.endDate).getTime() : null;
    case "reviewDate":
      return task.reviewDate ? new Date(task.reviewDate).getTime() : null;
    case "dueDate":
      return task.dueDate ? new Date(task.dueDate).getTime() : null;
    case "requestDate":
      return new Date(task.requestDate).getTime();
    case "platform":
      return task.platform;
    case "productName":
      return task.productName;
    case "folderName":
      return task.folderName;
  }
}

function groupInfo(task: Task, groupBy: GroupKey): { key: string; label: string } {
  switch (groupBy) {
    case "status":
      return { key: task.status, label: STATUS_LABELS[task.status] };
    case "assignee":
      return { key: baseName(task.assignee), label: baseName(task.assignee) };
    case "department":
      return { key: task.department ?? "", label: task.department ?? "미지정" };
    case "project":
      return { key: task.project?.name ?? "", label: task.project?.name ?? "미지정" };
    case "brand":
      return { key: task.brand ?? "", label: task.brand ?? "미지정" };
    default:
      return { key: "", label: "" };
  }
}

export default function TaskTable({
  tasks,
  onUpdateStatus,
  onOpenFolder,
  onUpdateDate,
  onEdit,
  onDelete,
  onCreateFollowUp,
}: {
  tasks: Task[];
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onOpenFolder: (id: string) => void;
  onUpdateDate: (id: string, field: DateField, iso: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onCreateFollowUp?: (task: Task) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [monthFilter, setMonthFilter] = useState<number | "all">("all");
  const [sortKey, setSortKey] = useState<SortableKey>(() => {
    const saved = loadJSON<string>(SORT_KEY_KEY, "startDate");
    return (SORTABLE_KEYS as readonly string[]).includes(saved) ? (saved as SortableKey) : "startDate";
  });
  const [sortDir, setSortDir] = useState<1 | -1>(() => (loadJSON<number>(SORT_DIR_KEY, 1) === -1 ? -1 : 1));
  const [groupBy, setGroupBy] = useState<GroupKey>(() => {
    const saved = loadJSON<string>(GROUP_BY_KEY, "none");
    return GROUP_OPTIONS.some((o) => o.value === saved) ? (saved as GroupKey) : "none";
  });
  const [memoTask, setMemoTask] = useState<Task | null>(null);
  const [rawTextTask, setRawTextTask] = useState<Task | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const [visibleKeys, setVisibleKeys] = useState<Set<ColumnKey>>(
    () => new Set(loadJSON<ColumnKey[]>(VISIBLE_COLUMNS_KEY, ALL_KEYS))
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    loadJSON<Record<string, number>>(COL_WIDTHS_KEY, {})
  );
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() =>
    sanitizeOrder(loadJSON<ColumnKey[]>(COLUMN_ORDER_KEY, TOGGLEABLE_KEYS))
  );
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [resizing, setResizing] = useState<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);
  const [propsOpen, setPropsOpen] = useState(false);
  const propsRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveJSON(VISIBLE_COLUMNS_KEY, Array.from(visibleKeys)), [visibleKeys]);
  useEffect(() => saveJSON(COL_WIDTHS_KEY, colWidths), [colWidths]);
  useEffect(() => saveJSON(COLUMN_ORDER_KEY, columnOrder), [columnOrder]);
  useEffect(() => saveJSON(SORT_KEY_KEY, sortKey), [sortKey]);
  useEffect(() => saveJSON(SORT_DIR_KEY, sortDir), [sortDir]);
  useEffect(() => saveJSON(GROUP_BY_KEY, groupBy), [groupBy]);

  function reorderColumn(from: ColumnKey, to: ColumnKey) {
    if (from === to) return;
    setColumnOrder((order) => {
      const next = order.filter((k) => k !== from);
      const toIdx = next.indexOf(to);
      next.splice(toIdx, 0, from);
      return next;
    });
  }

  useEffect(() => {
    if (!activeRowId) return;
    function handler(e: PointerEvent) {
      if (tableWrapRef.current && !tableWrapRef.current.contains(e.target as Node)) setActiveRowId(null);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [activeRowId]);

  useEffect(() => {
    if (!propsOpen) return;
    function handler(e: PointerEvent) {
      if (propsRef.current && !propsRef.current.contains(e.target as Node)) setPropsOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [propsOpen]);

  useEffect(() => {
    if (!resizing) return;
    const active = resizing;
    function onMove(e: PointerEvent) {
      setColWidths((w) => ({
        ...w,
        [active.key]: Math.max(60, active.startWidth + (e.clientX - active.startX)),
      }));
    }
    function onUp() {
      setResizing(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resizing.key/startX/startWidth은 드래그 시작 시점 값 그대로 써야 함
  }, [resizing?.key, resizing?.startX, resizing?.startWidth]);

  function toggleSort(key: SortableKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columnByKey = useMemo(() => new Map(COLUMN_DEFS.map((c) => [c.key, c])), []);

  const visibleColumns = useMemo(() => {
    const pinnedStart = COLUMN_DEFS.filter((c) => !c.toggleable && c.key !== "actions");
    const pinnedEnd = COLUMN_DEFS.filter((c) => c.key === "actions");
    const middle = columnOrder.filter((k) => visibleKeys.has(k)).map((k) => columnByKey.get(k)!);
    return [...pinnedStart, ...middle, ...pinnedEnd];
  }, [visibleKeys, columnOrder, columnByKey]);

  const availableYears = useMemo(
    () => Array.from(new Set(tasks.map((t) => new Date(t.startDate).getFullYear()))).sort((a, b) => b - a),
    [tasks]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      const started = new Date(t.startDate);
      if (yearFilter !== "all" && started.getFullYear() !== yearFilter) return false;
      if (monthFilter !== "all" && started.getMonth() + 1 !== monthFilter) return false;
      if (!q) return true;
      const hay = [t.requestContent, t.assignee, t.department, t.brand, t.project?.name, t.productName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return [...filtered].sort((a, b) => sortDir * compareValues(sortValueFor(a, sortKey), sortValueFor(b, sortKey)));
  }, [tasks, query, statusFilter, yearFilter, monthFilter, sortKey, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all__", label: null as string | null, rows }];
    const map = new Map<string, { label: string; rows: Task[] }>();
    for (const t of rows) {
      const { key, label } = groupInfo(t, groupBy);
      if (!map.has(key)) map.set(key, { label, rows: [] });
      map.get(key)!.rows.push(t);
    }
    const entries = Array.from(map.entries());
    entries.sort(([aKey], [bKey]) => {
      if (groupBy === "status") return STATUS_ORDER.indexOf(aKey as TaskStatus) - STATUS_ORDER.indexOf(bKey as TaskStatus);
      if (!aKey && !bKey) return 0;
      if (!aKey) return 1;
      if (!bKey) return -1;
      return aKey.localeCompare(bKey, "ko");
    });
    return entries.map(([key, v]) => ({ key, label: v.label as string | null, rows: v.rows }));
  }, [rows, groupBy]);

  const totalWidth = visibleColumns.reduce((sum, c) => sum + (colWidths[c.key] ?? c.defaultWidth), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 border border-neutral-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="업무명, 담당자, 브랜드, 프로젝트 검색"
            className="text-sm outline-none w-full placeholder:text-neutral-400"
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`text-xs px-2.5 py-1.5 rounded-full border font-medium ${
                statusFilter === opt.value
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5 text-neutral-600"
        >
          <option value="all">전체 연도</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5 text-neutral-600"
        >
          <option value="all">전체 월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupKey)}
          className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5 text-neutral-600"
        >
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="relative" ref={propsRef}>
          <button
            onClick={() => setPropsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          >
            <SlidersIcon />
            속성
          </button>
          {propsOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white border border-neutral-200 rounded-lg shadow-md p-1.5">
              <p className="px-2 pt-1 pb-1.5 text-[11px] text-neutral-400">드래그해서 순서 변경</p>
              {columnOrder.map((key) => {
                const col = columnByKey.get(key);
                if (!col) return null;
                const visible = visibleKeys.has(key);
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDragKey(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKey) reorderColumn(dragKey, key);
                      setDragKey(null);
                    }}
                    onDragEnd={() => setDragKey(null)}
                    className={`flex items-center gap-0.5 rounded-lg ${dragKey === key ? "opacity-30" : ""}`}
                  >
                    <span className="cursor-grab text-neutral-300 pl-1 shrink-0" title="드래그해서 순서 변경">
                      <DragHandleIcon />
                    </span>
                    <button
                      onClick={() => toggleColumn(key)}
                      className={`flex items-center gap-2 flex-1 min-w-0 px-1.5 py-1.5 text-sm rounded-lg hover:bg-neutral-50 ${
                        visible ? "text-neutral-700" : "text-neutral-400"
                      }`}
                    >
                      {visible ? <EyeIcon /> : <EyeOffIcon />}
                      {col.label}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <span className="text-xs text-neutral-400 ml-auto">{rows.length}건</span>
      </div>

      <div className="border border-neutral-200 rounded-xl overflow-x-auto" ref={tableWrapRef}>
        <table className="text-sm border-collapse table-fixed" style={{ width: totalWidth, minWidth: "100%" }}>
          <colgroup>
            {visibleColumns.map((col) => (
              <col key={col.key} style={{ width: colWidths[col.key] ?? col.defaultWidth }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`relative text-left font-medium text-neutral-500 text-xs px-3 py-2 whitespace-nowrap ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                >
                  <span
                    onClick={col.sortable ? () => toggleSort(col.key as SortableKey) : undefined}
                    className={col.sortable ? "cursor-pointer select-none hover:text-neutral-800" : ""}
                  >
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-indigo-600">{sortDir === 1 ? " ▲" : " ▼"}</span>
                    )}
                  </span>
                  {col.key !== "actions" && (
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setResizing({ key: col.key, startX: e.clientX, startWidth: colWidths[col.key] ?? col.defaultWidth });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300/70"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              {group.label !== null && (
                <tr className="bg-neutral-50/70">
                  <td colSpan={visibleColumns.length} className="px-3 py-1.5 text-xs font-semibold text-neutral-600 border-b border-neutral-200">
                    {group.label} <span className="text-neutral-400 font-normal">{group.rows.length}건</span>
                  </td>
                </tr>
              )}
              {group.rows.map((task) => (
                <TaskTableRow
                  key={task.id}
                  task={task}
                  columns={visibleColumns}
                  active={activeRowId === task.id}
                  onActivate={() => setActiveRowId(task.id)}
                  onUpdateStatus={onUpdateStatus}
                  onOpenFolder={onOpenFolder}
                  onUpdateDate={onUpdateDate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onCreateFollowUp={onCreateFollowUp}
                  onOpenMemo={setMemoTask}
                  onOpenRawText={setRawTextTask}
                />
              ))}
            </tbody>
          ))}
        </table>
        {rows.length === 0 && <p className="text-center text-sm text-neutral-400 py-8">조건에 맞는 업무가 없습니다.</p>}
      </div>

      {memoTask && memoTask.memo && (
        <MemoModal title={memoTask.requestContent} memo={memoTask.memo} onClose={() => setMemoTask(null)} />
      )}
      {rawTextTask && rawTextTask.rawExtractedText && (
        <RawTextModal
          fileName={rawTextTask.sourceFileName}
          rawText={rawTextTask.rawExtractedText}
          onClose={() => setRawTextTask(null)}
        />
      )}
    </div>
  );
}

function TaskTableRow({
  task,
  columns,
  active,
  onActivate,
  onUpdateStatus,
  onOpenFolder,
  onUpdateDate,
  onEdit,
  onDelete,
  onCreateFollowUp,
  onOpenMemo,
  onOpenRawText,
}: {
  task: Task;
  columns: ColumnDef[];
  active: boolean;
  onActivate: () => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onOpenFolder: (id: string) => void;
  onUpdateDate: (id: string, field: DateField, iso: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onCreateFollowUp?: (task: Task) => void;
  onOpenMemo: (task: Task) => void;
  onOpenRawText: (task: Task) => void;
}) {
  const [openDateField, setOpenDateField] = useState<DateField | null>(null);
  const done = task.status === "done";
  const dueEmphasize = !done && (!task.dueDate || daysLate(task.dueDate) >= 0);
  const tags = task.tags ? task.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  function dateCell(field: DateField, valueISO: string | null, emphasize?: boolean) {
    return (
      <DateEditor
        label=""
        valueISO={valueISO}
        emphasize={emphasize}
        open={openDateField === field}
        onToggle={() => setOpenDateField((f) => (f === field ? null : field))}
        onChange={(iso) => onUpdateDate(task.id, field, iso)}
      />
    );
  }

  function renderCell(key: ColumnKey) {
    switch (key) {
      case "requestContent":
        return (
          <button onClick={() => onEdit(task)} title={task.requestContent} className="text-left font-medium text-neutral-900 hover:text-indigo-600 truncate block w-full">
            {task.requestContent}
          </button>
        );
      case "project":
        return task.project?.name ? <span className="block truncate">{task.project.name}</span> : <span className="text-neutral-300">-</span>;
      case "brand":
        return task.brand ? <span className="block truncate">{task.brand}</span> : <span className="text-neutral-300">-</span>;
      case "assignee":
        return <span className="block truncate">{baseName(task.assignee)}</span>;
      case "department":
        return task.department ? <span className="block truncate">{task.department}</span> : <span className="text-neutral-300">-</span>;
      case "status":
        return <StatusSegment status={task.status} onChange={(s) => onUpdateStatus(task.id, s)} />;
      case "startDate":
        return dateCell("startDate", task.startDate);
      case "endDate":
        return dateCell("endDate", task.endDate);
      case "reviewDate":
        return dateCell("reviewDate", task.reviewDate);
      case "dueDate":
        return dateCell("dueDate", task.dueDate, dueEmphasize);
      case "requestDate":
        return <span className="block truncate text-neutral-500">{formatAbsoluteDate(task.requestDate)}</span>;
      case "tags":
        return tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                #{t}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-neutral-300">-</span>
        );
      case "memo":
        return task.memo ? (
          <button
            onClick={() => onOpenMemo(task)}
            title="메모 보기"
            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200"
          >
            <MemoIcon />
          </button>
        ) : (
          <span className="text-neutral-300">-</span>
        );
      case "rawText":
        return task.rawExtractedText ? (
          <button
            onClick={() => onOpenRawText(task)}
            title="요청서 원문 보기"
            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200"
          >
            <DocTextIcon />
          </button>
        ) : (
          <span className="text-neutral-300">-</span>
        );
      case "platform":
        return task.platform ? <span className="block truncate">{task.platform}</span> : <span className="text-neutral-300">-</span>;
      case "productName":
        return <span className={`block truncate ${!task.productName?.trim() || task.productIssues?.mismatch || task.productIssues?.unregistered.length ? "text-red-700" : ""}`}>{task.productName || "-"}</span>;
      case "folderName":
        return (
          <span className="block truncate text-neutral-500" title={task.folderName}>
            {task.folderName}
          </span>
        );
      case "actions":
        return active ? (
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => onOpenFolder(task.id)} title="폴더 열기" className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100">
              <FolderIcon />
            </button>
            <button onClick={() => onEdit(task)} title="수정" className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100">
              <EditIcon />
            </button>
            {onCreateFollowUp && (
              <button
                onClick={() => onCreateFollowUp(task)}
                title="후속작업 등록"
                className="p-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              >
                <FollowUpIcon />
              </button>
            )}
            <button
              onClick={() => {
                if (confirm(`"${task.requestContent}" 업무를 삭제할까요? 되돌릴 수 없습니다.`)) onDelete(task.id);
              }}
              title="삭제"
              className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
            >
              <TrashIcon />
            </button>
          </div>
        ) : null;
    }
  }

  return (
    <tr
      onClick={onActivate}
      className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 align-top cursor-pointer ${
        done ? "opacity-60" : ""
      } ${active ? "bg-indigo-50/40" : ""}`}
    >
      {columns.map((col) => (
        <td key={col.key} className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}`}>
          {renderCell(col.key)}
        </td>
      ))}
    </tr>
  );
}
