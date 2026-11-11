import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const text = "첫째 줄\n둘째 줄";

function component(file, editing = false) {
  const absolute = path.resolve(file), mod = new Module(absolute);
  let state = 0;
  mod.require = name => editing && name === "react" ? {
    useState(initial) { const index = state++; return [index === 0 ? true : index === 1 ? text : initial, () => {}]; },
    useRef(initial) { return { current: initial }; },
  } : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, absolute);
  return mod.exports.default;
}

function find(node, tag) {
  if (!node || typeof node !== "object") return undefined;
  if (node.type === tag) return node;
  const children = Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children];
  for (const child of children) { const match = find(child, tag); if (match) return match; }
}

function key(ctrlKey = false, composing = false) {
  let prevented = false;
  return { key: "Enter", ctrlKey, nativeEvent: { isComposing: composing }, currentTarget: { value: text },
    preventDefault() { prevented = true; }, stopPropagation() {}, get prevented() { return prevented; } };
}

for (const [file, field, props] of [
  ["components/TaskMemo.tsx", "referenceMemo", { taskId: "fixture", memo: null, field: "referenceMemo", label: "메모" }],
  ["components/TaskOutputLocation.tsx", "outputLocation", { taskId: "fixture", taskName: "검증 업무", value: null }],
]) {
  test(`${field}: Enter inserts a line; Ctrl+Enter saves both lines; IME confirmation never saves`, { timeout: 2000 }, async t => {
    const calls = [], previousWindow = globalThis.window;
    globalThis.window = { dispatchEvent() {} };
    t.mock.method(globalThis, "fetch", async (_url, request) => {
      const body = JSON.parse(request.body); calls.push(body);
      return { ok: true, json: async () => ({ id: "fixture", ...body }) };
    });
    let complete;
    const saved = new Promise(resolve => { complete = resolve; });
    try {
      const Editor = component(file, true), tree = Editor({ ...props, onSaved: complete });
      const input = find(tree, "textarea");
      assert.ok(input, "the editor must expose a multiline textarea");
      assert.equal(input.props.value, text);
      assert.equal(find(tree, "input"), undefined);
      const handle = input.props.onKeyDown ?? find(tree, "form").props.onKeyDown;
      const enter = key(); handle(enter);
      assert.equal(enter.prevented, false, "plain Enter must retain the native textarea newline");
      assert.equal(calls.length, 0, "plain Enter must not submit");
      const ime = key(true, true); handle(ime);
      assert.equal(calls.length, 0, "IME confirmation must not submit");
      const shortcut = key(true); handle(shortcut);
      assert.equal(shortcut.prevented, true);
      await saved;
      assert.deepEqual(calls, [{ [field]: text }], "the saved payload must retain the newline");
    } finally {
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    }
  });
}

test("compact and completed Kanban memos retain visible line breaks", () => {
  const Memo = component("components/TaskMemo.tsx");
  for (const inlineRow of [false, true]) {
    const html = renderToStaticMarkup(createElement(Memo, { taskId: "fixture", memo: text,
      field: "referenceMemo", label: "메모", compact: true, inlineRow }));
    assert.ok(html.includes(text));
    assert.match(html, /whitespace-pre-wrap/);
    assert.doesNotMatch(html, /\btruncate\b/);
  }
});

test("folder locations retain every entered line on the card", () => {
  const Location = component("components/TaskOutputLocation.tsx");
  const value = "D:\\결과물\\원본\nhttps://example.com/shared";
  const html = renderToStaticMarkup(createElement(Location, { taskId: "fixture", taskName: "검증 업무", value }));
  assert.ok(html.includes(value));
  assert.match(html, /whitespace-pre-wrap/);
  assert.doesNotMatch(html, /\btruncate\b/);
});
