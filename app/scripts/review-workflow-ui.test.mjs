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

test("new task review is distinct from hold, and missing delivery dates are identified for confirmation", () => {
  assert.deepEqual(taskStatusOptions(true), ["planned", "in_progress", "submitted", "done", "review"]);
  assert.equal(STATUS_LABELS.submitted, "검토");
  assert.equal(needsFirstReview({ reviewWorkflow: true, reviewDate: null }), true);
  assert.equal(needsFirstReview({ reviewWorkflow: true, reviewDate: "2026-11-12" }), false);
});

test("the status selector allows direct completion from waiting or in-progress and keeps the hold guard", () => {
  const openLoad = loader({ react: { ...React, useState: () => [true, () => {}] } });
  const Segment = openLoad("components/StatusSegment.tsx").default;
  const render = values => renderToStaticMarkup(React.createElement(Segment, { status: "in_progress", onChange() {}, ...values }));
  const oldHtml = render({});
  assert.doesNotMatch(oldHtml, />검토</);
  assert.match(oldHtml, />보류</);
  assert.doesNotMatch(oldHtml, / disabled="/);
  for (const status of ["planned", "in_progress"]) {
    const newHtml = render({ status, reviewWorkflow: true });
    assert.match(newHtml, />검토</);
    assert.doesNotMatch(newHtml, / disabled="/);
    assert.ok(!newHtml.includes(FIRST_REVIEW_REQUIRED));
  }
  const heldHtml = render({ status: "review", reviewWorkflow: true });
  assert.match(heldHtml, /<button[^>]*disabled=""[^>]*>[\s\S]*?완료<\/button>/);
  assert.ok(heldHtml.includes(FIRST_REVIEW_REQUIRED));
  const reviewedHtml = render({ reviewWorkflow: true, reviewDate: "2026-11-12" });
  assert.doesNotMatch(reviewedHtml, / disabled="/);
});

test("the status and comments dialog permits the same direct-completion states without changing comment choices", () => {
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
    for (const status of ["planned", "in_progress"]) {
      const html = render({ status, reviewWorkflow: true });
      assert.match(html, />검토</);
      assert.ok(!html.includes(FIRST_REVIEW_REQUIRED));
      assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>완료<\/button>/);
    }
    assert.ok(render({ status: "review", reviewWorkflow: true }).includes(FIRST_REVIEW_REQUIRED));
    const { COMMENT_OPTIONS } = openLoad("lib/statusComments.ts");
    assert.deepEqual(COMMENT_OPTIONS, ["업무 대기", "작업 시작", "업무 보류", "작업 재개", "작업 완료", "수정 요청", "수정 완료", "전달 완료", "담당자 확인중", "상세 1차 확인", "상세 2차 확인", "최종 전달일", "기타"]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("waiting and in-progress completion use the same dialog and confirm missing delivery with Korea today", () => {
  const modalLoad = loader({
    "./Modal": { __esModule: true, default: ({ children }) => React.createElement("div", null, children) },
    "./TaskIdentityEditor": { __esModule: true, default: () => null },
    "./InlineChoiceEditor": { __esModule: true, default: () => null },
    "./WorkTimeInlineInput": { __esModule: true, default: () => null },
    "./DateEditor": { __esModule: true, default: () => null },
  });
  const Completion = modalLoad("components/TaskCompletionModal.tsx").default;
  const { koreaDate } = modalLoad("lib/workTime.ts");
  const base = {
    id: "direct-completion", requestContent: "배너 제작", reviewWorkflow: true, reviewDate: null,
    projectId: "project", project: { name: "배너" }, productionType: "신규제작", assignee: "담당자", productName: "MODEL",
    requestDate: "2026-11-12", dueDate: null, outputLocation: null,
  };
  const render = values => renderToStaticMarkup(React.createElement(Completion, {
    task: { ...base, ...values }, master: { assignees: [], products: [], platforms: [] }, projects: [], onClose() {}, onSaved() {},
  }));
  for (const status of ["planned", "in_progress"]) {
    const html = render({ status });
    assert.match(html, /업무 완료/);
    assert.match(html, new RegExp(`aria-label="최초 전달일"[^>]*max="${koreaDate()}"[^>]*value="${koreaDate()}"`));
    assert.ok(!html.includes(FIRST_REVIEW_REQUIRED));
    assert.match(html, /실제 완료일로 기록됩니다/);
  }
  assert.doesNotMatch(render({ status: "in_progress", reviewDate: "2026-11-10T01:00:00Z" }), /aria-label="최초 전달일"/);
  assert.doesNotMatch(render({ status: "planned", reviewWorkflow: false }), /aria-label="최초 전달일"/);
  assert.ok(render({ status: "review" }).includes(FIRST_REVIEW_REQUIRED));
});

test("the journal picker includes submitted tasks without moving legacy states relative to each other", () => {
  const { journalTaskChoices } = load("lib/journalTaskChoices.ts");
  const base = { included: false, dueDate: null, createdAt: "2026-11-12", requestContent: "업무", assignee: "담당자", productName: null };
  const tasks = ["done", "review", "submitted", "planned", "in_progress"].map(status => ({ ...base, id: status, status }));
  assert.deepEqual(journalTaskChoices(tasks, "unfinished", "").map(task => task.id), ["in_progress", "planned", "submitted", "review"]);
  assert.deepEqual(journalTaskChoices(tasks, "submitted", "").map(task => task.id), ["submitted"]);
});
