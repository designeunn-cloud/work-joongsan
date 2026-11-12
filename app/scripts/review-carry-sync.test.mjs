import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import ts from "typescript";

function fixture() {
  const state = { today: "2026-11-12", cutoff: new Date("2026-11-12T00:00:00Z"), tasks: [], events: [], files: new Map(), reads: 0 };
  const uses = (task, cutoff) => !!cutoff && new Date(task.createdAt) >= cutoff;
  const mocks = {
    "node:fs/promises": {
      mkdir: async () => {},
      readFile: async file => { if (!state.files.has(file)) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return state.files.get(file); },
      writeFile: async (file, content) => { state.files.set(file, content); },
      rename: async (from, to) => { state.files.set(to, state.files.get(from)); state.files.delete(from); },
    },
    "node:path": path,
    "node:crypto": { randomUUID: () => "isolated-test" },
    "./dailyJournal": { getDailyJournal: async () => { state.reads++; return { tasks: state.tasks }; } },
    "./googleSheetsJournal": { getGoogleSheetsJournalConfig: async () => ({ configured: true }) },
    "./journalAutoSync": { queueJournalChanges: async events => { state.events.push(...events); } },
    "./journalMemoSync": { journalToday: () => state.today },
    "./reviewWorkflowServer": { getReviewWorkflowCutoff: async () => state.cutoff, usesReviewWorkflow: uses },
  };
  const file = path.resolve("lib/reviewCarrySync.ts");
  const mod = new Module(file);
  mod.require = name => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; };
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
  return { state, ...mod.exports };
}
const submitted = { createdAt: "2026-11-12T01:00:00Z", reviewDate: "2026-11-12T02:00:00Z", status: "submitted" };

test("review carry sync leaves legacy work and inactive installations untouched", async () => {
  const { state, queueReviewCarryDay } = fixture();
  state.tasks = [{ ...submitted, createdAt: "2026-11-11T00:00:00Z", status: "review" }];
  await queueReviewCarryDay();
  assert.deepEqual(state.events, []);
  state.cutoff = null;
  const reads = state.reads;
  await queueReviewCarryDay();
  assert.equal(state.reads, reads);
});

test("idle review queues once per Korean date without creating task membership", async () => {
  const { state, queueReviewCarryDay } = fixture();
  state.tasks = [submitted];
  await queueReviewCarryDay();
  await queueReviewCarryDay();
  assert.deepEqual(state.events, [{ dateISO: "2026-11-12" }]);
  state.today = "2026-11-13";
  await queueReviewCarryDay();
  assert.deepEqual(state.events, [{ dateISO: "2026-11-12" }, { dateISO: "2026-11-13" }]);
});

test("excluded rows, not-yet-delivered work, and completed work do not trigger carry", async () => {
  const { state, queueReviewCarryDay } = fixture();
  for (const tasks of [[], [{ ...submitted, reviewDate: null, status: "in_progress" }], [{ ...submitted, status: "done" }]]) {
    state.tasks = tasks;
    await queueReviewCarryDay();
  }
  assert.deepEqual(state.events, []);
  state.tasks = [{ ...submitted, status: "in_progress" }];
  await queueReviewCarryDay();
  assert.deepEqual(state.events, [{ dateISO: "2026-11-12" }]);
});

test("viewing other dates does not enqueue or read a carry journal", async () => {
  const { state, queueReviewCarryDay } = fixture();
  state.tasks = [submitted];
  await queueReviewCarryDay("2026-11-11");
  await queueReviewCarryDay("2026-11-13");
  assert.equal(state.reads, 0);
  assert.deepEqual(state.events, []);
});
