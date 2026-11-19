import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
function harness(file, initial = [], overrides = {}) {
  const hooks = [...initial];
  let cursor = 0;
  const mockReact = { ...React,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useMemo: factory => factory(), useCallback: callback => callback, useEffect() {},
  };
  const cache = new Map();
  function load(name) {
    const absolute = [name, `${name}.tsx`, `${name}.ts`].map(value => path.resolve(value)).find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => name === 'react' ? mockReact : name in overrides ? overrides[name]
      : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, absolute);
    return mod.exports;
  }
  const Component = load(file).default;
  return props => { cursor = 0; return Component(props); };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return React.Children.toArray(node.props?.children).map(child => find(child, predicate)).find(Boolean);
}

const saved = { id: 'saved', name: '세트', source: 'SC101 11/20, WOP121 11/21', projectId: 'project', requestContent: '배송 안내', productionType: '수정', productNames: ['SC101', 'WOP121'], assignee: '공지 담당자', dueDateISO: '2026-11-20', splitByProduct: true, dateConfirmed: true };
const { id, name, ...draft } = saved;

test('loading a notice restores every form value, and saving includes uncommitted products', () => {
  const Picker = () => null;
  const render = harness('components/NoticeQuickRegistration.tsx', [], { './NoticeTemplatePicker': { __esModule: true, default: Picker } });
  const props = { master: { products: [], assignees: [], platforms: [] }, projects: [{ id: 'project', name: '배송 안내' }], onCancel() {}, async onSubmit() {} };
  const picker = tree => find(tree, node => node.type === Picker).props;
  picker(render(props)).onLoad(saved);
  let tree = render(props);
  assert.deepEqual(picker(tree).draft, draft);
  assert.deepEqual(picker(tree).getDraft(), draft);
  find(tree, node => node.props?.inputLabel === '품명').props.ref.current = { flushPending: () => 'WM6915B/W' };
  assert.deepEqual(picker(tree).getDraft().productNames, ['SC101', 'WOP121', 'WM6915B/W']);
  find(tree, node => node.props?.inputLabel === '담당자').props.onChange('새 담당자');
  tree = render(props);
  assert.equal(picker(tree).getDraft().assignee, '새 담당자');
  find(tree, node => node.props?.['aria-label'] === '공지 원문').props.onChange({ target: { value: '변경한 원문 11/22' } });
  assert.equal(picker(render(props)).draft.dateConfirmed, false);
  picker(render(props)).onLoad({ id, name, source: '', projectId: null, requestContent: '', productionType: null, productNames: [] });
  assert.deepEqual(picker(render(props)).draft, { source: '', projectId: null, requestContent: '', productionType: null, productNames: [], assignee: '', dueDateISO: '', splitByProduct: false, dateConfirmed: false });
});

test('changing only an assignee, date or checkbox enables updating the saved notice', () => {
  const render = harness('components/NoticeTemplatePicker.tsx', [[saved], id, name, false, false]);
  const props = { disabled: false, hasDraft: true, onLoad() {} };
  const button = value => find(render({ ...props, draft: value }), node => node.props?.['aria-label'] === '저장본에 변경 반영');
  assert.equal(button(draft).props.disabled, true);
  for (const change of [{ assignee: '변경 담당자' }, { dueDateISO: '2026-11-21' }, { splitByProduct: false }, { dateConfirmed: false }]) {
    assert.equal(button({ ...draft, ...change }).props.disabled, false);
  }
});
