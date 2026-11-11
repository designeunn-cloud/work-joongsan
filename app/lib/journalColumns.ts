import { JOURNAL_TABLE_HEADERS } from "./journalTable";
export const JOURNAL_LAYOUT_KEY = "work-app-journal-columns-v1";
export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 900;
const ids = ["author", "date", "category", "project", "content", "due", "completed", "hours", "status", "production", "notes", "output"] as const;
const widths = [140,116,128,240,420,116,116,110,96,150,220,300];
export const JOURNAL_COLUMNS = [{ id: "management", index: -1, label: "관리", width: 128 }, ...ids.map((id, index) => ({ id, index, label: JOURNAL_TABLE_HEADERS[index], width: widths[index] }))];
export type JournalColumn = { id: string; visible: boolean; width: number };
export function columnWidth(width: number) { return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width))); }
export function defaultJournalLayout(): JournalColumn[] { return JOURNAL_COLUMNS.map(({ id, width }) => ({ id, width, visible: true })); }
export function restoreJournalLayout(value: unknown): JournalColumn[] {
  if (!Array.isArray(value)) return defaultJournalLayout();
  const result: JournalColumn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const definition = JOURNAL_COLUMNS.find(column => column.id === item.id);
    if (!definition || result.some(column => column.id === item.id)) continue;
    result.push({ id: definition.id, visible: typeof item.visible === "boolean" ? item.visible : true,
      width: typeof item.width === "number" && Number.isFinite(item.width) ? columnWidth(item.width) : definition.width });
  }
  for (const definition of JOURNAL_COLUMNS) if (!result.some(column => column.id === definition.id)) {
    const column = { id: definition.id, width: definition.width, visible: true };
    if (definition.id === "management") result.unshift(column); else result.push(column);
  }
  if (!result.some(column => column.visible)) result[0].visible = true;
  return result;
}
export function moveJournalColumn(layout: JournalColumn[], from: string, to: string): JournalColumn[] {
  const start = layout.findIndex(column => column.id === from), end = layout.findIndex(column => column.id === to);
  if (start < 0 || end < 0 || start === end) return layout;
  const result = [...layout]; const [column] = result.splice(start, 1); result.splice(end, 0, column); return result;
}
