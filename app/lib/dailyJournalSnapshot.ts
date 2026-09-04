import { prisma } from "./prisma";
import { toISODate } from "./dateHelpers";

/** 특정 날짜(YYYY-MM-DD)의 오전 9시(로컬 시간) Date 객체를 반환한다. */
function cutoffForDate(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0, 0, 0);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * 업무가 처음 속하게 되는 "일지 날짜"를 등록 시각 기준으로 계산한다.
 * 오후 10시 이후 등록되면 다음날로 넘기고, 그 날이 주말이면(업무일지엔 주말이 없으므로) 다음
 * 평일까지 계속 넘긴다 — 예: 금요일 오후 10시 이후 등록 → 다음 월요일.
 */
function journalDayFor(createdAt: Date): string {
  const d = new Date(createdAt);
  if (d.getHours() >= 22) d.setDate(d.getDate() + 1);
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

/**
 * dateISO의 일지에 속하는 업무 id 목록을 계산한다 — 그 날짜 오전 9시 컷오프 시점에 아직
 * 완료되지 않았고(또는 그 이후 완료됐고), journalDayFor 기준으로 이 날짜(혹은 그 이전)에
 * 속하는 업무들. 확정(finalize)과 실시간 미리보기 양쪽에서 공용으로 쓴다.
 */
async function eligibleTaskIdsForDate(dateISO: string): Promise<string[]> {
  const cutoff = cutoffForDate(dateISO);
  const dayEnd = new Date(cutoff);
  dayEnd.setHours(23, 59, 59, 999);
  const candidates = await prisma.task.findMany({
    where: { createdAt: { lte: dayEnd }, OR: [{ completedAt: null }, { completedAt: { gte: cutoff } }] },
    select: { id: true, createdAt: true },
  });
  return candidates.filter((t) => journalDayFor(t.createdAt) <= dateISO).map((t) => t.id);
}

/**
 * 이미 지나간 날짜 하나를 영구 고정한다. 이미 고정돼 있으면 아무 것도 안 한다.
 * ("오늘"과 미래는 아직 확정된 게 아니므로 여기서 다루지 않는다 — livePreviewTaskIds 참고)
 */
export async function finalizeDay(dateISO: string): Promise<void> {
  const exists = await prisma.dailyJournal.findUnique({ where: { dateISO } });
  if (exists) return;
  const taskIds = await eligibleTaskIdsForDate(dateISO);
  await prisma.dailyJournal.create({
    data: { dateISO, entries: { create: taskIds.map((taskId) => ({ taskId })) } },
  });
}

/**
 * 아직 고정되지 않은 지난 날짜들을 전부 고정한다(오늘은 제외 — 오늘은 하루가 끝나야 고정된다).
 * 워쳐가 상시 실행되며 주기적으로 호출해서, 자정이 지나 새 날짜가 시작되면 어제치를 자동으로 고정한다.
 */
export async function finalizePastDays(now: Date = new Date()): Promise<void> {
  const todayISO = toISODate(now);
  const latest = await prisma.dailyJournal.findFirst({ orderBy: { dateISO: "desc" } });
  // 이 기능이 처음 도입된 경우엔 그 이전 과거까지 소급하지 않고 어제부터 시작한다.
  let cursor = latest ? addDaysISO(latest.dateISO, 1) : addDaysISO(todayISO, -1);
  while (cursor < todayISO) {
    await finalizeDay(cursor);
    cursor = addDaysISO(cursor, 1);
  }
}

/**
 * 아직 끝나지 않은 날짜(오늘 또는 미래)의 실시간 목록 — 저장하지 않고 매번 새로 계산한다.
 * 오후 10시 이후 등록되었거나 주말로 밀린 업무는 실제로 속하게 될 날짜에서만 보인다 — 예를 들어
 * 오늘 밤 10시 이후 등록한 업무는 오늘자엔 안 보이고, 다음 평일 날짜를 미리 봐야 보인다.
 */
export async function livePreviewTaskIds(dateISO: string): Promise<string[]> {
  return eligibleTaskIdsForDate(dateISO);
}
