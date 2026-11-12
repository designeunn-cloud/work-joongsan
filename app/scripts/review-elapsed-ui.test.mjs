import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const preview = { available: true, seconds: 23 * 60, totalSeconds: 23 * 60, startedAt: "2026-11-12T01:00:00Z", reviewedAt: "2026-11-12T01:23:00Z" };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(props) {
  let cursor = 0;
  const hooks = [];
  const fakeReact = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useId: () => "elapsed-test",
    useEffect() {},
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => name === "react" ? fakeReact : name === "react-dom" ? { createPortal: children => children }
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  }
  const Input = load("components/WorkTimeInlineInput.tsx").default;
  const render = () => { cursor = 0; return Input({ taskName: "검증 업무", hours: 1, disabled: false, active: false, ready: true, ...props }); };
  const nodes = root => !root || typeof root !== "object" ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)];
  const text = value => value == null || typeof value === "boolean" ? "" : typeof value !== "object" ? String(value) : Array.isArray(value) ? value.map(text).join("") : text(value.props?.children);
  const find = (root, predicate) => nodes(root).find(predicate);
  function open() {
    const trigger = find(render(), node => node.type === "button");
    trigger.props.onClick({ currentTarget: { closest: () => ({}) } });
    return render();
  }
  const select = () => find(render(), node => node.type === "button" && text(node) === "진행→검토 시간").props.onClick();
  return { render, open, select, find, text };
}

test("the elapsed preset uses the normal save path and explicit manual intent even for an equal automatic value", async () => {
  const saved = [];
  const input = harness({ hours: 0.4, automatic: true, onReviewTime: async () => preview, onSave: async hours => { saved.push(hours); return true; } });
  input.open(); input.select(); await tick();
  assert.deepEqual(saved, [0.4], "23 minutes uses the existing 0.1-hour ceiling and can replace automatic time");
  assert.equal(input.find(input.render(), node => node.props?.role === "dialog"), undefined);
});

test("missing review history leaves the current input and saved time intact and shows its own reason", async () => {
  const saved = [];
  const input = harness({ saveError: "이전 저장 오류", onReviewTime: async () => ({ ...preview, available: false, seconds: 0, reason: "검토 기록이 없습니다." }), onSave: async hours => { saved.push(hours); return true; } });
  input.open(); input.select(); await tick();
  const tree = input.render();
  assert.deepEqual(saved, []);
  assert.equal(input.find(tree, node => node.type === "input").props.value, "1");
  assert.equal(input.text(input.find(tree, node => node.props?.role === "alert")), "검토 기록이 없습니다.");
});

test("canceling a pending preview prevents a late response from saving time", async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const saved = [];
  const input = harness({ onReviewTime: () => pending, onSave: async hours => { saved.push(hours); return true; } });
  input.open(); input.select();
  const dialog = input.find(input.render(), node => node.props?.role === "dialog");
  dialog.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  resolve(preview); await tick();
  assert.deepEqual(saved, []);
  assert.equal(input.find(input.render(), node => node.props?.role === "dialog"), undefined);
});

test("a failed save keeps the selected elapsed value for retry", async () => {
  const input = harness({ onReviewTime: async () => preview, onSave: async () => false });
  input.open(); input.select(); await tick();
  const tree = input.render();
  assert.ok(input.find(tree, node => node.props?.role === "dialog"));
  assert.equal(input.find(tree, node => node.type === "input").props.value, "0.4");
  assert.match(input.text(input.find(tree, node => node.props?.role === "alert")), /저장하지 못했습니다/);
});
