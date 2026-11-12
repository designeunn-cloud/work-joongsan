import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loader(overrides = {}) {
  const cache = new Map();
  function load(name) {
    const absolute = [name, `${name}.tsx`, `${name}.ts`].map(value => path.resolve(value))
      .find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert.ok(absolute, name);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loaded = new Module(absolute);
    cache.set(absolute, loaded);
    loaded.require = request => request in overrides ? overrides[request]
      : request.startsWith("@/") ? load(request.slice(2))
      : request.startsWith(".") ? load(path.resolve(path.dirname(absolute), request)) : require(request);
    loaded._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, absolute);
    return loaded.exports;
  }
  return load;
}

const load = loader();
const { taskStatusOptions, needsFirstReview, STATUS_LABELS, FIRST_REVIEW_REQUIRED } = load("lib/statusConfig.ts");

test("existing tasks retain their four status options and existing hold label", () => {
  assert.deepEqual(taskStatusOptions(), ["planned", "in_progress", "done", "review"]);
  assert.deepEqual(taskStatusOptions(false), taskStatusOptions());
  assert.equal(STATUS_LABELS.review, "보류");
  assert.equal(needsFirstReview({}), false);
});

test("new task review is distinct from hold, and completion requires its first delivery date", () => {
  assert.deepEqual(taskStatusOptions(true), ["planned", "in_progress", "submitted", "done", "review"]);
  assert.equal(STATUS_LABELS.submitted, "검토");
  assert.equal(needsFirstReview({ reviewWorkflow: true, reviewDate: null }), true);
  assert.equal(needsFirstReview({ reviewWorkflow: true, reviewDate: "2026-11-12" }), false);
});

test("the open status selector offers review only for new tasks and guards premature completion", () => {
  const openLoad = loader({ react: { ...React, useState: () => [true, () => {}] } });
  const Segment = openLoad("components/StatusSegment.tsx").default;
  const render = values => renderToStaticMarkup(React.createElement(Segment, { status: "in_progress", onChange() {}, ...values }));
  const oldHtml = render({});
  assert.doesNotMatch(oldHtml, />검토</);
  assert.match(oldHtml, />보류</);
  assert.doesNotMatch(oldHtml, / disabled="/);
  const newHtml = render({ reviewWorkflow: true });
  assert.match(newHtml, />검토</);
  assert.match(newHtml, /<button[^>]*disabled=""[^>]*>[\s\S]*?완료<\/button>/);
  assert.ok(newHtml.includes(FIRST_REVIEW_REQUIRED));
  const reviewedHtml = render({ reviewWorkflow: true, reviewDate: "2026-11-12" });
  assert.doesNotMatch(reviewedHtml, / disabled="/);
});

test("the status and comments dialog uses the same new-task guard without changing comment choices", () => {
  let state = 0;
  const openLoad = loader({
    react: { ...React, useState: initial => [state++ === 0 ? true : typeof initial === "function" ? initial() : initial, () => {}], useEffect() {}, useId: () => "review-test", useRef: () => ({ current: null }), useContext: () => null },
    "react-dom": { createPortal: children => children },
    "./Modal": { __esModule: true, default: ({ children }) => React.createElement("div", null, children) },
  });
  const Editor = openLoad("components/StatusChangeEditor.tsx").default;
  const previousDocument = globalThis.document;
  globalThis.document = { body: {} };
  try {
    const render = values => { state = 0; return renderToStaticMarkup(React.createElement(Editor, { taskId: "new", status: "in_progress", onSaved() {}, ...values })); };
    assert.doesNotMatch(render({}), />검토</);
    const html = render({ reviewWorkflow: true });
    assert.match(html, />검토</);
    assert.ok(html.includes(FIRST_REVIEW_REQUIRED));
    const { COMMENT_OPTIONS } = openLoad("lib/statusComments.ts");
    assert.deepEqual(COMMENT_OPTIONS, ["업무 대기", "작업 시작", "업무 보류", "작업 재개", "작업 완료", "수정 요청", "수정 완료", "전달 완료", "담당자 확인중", "상세 1차 확인", "상세 2차 확인", "최종 전달일", "기타"]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("the journal picker includes submitted tasks without moving legacy states relative to each other", () => {
  const { journalTaskChoices } = load("lib/journalTaskChoices.ts");
  const base = { included: false, dueDate: null, createdAt: "2026-11-12", requestContent: "업무", assignee: "담당자", productName: null };
  const tasks = ["done", "review", "submitted", "planned", "in_progress"].map(status => ({ ...base, id: status, status }));
  assert.deepEqual(journalTaskChoices(tasks, "unfinished", "").map(task => task.id), ["in_progress", "planned", "submitted", "review"]);
  assert.deepEqual(journalTaskChoices(tasks, "submitted", "").map(task => task.id), ["submitted"]);
});
