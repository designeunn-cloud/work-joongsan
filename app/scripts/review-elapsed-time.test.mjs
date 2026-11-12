import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute);
    cache.set(absolute, mod);
    mod.require = name => name in overrides ? overrides[name]
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, absolute);
    return mod.exports;
  }
  return load;
}
const { calculateReviewElapsedTime } = loader()("lib/reviewElapsedTime.ts");
const now = new Date("2030-12-31T12:00:00+09:00");
const at = time => `${time}+09:00`;
const event = (id, fromStatus, toStatus, createdAt, field = "status") => ({ id, field, fromStatus, toStatus, createdAt: at(createdAt) });
const pair = (start = "2030-11-12T09:00:00", end = "2030-11-12T10:23:00") => [
  event("01", "planned", "in_progress", start), event("02", "in_progress", "submitted", end),
];

test("status interval counts all elapsed seconds and never restarts for comments", () => {
  const history = pair();
  history.splice(1, 0, event("015", "in_progress", "in_progress", "2030-11-12T10:00:00", "statusComment"));
  const before = JSON.stringify(history);
  const preview = calculateReviewElapsedTime(history, "2030-11-12", now);
  assert.equal(preview.available, true);
  assert.equal(preview.seconds, 83 * 60);
  assert.equal(preview.totalSeconds, 83 * 60);
  assert.equal(preview.startedAt, "2030-11-12T00:00:00.000Z");
  assert.equal(preview.reviewedAt, "2030-11-12T01:23:00.000Z");
  assert.equal(JSON.stringify(history), before, "preview cannot mutate the source history");
});

test("initial in-progress registration and explicit work-start reset are valid starts", () => {
  const history = [event("01", null, "in_progress", "2030-11-12T08:00:00"), ...pair().slice(1)];
  assert.equal(calculateReviewElapsedTime(history, "2030-11-12", now).seconds, (2 * 60 + 23) * 60);
  history.splice(1, 0, event("015", "in_progress", "in_progress", "2030-11-12T09:30:00", "workStartReset"));
  assert.equal(calculateReviewElapsedTime(history, "2030-11-12", now).seconds, 53 * 60);
  history[1].field = "workStart";
  assert.equal(calculateReviewElapsedTime(history, "2030-11-12", now).seconds, 53 * 60);
});

test("the latest completed review cycle is used, including after resuming a later revision", () => {
  const history = [
    ...pair("2030-11-11T09:00:00", "2030-11-11T17:00:00"),
    event("03", "submitted", "in_progress", "2030-11-12T13:00:00"),
    event("04", "in_progress", "review", "2030-11-12T13:30:00"),
    event("05", "review", "in_progress", "2030-11-12T14:00:00"),
    event("06", "in_progress", "submitted", "2030-11-12T16:00:00"),
    event("07", "submitted", "submitted", "2030-11-12T16:10:00"),
    event("08", "submitted", "in_progress", "2030-11-12T17:00:00"),
  ];
  const result = calculateReviewElapsedTime(history.toReversed(), "2030-11-12", now);
  assert.equal(result.seconds, 2 * 3600);
  assert.equal(result.startedAt, "2030-11-12T05:00:00.000Z");
  assert.equal(result.reviewedAt, "2030-11-12T07:00:00.000Z");
});

test("Korean midnight intersection keeps every daily amount within 24 hours", () => {
  const history = pair("2030-11-11T23:30:00", "2030-11-13T00:30:00");
  for (const [date, seconds] of [["2030-11-11", 1800], ["2030-11-12", 86400], ["2030-11-13", 1800]]) {
    const result = calculateReviewElapsedTime(history, date, now);
    assert.equal(result.available, true);
    assert.equal(result.seconds, seconds);
    assert.equal(result.totalSeconds, 25 * 3600);
  }
  const outside = calculateReviewElapsedTime(history, "2030-11-14", now);
  assert.equal(outside.available, false);
  assert.equal(outside.seconds, 0);
  assert.equal(outside.totalSeconds, 25 * 3600);
  assert.match(outside.reason, /선택한 날짜/);
  const exactMidnight = calculateReviewElapsedTime(pair("2030-11-12T23:00:00", "2030-11-13T00:00:00"), "2030-11-13", now);
  assert.equal(exactMidnight.available, false);
});

test("missing, legacy hold, reversed, zero-length and future intervals are unavailable", () => {
  const noReview = [event("01", null, "in_progress", "2030-11-12T09:00:00"), event("02", "in_progress", "review", "2030-11-12T10:00:00")];
  const brokenCycle = [...pair("2030-11-11T09:00:00", "2030-11-11T10:00:00"), event("03", "in_progress", "submitted", "2030-11-12T10:00:00")];
  for (const history of [[], noReview, pair().slice(1), brokenCycle,
    pair("2030-11-12T11:00:00", "2030-11-12T10:00:00"),
    pair("2030-11-12T10:00:00", "2030-11-12T10:00:00"),
    pair("2031-01-01T09:00:00", "2031-01-01T10:00:00")]) {
    assert.equal(calculateReviewElapsedTime(history, "2030-11-12", now).available, false);
  }
  assert.equal(calculateReviewElapsedTime(pair(), "2030-02-30", now).available, false);
});

test("sub-second precision survives without rounding before daily save", () => {
  const result = calculateReviewElapsedTime(pair("2030-11-12T09:00:00.100", "2030-11-12T09:00:00.250"), "2030-11-12", now);
  assert.equal(result.seconds, 0.15);
});

test("the opt-in GET preview reads only the selected task history and leaves normal GET untouched", async () => {
  const queries = [];
  const db = { activityLog: { findMany: async query => { queries.push(query); return pair("2020-11-12T09:00:00", "2020-11-12T10:00:00").map(value => ({ ...value, createdAt: new Date(value.createdAt) })); } } };
  const mustNotWrite = () => { throw new Error("A preview attempted to change data"); };
  const load = loader({
    "@/lib/workTimeServer": { prisma: db, timerState: async () => ({ taskId: null }), dayState: async () => ({ hours: null }), saveDay: mustNotWrite, settle: mustNotWrite },
    "@/lib/dailyJournal": { isValidJournalDate: value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) },
    "@/lib/journalChangeTracker": { recordJournalChange: mustNotWrite },
    "@/lib/autoWorkTime": { automaticTimeState: mustNotWrite, setAutomaticTime: mustNotWrite },
  });
  const { GET } = load("app/api/work-time/route.ts");
  const regular = await GET(new Request("http://localhost/api/work-time?taskId=task-one&date=2020-11-12"));
  assert.equal(regular.status, 200);
  assert.equal((await regular.json()).reviewTime, undefined);
  assert.equal(queries.length, 0);
  const response = await GET(new Request("http://localhost/api/work-time?taskId=task-one&date=2020-11-12&includeReviewTime=1"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.day, { hours: null });
  assert.equal(body.reviewTime.available, true);
  assert.equal(body.reviewTime.seconds, 3600);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].where, { taskId: "task-one", toStatus: { not: null } });
  const invalid = await GET(new Request("http://localhost/api/work-time?includeReviewTime=1"));
  assert.equal(invalid.status, 400);
  assert.equal(queries.length, 1);
});
