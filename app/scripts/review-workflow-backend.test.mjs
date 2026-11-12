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

test("review workflow isolates legacy tasks, supports explicit enrollment and preserves first delivery", async t => {
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
      let calls = 0;
      const compatible = await policy.getReviewWorkflowPolicy({ $queryRaw: async () => {
        if (++calls === 1) throw new Error("no such column: legacySnapshot");
        return [{ name: "review-v1", activatedAt: cutoff.toISOString() }];
      } });
      assert.equal(calls, 2);
      assert.equal(compatible.cutoff.toISOString(), cutoff.toISOString());
      assert.equal(compatible.taskSnapshots.size, 0);
      await assert.rejects(policy.getReviewWorkflowPolicy({ $queryRaw: async () => { throw new Error("no such column: anotherColumn"); } }), /anotherColumn/);
      await assert.rejects(policy.getReviewWorkflowPolicy({ $queryRaw: async () => [{
        name: "review-task:invalid-snapshot", activatedAt: cutoff.toISOString(), legacySnapshot: '{"status":"done"}',
      }] }), /기존 업무 상태/);
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
    await t.test("new tasks without a first delivery must confirm its date before direct completion", async () => {
      const rejected = await patch(fresh.id, { status: "done", completionHours: 1 });
      assert.equal(rejected.status, 400);
      assert.match(rejected.body.error, /최초 전달일/);
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

    const enrolledAt = new Date(Date.now() - 5_000);
    const formerReview = new Date(enrolledAt.getTime() - 86_400_000);
    const enrolled = await create("enrolled", {
      createdAt: new Date(cutoff.getTime() - 86_400_000), reviewDate: formerReview,
      endDate: new Date("2026-11-09T00:00:00Z"),
    });
    const enrolledBefore = await db.task.findUnique({ where: { id: enrolled.id } });
    const legacySnapshot = JSON.stringify({
      status: enrolledBefore.status, reviewDate: enrolledBefore.reviewDate.toISOString(),
      endDate: enrolledBefore.endDate.toISOString(), completedAt: null,
    });
    await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt, legacySnapshot) VALUES (${`review-task:${enrolled.id}`}, ${enrolledAt.toISOString()}, ${legacySnapshot})`;
    await t.test("explicit enrollment is read-only, preserves its snapshot and starts at its own timestamp", async () => {
      const currentPolicy = await policy.getReviewWorkflowPolicy(db);
      assert.equal(policy.getReviewWorkflowStart(enrolledBefore, currentPolicy).toISOString(), enrolledAt.toISOString());
      assert.equal(policy.getReviewWorkflowStart(fresh, currentPolicy).toISOString(), cutoff.toISOString());
      assert.deepEqual(currentPolicy.taskSnapshots.get(enrolled.id), JSON.parse(legacySnapshot));
      assert.deepEqual(await db.task.findUnique({ where: { id: enrolled.id } }), enrolledBefore);
      const beforeStart = await policy.withReviewWorkflow([enrolledBefore], db, new Date(enrolledAt.getTime() - 1));
      assert.equal(beforeStart[0].reviewWorkflow, false);
      assert.equal(beforeStart[0].reviewDate.toISOString(), formerReview.toISOString());
      const atStart = await policy.withReviewWorkflow([enrolledBefore], db, enrolledAt);
      assert.equal(atStart[0].reviewWorkflow, true);
      assert.equal(atStart[0].reviewDate, null);
      const listed = await listRoute.GET().then(response => response.json());
      assert.equal(listed.find(task => task.id === enrolled.id).reviewWorkflow, true);
      assert.equal(listed.find(task => task.id === enrolled.id).reviewDate, null);
      assert.equal(listed.find(task => task.id === old.id).reviewWorkflow, false);
    });
    await t.test("legacy hold dates cannot skip first delivery or be edited before enrollment's first submission", async () => {
      assert.equal((await patch(enrolled.id, { status: "done" })).status, 400);
      assert.equal((await patch(enrolled.id, { reviewDateISO: journalToday() })).status, 400);
      assert.equal((await patch(enrolled.id, { reviewDateISO: "" })).status, 400);
      assert.deepEqual(await db.task.findUnique({ where: { id: enrolled.id } }), enrolledBefore);
      const edited = await patch(enrolled.id, { referenceMemo: "개별 적용 확인" });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.reviewDate, null);
      assert.equal((await db.task.findUnique({ where: { id: enrolled.id } })).reviewDate.toISOString(), formerReview.toISOString());
      assert.equal((await patch(enrolled.id, { status: "review" })).body.reviewDate, null);
      const resumed = await patch(enrolled.id, { status: "in_progress", workType: "initial" });
      assert.equal(resumed.body.workType, "initial", "old hold date must not classify resumed work as a revision");
      assert.equal((await db.task.findUnique({ where: { id: enrolled.id } })).reviewDate.toISOString(), formerReview.toISOString());
    });
    let enrolledFirstDate;
    await t.test("an enrolled legacy task first submits with a new first date and settles its timer", async () => {
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${enrolled.id}, ${new Date(Date.now() - 60000).toISOString()})`;
      const submitted = await patch(enrolled.id, { status: "submitted" });
      assert.equal(submitted.status, 200);
      enrolledFirstDate = submitted.body.reviewDate;
      assert.ok(new Date(enrolledFirstDate).getTime() >= enrolledAt.getTime());
      assert.notEqual(enrolledFirstDate, formerReview.toISOString());
      assert.equal(submitted.body.reviewWorkflow, true);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, null);
      assert.ok((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: journalToday(), taskId: enrolled.id } } })).hours > 0);
      assert.equal((await patch(enrolled.id, { status: "in_progress" })).body.workType, "revision");
      assert.equal((await patch(enrolled.id, { status: "submitted" })).body.reviewDate, enrolledFirstDate);
      const finished = await patch(enrolled.id, { status: "done" });
      assert.equal(finished.status, 200);
      assert.equal(finished.body.reviewDate, enrolledFirstDate);
      assert.ok(finished.body.completedAt);
      assert.deepEqual((await policy.getReviewWorkflowPolicy(db)).taskSnapshots.get(enrolled.id), JSON.parse(legacySnapshot));
    });
    await t.test("date-only correction on enrollment day remains valid while earlier legacy dates are rejected", async () => {
      const activationDate = new Date(enrolledAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const corrected = await patch(enrolled.id, { reviewDateISO: activationDate });
      assert.equal(corrected.status, 200);
      assert.ok(corrected.body.reviewDate);
      assert.ok(new Date(corrected.body.reviewDate).getTime() >= enrolledAt.getTime());
      assert.equal((await patch(enrolled.id, { status: "in_progress" })).body.workType, "revision");
      assert.equal((await patch(enrolled.id, { status: "done" })).status, 200);
      const before = await db.task.findUnique({ where: { id: enrolled.id } });
      assert.equal((await patch(enrolled.id, { reviewDateISO: formerReview.toISOString().slice(0, 10) })).status, 400);
      assert.deepEqual(await db.task.findUnique({ where: { id: enrolled.id } }), before);
    });
    await t.test("an enrolled task without a legacy review date follows the same first-delivery flow", async () => {
      const task = await create("enrolled-empty", { createdAt: new Date(cutoff.getTime() - 86_400_000) });
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES (${`review-task:${task.id}`}, ${enrolledAt.toISOString()})`;
      assert.equal((await patch(task.id, { status: "done" })).status, 400);
      const submitted = await patch(task.id, { status: "submitted" });
      assert.equal(submitted.status, 200);
      assert.ok(submitted.body.reviewDate);
      assert.equal((await patch(task.id, { status: "done" })).body.reviewDate, submitted.body.reviewDate);
    });
    await t.test("future enrollment remains inactive and cannot reset the global workflow", async () => {
      const future = new Date(Date.now() + 86_400_000);
      const task = await create("future-enrollment", { createdAt: new Date(cutoff.getTime() - 86_400_000) });
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES (${`review-task:${task.id}`}, ${future.toISOString()})`;
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES (${`review-task:${fresh.id}`}, ${future.toISOString()})`;
      const current = await policy.withReviewWorkflow([task, fresh], db);
      assert.equal(current[0].reviewWorkflow, false);
      assert.equal(current[1].reviewWorkflow, true);
      assert.equal((await patch(task.id, { status: "submitted" })).status, 400);
      assert.equal(policy.getReviewWorkflowStart(fresh, await policy.getReviewWorkflowPolicy(db)).toISOString(), cutoff.toISOString());
    });

    const koreaDate = offset => new Date(Date.now() + offset * 86_400_000 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const deliveryStamp = dateISO => new Date(`${dateISO}T00:00:00+09:00`).toISOString();
    await t.test("planned work can finish directly with a confirmed past delivery and no invented start date", async () => {
      const task = await create("direct-planned", { status: "planned", startDate: null });
      const beforeCompletion = Date.now();
      const completed = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-2), completionHours: 1.5 });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.status, "done");
      assert.equal(completed.body.reviewDate, deliveryStamp(koreaDate(-2)));
      assert.equal(completed.body.startDate, null);
      assert.ok(new Date(completed.body.completedAt).getTime() >= beforeCompletion);
      assert.equal(completed.body.endDate, completed.body.completedAt);
      assert.equal((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: journalToday(), taskId: task.id } } })).hours, 1.5);
      const transitions = await db.activityLog.findMany({ where: { taskId: task.id, toStatus: { not: null } } });
      assert.deepEqual(transitions.map(row => [row.fromStatus, row.toStatus]), [["planned", "done"]]);
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(task.id), false, "global new tasks need no individual confirmation marker");
      await patch(task.id, { status: "planned" });
      const repeated = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(1) });
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.reviewDate, completed.body.reviewDate, "a redundant delivery selection cannot overwrite an existing first date");
      assert.equal(repeated.body.startDate, null);
    });
    await t.test("in-progress direct completion settles the timer and preserves the original start", async () => {
      const started = new Date(Date.now() - 86_400_000);
      const task = await create("direct-running", { startDate: started });
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${task.id}, ${new Date(Date.now() - 120000).toISOString()})`;
      const completed = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(0) });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.startDate, started.toISOString());
      assert.equal(completed.body.reviewDate, deliveryStamp(koreaDate(0)));
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, null);
      assert.ok((await db.dailyJournalDetail.findUnique({ where: { dateISO_taskId: { dateISO: journalToday(), taskId: task.id } } })).hours > 0);
    });
    await t.test("missing, malformed, impossible, future and conflicting first dates leave the task and timer untouched", async () => {
      const task = await create("direct-invalid", { createdAt: new Date(cutoff.getTime() - 86_400_000) });
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES (${`review-task:${task.id}`}, ${enrolledAt.toISOString()})`;
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${task.id}, ${new Date(Date.now() - 60000).toISOString()})`;
      const before = await db.task.findUnique({ where: { id: task.id } });
      const invalid = [undefined, null, "", 20261112, "2026-2-03", "2026-02-30", "2026-11-12T00:00:00Z", "invalid", koreaDate(1)];
      for (const firstDeliveryDateISO of invalid) {
        const rejected = await patch(task.id, { status: "done", firstDeliveryDateISO });
        assert.equal(rejected.status, 400, `reject ${String(firstDeliveryDateISO)}`);
      }
      assert.equal((await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(0), reviewDateISO: koreaDate(1) })).status, 400);
      assert.deepEqual(await db.task.findUnique({ where: { id: task.id } }), before);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, task.id);
      assert.equal(await db.activityLog.count({ where: { taskId: task.id } }), 0);
      assert.equal(await db.dailyJournalDetail.count({ where: { taskId: task.id } }), 0);
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(task.id), false);
    });
    await t.test("direct completion retains subtask and timer guards without leaving a confirmation marker", async () => {
      const task = await create("direct-guarded", { createdAt: new Date(cutoff.getTime() - 86_400_000) });
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt) VALUES (${`review-task:${task.id}`}, ${enrolledAt.toISOString()})`;
      await db.subtask.create({ data: { id: "direct-pending-subtask", taskId: task.id, content: "남은 세부할일", done: false } });
      await db.$executeRaw`INSERT OR REPLACE INTO WorkTimer (id, taskId, runningSince) VALUES ('active', ${task.id}, ${new Date(Date.now() - 60000).toISOString()})`;
      const before = await db.task.findUnique({ where: { id: task.id } });
      const blocked = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-3) });
      assert.equal(blocked.status, 400);
      assert.match(blocked.body.error, /세부할일/);
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(task.id), false);
      await db.subtask.update({ where: { id: "direct-pending-subtask" }, data: { done: true } });
      const conflict = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-3), completionHours: 1 });
      assert.equal(conflict.status, 409);
      assert.deepEqual(await db.task.findUnique({ where: { id: task.id } }), before);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, task.id);
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(task.id), false);
      const completed = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-3) });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.reviewDate, deliveryStamp(koreaDate(-3)));
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(task.id), true);
      assert.equal((await db.$queryRaw`SELECT taskId FROM WorkTimer WHERE id='active'`)[0].taskId, null);
      const listed = await listRoute.GET().then(response => response.json());
      assert.equal(listed.find(row => row.id === task.id).reviewDate, completed.body.reviewDate, "confirmed pre-enrollment delivery must survive a fresh policy read");
    });
    await t.test("an enrolled task can confirm an earlier delivery without changing its legacy snapshot", async () => {
      const task = await create("direct-legacy-past", { createdAt: new Date(cutoff.getTime() - 86_400_000), reviewDate: formerReview });
      const snapshot = JSON.stringify({ status: "in_progress", reviewDate: formerReview.toISOString(), endDate: null, completedAt: null });
      await db.$executeRaw`INSERT INTO TaskWorkflowPolicy (name, activatedAt, legacySnapshot) VALUES (${`review-task:${task.id}`}, ${enrolledAt.toISOString()}, ${snapshot})`;
      const completed = await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-7) });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.reviewDate, deliveryStamp(koreaDate(-7)));
      let currentPolicy = await policy.getReviewWorkflowPolicy(db);
      assert.deepEqual(currentPolicy.taskSnapshots.get(task.id), JSON.parse(snapshot));
      assert.equal(policy.getReviewWorkflowFirstDate(await db.task.findUnique({ where: { id: task.id } }), currentPolicy).toISOString(), completed.body.reviewDate);
      await patch(task.id, { status: "in_progress" });
      assert.equal((await patch(task.id, { status: "done", firstDeliveryDateISO: koreaDate(-1) })).body.reviewDate, completed.body.reviewDate);
      const corrected = await patch(task.id, { reviewDateISO: koreaDate(-6) });
      assert.equal(corrected.status, 200, "separate explicit date correction is still available after confirmation");
      assert.equal(corrected.body.reviewDate, `${koreaDate(-6)}T00:00:00.000Z`);
      currentPolicy = await policy.getReviewWorkflowPolicy(db);
      assert.deepEqual(currentPolicy.taskSnapshots.get(task.id), JSON.parse(snapshot));
    });
    await t.test("the direct date field does not change untouched legacy completion or bypass hold requirements", async () => {
      const legacy = await create("direct-legacy-unchanged", { status: "planned", startDate: null, createdAt: new Date(cutoff.getTime() - 86_400_000) });
      const completed = await patch(legacy.id, { status: "done", firstDeliveryDateISO: koreaDate(-1) });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.reviewDate, null);
      assert.equal(completed.body.startDate, null);
      assert.equal((await policy.getReviewWorkflowPolicy(db)).confirmedDeliveries.has(legacy.id), false);
      const held = await create("direct-hold-unchanged", { status: "review" });
      assert.equal((await patch(held.id, { status: "done", firstDeliveryDateISO: koreaDate(-1) })).status, 400);
      assert.equal((await db.task.findUnique({ where: { id: held.id } })).reviewDate, null);
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
