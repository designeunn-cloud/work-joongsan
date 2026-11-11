import { readFile } from "node:fs/promises";
import path from "node:path";

export const GOOGLE_JOURNAL_SPREADSHEET_ID = "14JvE14POspz86Pzb1teoUZwX47uupfsCQsuStjIZZiY";
export const GOOGLE_JOURNAL_SHEET_ID = 44908072;
export const GOOGLE_JOURNAL_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_JOURNAL_SPREADSHEET_ID}/edit#gid=${GOOGLE_JOURNAL_SHEET_ID}`;
export const GOOGLE_JOURNAL_CONFIG_PATH = path.join(process.cwd(), ".google-sheets-journal.local.json");

export type GoogleSheetsJournalConfig = { webAppUrl: string; token: string };
type JournalTask = {
  id: string; requestContent: string; brand: string | null; productName: string | null;
  project: { name: string } | null; memo: string | null; status: string;
  subtasks: Array<{ content: string; done: boolean }>;
};

export function isValidJournalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidGoogleJournalWebAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "script.google.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
  } catch { return false; }
}

export async function getGoogleSheetsJournalConfig(): Promise<GoogleSheetsJournalConfig | null> {
  const envUrl = process.env.GOOGLE_SHEETS_JOURNAL_WEB_APP_URL;
  const envToken = process.env.GOOGLE_SHEETS_JOURNAL_TOKEN;
  let config: Partial<GoogleSheetsJournalConfig>;
  if (envUrl || envToken) config = { webAppUrl: envUrl, token: envToken };
  else {
    try { config = JSON.parse(await readFile(GOOGLE_JOURNAL_CONFIG_PATH, "utf8")); }
    catch { return null; }
  }
  return typeof config?.webAppUrl === "string" && isValidGoogleJournalWebAppUrl(config.webAppUrl)
    && typeof config.token === "string" && config.token.length >= 32
    ? { webAppUrl: config.webAppUrl, token: config.token } : null;
}

export async function getGoogleSheetsJournalStatus() {
  return { configured: !!await getGoogleSheetsJournalConfig(), spreadsheetUrl: GOOGLE_JOURNAL_SPREADSHEET_URL };
}

export function buildGoogleJournalTasks(tasks: JournalTask[], dateISO: string) {
  return tasks.map((task) => {
    const title = task.requestContent.trim();
    const source = `${task.project?.name ?? ""} ${title}`;
    const category = /상세\s*페이지/.test(source) ? "상세페이지"
      : /배너|프로모션|기획전/.test(source) ? "프로모션/배너"
      : /설명서|패키지|매뉴얼|제품\s*개발/.test(source) ? "제품개발/지원"
      : /운영\s*지원|운영\s*업무/.test(source) ? "운영/지원" : "기타";
    const brand = task.brand && !title.includes(task.brand) ? `${task.brand} ` : "";
    const product = task.productName ? ` (${task.productName})` : "";
    const subtasks = task.subtasks.filter((subtask) => !subtask.done).map((subtask) => `· ${subtask.content}`);
    const notes = [task.memo?.trim(), task.status === "review" ? "보류 중" : "",
      `업무일지 ${dateISO} · 등록 시점의 업무 상태`].filter(Boolean).join("\n");
    return { id: task.id, category, project: task.project?.name ?? task.productName ?? "",
      content: [`${brand}${title}${product}`, ...subtasks].join("\n"),
      status: task.status === "done" ? "완료" : task.status === "planned" ? "대기" : "진행중", notes };
  });
}

export class GoogleSheetsJournalError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function registerGoogleSheetsJournal(dateISO: string, tasks: JournalTask[]) {
  if (!isValidJournalDate(dateISO)) throw new GoogleSheetsJournalError("올바른 업무일지 날짜를 선택해주세요.", 400);
  if (!tasks.length) throw new GoogleSheetsJournalError("선택한 날짜에 등록할 업무가 없습니다.", 400);
  if (tasks.length > 1000) throw new GoogleSheetsJournalError("한 번에 등록할 수 있는 업무는 1,000건입니다.", 400);
  const config = await getGoogleSheetsJournalConfig();
  if (!config) throw new GoogleSheetsJournalError("구글 시트 연결 설정을 먼저 완료해주세요.", 503);
  let response: Response;
  try {
    response = await fetch(config.webAppUrl, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ token: config.token, dateISO, tasks: buildGoogleJournalTasks(tasks, dateISO) }) });
  } catch {
    throw new GoogleSheetsJournalError("구글 시트 응답을 받지 못했습니다. 다시 등록해도 같은 업무는 중복되지 않습니다.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.ok !== true) {
    throw new GoogleSheetsJournalError(typeof result?.error === "string"
      ? result.error.slice(0, 500) : "구글 시트 연결을 확인해주세요. 웹앱 배포 주소와 실행 권한이 필요합니다.");
  }
  const expectedUrl = new RegExp(`^https://docs\\.google\\.com/spreadsheets/d/${GOOGLE_JOURNAL_SPREADSHEET_ID}/edit(?:\\?gid=\\d+)?(?:#gid=\\d+)?$`);
  if (result.dateISO !== dateISO || !Number.isSafeInteger(result.created) || !Number.isSafeInteger(result.updated)
    || result.created < 0 || result.updated < 0 || result.created + result.updated !== tasks.length
    || typeof result.url !== "string" || !expectedUrl.test(result.url)) {
    throw new GoogleSheetsJournalError("구글 시트의 등록 결과를 확인할 수 없습니다. 연결한 스크립트가 최신 버전인지 확인해주세요.");
  }
  return { ok: true, dateISO, created: result.created as number, updated: result.updated as number, url: result.url as string };
}

