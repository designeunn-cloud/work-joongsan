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
    mod.require = name => name === "./prisma" || name === "@/lib/prisma" ? { prisma: db }
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`)
        : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  };
}

test("standing project choices add only the selected journal day without borrowing or changing existing work", async t => {
  const file = path.join(os.tmpdir(), `journal-standing-${process.pid}-${Date.now()}.db`);
  const sql = new DatabaseSync(file);
  for (const folder of fs.readdirSync("prisma/migrations").sort()) {
    const migration = path.join("prisma/migrations", folder, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  const load = loader(db);
  const { koreaDate } = load("lib/workTime.ts");
  const { standingJournalTaskId, STANDING_JOURNAL_PROJECT_NAME } = load("lib/journalStandingTasks.ts");
  const { getDailyJournal } = load("lib/dailyJournal.ts");
  const { setJournalSelection } = load("lib/journalMembership.ts");
  const route = load("app/api/journal/[date]/membership/route.ts");
  const date = koreaDate(), tomorrow = koreaDate(new Date(Date.now() + 86400000));
  const previous = koreaDate(new Date(Date.now() - 86400000));
  const projectId = "standing-project", routineId = standingJournalTaskId(projectId);
  const context = dateISO => ({ params: Promise.resolve({ date: dateISO }) });
  const get = async (dateISO = date) => (await route.GET(new Request("http://localhost"), context(dateISO))).json();
  const call = (method, body, dateISO = date, origin = "http://localhost") => route[method](new Request(`http://localhost/api/journal/${dateISO}/membership`, {
    method, headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  }), context(dateISO));
  try {
    await db.project.create({ data: { id: projectId, name: STANDING_JOURNAL_PROJECT_NAME, department: "운영·개선" } });
    await db.project.create({ data: { id: "other-project", name: "다른 프로젝트" } });
    const original = await db.task.create({ data: {
      id: "hosting-request", projectId, source: "manual", requestContent: "기존 호스팅 요청", assignee: "기존 담당자",
      folderPath: "D:\\원본 업무", folderName: "원본 업무", status: "done",
      completedAt: new Date("2026-01-01"), createdAt: new Date("2025-12-01"),
    } });

    await t.test("listing a project is read-only and ordinary choices retain their project name", async () => {
      const result = await get();
      assert.deepEqual(result.projects, [{ id: projectId, name: STANDING_JOURNAL_PROJECT_NAME, taskId: routineId, included: false }]);
      assert.equal(result.tasks.find(row => row.id === original.id).projectName, STANDING_JOURNAL_PROJECT_NAME);
      assert.equal(await db.task.count(), 1, "opening the chooser must not register a task");
    });

    await t.test("explicit addition creates one journal-only row and repeated additions are idempotent", async () => {
      let response = await call("POST", { projectIds: [projectId] });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).changed, 1);
      const routine = await db.task.findUnique({ where: { id: routineId } });
      assert.equal(routine.source, "journal");
      assert.equal(routine.status, "in_progress");
      assert.equal(routine.projectId, projectId);
      assert.equal(routine.requestContent, STANDING_JOURNAL_PROJECT_NAME);
      for (const field of ["requestDate", "startDate", "endDate", "completedAt"]) assert.equal(routine[field], null, field);
      assert.equal(routine.folderPath, "");
      assert.deepEqual(await db.task.findUnique({ where: { id: original.id } }), original);
      response = await call("POST", { taskIds: [], projectIds: [projectId, projectId] });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).changed, 0);
      assert.equal(await db.task.count(), 2);
      const result = await get();
      assert.equal(result.projects[0].included, true);
      assert.equal(result.tasks.some(task => task.id === routineId), false, "journal rows must stay out of ordinary task choices");
      assert.ok((await getDailyJournal(date)).tasks.some(task => task.id === routineId));
    });

    await t.test("each day is selected independently and exclude/re-add preserves that day's saved values", async () => {
      await db.dailyJournalDetail.create({ data: { taskId: routineId, dateISO: date, content: "오늘 파일 정리", hours: .5 } });
      await db.dailyJournalDetail.create({ data: { taskId: routineId, dateISO: previous, content: "과거 업무 관리", hours: 1 } });
      await setJournalSelection(previous, routineId, true);
      assert.equal((await call("DELETE", { taskIds: [routineId] })).status, 200);
      assert.equal((await get()).projects[0].included, false);
      assert.equal((await call("POST", { projectIds: [projectId] })).status, 200);
      assert.equal((await getDailyJournal(date)).rows.find(row => row.taskId === routineId).hours, .5);
      assert.equal((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: previous, taskId: routineId } } })).content, "과거 업무 관리");
      assert.equal((await get(tomorrow)).projects[0].included, false);
      assert.equal((await call("POST", { projectIds: [projectId] }, tomorrow)).status, 400);
      assert.equal((await db.$queryRaw`SELECT COUNT(*) AS total FROM JournalTaskSelection WHERE dateISO = ${tomorrow}`)[0].total, 0n);
    });

    await t.test("other or missing projects cannot create journal rows", async () => {
      assert.equal((await call("POST", { projectIds: ["other-project"] })).status, 409);
      assert.equal((await call("POST", { projectIds: ["missing-project"] })).status, 409);
      assert.equal((await call("DELETE", { projectIds: [projectId] })).status, 400);
      assert.equal((await call("POST", { projectIds: [projectId] }, date, "https://other.invalid")).status, 403);
      assert.equal(await db.task.count(), 2);
    });
  } finally {
    await db.$disconnect();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
