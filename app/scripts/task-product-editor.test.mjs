import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  const absolute = path.resolve(filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = new Module(absolute);
  cache.set(absolute, mod);
  mod.require = name => {
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
    if (name.startsWith(".")) {
      const target = path.resolve(path.dirname(absolute), name);
      return load([`${target}.tsx`, `${target}.ts`].find(file => fs.existsSync(file)));
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, absolute);
  return mod.exports;
}

const Editor = load("components/TaskProductEditor.tsx").default;
const MultiCombobox = load("components/MultiCombobox.tsx").default;
const base = { taskId: "task", taskName: "업무", options: [], onSaved() {} };

test("Kanban shows one product by name and two or more by count, retaining the full accessible list", () => {
  const empty = renderToStaticMarkup(createElement(Editor, { ...base, value: null }));
  assert.match(empty, />품명<\/button>/);
  const single = renderToStaticMarkup(createElement(Editor, { ...base, value: "EW770" }));
  assert.match(single, />EW770<\/button>/);
  const two = renderToStaticMarkup(createElement(Editor, { ...base, value: "EW770, WOP121" }));
  assert.match(two, />2종<\/button>/);
  assert.match(two, /title="EW770, WOP121"/);
  assert.match(two, /aria-label="업무 품명 변경 · EW770, WOP121"/);
  const three = renderToStaticMarkup(createElement(Editor, { ...base, value: "EW770, WOP121, GL40A" }));
  assert.match(three, />3종<\/button>/);
});

test("multi selection chips expose individual removal and lock all controls during saving", () => {
  const html = renderToStaticMarkup(createElement(MultiCombobox, {
    values: ["EW770", "WOP121"], options: ["EW770", "WOP121", "GL40A"], onChange() {}, inputLabel: "품명 검색", disabled: true,
  }));
  assert.match(html, /aria-label="EW770 제거"/);
  assert.match(html, /aria-label="WOP121 제거"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  assert.match(html, /role="combobox"/);
});
