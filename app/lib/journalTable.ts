import { getTaskDeadline } from "./taskDeadline";
import { recordsStatusComments, visibleStatusNotes } from "./statusComments";
import { isProductionType, type ProductionType } from "./productionTypes";
import { getTaskWorkCategory, normalizeWorkCategory } from "./workCategories";

export const JOURNAL_AUTHORS = ["김희영 과장", "허슬기 과장", "박지은 대리"] as const;
export type JournalAuthor = typeof JOURNAL_AUTHORS[number];
export const DEFAULT_JOURNAL_AUTHOR: JournalAuthor = "박지은 대리";

export const JOURNAL_TABLE_HEADERS = [
  "작성자", "일자", "업무분류", "프로젝트명", "업무·처리내용", "요청 납기일", "실제 완료일",
  "소요시간(h)", "진행상태", "작업구분", "비고(특이사항)", "결과물 폴더 위치 / 파일명",
] as const;

type DateValue = Date | string | null;

/** Both Prisma records and JSON task responses can supply the source values. */
export type JournalTableTask = {
  id: string;
  requestContent: string;
  status: string;
  department?: string | null;
  workCategory?: string | null;
  productionType?: string | null;
  brand?: string | null;
  productName?: string | null;
  platform?: string | null;
  project?: { name: string; department?: string | null } | null;
  subtasks?: ReadonlyArray<{ id: string; content: string; done: boolean; completedAt?: DateValue }>;
  requestDate?: DateValue;
  dueDate?: DateValue;
  completedAt?: DateValue;
  endDate?: DateValue;
  rawExtractedText?: string | null;
  aiConfidenceNote?: string | null;
  memo?: string | null;
  folderPath?: string | null;
  outputLocation?: string | null;
};

export type JournalTableDetail = {
  taskId: string;
  dateISO?: string;
  author?: string | null;
  projectName?: string | null;
  content?: string | null;
  selectedSubtaskIds?: string | null;
  hours?: number | null;
  notes?: string | null;
  outputLocation?: string | null;
};

export type JournalTableRow = {
  taskId: string;
  taskName: string;
  workTitle?: string;
  author: string;
  dateISO: string;
  workCategory: string;
  projectName: string;
  content: string;
  dueDate: string;
  completedDate: string;
  hours: number | null;
  status: string;
  productionType: ProductionType | null;
  notes: string;
  outputLocation: string;
  selectedSubtaskIds: string[];
  subtasks: Array<{ id: string; content: string; done: boolean; completedDate: string }>;
};

const koreaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

function dateText(value: DateValue | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const parts = koreaDate.formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function taskTitle(task: JournalTableTask): string {
  const brand = task.brand && !task.requestContent.includes(task.brand) ? `${task.brand} ` : "";
  const containsProduct = task.productName && task.requestContent.toLocaleLowerCase().includes(task.productName.toLocaleLowerCase());
  const product = task.productName && !containsProduct ? ` (${task.productName})` : "";
  return `${brand}${task.requestContent}${product}`.trim();
}

function defaultWorkContent(task: JournalTableTask): string {
  const title = task.requestContent.trim();
  const product = task.productName?.trim() ?? "";
  return product && !title.toLocaleLowerCase().includes(product.toLocaleLowerCase()) ? `${title} ${product}`.trim() : title;
}
export function withJournalWorkTitle(content: string, title: string): string {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  return title && lines.length && lines.every(line => /^\s*-\s+/.test(line)) ? title + "\n" + content : content;
}

function journalContent(task: JournalTableTask, content: string | null | undefined, selected: string[], subtasks: JournalTableRow["subtasks"]): string {
  const title = defaultWorkContent(task);
  const bullets = [...new Set(subtasks.filter(item => selected.includes(item.id)).map(item => item.content.trim()).filter(Boolean))].map(text => `- ${text}`).join("\n");
  if (content === undefined || content === null) return [title, bullets].filter(Boolean).join("\n");
  return withJournalWorkTitle(content, title);
}

function selectedIds(value: string | null | undefined, subtasks: JournalTableRow["subtasks"]): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string" || !id.trim())) return [];
    const available = new Set(subtasks.map((item) => item.id));
    return [...new Set(parsed as string[])].filter((id) => available.has(id));
  } catch { return []; }
}

