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
      if (name === "@/lib/bannerFolders") return {
        organizeTaskFolder: () => null, rollbackTaskFolder() {},
        BannerFolderError: class extends Error {}, FolderMoveDeferredError: class extends Error {},
      };
      if (name === "@/lib/productPolicyServer") return { registerTradeProducts: async () => {} };
      if (name === "@/lib/productPolicy") return { extractProductCodes: () => [], salesTitleData: () => ({}), getProductIssues: () => ({}) };
      if (name === "@/lib/specialNoticesServer") return { taskNoticesFor: async () => new Map() };
      return name.startsWith("@/") ? load(`${name.slice(2)}.ts`)
        : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  };
}

test("review workflow only applies to newly registered tasks and preserves first delivery through revisions", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-workflow-"));
  const filename = path.join(directory, "test.db");
  const sql = new DatabaseSync(filename);
  for (const name of fs.readdirSync("prisma/migrations").sort()) {
    const migration = path.join("prisma/migrations", name, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${filename.replaceAll("\\", "/")}` } } });
  const load = loader(db);
  const policy = load("lib/reviewWorkflowServer.ts");
  const route = load("app/api/tasks/[id]/route.ts");
  const listRoute = load("app/api/tasks/route.ts");
  const automatic = load("lib/autoWorkTime.ts");
  const { journalToday } = load("lib/journalMemoSync.ts");
  const cutoff = new Date(Date.now() - 60_000);
  const create = (id, extra = {}) => db.task.create({ data: {
    id, folderPath: "isolated-test", folderName: "isolated-test", assignee: "검증 담당자",
    requestContent: "상세페이지 검증", status: "in_progress", workType: "initial",
    ...extra,
  } });
  const patch = async (id, body) => {
    const response = await route.PATCH(new Request("http://localhost/api/tasks/test", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await t.test("a missing policy is legacy; only a missing policy table may be ignored", async () => {
      assert.equal(await policy.getReviewWorkflowCutoff(db), null);
      assert.equal(await policy.getReviewWorkflowCutoff({ $queryRaw: async () => { throw new Error("no such table: TaskWorkflowPolicy"); } }), null);
      await assert.rejects(policy.getReviewWorkflowCutoff({ $queryRaw: async () => { throw new Error("database is locked"); } }), /locked/);
      await assert.rejects(policy.getReviewWorkflowCutoff({ $queryRaw: async () => [{ activatedAt: "invalid" }] }), /적용 시점/);
    });

    const old = await create("legacy", { createdAt: new Date(cutoff.getTime() - 1), reviewDate: new Date("2026-01-02T00:00:00Z") });
    const oldBefore = await db.task.findUnique({ where: { id: old.id } });
    await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES ('review-v1', ${cutoff.toISOString()})`;
    const fresh = await create("fresh", { createdAt: cutoff });
    await t.test("activation is inclusive by registration time and does not mutate legacy records", async () => {
      assert.deepEqual(await db.task.findUnique({ where: { id: old.id } }), oldBefore);
      assert.equal(policy.usesReviewWorkflow(old, cutoff), false);
      assert.equal(policy.usesReviewWorkflow(fresh, cutoff), true);
      const response = await listRoute.GET();
      const tasks = await response.json();
      assert.equal(tasks.find(task => task.id === old.id).reviewWorkflow, false);
      assert.equal(tasks.find(task => task.id === fresh.id).reviewWorkflow, true);
    });
    await t.test("legacy tasks cannot acquire the new status, even after an ordinary edit", async () => {
      const rejected = await patch(old.id, { status: "submitted" });
      assert.equal(rejected.status, 400);
      assert.deepEqual(await db.task.findUnique({ where: { id: old.id } }), oldBefore);
      assert.equal(await db.activityLog.count({ where: { taskId: old.id } }), 0);
      const edited = await patch(old.id, { referenceMemo: "기존 기록 수정" });
      assert.equal(edited.body.reviewWorkflow, false);
      assert.equal((await patch(old.id, { status: "submitted" })).status, 400);
      assert.equal((await db.task.findUnique({ where: { id: old.id } })).reviewDate.toISOString(), oldBefore.reviewDate.toISOString());
    });
    await t.test("new tasks must record review before final completion", async () => {
      const rejected = await patch(fresh.id, { status: "done", completionHours: 1 });
      assert.equal(rejected.status, 400);
      assert.match(rejected.body.error, /먼저.*검토/);
      const unchanged = await db.task.findUnique({ where: { id: fresh.id } });
      assert.equal(unchanged.status, "in_progress");
      assert.equal(unchanged.reviewDate, null);
      assert.equal(unchanged.completedAt, null);
      assert.equal(await db.dailyJournalDetail.count({ where: { taskId: fresh.id } }), 0);
    });

    let firstDate;
    await t.test("first submission records actual completion and settles the active timer", async () => {
      const started = new Date(Date.now() - 12 * 60_000).toISOString();
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${fresh.id}, ${started})`;
      const submitted = await patch(fresh.id, { status: "submitted" });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.status, "submitted");
      assert.equal(submitted.body.reviewWorkflow, true);
      assert.ok(submitted.body.reviewDate);
      assert.equal(submitted.body.completedAt, null);
      assert.equal(submitted.body.endDate, null);
      firstDate = submitted.body.reviewDate;
      const timer = await db.$queryRaw`SELECT taskId, runningSince FROM WorkTimer WHERE id='active'`;
      assert.equal(timer[0].taskId, null);
      assert.equal(timer[0].runningSince, null);
      const today = await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: journalToday(), taskId: fresh.id } } });
      assert.ok(today.hours > 0);
      assert.equal(await db.$queryRaw`SELECT COUNT(*) AS count FROM WorkTimeSegment WHERE taskId = ${fresh.id}`.then(rows => Number(rows[0].count)), 1);
    });
    await t.test("revision, repeat review, hold, final completion and reopen preserve the first date", async () => {
      const same = await patch(fresh.id, { status: "submitted" });
      assert.equal(same.body.reviewDate, firstDate);
      const revision = await patch(fresh.id, { status: "in_progress", workType: "initial" });
      assert.equal(revision.status, 200);
      assert.equal(revision.body.workType, "revision");
      assert.equal(revision.body.reviewDate, firstDate);
      assert.equal((await patch(fresh.id, { status: "submitted" })).body.reviewDate, firstDate);
      assert.equal((await patch(fresh.id, { status: "review" })).body.reviewDate, firstDate);
      const finished = await patch(fresh.id, { status: "done" });
      assert.equal(finished.status, 200);
      assert.equal(finished.body.reviewDate, firstDate);
      assert.ok(finished.body.endDate);
      assert.ok(finished.body.completedAt);
      const resumed = await patch(fresh.id, { status: "in_progress" });
      assert.equal(resumed.body.reviewDate, firstDate);
      assert.equal(resumed.body.workType, "revision");
      assert.equal(resumed.body.completedAt, null);
      assert.equal(resumed.body.endDate, null);
    });
    await t.test("explicit corrections work, but clearing a recorded first review is rejected atomically", async () => {
      const corrected = await patch(fresh.id, { reviewDateISO: "2026-11-12" });
      assert.equal(corrected.status, 200);
      assert.equal(corrected.body.reviewDate, "2026-11-12T00:00:00.000Z");
      const before = await db.task.findUnique({ where: { id: fresh.id } });
      const rejected = await patch(fresh.id, { status: "submitted", reviewDateISO: "" });
      assert.equal(rejected.status, 400);
      assert.deepEqual(await db.task.findUnique({ where: { id: fresh.id } }), before);
    });
    await t.test("hold stops a new task timer while preserving its automatic time setting", async () => {
      const task = await create("automatic");
      const dateISO = journalToday();
      await db.$transaction(tx => automatic.setAutomaticTime(tx, task.id, dateISO, true));
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${task.id}, ${new Date(Date.now() - 60000).toISOString()})`;
      assert.equal((await patch(task.id, { status: "review" })).status, 200);
      assert.equal((await automatic.automaticTimeState(db, dateISO)).taskId, task.id);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, null);
      assert.equal((await db.task.findUnique({ where: { id: task.id } })).reviewDate, null, "hold is not first submission");
      const other = await create("other-time");
      const { saveDay } = load("lib/workTimeServer.ts");
      await db.$transaction(tx => saveDay(tx, other.id, dateISO, 3600, "manual"));
      assert.equal((await automatic.automaticTimeState(db, dateISO)).taskId, task.id);
      const details = await db.dailyJournalDetail.findMany({ where: { dateISO } });
      const expected = Math.max(0, 8 - details.filter(row => row.taskId !== task.id).reduce((sum, row) => sum + (row.hours ?? 0), 0));
      assert.ok(Math.abs(details.find(row => row.taskId === task.id).hours - expected) < 1e-8);
    });
    await t.test("legacy completion and hold retain their previous meanings", async () => {
      const task = await create("legacy-direct", { createdAt: new Date(cutoff.getTime() - 1000) });
      const done = await patch(task.id, { status: "done" });
      assert.equal(done.status, 200);
      assert.equal(done.body.reviewDate, null);
      await patch(task.id, { status: "in_progress" });
      const held = await patch(task.id, { status: "review" });
      assert.equal(held.status, 200);
      assert.ok(held.body.reviewDate);
      assert.equal(held.body.reviewWorkflow, false);
    });
  } finally {
    await db.$disconnect();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const file = filename + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(directory);
  }
});
