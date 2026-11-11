import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import Module from 'node:module';

const mod = new Module('journal-task-choices');
mod._compile(ts.transpileModule(fs.readFileSync('lib/journalTaskChoices.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, 'journal-task-choices');
const { journalTaskChoices } = mod.exports;
const task = (id, overrides = {}) => ({
  id, status: 'in_progress', included: false, dueDate: null,
  createdAt: '2026-10-01T00:00:00Z', requestContent: '배너 제작',
  assignee: '담당자', productName: '제품', ...overrides,
});

test('unfinished choices prioritize available progress tasks and deadlines, leaving included tasks last', () => {
  const tasks = [
    task('done', { status: 'done', createdAt: '2026-11-02T00:00:00Z' }),
    task('included', { included: true, dueDate: '2026-10-01T00:00:00Z' }),
    task('waiting', { status: 'planned', dueDate: '2026-10-01T00:00:00Z' }),
    task('no-deadline'),
    task('later', { dueDate: '2026-11-05T00:00:00Z' }),
    task('urgent', { dueDate: '2026-11-02T00:00:00Z' }),
    task('held', { status: 'review' }),
  ];
  const original = tasks.map(t => t.id);
  assert.deepEqual(journalTaskChoices(tasks, 'unfinished', '').map(t => t.id),
    ['urgent', 'later', 'no-deadline', 'waiting', 'held', 'included']);
  assert.deepEqual(tasks.map(t => t.id), original);
  assert.deepEqual(journalTaskChoices(tasks, 'done', '').map(t => t.id), ['done']);
  assert.equal(journalTaskChoices(tasks, 'all', '').length, 7);
  assert.equal(journalTaskChoices(tasks, 'in_progress', '').length, 4);
  assert.equal(journalTaskChoices(tasks, 'unfinished', '없는 업무').length, 0);
  assert.equal(journalTaskChoices(tasks, 'planned', ' 제품 ').length, 1);
});

test('equal deadlines use newest registration with a stable id tie break', () => {
  const tasks = [task('old'), task('a', { createdAt: '2026-11-01T00:00:00Z' }), task('b', { createdAt: '2026-11-01T00:00:00Z' })];
  assert.deepEqual(journalTaskChoices(tasks, 'unfinished', '').map(t => t.id), ['b', 'a', 'old']);
});

test('project names can be searched without changing task state filters', () => {
  const tasks = [task('file-management', { projectName: '파일 관리 및 업무 관리' }), task('other')];
  assert.deepEqual(journalTaskChoices(tasks, 'unfinished', '파일 관리').map(t => t.id), ['file-management']);
  assert.equal(journalTaskChoices(tasks, 'done', '파일 관리').length, 0);
});
