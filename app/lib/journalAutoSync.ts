import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDailyJournal, isValidJournalDate } from "./dailyJournal";
import { getGoogleSheetsJournalConfig, syncGoogleJournalRows } from "./googleSheetsJournal";
import type { JournalChange } from "./journalChangeTracker";
import { journalSyncFingerprint } from "./journalSyncState";
import { prisma } from "./prisma";

const directory = path.join(process.cwd(), ".journal-auto-sync");
const lockPath = path.join(directory, "worker.lock");
type SyncStatus = { lastSyncedAt?: string; lastDate?: string; lastHash?: string; url?: string; error?: string; running?: boolean };
const shared = globalThis as unknown as { journalSyncTimer?: ReturnType<typeof setTimeout> };

async function events() {
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter(name => name.endsWith(".event.json"));
  const loaded = await Promise.all(names.map(async name => {
    try { return { name, change: JSON.parse(await readFile(path.join(directory, name), "utf8")) as JournalChange }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }));
  return loaded.filter((item): item is NonNullable<typeof item> => item !== null);
}
async function saveStatus(value: SyncStatus) {
  const temp = path.join(directory, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path.join(directory, "status.json"));
}
export async function getJournalAutoSyncStatus() {
  const pending = await events();
  let status: SyncStatus = {};
  try { status = JSON.parse(await readFile(path.join(directory, "status.json"), "utf8")); } catch { /* first run */ }
  if (status.running) {
    try { await stat(lockPath); } catch { status.running = false; }
  }
  return { ...status, pending: pending.length, configured: !!await getGoogleSheetsJournalConfig() };
}
export function scheduleJournalAutoSync(delay = 1500) {
  if (shared.journalSyncTimer) clearTimeout(shared.journalSyncTimer);
  shared.journalSyncTimer = setTimeout(() => {
    shared.journalSyncTimer = undefined;
    void flushJournalAutoSync().catch(error => console.error("[journal] 자동 동기화 실패", error));
  }, delay);
  shared.journalSyncTimer.unref?.();
}
export async function queueJournalChanges(changes: JournalChange[]) {
  await mkdir(directory, { recursive: true });
  for (const change of changes) {
    if (!isValidJournalDate(change.dateISO)) continue;
    const file = path.join(directory, `${randomUUID()}.event.json`);
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(change));
    await rename(temp, file);
  }
  scheduleJournalAutoSync();
}
async function acquireLock() {
  try {
    const file = await open(lockPath, "wx");
    await file.writeFile(String(process.pid));
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let alive = true;
    try { const pid = Number(await readFile(lockPath, "utf8")); if (pid) process.kill(pid, 0); } catch { alive = false; }
    let age: number;
    try { age = Date.now() - (await stat(lockPath)).mtimeMs; }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code === "ENOENT") return acquireLock(); throw failure; }
    if (!alive || age > 300000) {
      await unlink(lockPath).catch(() => {});
      return acquireLock();
    }
    return null;
  }
}

/** Both manual and automatic sync use this single cross-process worker. */
export async function flushJournalAutoSync(requestedDate?: string) {
  const batch = await events();
  if (!batch.length) return null;
  const lock = await acquireLock();
  if (!lock) { scheduleJournalAutoSync(3000); return null; }
  let status: SyncStatus = {};
  try {
    status = await getJournalAutoSyncStatus();
    await saveStatus({ ...status, running: true, error: undefined });
    const dates = [...new Set(batch.map(item => item.change.dateISO))];
    // A task is included on each day it was actually edited, not on idle days.
    // INSERT OR IGNORE preserves a user's explicit exclusion for that date.
    await prisma.$transaction(async db => {
      const seen = new Set<string>();
      for (const { change } of batch) {
        if (!change.taskId || seen.has(`${change.dateISO}|${change.taskId}`)) continue;
        seen.add(`${change.dateISO}|${change.taskId}`);
        await db.$executeRaw`INSERT OR IGNORE INTO JournalTaskSelection (dateISO, taskId, included) SELECT ${change.dateISO}, id, 2 FROM Task WHERE id = ${change.taskId}`;
      }
    });
    if (!await getGoogleSheetsJournalConfig()) throw new Error("구글 시트 연결을 먼저 설정해주세요.");
    let requestedResult: Awaited<ReturnType<typeof syncGoogleJournalRows>> | null = null;
    for (const dateISO of dates) {
      const now = new Date();
      await lock.utimes(now, now);
      const journal = await getDailyJournal(dateISO);
      const result = await syncGoogleJournalRows(dateISO, journal.rows);
      // Delete only the events read for this pass: later edits remain pending.
      for (const event of batch.filter(item => item.change.dateISO === dateISO)) await unlink(path.join(directory, event.name)).catch(() => {});
      status = { lastSyncedAt: new Date().toISOString(), lastDate: dateISO, lastHash: journalSyncFingerprint(journal.rows), url: result.url, running: false };
      await saveStatus(status);
      if (dateISO === requestedDate) requestedResult = result;
    }
    return requestedResult;
  } catch (error) {
    await saveStatus({ ...status, running: false, error: error instanceof Error ? error.message : "시트 전송에 실패했습니다. 앱 저장은 유지됩니다." });
    scheduleJournalAutoSync(30000);
    if (requestedDate) throw error;
    return null;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
    if ((await events()).length && !shared.journalSyncTimer) scheduleJournalAutoSync(1500);
  }
}
