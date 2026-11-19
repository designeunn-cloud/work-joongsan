import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
const require = createRequire(import.meta.url);
function loader(overrides) {
  return function load(file) {
    const absolute = path.resolve(file), mod = new Module(absolute);
    mod.require = name => overrides[name] ?? (name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name + '.ts')) : require(name));
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, absolute);
    return mod.exports;
  };
}

test('saved notices persist separately, support CRUD and reject invalid or foreign-origin writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notice-templates-'));
  const file = path.join(dir, 'test.db'), sql = new DatabaseSync(file);
  for (const folder of fs.readdirSync('prisma/migrations').sort()) {
    const migration = path.join('prisma/migrations', folder, 'migration.sql');
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, 'utf8'));
  }
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll('\\', '/')}` } } });
  try {
    const load = loader({ '@/lib/prisma': { prisma: db } });
    const route = load('app/api/notice-templates/route.ts');
    const { validateNoticeTemplate } = load('lib/noticeTemplates.ts');
    const project = await db.project.create({ data: { name: '배송공지' } });
    const body = { name: ' 배송지연 ', source: ' SC101 배송 안내\n일정 확인 ', projectId: project.id, requestContent: '배송공지', productionType: '수정', productNames: ['SC101', 'WOP121'], dueDateISO: '2026-11-20', assignee: '공지 담당자', splitByProduct: true, dateConfirmed: true };
    const call = (method, value, origin = 'http://localhost') => route[method](new Request('http://localhost/api/notice-templates', { method, headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(value) }));
    assert.deepEqual(await (await route.GET()).json(), []);
    const created = await call('POST', body);
    assert.equal(created.status, 201);
    const saved = await created.json();
    assert.equal(saved.name, '배송지연');
    assert.equal(saved.source, body.source);
    assert.equal(saved.productionType, body.productionType);
    assert.equal(saved.requestContent, body.requestContent);
    assert.equal(saved.dueDateISO, body.dueDateISO);
    assert.equal(saved.assignee, body.assignee);
    assert.deepEqual(saved.productNames, body.productNames);
    assert.equal(saved.splitByProduct, true);
    assert.equal(saved.dateConfirmed, true);
    assert.equal(await db.task.count(), 0);
    assert.equal(await db.activityLog.count(), 0);
    assert.deepEqual((await (await route.GET()).json())[0], saved);
    const draft = { ...saved, source: '불러와서 수정한 내용', requestContent: '직접 적은 업무요청내용', productionType: '부분 신규제작', assignee: '변경 담당자', dueDateISO: '2026-11-21', splitByProduct: false, dateConfirmed: false };
    assert.equal((await (await route.GET()).json())[0].source, body.source);
    assert.equal((await call('PUT', draft)).status, 200);
    assert.equal((await (await route.GET()).json())[0].source, draft.source);
    const reread = (await (await route.GET()).json())[0];
    assert.equal(reread.requestContent, draft.requestContent);
    assert.equal(reread.productionType, draft.productionType);
    assert.deepEqual(reread, draft);
    for (const changes of [{ assignee: '담당자만 변경' }, { dueDateISO: '2026-12-01' }, { splitByProduct: true }, { dateConfirmed: true }]) {
      const changed = { ...draft, ...changes };
      assert.equal((await call('PUT', changed)).status, 200);
      assert.deepEqual((await (await route.GET()).json()).find(item => item.id === saved.id), changed);
    }
    const cleared = { ...draft, assignee: '', dueDateISO: '', splitByProduct: false, dateConfirmed: false };
    assert.equal((await call('PUT', cleared)).status, 200);
    assert.deepEqual((await (await route.GET()).json())[0], cleared);
    const legacyInput = { name: '기존 형식', source: '', projectId: null, requestContent: '', productionType: null };
    assert.deepEqual(validateNoticeTemplate(legacyInput), { ...legacyInput, productNames: [], assignee: '', dueDateISO: '', splitByProduct: false, dateConfirmed: false });
    const emptySource = await call('POST', { ...body, source: '', productNames: ['SC101'], requestContent: '원문 없는 공지' });
    assert.equal(emptySource.status, 201);
    const emptySaved = await emptySource.json();
    const emptyReread = (await (await route.GET()).json()).find(item => item.id === emptySaved.id);
    assert.equal(emptyReread.source, '');
    assert.deepEqual(emptyReread.productNames, ['SC101']);
    assert.equal(emptyReread.requestContent, '원문 없는 공지');
    assert.equal(emptyReread.productionType, '수정');
    assert.equal((await call('PUT', { ...emptySaved, productNames: ['WOP121'] })).status, 200);
    assert.equal((await call('DELETE', { id: emptySaved.id })).status, 200);
    for (const changes of [{ name: '' }, { source: null }, { productNames: [123] }, { name: 'x'.repeat(101) }, { productionType: 'invalid' }, { projectId: 'missing' }, { assignee: 123 }, { assignee: null }, { assignee: 'x'.repeat(201) }, { dueDateISO: '2026-02-30' }, { dueDateISO: 123 }, { dueDateISO: null }, { splitByProduct: 'true' }, { dateConfirmed: 1 }]) {
      assert.equal((await call('POST', { ...body, ...changes })).status, 400);
    }
    assert.equal((await call('POST', body, 'https://other.invalid')).status, 403);
    assert.equal((await call('DELETE', { id: saved.id }, 'https://other.invalid')).status, 403);
    assert.equal((await call('DELETE', { id: saved.id })).status, 200);
    assert.equal((await call('PUT', draft)).status, 404);
    assert.equal((await call('DELETE', { id: saved.id })).status, 404);
    assert.deepEqual(await (await route.GET()).json(), []);
    assert.equal(await db.project.count(), 1);
    assert.throws(() => validateNoticeTemplate(null));
  } finally {
    await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('adding form fields preserves existing saved notices and gives missing fields empty defaults', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const folder of ['20261102010000_notice_templates', '20261102030000_notice_template_products']) {
      db.exec(fs.readFileSync(`prisma/migrations/${folder}/migration.sql`, 'utf8'));
    }
    db.prepare('INSERT INTO NoticeTemplate (id, name, source, projectId, requestContent, productionType, productNames, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('old', '기존 공지', '기존 원문', 'project', '요청내용', '수정', '["WM6915B/W"]', 123);
    const before = db.prepare('SELECT * FROM NoticeTemplate').get();
    db.exec(fs.readFileSync('prisma/migrations/20261119010000_notice_template_form_fields/migration.sql', 'utf8'));
    assert.deepEqual({ ...db.prepare('SELECT * FROM NoticeTemplate').get() }, { ...before, assignee: '', dueDateISO: '', splitByProduct: 0, dateConfirmed: 0 });
  } finally { db.close(); }
});
