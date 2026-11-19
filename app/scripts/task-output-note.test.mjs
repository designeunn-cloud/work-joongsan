import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loader(prisma) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => ['@/lib/prisma', './prisma'].includes(name) ? { prisma }
      : name.startsWith('@/') ? load(`${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, absolute);
    return mod.exports;
  }
  return load;
}

test('completion records external result locations beside Excel-only requests without moving folders', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-output-note-'));
  const dbPath = path.join(temp, 'test.db');
  const sql = new DatabaseSync(dbPath);
  for (const name of fs.readdirSync('prisma/migrations').sort()) {
    const file = path.join('prisma/migrations', name, 'migration.sql');
    if (fs.existsSync(file)) sql.exec(fs.readFileSync(file, 'utf8'));
  }
  sql.close();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll('\\', '/')}` } } });
  const load = loader(prisma);
  const route = load('app/api/tasks/[id]/route.ts');
  const { createTaskOutputNote, TaskOutputNoteError } = load('lib/taskOutputNote.ts');
  const previousWatch = process.env.WATCH_FOLDER_PATH;
  process.env.WATCH_FOLDER_PATH = temp;
  const excelBytes = Buffer.from([80, 75, 0, 255, 42]);
  let sequence = 0;
  async function fixture(overrides = {}, files = []) {
    const folderName = `20261119_위치기록${++sequence}`, folderPath = path.join(temp, folderName);
    fs.mkdirSync(folderPath);
    fs.writeFileSync(path.join(folderPath, '원본요청서.xlsx'), excelBytes);
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(folderPath, file)), { recursive: true });
      fs.writeFileSync(path.join(folderPath, file), 'existing file');
    }
    return prisma.task.create({ data: {
      source: 'excel', sourceFileName: '원본요청서.xlsx', folderName, folderPath, assignee: '검증',
      requestContent: '결과물 위치 기록', status: 'in_progress', department: '기타',
      createdAt: new Date('2026-10-01T00:00:00Z'), ...overrides,
    } });
  }
  async function patch(task, body) {
    const response = await route.PATCH(new Request(`http://localhost/api/tasks/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: task.id }) });
    return { status: response.status, body: await response.json() };
  }
  const notes = task => fs.readdirSync(task.folderPath).filter(name => /^결과물 위치(?: \(\d+\))?\.txt$/.test(name));
  const noteText = task => fs.readFileSync(path.join(task.folderPath, '결과물 위치.txt'), 'utf8');
  try {
    await t.test('a stored UNC path is written immediately and the original Excel stays intact', async () => {
      const task = await fixture({ outputLocation: '\\\\design-server\\공유 폴더\\최종' }, ['메모/참고.txt']);
      const result = await patch(task, { status: 'done' });
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'done');
      assert.equal(result.body.folderPath, task.folderPath);
      assert.match(noteText(task), /업무명: 결과물 위치 기록/);
      assert.ok(noteText(task).includes(task.outputLocation));
      assert.deepEqual(fs.readFileSync(path.join(task.folderPath, task.sourceFileName)), excelBytes);
      assert.equal(fs.readFileSync(path.join(task.folderPath, '메모/참고.txt'), 'utf8'), 'existing file');
      assert.equal((await patch(task, { status: 'done' })).status, 200);
      assert.deepEqual(notes(task), ['결과물 위치.txt']);
      assert.equal(createTaskOutputNote({ ...result.body, status: 'done' }), null, 'retrying the same snapshot creates no duplicate');
    });
    await t.test('the location entered in the completion request takes precedence over the old value', async () => {
      const task = await fixture({ outputLocation: 'D:\\이전 결과물' });
      const location = 'https://drive.google.com/drive/folders/test-result?tab=design#final';
      const result = await patch(task, { status: 'done', outputLocation: location, requestContent: '변경한 업무명' });
      assert.equal(result.status, 200);
      assert.ok(noteText(task).includes(location));
      assert.ok(noteText(task).includes('변경한 업무명'));
      assert.ok(!noteText(task).includes(task.outputLocation));
    });
    await t.test('blank locations, actual artwork, active tasks and non-Excel requests get no note', async () => {
      for (const outputLocation of [null, '', ' \t\n ']) {
        const task = await fixture({ outputLocation });
        assert.equal((await patch(task, { status: 'done' })).status, 200);
        assert.deepEqual(notes(task), []);
      }
      const artwork = await fixture({ outputLocation: 'D:/결과물' }, ['시안/작업.psd']);
      assert.equal((await patch(artwork, { status: 'done' })).status, 200);
      assert.deepEqual(notes(artwork), []);
      const active = await fixture();
      assert.equal((await patch(active, { outputLocation: 'D:/결과물' })).status, 200);
      assert.deepEqual(notes(active), []);
      const manual = await fixture({ source: 'manual', sourceFileName: '요청서.txt', outputLocation: 'D:/결과물' });
      assert.equal((await patch(manual, { status: 'done' })).status, 200);
      assert.deepEqual(notes(manual), []);
    });
    await t.test('an existing note is preserved and the new snapshot uses a free filename', async () => {
      const task = await fixture({ outputLocation: 'D:\\새 결과물' }, ['결과물 위치.txt']);
      assert.equal((await patch(task, { status: 'done' })).status, 200);
      assert.equal(noteText(task), 'existing file');
      assert.ok(fs.readFileSync(path.join(task.folderPath, '결과물 위치 (2).txt'), 'utf8').includes(task.outputLocation));
    });
    await t.test('partial TXT write failures leave no file and roll back completion', async t => {
      const task = await fixture();
      const originalWrite = fs.writeFileSync;
      const write = t.mock.method(fs, 'writeFileSync', (target, ...args) => {
        if (typeof target !== 'number') return originalWrite(target, ...args);
        originalWrite(target, 'partial');
        throw Object.assign(new Error('disk unavailable'), { code: 'EACCES' });
      });
      const errors = t.mock.method(console, 'error', () => {});
      try {
        const result = await patch(task, { status: 'done', outputLocation: 'D:/결과물' });
        assert.equal(result.status, 500);
        assert.match(result.body.error, /TXT/);
        const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        assert.equal(after.status, 'in_progress');
        assert.equal(after.outputLocation, null);
        assert.deepEqual(notes(task), []);
        assert.deepEqual(fs.readFileSync(path.join(task.folderPath, task.sourceFileName)), excelBytes);
      } finally { write.mock.restore(); errors.mock.restore(); }
    });
    await t.test('a later DB error removes only the newly created TXT and preserves existing files', async t => {
      const task = await fixture({}, ['결과물 위치.txt']);
      await prisma.$executeRawUnsafe("CREATE TRIGGER reject_note_test BEFORE INSERT ON DailyJournalDetail BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
      const errors = t.mock.method(console, 'error', () => {});
      try {
        assert.equal((await patch(task, { status: 'done', outputLocation: 'D:/결과물' })).status, 500);
        assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'in_progress');
        assert.deepEqual(notes(task), ['결과물 위치.txt']);
        assert.equal(noteText(task), 'existing file');
        assert.deepEqual(fs.readFileSync(path.join(task.folderPath, task.sourceFileName)), excelBytes);
      } finally { await prisma.$executeRawUnsafe('DROP TRIGGER reject_note_test'); errors.mock.restore(); }
    });
    await t.test('the watch root itself cannot be used as a task folder', () => {
      assert.throws(() => createTaskOutputNote({ status: 'done', folderPath: temp, sourceFileName: 'request.xlsx', requestContent: 'test', outputLocation: 'D:/결과물' }), TaskOutputNoteError);
      assert.ok(!fs.existsSync(path.join(temp, '결과물 위치.txt')));
    });
  } finally {
    if (previousWatch === undefined) delete process.env.WATCH_FOLDER_PATH; else process.env.WATCH_FOLDER_PATH = previousWatch;
    await prisma.$disconnect();
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temp));
    assert.ok(relative.startsWith('task-output-note-') && !relative.includes(path.sep));
    fs.rmSync(path.resolve(temp), { recursive: true, force: true });
  }
});
