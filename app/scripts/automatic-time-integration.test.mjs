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
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, absolute);
    return mod.exports;
  };
}

test("journal edits, inclusion and deletion keep automatic hours transactional", async t => {
  const filename = path.join(os.tmpdir(), `automatic-time-integration-${process.pid}-${Date.now()}.db`);
  const sql = new DatabaseSync(filename);
  for (const directory of fs.readdirSync("prisma/migrations").sort()) {
    const file = path.join("prisma/migrations", directory, "migration.sql");
    if (fs.existsSync(file)) sql.exec(fs.readFileSync(file, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${filename.replaceAll("\\", "/")}` } } });
  const load = loader(db), work = load("lib/workTimeServer.ts"), automatic = load("lib/autoWorkTime.ts");
  const rowsRoute = load("app/api/journal/[date]/rows/route.ts"), membership = load("app/api/journal/[date]/membership/route.ts"), tasks = load("app/api/tasks/[id]/route.ts");
  const published = [];
  const date = "2035-01-02", nextDate = "2035-01-03", owner = "integration-auto", other = "integration-other", third = "integration-third";
  const saveRows = async rows => {
    const response = await rowsRoute.PUT(new Request(`http://localhost/api/journal/${date}/rows`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }), { params: Promise.resolve({ date }) });
    return { status: response.status, body: await response.json() };
  };
  const exclude = async taskId => {
    const response = await membership.DELETE(new Request(`http://localhost/api/journal/${date}/membership`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds: [taskId] }) }), { params: Promise.resolve({ date }) });
    return { status: response.status, body: await response.json() };
  };
  const remove = async id => tasks.DELETE(new Request(`http://localhost/api/tasks/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
  const hours = async (taskId, value = date) => (await work.dayState(db, taskId, value)).hours;
  const seed = async () => {
    await db.$executeRaw`DELETE FROM WorkTimeAuto`;
    await db.$executeRaw`DELETE FROM WorkTimeDay`;
    await db.dailyJournalDetail.deleteMany();
    await db.$executeRaw`DELETE FROM JournalTaskSelection`;
    await db.$transaction(async tx => {
      await work.saveDay(tx, other, date, 2 * 3600, "manual");
      await work.saveDay(tx, third, date, 3 * 3600, "manual");
      await automatic.setAutomaticTime(tx, owner, date, true);
      await work.saveDay(tx, other, nextDate, 1 * 3600, "manual");
      await work.saveDay(tx, third, nextDate, 4 * 3600, "manual");
      await automatic.setAutomaticTime(tx, owner, nextDate, true);
    });
  };
  try {
    load("lib/journalChangeTracker.ts").installJournalChangeTracker(db, async changes => { published.push(...changes); });
    for (const id of [owner, other, third]) await db.task.create({ data: { id, source: "manual", requestContent: id, assignee: "격리 테스트", folderPath: "", folderName: "", startDate: null, requestDate: null } });

    await t.test("a journal batch refreshes the residual after every row and preserves other dates", async () => {
      await seed(); const before = published.length;
      const result = await saveRows([{ taskId: other, hours: 3, notes: "직접 비고" }, { taskId: third, hours: 1 }]);
      assert.equal(result.status, 200);
      assert.equal(await hours(owner), 4);
      assert.equal(result.body.rows.find(row => row.taskId === owner).hours, 4);
      assert.equal(await hours(owner, nextDate), 3);
      assert.equal((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: date, taskId: other } } })).notes, "직접 비고");
      assert.ok(published.slice(before).some(change => change.dateISO === date && change.taskId === owner));
      const cleared = await saveRows([{ taskId: other, hours: null }]);
      assert.equal(cleared.status, 200);
      assert.equal(await hours(owner), 7);
    });

    await t.test("editing automatic hours explicitly switches only that date to manual", async () => {
      await seed();
      assert.equal((await saveRows([{ taskId: owner, hours: 4 }])).status, 200);
      assert.equal((await work.dayState(db, owner, date)).automatic, false);
      assert.equal(await hours(owner), 4);
      assert.equal((await work.dayState(db, owner, nextDate)).automatic, true);
      assert.equal((await saveRows([{ taskId: other, hours: 4 }])).status, 200);
      assert.equal(await hours(owner), 4, "a manual owner must no longer change when another task changes");
    });

    await t.test("invalid and rolled-back journal batches change neither inputs nor derived hours", async () => {
      await seed(); const before = published.length;
      assert.equal((await saveRows([{ taskId: other, hours: 25 }])).status, 400);
      assert.equal((await saveRows([{ taskId: "not-in-journal", hours: 1 }])).status, 400);
      assert.equal(published.length, before);
      const transaction = db.$transaction.bind(db);
      db.$transaction = callback => transaction(async tx => { await callback(tx); throw new Error("intentional integration rollback"); });
      try { assert.equal((await saveRows([{ taskId: other, hours: 5 }, { taskId: third, hours: 0 }])).status, 500); }
      finally { db.$transaction = transaction; }
      assert.equal(await hours(other), 2);
      assert.equal(await hours(third), 3);
      assert.equal(await hours(owner), 3);
      assert.equal((await work.dayState(db, owner, date)).automatic, true);
      assert.equal(published.length, before);
    });

    await t.test("excluding and re-including another task recalculates, while excluding the owner releases automatic mode", async () => {
      await seed();
      assert.equal((await exclude(third)).status, 200);
      assert.equal(await hours(owner), 6);
      assert.equal(await hours(third), 3, "exclusion preserves entered hours");
      await db.$transaction(tx => load("lib/journalMembership.ts").setJournalSelection(date, third, true, tx));
      assert.equal(await hours(owner), 3);
      assert.equal((await exclude(owner)).status, 200);
      assert.equal((await work.dayState(db, owner, date)).automatic, false);
      assert.equal(await hours(owner), 3);
      assert.equal((await db.$queryRaw`SELECT included FROM JournalTaskSelection WHERE dateISO = ${date} AND taskId = ${owner}`)[0].included, 0);
      assert.equal((await work.dayState(db, owner, nextDate)).automatic, true);
    });

    await t.test("task deletion refreshes every affected date and owner deletion clears its settings", async () => {
      await seed(); const before = published.length;
      assert.equal((await remove(other)).status, 200);
      assert.equal(await hours(owner), 5);
      assert.equal(await hours(owner, nextDate), 4);
      for (const value of [date, nextDate]) assert.ok(published.slice(before).some(change => change.taskId === owner && change.dateISO === value));
      assert.ok(published.slice(before).some(change => change.deletedTaskId === other));
      assert.equal((await remove(owner)).status, 200);
      assert.equal(await automatic.automaticTimeState(db, date), null);
      assert.equal(await automatic.automaticTimeState(db, nextDate), null);
    });
  } finally { await db.$disconnect(); if (fs.existsSync(filename)) fs.unlinkSync(filename); }
});
