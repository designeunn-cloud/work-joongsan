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
    mod.require = name => {
      if (["@/lib/prisma", "./prisma"].includes(name)) return { prisma: db };
      if (name === "@/lib/dailyJournal") return { isValidJournalDate: value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime()) };
      return name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, absolute);
    return mod.exports;
  };
}

test("automatic work time is unique per date and recalculates only the remaining hours", async t => {
  const filename = path.join(os.tmpdir(), `automatic-work-time-${process.pid}-${Date.now()}.db`);
  const sql = new DatabaseSync(filename);
  for (const directory of fs.readdirSync("prisma/migrations").sort()) {
    const file = path.join("prisma/migrations", directory, "migration.sql");
    if (fs.existsSync(file)) sql.exec(fs.readFileSync(file, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${filename.replaceAll("\\", "/")}` } } });
  const load = loader(db), route = load("app/api/work-time/route.ts"), work = load("lib/workTimeServer.ts"), auto = load("lib/autoWorkTime.ts");
  const published = [];
  const date = "2026-11-11";
  const call = async body => {
    const response = await route.POST(new Request("http://localhost/api/work-time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const setAuto = (taskId, enabled = true, value = date) => call({ action: "auto", taskId, date: value, enabled });
  const manual = (taskId, hours, value = date) => call({ action: "manual", taskId, date: value, minutes: hours * 60, mode: "replace" });
  const day = (taskId, value = date) => work.dayState(db, taskId, value);
  const reset = async () => {
    await db.$executeRaw`DELETE FROM WorkTimeAuto`;
    await db.$executeRaw`DELETE FROM WorkTimeDay`;
    await db.$executeRaw`DELETE FROM WorkTimer`;
    await db.dailyJournalDetail.deleteMany();
    await db.$executeRaw`DELETE FROM JournalTaskSelection`;
  };
  try {
    load("lib/journalChangeTracker.ts").installJournalChangeTracker(db, async changes => { published.push(...changes); });
    for (const id of ["auto-a", "manual-b", "manual-c"]) await db.task.create({ data: { id, requestContent: id, assignee: "격리 테스트", folderPath: "", folderName: "" } });

    await t.test("8 minus the other hours, date isolation and one automatic task", async () => {
      await manual("manual-b", 2); await manual("manual-c", 3);
      assert.equal((await setAuto("auto-a")).status, 200);
      assert.equal((await day("auto-a")).hours, 3);
      assert.equal((await day("auto-a")).automatic, true);
      assert.equal((await day("auto-a")).source, "auto");
      assert.equal((await day("manual-b")).autoTaskId, "auto-a");
      const conflict = await setAuto("manual-b");
      assert.equal(conflict.status, 409);
      assert.match(conflict.body.error, /auto-a/);
      assert.equal((await setAuto("manual-b", true, "2026-11-12")).status, 200);
      assert.equal((await day("manual-b", "2026-11-12")).hours, 8);
      assert.equal((await day("auto-a")).hours, 3);
    });

    await t.test("manual changes and timer settlements refresh the automatic task after commit", async () => {
      const before = published.length;
      assert.equal((await manual("manual-b", 3)).status, 200);
      assert.equal((await day("auto-a")).hours, 2);
      assert.ok(published.slice(before).some(change => change.taskId === "auto-a" && change.dateISO === date));
      await db.$transaction(tx => work.settle(tx, { taskId: "manual-b", runningSince: "2026-11-11T01:00:00.000Z" }, new Date("2026-11-11T02:00:00.000Z")));
      assert.equal((await day("manual-b")).hours, 4);
      assert.equal((await day("auto-a")).hours, 1);
      assert.equal((await manual("auto-a", 0.5)).status, 200);
      assert.equal((await day("auto-a")).automatic, false);
      assert.equal((await day("auto-a")).hours, 0.5);
    });

    await t.test("decimal subtraction stays exact, overtime bottoms out at zero and exclusion is respected", async () => {
      await reset(); await manual("manual-b", 0.1); await manual("manual-c", 0.2); await setAuto("auto-a");
      assert.equal((await day("auto-a")).hours, 7.7);
      await manual("manual-b", 6); await manual("manual-c", 5);
      assert.equal((await day("auto-a")).hours, 0);
      await db.$transaction(async tx => {
        await tx.$executeRaw`INSERT INTO JournalTaskSelection (dateISO,taskId,included) VALUES (${date},'manual-c',0)`;
        await auto.recalculateAutomaticTime(tx, date);
      });
      assert.equal((await day("auto-a")).hours, 2);
      await db.$transaction(async tx => {
        await tx.$executeRaw`INSERT INTO JournalTaskSelection (dateISO,taskId,included) VALUES (${date},'auto-a',0) ON CONFLICT(dateISO,taskId) DO UPDATE SET included = 0`;
        await auto.recalculateAutomaticTime(tx, date);
      });
      assert.equal((await day("auto-a")).automatic, false);
      assert.equal((await day("auto-a")).hours, 2);
    });

    await t.test("automatic toggle keeps manual values and does not allow an active timer", async () => {
      await reset(); await manual("manual-b", 2); await setAuto("auto-a");
      assert.equal((await setAuto("auto-a", false)).status, 200);
      assert.equal((await day("auto-a")).hours, 6);
      assert.equal((await day("auto-a")).source, "manual");
      const today = load("lib/workTime.ts").koreaDate();
      await setAuto("auto-a", true, today);
      assert.equal((await call({ action: "start", taskId: "auto-a" })).status, 409);
      await setAuto("auto-a", false, today);
      assert.equal((await call({ action: "start", taskId: "auto-a" })).status, 200);
      assert.equal((await setAuto("auto-a", true, today)).status, 409);
      assert.equal((await call({ action: "stop", taskId: "auto-a" })).status, 200);
    });

    await t.test("a timer crossing midnight does not add the automatic balance to measured time", async () => {
      await reset();
      await setAuto("auto-a", true, "2026-11-12");
      await db.$transaction(tx => work.settle(tx, { taskId: "auto-a", runningSince: "2026-11-11T14:30:00.000Z" }, new Date("2026-11-11T15:30:00.000Z")));
      assert.equal((await day("auto-a", "2026-11-11")).hours, 0.5);
      assert.equal((await day("auto-a", "2026-11-12")).hours, 8);
      assert.equal((await day("auto-a", "2026-11-12")).automatic, true);
    });

    await t.test("transaction rollback sends no derived updates and concurrent tabs retain one owner", async () => {
      await reset(); const before = published.length;
      await assert.rejects(db.$transaction(async tx => { await auto.setAutomaticTime(tx, "auto-a", date, true); throw new Error("rollback fixture"); }), /rollback fixture/);
      assert.equal(await auto.automaticTimeState(db, date), null);
      assert.equal((await day("auto-a")).hours, null);
      assert.equal(published.length, before);
      const responses = await Promise.all([setAuto("auto-a"), setAuto("manual-b")]);
      assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimeAuto WHERE dateISO = ${date}`).length, 1);
    });

    await t.test("removing another task recalculates and removing the owner clears its automatic setting", async () => {
      await reset(); await manual("manual-b", 2); await setAuto("auto-a");
      await db.$transaction(async tx => { await tx.task.delete({ where: { id: "manual-b" } }); await auto.recalculateAutomaticTime(tx, date); });
      assert.equal((await day("auto-a")).hours, 8);
      await db.task.delete({ where: { id: "auto-a" } });
      assert.equal(await auto.automaticTimeState(db, date), null);
    });
  } finally { await db.$disconnect(); if (fs.existsSync(filename)) fs.unlinkSync(filename); }
});
