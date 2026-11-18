import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loader(prisma, rejectSync = false) {
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => {
      if (["@/lib/prisma", "./prisma"].includes(name)) return { prisma };
      if (name === "@/lib/journalTaskNameSync" && rejectSync) {
        const actual = load("lib/journalTaskNameSync.ts");
        return { syncTaskNameToJournals: async (...args) => {
          await actual.syncTaskNameToJournals(...args);
          throw new Error("test-only journal write failure");
        } };
      }
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      return require(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, absolute);
    return mod.exports;
  }
  return load;
}

test("task renames keep kanban/table identity and every journal date in sync", async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task-name-sync-"));
  const databasePath = path.join(temp, "test.db");
  const sql = new DatabaseSync(databasePath);
  for (const name of fs.readdirSync(path.join(root, "prisma/migrations")).sort()) {
    const migration = path.join(root, "prisma/migrations", name, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replaceAll("\\", "/")}` } } });
  try {
    const load = loader(prisma);
    const route = load("app/api/tasks/[id]/route.ts");
    const { getDailyJournal } = load("lib/dailyJournal.ts");
    const { journalWorkTitle, replaceJournalTitle, journalContentBody } = load("lib/journalTable.ts");
    const { buildGoogleJournalRows } = load("lib/googleSheetsJournal.ts");
    const task = await prisma.task.create({ data: {
      id: "name-sync-task", folderPath: temp, folderName: "test-only", source: "manual",
      assignee: "격리 검증", department: "관리팀", requestContent: "이전 업무", productName: "WSI011",
      status: "planned", startDate: null,
    } });
    const other = await prisma.task.create({ data: {
      id: "other-name-task", folderPath: temp, folderName: "other-test-only", assignee: "격리 검증",
      department: "관리팀", requestContent: "이전 업무", status: "planned", startDate: null,
    } });
    const days = ["2026-11-15", "2026-11-16", "2026-11-17"];
    for (const day of days) {
      await prisma.dailyJournal.create({ data: { dateISO: day, entries: { create: { taskId: task.id } } } });
    }
    const contents = ["이전 업무 WSI011\r\n- 이미지 교체\r\n직접 쓴 설명", "이전 업무\n- 기존 세부할일", "이전 업무라는 단어를 포함한 별도 처리내용"];
    for (let index = 0; index < days.length; index++) {
      await prisma.dailyJournalDetail.create({ data: {
        dateISO: days[index], taskId: task.id, content: contents[index], hours: index + 0.5,
        notes: `날짜별 비고 ${index}`, outputLocation: `D:/결과물/${index}`, selectedSubtaskIds: "[]",
      } });
    }
    await prisma.dailyJournalDetail.create({ data: { dateISO: days[0], taskId: other.id, content: "이전 업무\n다른 업무의 처리내용" } });
    await prisma.$executeRaw`INSERT INTO JournalTaskSelection (dateISO,taskId,included) VALUES ('2026-11-17',${task.id},1)`;
    const published = [];
    load("lib/journalChangeTracker.ts").installJournalChangeTracker(prisma, async changes => { published.push(...changes); });

    async function rename(value, handler = route) {
      const response = await handler.PATCH(new Request(`http://localhost/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestContent: value }),
      }), { params: Promise.resolve({ id: task.id }) });
      return { status: response.status, body: await response.json() };
    }

    await t.test("a rename through the shared task API updates titles without changing dated evidence", async () => {
      assert.equal((await rename("  공통 업무명  ")).status, 200);
      const savedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      assert.equal(savedTask.requestContent, "공통 업무명");
      assert.equal(savedTask.folderPath, task.folderPath);
      const details = await prisma.dailyJournalDetail.findMany({ where: { taskId: task.id }, orderBy: { dateISO: "asc" } });
      assert.equal(details[0].content, "공통 업무명 WSI011\r\n- 이미지 교체\r\n직접 쓴 설명");
      assert.equal(details[1].content, "공통 업무명 WSI011\n- 기존 세부할일");
      assert.equal(details[2].content, contents[2], "custom prose is not a task-name field");
      for (const day of days) assert.ok(published.some(change => change.dateISO === day), "historical sheet rows must also be queued");
      for (const [index, detail] of details.entries()) {
        assert.equal(detail.hours, index + 0.5);
        assert.equal(detail.notes, `날짜별 비고 ${index}`);
        assert.equal(detail.outputLocation, `D:/결과물/${index}`);
      }
      for (const day of days) {
        const journal = await getDailyJournal(day);
        const row = journal.rows.find(row => row.taskId === task.id);
        assert.equal(row.requestContent, savedTask.requestContent);
        assert.equal(row.workTitle, "공통 업무명 WSI011");
        assert.ok(buildGoogleJournalRows([row], day)[0].values[4].startsWith("공통 업무명 WSI011"));
      }
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: other.id } })).requestContent, "이전 업무");
      assert.equal((await prisma.dailyJournalDetail.findUniqueOrThrow({ where: { dateISO_taskId: { dateISO: days[0], taskId: other.id } } })).content, "이전 업무\n다른 업무의 처리내용");
    });

    await t.test("a second rename uses the same identity and stale drafts retain their body", async () => {
      assert.equal((await rename("최종 업무명")).status, 200);
      const journal = await getDailyJournal(days[0]);
      const row = journal.rows.find(row => row.taskId === task.id);
      assert.equal(row.requestContent, "최종 업무명");
      assert.equal(row.content, "최종 업무명 WSI011\r\n- 이미지 교체\r\n직접 쓴 설명");
      const draft = replaceJournalTitle("공통 업무명 WSI011\n작성 중인 처리내용", ["공통 업무명 WSI011"], row.workTitle);
      assert.equal(journalContentBody(draft, row.workTitle), "작성 중인 처리내용");
      assert.equal(journalWorkTitle({ requestContent: "WSI011 최종 업무명", productName: "WSI011" }), "WSI011 최종 업무명");
      assert.equal(replaceJournalTitle("", ["공통 업무명"], "새 이름"), "");
    });

    await t.test("failed synchronization rolls back the name and every changed journal row", async () => {
      const failRoute = loader(prisma, true)("app/api/tasks/[id]/route.ts");
      const before = await prisma.dailyJournalDetail.findMany({ where: { taskId: task.id }, orderBy: { dateISO: "asc" } });
      const publishedBefore = published.length;
      const quiet = t.mock.method(console, "error", () => {});
      try { assert.equal((await rename("실패할 이름", failRoute)).status, 500); }
      finally { quiet.mock.restore(); }
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).requestContent, "최종 업무명");
      assert.deepEqual(await prisma.dailyJournalDetail.findMany({ where: { taskId: task.id }, orderBy: { dateISO: "asc" } }), before);
      assert.equal(published.length, publishedBefore, "failed transactions must not publish sheet updates");
    });

    await t.test("invalid names never overwrite a shared task name", async () => {
      for (const invalid of ["", "  ", "여러\n줄", "가".repeat(2001), 42, null]) assert.equal((await rename(invalid)).status, 400);
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).requestContent, "최종 업무명");
    });
  } finally {
    await prisma.$disconnect();
    // This directory is created by this test and holds only its isolated fixtures.
    if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith("task-name-sync-")) throw new Error("Unexpected test cleanup path");
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
