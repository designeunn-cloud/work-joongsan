import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const file = path.resolve("lib/taskCompletionSort.ts");
const mod = new Module(file);
mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { completionSortTime, compareCompletedNewest } = mod.exports;
const require = createRequire(import.meta.url);
const task = (id, values = {}) => ({ id, createdAt: "2026-10-01T00:00:00Z", ...values });
const sortedIds = tasks => [...tasks].sort(compareCompletedNewest).map(item => item.id);

test("completion sorting retains hours, minutes, seconds and milliseconds within the same day", () => {
  const tasks = [
    task("morning", { completedAt: "2026-11-11T00:14:59.734Z" }),
    task("later-ms", { completedAt: "2026-11-11T06:45:37.408Z" }),
    task("earlier-ms", { completedAt: "2026-11-11T06:45:37.407Z" }),
    task("earlier-second", { completedAt: "2026-11-11T06:45:36.999Z" }),
    task("earlier-minute", { completedAt: "2026-11-11T06:44:59.999Z" }),
  ];
  assert.deepEqual(sortedIds(tasks), ["later-ms", "earlier-ms", "earlier-second", "earlier-minute", "morning"]);
  assert.equal(tasks[0].id, "morning", "sorting must not mutate the source array");
});

test("a long-running old request completed recently comes before a newer request completed earlier", () => {
  assert.deepEqual(sortedIds([
    task("new-request", { createdAt: "2026-11-10T00:00:00Z", completedAt: "2026-11-10T10:00:00Z" }),
    task("old-request", { createdAt: "2026-01-01T00:00:00Z", completedAt: "2026-11-11T01:00:00Z" }),
  ]), ["old-request", "new-request"]);
});

test("invalid or missing primary dates fall back in order, and missing completion dates always stay last", () => {
  assert.equal(completionSortTime(task("primary", {
    completedAt: "2026-11-09T01:00:00Z", endDate: "2026-11-10T01:00:00Z", statusChangedAt: "2026-11-11T01:00:00Z",
  })), Date.parse("2026-11-09T01:00:00Z"));
  assert.equal(completionSortTime(task("fallback-end", {
    completedAt: "invalid", endDate: "2026-11-10T01:00:00Z", statusChangedAt: "2026-11-11T01:00:00Z",
  })), Date.parse("2026-11-10T01:00:00Z"));
  assert.equal(completionSortTime(task("fallback-status", {
    completedAt: null, endDate: "invalid", statusChangedAt: new Date("2026-11-11T01:00:00Z"),
  })), Date.parse("2026-11-11T01:00:00Z"));
  assert.equal(completionSortTime(task("missing", { completedAt: "", endDate: "invalid", statusChangedAt: null })), null);
  assert.deepEqual(sortedIds([
    task("missing", { createdAt: "2026-12-01T00:00:00Z" }),
    task("valid", { completedAt: "2026-01-01T00:00:00Z" }),
  ]), ["valid", "missing"]);
});

test("editing another field or a later status timestamp does not replace an existing completion date", () => {
  const first = task("first", { completedAt: "2026-11-11T02:00:00Z", updatedAt: "2026-11-11T02:00:00Z" });
  const second = task("second", { completedAt: "2026-11-11T01:00:00Z", updatedAt: "2026-12-01T00:00:00Z", statusChangedAt: "2026-12-01T00:00:00Z" });
  assert.deepEqual(sortedIds([second, first]), ["first", "second"]);
});

test("equal completion dates use newest registration then deterministic ID order", () => {
  const completedAt = "2026-11-11T01:00:00Z";
  const a = task("a", { completedAt, createdAt: "2026-11-10T00:00:00Z" });
  const b = task("b", { completedAt, createdAt: "2026-11-10T00:00:00Z" });
  const old = task("old", { completedAt, createdAt: "2026-11-01T00:00:00Z" });
  const missing = task("missing", { completedAt, createdAt: null });
  assert.deepEqual(sortedIds([missing, old, b, a]), ["a", "b", "old", "missing"]);
  assert.deepEqual(sortedIds([b, missing, a, old]), ["a", "b", "old", "missing"]);
  assert.equal(compareCompletedNewest(a, a), 0);
});

test("the table's completed status group is newest first while in-progress rows retain the saved start-date sort", () => {
  const cache = new Map();
  function loadUI(name) {
    const candidates = [name, `${name}.tsx`, `${name}.ts`].map(candidate => path.resolve(candidate));
    const absolute = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(absolute, name);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loaded = new Module(absolute);
    cache.set(absolute, loaded);
    loaded.require = request => request.startsWith("@/") ? loadUI(request.slice(2))
      : request.startsWith(".") ? loadUI(path.resolve(path.dirname(absolute), request)) : require(request);
    loaded._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, absolute);
    return loaded.exports;
  }
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { WorkTimeProvider } = loadUI("components/WorkTime.tsx");
  const TaskTable = loadUI("components/TaskTable.tsx").default;
  const source = (id, values) => ({
    id, requestContent: id, source: "manual", sourceFileName: "", rawExtractedText: null,
    folderPath: "", folderName: "", assignee: "검증 담당자", department: "무역부", brand: null,
    productName: null, platform: null, tags: null, memo: null, referenceMemo: null,
    projectId: null, project: null, requestDate: null, dueDate: null, reviewDate: null,
    plannedEndDate: null, endDate: null, completedAt: null, statusChangedAt: null,
    relatedTaskId: null, relatedTask: null, followUps: [], subtasks: [],
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z", ...values,
  });
  const tasks = [
    source("SSR-DONE-OLD", { status: "done", startDate: "2020-01-01T00:00:00Z", completedAt: "2026-11-10T05:00:00Z" }),
    source("SSR-PROGRESS-LATER", { status: "in_progress", startDate: "2024-01-01T00:00:00Z" }),
    source("SSR-DONE-RECENT", { status: "done", startDate: "2025-01-01T00:00:00Z", completedAt: "2026-11-11T05:00:00Z" }),
    source("SSR-PROGRESS-EARLIER", { status: "in_progress", startDate: "2021-01-01T00:00:00Z" }),
  ];
  const stored = {
    "taskTable.filters.v2": { query: "", status: "all", year: "all", month: "all", groupBy: "status", periodMode: "month", quarter: "all", dateBasis: "startDate", assignee: "all", project: "all" },
    "taskTable.sortKey": "startDate", "taskTable.sortDir": 1,
  };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => key in stored ? JSON.stringify(stored[key]) : null } };
  try {
    const noop = () => {};
    const render = rows => renderToStaticMarkup(createElement(WorkTimeProvider, null, createElement(TaskTable, {
      tasks: rows, master: { assignees: [], products: [], platforms: [] },
      onUpdateStatus: noop, onOpenFolder: noop, onUpdateDate: noop, onEdit: noop, onDelete: noop, onTaskChanged: noop,
    })));
    for (const rows of [tasks, [...tasks].reverse()]) {
      const html = render(rows);
      for (const id of tasks.map(item => item.id)) assert.ok(html.includes(id), id);
      assert.ok(html.indexOf("SSR-DONE-RECENT") < html.indexOf("SSR-DONE-OLD"), "completed group must ignore the saved start-date sort");
      assert.ok(html.indexOf("SSR-PROGRESS-EARLIER") < html.indexOf("SSR-PROGRESS-LATER"), "in-progress group must keep the saved ascending start-date sort");
      assert.match(html, /최근 완료순/);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
