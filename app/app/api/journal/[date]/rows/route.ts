import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailyJournal, isValidJournalDate } from "@/lib/dailyJournal";
import { buildJournalTableRows, JOURNAL_AUTHORS } from "@/lib/journalTable";
import { disableAutomaticTime, recalculateAutomaticTime } from "@/lib/autoWorkTime";

export const runtime = "nodejs";

type DetailValues = {
  author?: string | null;
  projectName?: string | null;
  selectedSubtaskIds?: string | null;
  content?: string | null;
  hours?: number | null;
  notes?: string | null;
  outputLocation?: string | null;
};

const ROW_FIELDS = new Set(["taskId", "author", "projectName", "selectedSubtaskIds", "content", "hours", "notes", "outputLocation"]);
const TEXT_LIMITS = { projectName: 1000, content: 40000, notes: 10000, outputLocation: 4000 } as const;
const SUBTASK_ID = /^c[a-z0-9]{24}$/;

function parseDetailRow(value: unknown): { taskId: string; data: DetailValues } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !ROW_FIELDS.has(key))
    || typeof row.taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(row.taskId)) return null;
  const data: DetailValues = {};
  if (row.author !== undefined) {
    if (row.author === null) data.author = null;
    else if (typeof row.author === "string") {
      const author = row.author.trim();
      if (author && !JOURNAL_AUTHORS.some((allowed) => allowed === author)) return null;
      data.author = author;
    } else return null;
  }
  for (const field of Object.keys(TEXT_LIMITS) as Array<keyof typeof TEXT_LIMITS>) {
    const text = row[field];
    if (text === undefined) continue;
    if (text !== null && (typeof text !== "string" || text.length > TEXT_LIMITS[field])) return null;
    data[field] = text as string | null;
  }
  if (row.hours !== undefined) {
    if (row.hours !== null && (typeof row.hours !== "number" || !Number.isFinite(row.hours) || row.hours < 0 || row.hours > 24)) return null;
    data.hours = row.hours as number | null;
  }
  if (row.selectedSubtaskIds !== undefined) {
    if (row.selectedSubtaskIds === null) data.selectedSubtaskIds = null;
    else if (Array.isArray(row.selectedSubtaskIds) && row.selectedSubtaskIds.length <= 500
      && row.selectedSubtaskIds.every((id) => typeof id === "string" && id.length <= 200 && SUBTASK_ID.test(id))
      && new Set(row.selectedSubtaskIds).size === row.selectedSubtaskIds.length) {
      data.selectedSubtaskIds = JSON.stringify(row.selectedSubtaskIds);
    } else return null;
  }
  return { taskId: row.taskId, data };
}

function savedSubtaskIds(value: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string" && SUBTASK_ID.test(id))) : new Set();
  } catch { return new Set(); }
}

/** Journal notes are saved for the selected date without overwriting the task memo. */
export async function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidJournalDate(date)) return NextResponse.json({ error: "올바른 업무일지 날짜를 선택해주세요." }, { status: 400 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램 화면에서 저장해주세요." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "rows")
    || !Array.isArray(body.rows) || body.rows.length > 1000) {
    return NextResponse.json({ error: "저장할 업무일지 행을 확인해주세요." }, { status: 400 });
  }
  const rows = [];
  const seen = new Set<string>();
  for (const value of body.rows) {
    const row = parseDetailRow(value);
    if (!row || seen.has(row.taskId)) {
      return NextResponse.json({ error: "업무일지 입력값을 확인해주세요. 작성자와 세부업무는 목록에서 선택하고 소요시간은 0~24 사이의 숫자로 입력해주세요." }, { status: 400 });
    }
    seen.add(row.taskId);
    rows.push(row);
  }

  try {
    const journal = await getDailyJournal(date);
    const membership = new Set(journal.tasks.map((task) => task.id));
    if (rows.some((row) => !membership.has(row.taskId))) {
      return NextResponse.json({ error: "선택한 날짜의 일지에 없는 업무가 포함되어 있습니다. 일지를 새로 불러와주세요." }, { status: 400 });
    }
    const selectionChanges = rows.filter((row) => typeof row.data.selectedSubtaskIds === "string");
    if (selectionChanges.length) {
      const existing = await prisma.dailyJournalDetail.findMany({ where: { dateISO: date, taskId: { in: selectionChanges.map((row) => row.taskId) } } });
      const existingIds = new Map(existing.map((detail) => [detail.taskId, savedSubtaskIds(detail.selectedSubtaskIds)]));
      const sourceTasks = new Map(journal.tasks.map((task) => [task.id, task]));
      for (const row of selectionChanges) {
        const sourceIds = new Set(sourceTasks.get(row.taskId)?.subtasks?.map((subtask) => subtask.id) ?? []);
        const previousIds = existingIds.get(row.taskId);
        const selected: string[] = JSON.parse(row.data.selectedSubtaskIds as string);
        if (selected.some((id) => !sourceIds.has(id) && !previousIds?.has(id))) {
          return NextResponse.json({ error: "해당 업무에 속하지 않는 세부업무가 포함되어 있습니다. 일지를 새로 불러와주세요." }, { status: 400 });
        }
      }
    }
    const changes = rows.filter((row) => Object.keys(row.data).length > 0);
    if (changes.length) {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
        await tx.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
        for (const row of changes) {
          if (row.data.hours !== undefined) await disableAutomaticTime(tx, row.taskId, date);
          await tx.dailyJournalDetail.upsert({
        where: { dateISO_taskId: { dateISO: date, taskId: row.taskId } },
        create: { dateISO: date, taskId: row.taskId, ...row.data },
        update: row.data,
          });
        }
        await recalculateAutomaticTime(tx, date);
      });
    }
    const details = await prisma.dailyJournalDetail.findMany({ where: { dateISO: date, taskId: { in: journal.tasks.map((task) => task.id) } } });
    return NextResponse.json({ ...journal, rows: buildJournalTableRows(journal.tasks, date, details), details });
  } catch {
    return NextResponse.json({ error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
