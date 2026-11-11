import { journalRowsToTsv, type JournalTableRow } from "./journalTable";
/** 제출 내용만 비교한다. 표시 열·너비·순서는 동기화 상태에 영향을 주지 않는다. */
export function journalSyncFingerprint(rows: ReadonlyArray<JournalTableRow>): string {
  const text = journalRowsToTsv([...rows].sort((a,b) => a.taskId.localeCompare(b.taskId)), undefined, false);
  const ids = [...rows].sort((a,b) => a.taskId.localeCompare(b.taskId)).map(row => JSON.stringify([row.taskId, row.workTitle ?? row.taskName ?? ""])).join("|");
  let hash = 2166136261;
  for (const char of ids + "\n" + text) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return `${rows.length}-${text.length}-${(hash >>> 0).toString(16)}`;
}