/** Saved empty strings are intentional blanks; null restores the task's source value. */
export function buildJournalTableRows(
  tasks: ReadonlyArray<JournalTableTask>, dateISO: string, details: ReadonlyArray<JournalTableDetail> = [],
): JournalTableRow[] {
  const byTask = new Map(details.filter((detail) => !detail.dateISO || detail.dateISO === dateISO)
    .map((detail) => [detail.taskId, detail]));
  return tasks.map((task) => {
    const detail = byTask.get(task.id);
    const deadline = getTaskDeadline({
      requestDate: dateText(task.requestDate) || null, dueDate: dateText(task.dueDate) || null,
      rawExtractedText: task.rawExtractedText, aiConfidenceNote: task.aiConfidenceNote,
    });
    const hours = detail?.hours;
    const workCategory = getTaskWorkCategory(task) ?? normalizeWorkCategory(task.workCategory) ?? "미지정";
    const subtasks = (task.subtasks ?? []).filter((item) => typeof item.id === "string" && item.id.trim()).map((item) => ({
      id: item.id, content: item.content, done: item.done, completedDate: item.done ? dateText(item.completedAt) : "",
    }));
    const selected = selectedIds(detail?.selectedSubtaskIds, subtasks);
    return {
      taskId: task.id,
      taskName: taskTitle(task),
      workTitle: defaultWorkContent(task),
      author: detail?.author ?? DEFAULT_JOURNAL_AUTHOR,
      dateISO,
      workCategory,
      projectName: workCategory === "영업팀" ? task.platform?.trim() || "배너" : task.project?.name?.trim() ?? "",
      content: journalContent(task, detail?.content, selected, subtasks),
      dueDate: deadline ?? "",
      completedDate: task.status === "done" ? dateText(task.completedAt) || dateText(task.endDate) : "",
      hours: typeof hours === "number" && Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : null,
      status: task.status === "done" ? "완료" : task.status === "planned" ? "대기"
        : task.status === "in_progress" ? "진행중" : task.status === "review" ? "보류" : "",
      productionType: isProductionType(task.productionType) ? task.productionType : null,
      notes: visibleStatusNotes(detail?.notes, recordsStatusComments(task)),
      outputLocation: detail?.outputLocation ?? task.outputLocation ?? "",
      selectedSubtaskIds: selected,
      subtasks,
    };
  });
}

type SelectableSubtask = Pick<JournalTableRow["subtasks"][number], "id" | "content">;

/** Selection replaces journal content with the selected subtasks only; source completion is unchanged. */
export function toggleJournalSubtaskContent(
  content: string, currentSelectedIds: ReadonlyArray<string>, subtask: SelectableSubtask, checked: boolean,
  subtasks: ReadonlyArray<SelectableSubtask> = [], workTitle = "",
): { content: string; selectedSubtaskIds: string[] } {
  const ids = [...new Set(currentSelectedIds)];
  if (ids.includes(subtask.id) === checked) return { content, selectedSubtaskIds: ids };
  const nextIds = checked ? [...ids, subtask.id] : ids.filter((id) => id !== subtask.id);
  const available = [...subtasks.filter(item => item.id !== subtask.id), subtask];
  const byId = new Map(available.map(item => [item.id, item]));
  const texts = [...new Set(nextIds.map(id => byId.get(id)?.content.trim()).filter((text): text is string => !!text))];
  return { content: [workTitle, ...texts.map(text => `- ${text}`)].filter(Boolean).join("\n"), selectedSubtaskIds: nextIds };
}

function tsvCell(value: string): string {
  // Text pasted into a spreadsheet must stay text even when it begins with a formula marker.
  const literal = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[\t\r\n"]/.test(literal) ? `"${literal.replaceAll('"', '""')}"` : literal;
}

export function formatJournalHours(hours: number | null): string {
  return hours === null ? "" : Number.isInteger(hours) ? hours.toFixed(1) : String(hours);
}

export function journalRowsToTsv(rows: ReadonlyArray<JournalTableRow>, columnIndexes: ReadonlyArray<number> = JOURNAL_TABLE_HEADERS.map((_, index) => index), includeHeaders = true): string {
  return [...(includeHeaders ? [Array.from(JOURNAL_TABLE_HEADERS)] : []), ...rows.map((row) => [
    row.author, row.dateISO, row.workCategory, row.projectName, row.content, row.dueDate, row.completedDate,
    formatJournalHours(row.hours), row.status, row.productionType ?? "", row.notes, row.outputLocation,
  ])].map((row) => columnIndexes.map(index => tsvCell(row[index])).join("\t")).join("\r\n");
}
