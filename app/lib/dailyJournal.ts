import { journalSelections } from "./journalMembership";
import { prisma } from "./prisma";
import { finalizeDay, finalizePastDays, livePreviewTaskIds } from "./dailyJournalSnapshot";
import { toISODate } from "./dateHelpers";
import { getTaskWorkCategory } from "./workCategories";
import { buildJournalTableRows } from "./journalTable";
import { withJournalReviewState } from "./journalReviewWorkflow";

export function isValidJournalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 화면 조회와 구글 등록이 같은 날짜·같은 일지 선정 규칙을 사용한다. */
export async function getDailyJournal(dateISO: string) {
  if (!isValidJournalDate(dateISO)) throw new Error("올바른 날짜를 선택해주세요.");
  const selections = await journalSelections(dateISO);
  const manualTaskIds = selections.filter(item => item.included === 1).map(item => item.taskId);
  const includedTaskIds = selections.filter(item => item.included > 0).map(item => item.taskId);
  const excluded = new Set(selections.filter(item => item.included === 0).map(item => item.taskId));
  const now = new Date();
  if (dateISO >= toISODate(now)) {
    const taskIds = await livePreviewTaskIds(dateISO);
    const timed = await prisma.dailyJournalDetail.findMany({ where: { dateISO }, select: { taskId: true } });
    taskIds.push(...timed.map(row => row.taskId), ...includedTaskIds);
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds.filter(id => !excluded.has(id)) } },
      include: { subtasks: true, project: { select: { name: true, department: true } } },
    });
    const historicalTasks = await withJournalReviewState(tasks, dateISO);
    const categorizedTasks = historicalTasks.map((task) => ({ ...task, workCategory: getTaskWorkCategory(task) }));
    const details = await prisma.dailyJournalDetail.findMany({ where: { dateISO, taskId: { in: tasks.map((task) => task.id) } } });
    return { dateISO, manualTaskIds, preview: true, tasks: categorizedTasks, rows: buildJournalTableRows(categorizedTasks, dateISO, details) };
  }

  await finalizePastDays(now);
  await finalizeDay(dateISO);
  const journal = await prisma.dailyJournal.findUnique({
    where: { dateISO },
    include: { entries: { include: { task: { include: { subtasks: true, project: { select: { name: true, department: true } } } } } } },
  });
  const recorded = await prisma.dailyJournalDetail.findMany({ where: { dateISO, hours: { not: null } }, select: { taskId: true } });
  const extra = await prisma.task.findMany({ where: { id: { in: [...recorded.map(row => row.taskId), ...includedTaskIds].filter(id => !journal?.entries.some(entry => entry.taskId === id)) } }, include: { subtasks: true, project: { select: { name: true, department: true } } } });
  const candidates = [...(journal?.entries.map(({ task }) => ({ ...task, workCategory: getTaskWorkCategory(task) })) ?? []), ...extra.map(task => ({ ...task, workCategory: getTaskWorkCategory(task) }))];
  const tasks = await withJournalReviewState(candidates.filter(task => !excluded.has(task.id)), dateISO);
  const details = await prisma.dailyJournalDetail.findMany({ where: { dateISO, taskId: { in: tasks.map((task) => task.id) } } });
  return { dateISO, manualTaskIds, preview: false, tasks, rows: buildJournalTableRows(tasks, dateISO, details) };
}
