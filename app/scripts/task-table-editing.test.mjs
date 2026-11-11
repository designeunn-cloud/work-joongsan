import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const require = createRequire(import.meta.url);
function loader(db) {
  const cache = new Map();
  return function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => {
      // Never initialize the application's live client or its auto-sync worker.
      if (name === "@/lib/prisma" || name === "./prisma") return { prisma: db };
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      return require(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  };
}

test("table edits save dates, notes, locations and time atomically before publishing sync changes", async t => {
  const file = path.join(os.tmpdir(), `task-table-editing-${process.pid}-${Date.now()}.db`);
  const sql = new DatabaseSync(file);
  for (const directory of fs.readdirSync(path.join(root, "prisma/migrations")).sort()) {
    const migration = path.join(root, "prisma/migrations", directory, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  const load = loader(db), route = load("app/api/tasks/[id]/route.ts");
  const published = [];
  const { installJournalChangeTracker } = load("lib/journalChangeTracker.ts");
  const { journalToday } = load("lib/journalMemoSync.ts");
  const today = journalToday(), previous = "2026-01-01", id = "table-regression-task";
  const call = async (body, taskId = id) => {
    const response = await route.PATCH(new Request(`http://localhost/api/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: taskId }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    installJournalChangeTracker(db, async changes => {
      // A separate query must see committed state before any sheet work is scheduled.
      assert.ok(await db.task.findUnique({ where: { id } }));
      published.push(changes);
    });
    await db.task.create({ data: {
      id, requestContent: "격리 회귀 테스트", assignee: "테스트 담당자", status: "planned",
      folderPath: "", folderName: "", department: "무역부", startDate: new Date("2026-11-01"),
      requestDate: new Date("2026-11-02"), dueDate: new Date("2026-11-03"), reviewDate: new Date("2026-11-04"),
    } });
    await db.dailyJournalDetail.create({ data: { taskId: id, dateISO: previous, notes: "보존할 과거 비고", outputLocation: "과거 결과물" } });

    await t.test("date edits calculate planned end, preserve actual completion and support clearing", async () => {
      let result = await call({ startDateISO: "2026-11-10" });
      assert.equal(result.status, 200);
      assert.equal(result.body.plannedEndDate.slice(0, 10), "2026-11-17");
      assert.equal(result.body.endDate, null);
      result = await call({ startDateISO: "", requestDateISO: "", reviewDateISO: "" });
      assert.equal(result.status, 200);
      for (const field of ["startDate", "requestDate", "dueDate", "reviewDate"]) assert.equal(result.body[field], null, field);
      const before = published.length;
      assert.equal((await call({ startDateISO: "invalid" })).status, 400);
      assert.equal((await call({ endDateISO: "2026-11-11" })).status, 400);
      assert.equal(published.length, before);
      assert.equal((await db.task.findUnique({ where: { id } })).status, "planned");
    });

    await t.test("notes and output changes update today only and keep reference memo separate", async () => {
      const result = await call({ memo: "비고 첫 줄\n둘째 줄", referenceMemo: "참고 메모", outputLocation: "D:\\원본\nD:\\최종\\결과물.psd" });
      assert.equal(result.status, 200);
      assert.equal(result.body.referenceMemo, "참고 메모");
      const saved = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: today, taskId: id } } });
      assert.equal(saved.notes, "비고 첫 줄\n둘째 줄");
      assert.equal(saved.outputLocation, result.body.outputLocation);
      const old = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: previous, taskId: id } } });
      assert.equal(old.notes, "보존할 과거 비고");
      assert.equal(old.outputLocation, "과거 결과물");
      const cleared = await call({ referenceMemo: "", outputLocation: null, memo: "" });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.referenceMemo, null);
      assert.equal(cleared.body.outputLocation, null);
      const todayDetail = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: today, taskId: id } } });
      assert.equal(todayDetail.notes, "");
      assert.equal(todayDetail.outputLocation, null);
    });

    await t.test("completed tasks allow actual completion correction and settle their active timer", async () => {
      await db.task.update({ where: { id }, data: { status: "done", endDate: new Date(), completedAt: new Date() } });
      let result = await call({ endDateISO: "2026-11-09" });
      assert.equal(result.status, 200);
      assert.equal(result.body.endDate.slice(0, 10), "2026-11-09");
      assert.equal(result.body.completedAt, result.body.endDate);
      await db.$executeRaw`INSERT INTO WorkTimer (id,taskId,runningSince) VALUES ('active',${id},${new Date(Date.now() - 60000).toISOString()})`;
      assert.equal((await call({ status: "done", completionHours: 1 })).status, 409);
      result = await call({ status: "done" });
      assert.equal(result.status, 200);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id = 'active'`)[0].taskId, null);
      assert.ok((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: today, taskId: id } } })).hours > 0);
    });

    await t.test("failed transactions restore task and today's journal and publish no sheet event", async () => {
      await call({ memo: "원복 전 비고", outputLocation: "원복 전 위치" });
      const transaction = db.$transaction.bind(db), before = published.length;
      db.$transaction = callback => transaction(async tx => { await callback(tx); throw new Error("intentional test rollback"); });
      const quiet = t.mock.method(console, "error", () => {});
      try {
        assert.equal((await call({ memo: "저장되면 안 되는 비고", outputLocation: "저장되면 안 되는 위치" })).status, 500);
      } finally { db.$transaction = transaction; quiet.mock.restore(); }
      assert.equal((await db.task.findUnique({ where: { id } })).memo, "원복 전 비고");
      const detail = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: today, taskId: id } } });
      assert.equal(detail.notes, "원복 전 비고");
      assert.equal(detail.outputLocation, "원복 전 위치");
      assert.equal(published.length, before);
      assert.equal((await call({ memo: "test" }, "missing-task")).status, 404);
    });
  } finally {
    await db.$disconnect();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
