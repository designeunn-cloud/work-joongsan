import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "journal-review-workflow-"));
  const file = path.join(temp, "test.db");
  const sql = new DatabaseSync(file);
  for (const name of fs.readdirSync(path.join(root, "prisma/migrations")).sort()) {
    const migration = path.join(root, "prisma/migrations", name, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = request => {
      if (request === "./prisma" || request === "@/lib/prisma") return { prisma: db };
      if (request === "./journalChangeTracker") return { recordJournalChange: async () => {} };
      if (request.startsWith("@/")) return load(`${request.slice(2)}.ts`);
      if (request.startsWith(".")) return load(path.resolve(path.dirname(absolute), `${request}.ts`));
      return require(request);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  }
  const at = value => new Date(`${value}+09:00`);
  async function task(id, data = {}) {
    return db.task.create({ data: {
      id, folderPath: "", folderName: id, assignee: "테스트", requestContent: id,
      createdAt: at("2099-01-02T09:00:00"), status: "planned", startDate: null, ...data,
    } });
  }
  async function status(taskId, fromStatus, toStatus, date) {
    return db.activityLog.create({ data: {
      taskId, field: "status", fromStatus, toStatus, message: `${fromStatus}→${toStatus}`, createdAt: at(date),
    } });
  }
  try {
    await db.$executeRaw`INSERT INTO TaskWorkflowPolicy(name, activatedAt) VALUES ('review-v1', '2099-01-01T00:00:00.000Z')`;
    await run({ db, load, task, status, at });
  } finally {
    await db.$disconnect();
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith("journal-review-workflow-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

test("new reviews carry to the final day, retain the first review date and restore each day's state", async () => fixture(async ({ db, load, task, status, at }) => {
  const { livePreviewTaskIds } = load("lib/dailyJournalSnapshot.ts");
  const { getDailyJournal } = load("lib/dailyJournal.ts");
  await task("new-review", {
    status: "done", reviewDate: at("2099-01-03T10:30:00"), completedAt: at("2099-01-07T18:00:00"),
    endDate: at("2099-01-07T18:00:00"), statusChangedAt: at("2099-01-07T18:00:00"),
  });
  await task("idle-pending");
  await status("new-review", null, "planned", "2099-01-02T09:00:00");
  await status("new-review", "planned", "in_progress", "2099-01-02T10:00:00");
  await status("new-review", "in_progress", "submitted", "2099-01-03T10:30:00");
  await status("new-review", "submitted", "in_progress", "2099-01-05T10:00:00");
  await status("new-review", "in_progress", "submitted", "2099-01-06T15:00:00");
  await status("new-review", "submitted", "done", "2099-01-07T18:00:00");
  assert.deepEqual(await livePreviewTaskIds("2099-01-04"), ["new-review"], "reviewed work carries, ordinary waiting work does not");
  assert.deepEqual(await livePreviewTaskIds("2099-01-08"), [], "final closure ends automatic carry the next day");
  const expected = [
    ["2099-01-02", "진행중", "", "in_progress"],
    ["2099-01-03", "진행중", "2099-01-03", "submitted"],
    ["2099-01-04", "진행중", "2099-01-03", "submitted"],
    ["2099-01-05", "진행중", "2099-01-03", "in_progress"],
    ["2099-01-06", "진행중", "2099-01-03", "submitted"],
    ["2099-01-07", "완료", "2099-01-03", "done"],
  ];
  for (const [dateISO, label, completedDate, historicalStatus] of expected) {
    const journal = await getDailyJournal(dateISO);
    const row = journal.rows.find(row => row.taskId === "new-review");
    assert.equal(row.status, label, dateISO);
    assert.equal(row.completedDate, completedDate, dateISO);
    assert.equal(journal.tasks.find(item => item.id === "new-review").status, historicalStatus, dateISO);
  }
  assert.equal((await db.task.findUnique({ where: { id: "new-review" } })).status, "done", "historical reads never change source state");
}));

test("Korean midnight boundaries, saved snapshots and manual exclusions keep the new review rules", async () => fixture(async ({ db, load, task, status, at }) => {
  const { finalizeDay, livePreviewTaskIds } = load("lib/dailyJournalSnapshot.ts");
  const { getDailyJournal } = load("lib/dailyJournal.ts");
  const { withJournalReviewState } = load("lib/journalReviewWorkflow.ts");
  await task("midnight-review", { status: "done", reviewDate: at("2099-01-03T00:00:00"), completedAt: at("2099-01-05T00:00:00") });
  await status("midnight-review", null, "planned", "2099-01-02T09:00:00");
  await status("midnight-review", "planned", "submitted", "2099-01-03T00:00:00");
  await status("midnight-review", "submitted", "done", "2099-01-05T00:00:00");
  await db.dailyJournal.create({ data: { dateISO: "2099-01-04" } });
  await finalizeDay("2099-01-04");
  await finalizeDay("2099-01-04");
  const saved = await db.dailyJournal.findUnique({ where: { dateISO: "2099-01-04" }, include: { entries: true } });
  assert.deepEqual(saved.entries.map(entry => entry.taskId), ["midnight-review"], "fixed snapshots add only a missing review once");
  const source = await db.task.findUnique({ where: { id: "midnight-review" } });
  assert.equal((await withJournalReviewState([source], "2099-01-02"))[0].status, "planned");
  assert.equal((await withJournalReviewState([source], "2099-01-04"))[0].status, "submitted", "next Korean midnight must not leak into yesterday");
  assert.ok((await livePreviewTaskIds("2099-01-05")).includes(source.id));
  assert.ok(!(await livePreviewTaskIds("2099-01-06")).includes(source.id));
  await db.$executeRaw`INSERT INTO JournalTaskSelection(dateISO, taskId, included) VALUES ('2099-01-04', 'midnight-review', 0)`;
  assert.equal((await getDailyJournal("2099-01-04")).rows.length, 0, "explicit exclusion wins over review carry and snapshots");
}));

test("legacy journal membership, all twelve cells, comments and saved details stay byte-for-byte unchanged", async () => fixture(async ({ db, load, task, status, at }) => {
  const { getDailyJournal } = load("lib/dailyJournal.ts");
  const { livePreviewTaskIds, finalizeDay } = load("lib/dailyJournalSnapshot.ts");
  const { buildJournalTableRows, JOURNAL_TABLE_HEADERS, journalRowsToTsv } = load("lib/journalTable.ts");
  const old = await task("legacy-done", {
    createdAt: at("2098-12-15T09:00:00"), status: "done", requestContent: "기존 완료 업무", reviewDate: at("2098-12-16T10:00:00"),
    completedAt: at("2099-01-03T14:00:00"), endDate: at("2099-01-03T14:00:00"),
    memo: "기존 메모", outputLocation: "보존할 위치", productName: "기존 품명", productionType: "수정",
  });
  await task("legacy-wait", { createdAt: at("2098-12-20T09:00:00"), reviewDate: at("2098-12-21T09:00:00"), status: "review" });
  await status(old.id, "in_progress", "done", "2099-01-03T14:00:00");
  const detail = await db.dailyJournalDetail.create({ data: {
    dateISO: "2099-01-03", taskId: old.id, author: "허슬기 과장", content: "직접 입력한 기존 내용", hours: 1.5,
    notes: "보존할 비고\n기존 코멘트", outputLocation: "수동 결과물",
  } });
  const expected = buildJournalTableRows([old], "2099-01-03", [detail]);
  const actual = await getDailyJournal("2099-01-03");
  assert.deepEqual(actual.rows, expected);
  assert.equal(JOURNAL_TABLE_HEADERS.length, 12);
  assert.equal(journalRowsToTsv(actual.rows), journalRowsToTsv(expected));
  assert.deepEqual(await livePreviewTaskIds("2099-01-04"), [], "a pre-cutoff reviewed task never acquires carry");
  await db.dailyJournal.create({ data: { dateISO: "2099-01-04", entries: { create: [{ taskId: old.id }] } } });
  await finalizeDay("2099-01-04");
  assert.deepEqual((await db.dailyJournal.findUnique({ where: { dateISO: "2099-01-04" }, include: { entries: true } })).entries.map(entry => entry.taskId), [old.id]);
  const { withJournalReviewState } = load("lib/journalReviewWorkflow.ts");
  assert.deepEqual(buildJournalTableRows(await withJournalReviewState([old], "2099-01-04"), "2099-01-04")[0], buildJournalTableRows([old], "2099-01-04")[0], "legacy past status and date rules are not reinterpreted");
}));

test("past snapshot reads add a missing new review while preserving old entries and explicit exclusions", async () => fixture(async ({ db, load, task, status }) => {
  const { koreaDate } = load("lib/workTime.ts");
  const day = offset => koreaDate(new Date(Date.now() + offset * 86_400_000));
  const journalDate = day(-1);
  const date = (offset, clock = "10:00:00") => `${day(offset)}T${clock}`;
  const stamp = offset => new Date(`${date(offset)}+09:00`);
  await db.$executeRaw`UPDATE TaskWorkflowPolicy SET activatedAt = ${stamp(-10).toISOString()} WHERE name = 'review-v1'`;
  const old = await task("past-legacy", { createdAt: stamp(-20), status: "review", reviewDate: stamp(-15) });
  await task("past-new", { createdAt: stamp(-4), status: "done", reviewDate: stamp(-3), completedAt: stamp(0) });
  await status("past-new", null, "planned", date(-4));
  await status("past-new", "planned", "submitted", date(-3));
  await status("past-new", "submitted", "done", date(0));
  await db.dailyJournal.create({ data: { dateISO: journalDate, entries: { create: [{ taskId: old.id }] } } });
  await db.dailyJournalDetail.create({ data: { dateISO: journalDate, taskId: old.id, content: "기존 일지 그대로", notes: "기존 비고 그대로" } });
  const { getDailyJournal } = load("lib/dailyJournal.ts");
  const journal = await getDailyJournal(journalDate);
  assert.equal(journal.preview, false);
  assert.deepEqual(journal.tasks.map(task => task.id).sort(), ["past-legacy", "past-new"]);
  const newRow = journal.rows.find(row => row.taskId === "past-new");
  assert.equal(newRow.status, "진행중");
  assert.equal(newRow.completedDate, day(-3));
  const oldRow = journal.rows.find(row => row.taskId === old.id);
  assert.equal(oldRow.status, "보류");
  assert.equal(oldRow.completedDate, "");
  assert.equal(oldRow.content, "기존 일지 그대로");
  assert.equal(oldRow.notes, "기존 비고 그대로");
  await db.$executeRaw`INSERT INTO JournalTaskSelection(dateISO, taskId, included) VALUES (${journalDate}, 'past-new', 0)`;
  assert.deepEqual((await getDailyJournal(journalDate)).tasks.map(task => task.id), [old.id]);
  assert.equal((await db.dailyJournalEntry.findMany()).length, 2, "excluding a row does not rewrite the fixed snapshot");
}));