/** 저장된 일지의 12개 값을 화면 배치와 관계없이 고정 순서로 전송한다. */
export function sheetCommentNotes(notes: string, dateISO: string): string {
  const [, month, day] = dateISO.split("-");
  const date = `(${Number(month)}/${Number(day)})`;
  return notes.split(/\r?\n/).map(line => {
    const text = line.trim();
    // Only comment lines receive dates; handwritten notes remain untouched.
    const comment = /^(?:업무 대기|작업 시작|업무 보류|작업 재개|작업 완료|수정 요청|수정 완료|전달 완료|담당자 확인중|상세 1차 확인|상세 2차 확인|최종 확인 완료|최종 전달일)(?=\s|[·+\-–—:]|$)/.test(text);
    return comment && !/\(\d{1,2}\/\d{1,2}\)$/.test(text) ? `${line.trimEnd()} ${date}` : line;
  }).join("\n");
}

export function buildGoogleJournalRows(rows: ReadonlyArray<import("./journalTable").JournalTableRow>, dateISO: string) {
  const ids = new Set<string>();
  return rows.map(row => {
    if (row.dateISO !== dateISO || ids.has(row.taskId) || !/^[A-Za-z0-9_-]{1,200}$/.test(row.taskId)) throw new GoogleSheetsJournalError("업무일지 날짜와 업무 ID를 확인해주세요.", 400);
    ids.add(row.taskId);
    const title = (row.workTitle ?? row.taskName ?? "").trim();
    const content = row.content;
    const firstLine = content.split(/\r?\n/, 1)[0].trim();
    const syncContent = !title || firstLine === title ? content : [title, content].filter(Boolean).join("\n");
    return { taskId: row.taskId, values: [row.author, row.dateISO, row.workCategory, row.projectName, syncContent,
      row.dueDate, row.completedDate, row.hours ?? "", row.status, row.productionType ?? "", sheetCommentNotes(row.notes, dateISO), row.outputLocation] };
  });
}
export async function syncGoogleJournalRows(dateISO: string, rows: ReadonlyArray<import("./journalTable").JournalTableRow>) {
  if (!isValidJournalDate(dateISO) || rows.length > 1000) throw new GoogleSheetsJournalError("동기화할 일지는 0~1,000건이어야 합니다.", 400);
  const payload = buildGoogleJournalRows(rows, dateISO);
  const config = await getGoogleSheetsJournalConfig();
  if (!config) throw new GoogleSheetsJournalError("구글 시트 연결 설정을 먼저 완료해주세요.", 503);
  async function send(body: Record<string, unknown>) {
    try {
      const response = await fetch(config!.webAppUrl, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ ...body, token: config!.token }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new GoogleSheetsJournalError(typeof result?.error === "string" ? result.error.slice(0,500) : "구글 시트 연결을 확인해주세요.");
      return result;
    } catch (e) {
      if (e instanceof GoogleSheetsJournalError) throw e;
      throw new GoogleSheetsJournalError("앱에는 저장했지만 시트 응답을 확인하지 못했습니다. 다시 동기화해도 날짜와 업무 ID가 같은 행은 중복되지 않습니다.");
    }
  }
  const capability = await send({ action: "ping" });
  if (capability.spreadsheetId !== GOOGLE_JOURNAL_SPREADSHEET_ID || capability.protocolVersion !== 2 || capability.reconcileJournalRows !== true) throw new GoogleSheetsJournalError("앱에는 저장했습니다. 삭제·제외한 업무까지 동기화하려면 ‘구글 시트 연결 설정’에서 최신 연결 코드를 기존 Apps Script에 반영하고 기존 웹앱 배포를 새 버전으로 업데이트해주세요.", 409);
  const result = await send({ action: "syncJournalRows", protocolVersion: 2, dateISO, rows: payload });
  const prefix = `https://docs.google.com/spreadsheets/d/${GOOGLE_JOURNAL_SPREADSHEET_ID}/edit#gid=`;
  if (!Number.isSafeInteger(result.removed) || result.removed < 0 || result.protocolVersion !== 2 || result.dateISO !== dateISO || !Number.isSafeInteger(result.created) || !Number.isSafeInteger(result.updated) || result.created < 0 || result.updated < 0 || result.created + result.updated !== rows.length || typeof result.url !== "string" || !result.url.startsWith(prefix) || !/^\d+$/.test(result.url.slice(prefix.length))) throw new GoogleSheetsJournalError("시트 동기화 결과를 확인하지 못했습니다. 다시 시도해주세요.");
  return { ok: true, dateISO, created: result.created as number, updated: result.updated as number, removed: result.removed as number, url: result.url as string };
}
