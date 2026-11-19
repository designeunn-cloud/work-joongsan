import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { watchExcelInbox } from "../lib/excelInbox.ts";

test("picks up pending Excel files and finished downloads while ignoring temporary files and task folders", { timeout: 12000 }, async t => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "excel-inbox-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(path.join(folder, "completed"));
  for (const name of ["pending.xls", "~$pending.xlsx", "download.crdownload", "art.psd", "completed/copy.xlsx"]) {
    await writeFile(path.join(folder, name), "fixture");
  }
  const seen = [];
  const watcher = watchExcelInbox(folder, file => seen.push(path.basename(file)));
  try {
    await once(watcher, "ready");
    assert.deepEqual(seen, ["pending.xls"]);
    assert.deepEqual(watcher.getWatched()[folder], ["pending.xls"]);
    const log = t.mock.method(console, "error", () => {});
    watcher.emit("error", Object.assign(new Error("busy"), { code: "EBUSY" }));
    assert.equal(log.mock.callCount(), 1);
    const next = once(watcher, "add");
    await rename(path.join(folder, "download.crdownload"), path.join(folder, "finished.XLSM"));
    await next;
    assert.deepEqual(seen, ["pending.xls", "finished.XLSM"]);
  } finally {
    await watcher.close();
  }
});
