import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
function loader(db) {
  const cache = new Map();
  return function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => ["@/lib/prisma", "./prisma"].includes(name) ? { prisma: db }
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`)
      : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  };
}

test("today work records save content and time while work remains in progress", async t => {
  const file = path.join(os.tmpdir(), `today-work-record-${process.pid}-${Date.now()}.db`);
  const sql = new DatabaseSync(file);
  for (const directory of fs.readdirSync("prisma/migrations").sort()) {
    const migration = path.join("prisma/migrations", directory, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  const load = loader(db), route = load("app/api/tasks/[id]/work-record/route.ts");
  const timerRoute = load("app/api/work-time/route.ts");
  const controlTimer = async (id, action, extra = {}) => {
    const response = await timerRoute.POST(new Request("http://localhost/api/work-time", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: id, action, ...extra }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const { koreaDate } = load("lib/workTime.ts");
  const { dayState, saveDay } = load("lib/workTimeServer.ts");
  const published = [];
  load("lib/journalChangeTracker.ts").installJournalChangeTracker(db, async changes => { published.push(...changes); });
  const today = koreaDate();
  let sequence = 0;
  const create = () => db.task.create({ data: {
    id: `work-record-${++sequence}`, requestContent: "ABC 업무", assignee: "테스트", status: "in_progress",
    folderPath: "isolated-test", folderName: "isolated-test", startDate: new Date("2026-01-01"),
    statusChangedAt: new Date("2026-01-01"), subtasks: { create: [{ content: "A", done: true }, { content: "B" }, { content: "C" }] },
  }, include: { subtasks: true } });
  const read = async id => {
    const response = await route.GET(new Request(`http://localhost/api/tasks/${id}/work-record`), { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json() };
  };
  const save = async (id, state, extra = {}, headers = {}) => {
    const response = await route.POST(new Request(`http://localhost/api/tasks/${id}/work-record`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ date: state.date, version: state.version, content: "A 작업", mode: "manual", hours: 2, ...extra }),
    }), { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await t.test("A can be recorded with B and C incomplete; history, other days and task fields stay intact", async () => {
      const task = await create();
      await db.dailyJournalDetail.create({ data: { taskId: task.id, dateISO: "2025-12-31", content: "이전 작업", hours: 1 } });
      await db.dailyJournalDetail.create({ data: { taskId: task.id, dateISO: today, notes: "보존할 비고", outputLocation: "기존 경로" } });
      await db.$executeRaw`INSERT INTO JournalTaskSelection (taskId,dateISO,included) VALUES (${task.id},${today},0)`;
      const state = (await read(task.id)).body;
      const result = await save(task.id, state);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { date: today, content: "A 작업", hours: 2, totalHours: 3 });
      assert.deepEqual(await db.task.findUnique({ where: { id: task.id }, include: { subtasks: true } }), task);
      assert.equal(await db.activityLog.count({ where: { taskId: task.id } }), 0);
      const detail = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { taskId: task.id, dateISO: today } } });
      assert.equal(detail.notes, "보존할 비고"); assert.equal(detail.outputLocation, "기존 경로");
      assert.equal(detail.content, "A 작업"); assert.equal(detail.hours, 2);
      const reloaded = (await read(task.id)).body;
      assert.equal(reloaded.content, "A 작업"); assert.equal(reloaded.hours, 2); assert.equal(reloaded.totalHours, 3);
      assert.equal((await save(task.id, reloaded)).status, 200);
      assert.equal((await dayState(db, task.id, today)).hours, 2, "repeated save is not additive");
      assert.equal((await db.$queryRaw`SELECT included FROM JournalTaskSelection WHERE taskId=${task.id} AND dateISO=${today}`)[0].included, 1);
      assert.ok(published.some(change => change.dateISO === today));
      assert.equal((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { taskId: task.id, dateISO: "2025-12-31" } } })).content, "이전 작업");
    });
    await t.test("invalid, stale and foreign requests cannot overwrite saved work", async () => {
      const task = await create(), state = (await read(task.id)).body;
      for (const extra of [{ content: " " }, { hours: -1 }, { hours: 25 }, { hours: "2" }, { mode: "unknown" }, { version: 123 }]) {
        assert.equal((await save(task.id, state, extra)).status, 400);
      }
      assert.equal((await save(task.id, state, {}, { origin: "https://example.com" })).status, 403);
      assert.equal((await save(task.id, state, { date: "2000-01-01" })).status, 409);
      await save(task.id, state);
      assert.equal((await save(task.id, state, { content: "덮어쓰면 안 됨", hours: 4 })).status, 409);
      assert.equal((await read(task.id)).body.hours, 2);
      await db.task.update({ where: { id: task.id }, data: { status: "submitted" } });
      assert.equal((await save(task.id, state)).status, 409);
      assert.equal((await read(task.id)).status, 409);
      assert.equal((await read("missing")).status, 404);
    });
    await t.test("running and paused timers stop once without transitioning the task", async () => {
      for (const running of [true, false]) {
        const task = await create();
        await db.$transaction(tx => saveDay(tx, task.id, today, 3600, "manual"));
        const start = running ? new Date(Date.now() - 1800000).toISOString() : null;
        await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id,taskId,runningSince) VALUES ('active',${task.id},${start})`;
        const state = (await read(task.id)).body;
        assert.equal(state.timerActive, true);
        assert.equal((await save(task.id, state)).status, 409);
        const body = { mode: "timer", timerStartedAt: start };
        const result = await save(task.id, state, body);
        assert.equal(result.status, 200);
        assert.ok(result.body.hours >= 1);
        assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, null);
        assert.deepEqual(await db.task.findUnique({ where: { id: task.id }, include: { subtasks: true } }), task);
        assert.equal((await save(task.id, state, body)).status, 409);
        assert.equal((await read(task.id)).body.hours, result.body.hours);
      }
    });
    await t.test("start, pause, resume and record save count only working time and keep the task in progress", async () => {
      const task = await create(), other = await create();
      t.mock.timers.enable({ apis: ["Date"], now: new Date("2099-02-01T01:00:00Z") });
      try {
        let state = (await read(task.id)).body;
        assert.equal(state.timerActive, false);
        assert.equal(state.timerSeconds, 0);
        assert.equal((await controlTimer(task.id, "start")).status, 200);
        t.mock.timers.tick(30 * 60000);
        state = (await read(task.id)).body;
        assert.equal(state.timerRunning, true);
        assert.equal(state.timerSeconds, 1800);
        assert.equal(state.timerHours, 0.5);
        assert.equal((await read(other.id)).body.otherTimerTaskName, task.requestContent);
        assert.equal((await controlTimer(other.id, "start")).status, 409);
        assert.equal((await controlTimer(task.id, "pause")).status, 200);
        state = (await read(task.id)).body;
        assert.equal(state.timerActive, true);
        assert.equal(state.timerRunning, false);
        assert.equal(state.timerStartedAt, null);
        t.mock.timers.tick(20 * 60000);
        assert.equal((await read(task.id)).body.timerSeconds, 1800, "breaks are not counted");
        assert.equal((await controlTimer(task.id, "resume")).status, 200);
        t.mock.timers.tick(30 * 60000);
        state = (await read(task.id)).body;
        assert.equal(state.timerSeconds, 3600);
        assert.equal(state.serverNow, "2099-02-01T02:20:00.000Z");
        const saved = await save(task.id, state, { mode: "timer", timerStartedAt: state.timerStartedAt, content: "A 작업 완료, B와 C는 내일" });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.hours, 1);
        assert.equal(saved.body.content, "A 작업 완료, B와 C는 내일");
        assert.equal((await read(task.id)).body.timerActive, false);
        assert.deepEqual(await db.task.findUnique({ where: { id: task.id }, include: { subtasks: true } }), task);
        assert.equal((await save(task.id, state, { mode: "timer", timerStartedAt: state.timerStartedAt })).status, 409);
      } finally { t.mock.timers.reset(); }
    });
    await t.test("automatic time can be disabled before starting a timer without losing existing hours", async () => {
      const task = await create();
      t.mock.timers.enable({ apis: ["Date"], now: new Date("2099-02-02T01:00:00Z") });
      try {
        assert.equal((await controlTimer(task.id, "auto", { date: "2099-02-02", enabled: true })).status, 200);
        assert.equal((await controlTimer(task.id, "start")).status, 409);
        const before = (await read(task.id)).body;
        assert.equal((await controlTimer(task.id, "auto", { date: before.date, enabled: false })).status, 200);
        assert.equal((await controlTimer(task.id, "start")).status, 200);
        const state = (await read(task.id)).body;
        assert.equal(state.automatic, false);
        assert.equal(state.hours, before.hours);
        assert.equal((await save(task.id, state, { mode: "timer", timerStartedAt: state.timerStartedAt })).status, 200);
      } finally { t.mock.timers.reset(); }
    });
    await t.test("timer changes and another task's running timer are handled independently", async () => {
      const task = await create(), other = await create();
      const state = (await read(task.id)).body;
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id,taskId,runningSince) VALUES ('active',${other.id},${new Date().toISOString()})`;
      assert.equal((await save(task.id, state, { mode: "timer", timerStartedAt: null })).status, 409);
      assert.equal((await save(task.id, state)).status, 200);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, other.id);
      await db.$executeRaw`DELETE FROM WorkTimer WHERE id='active'`;
    });
    await t.test("saving across Korean midnight asks to reload; timer settlement preserves both days", async () => {
      const task = await create();
      t.mock.timers.enable({ apis: ["Date"], now: new Date("2099-01-02T14:30:00Z") });
      try {
        const state = (await read(task.id)).body;
        assert.equal(state.date, "2099-01-02");
        const start = "2099-01-02T14:30:00.000Z";
        await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id,taskId,runningSince) VALUES ('active',${task.id},${start})`;
        t.mock.timers.setTime(new Date("2099-01-02T15:30:00Z").getTime());
        assert.equal((await save(task.id, state)).status, 409);
        const current = (await read(task.id)).body;
        assert.equal(current.date, "2099-01-03"); assert.equal(current.timerHours, 0.5);
        const result = await save(task.id, current, { mode: "timer", timerStartedAt: start });
        assert.equal(result.status, 200); assert.equal(result.body.totalHours, 1);
        assert.equal((await dayState(db, task.id, "2099-01-02")).hours, 0.5);
        assert.equal((await dayState(db, task.id, "2099-01-03")).hours, 0.5);
      } finally { t.mock.timers.reset(); }
    });
    await t.test("saving manual hours replaces automatic time and recalculates another automatic task", async () => {
      const task = await create(), other = await create();
      const { setAutomaticTime } = load("lib/autoWorkTime.ts");
      await db.$transaction(tx => setAutomaticTime(tx, task.id, today, true));
      const state = (await read(task.id)).body;
      assert.equal(state.automatic, true);
      assert.equal((await save(task.id, state)).status, 200);
      assert.equal((await dayState(db, task.id, today)).automatic, false);
      await db.$transaction(tx => setAutomaticTime(tx, other.id, today, true));
      assert.equal((await save(task.id, (await read(task.id)).body, { hours: 24 })).status, 200);
      assert.equal((await dayState(db, other.id, today)).hours, 0);
    });
    await t.test("failed transactions roll back content, hours, timer and journal membership without publishing", async () => {
      const task = await create(), start = new Date(Date.now() - 60000).toISOString();
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id,taskId,runningSince) VALUES ('active',${task.id},${start})`;
      const state = (await read(task.id)).body, before = published.length;
      const transaction = db.$transaction.bind(db);
      db.$transaction = callback => transaction(async tx => { await callback(tx); throw new Error("intentional rollback"); });
      try { assert.equal((await save(task.id, state, { mode: "timer", timerStartedAt: start })).status, 500); }
      finally { db.$transaction = transaction; }
      assert.equal(await db.dailyJournalDetail.count({ where: { taskId: task.id } }), 0);
      assert.equal((await db.$queryRaw`SELECT COUNT(*) AS count FROM JournalTaskSelection WHERE taskId=${task.id}`)[0].count, 0n);
      assert.equal((await db.$queryRaw`SELECT COUNT(*) AS count FROM WorkTimeSegment WHERE taskId=${task.id}`)[0].count, 0n);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, task.id);
      assert.equal(published.length, before);
    });
  } finally {
    await db.$disconnect();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
  }
});
