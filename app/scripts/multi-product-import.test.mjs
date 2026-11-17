import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
function loader(prisma) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = new Module(absolute); cache.set(absolute, mod);
    mod.require = name => ["./prisma", "@/lib/prisma"].includes(name) ? { prisma }
      : name.startsWith("@/") ? load(`${name.slice(2)}.ts`)
      : name.startsWith(".") ? load(path.resolve(path.dirname(absolute), `${name}.ts`)) : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, absolute);
    return mod.exports;
  }
  return load;
}
const load = loader(null);
const { splitProducts, extractRequestProducts, mergeRequestProducts } = load("lib/productPolicy.ts");
const { interpretExcelRules } = load("lib/ruleBasedInterpret.ts");
const models = ["WSG-9200", "WSG-9890", "WSG-9900"];
const rows = [["요청부서", "영업부 디자인팀", "요청자", "김희진"], ["요청일자", "2026-11-11"],
  ["요청완료일자", "2026-11-13"], ["제 품", "커피그라인더 WSG-9200, 9890, 9900 KC라벨 디자인 수정 요청"],
  ["1. KC라벨"], ['- 재질명 "스테인레스, " 삭제'], ["(1) WSG-9200"], ["(2) WSG-9890", "(3) WSG-9900"]];
const fileName = "커피그라인더 WSG-9200, 9890, 9900 KC라벨 디자인 수정 요청_261111.xlsx";
const input = { fileBaseName: fileName.replace(/\.xlsx$/, ""), rows,
  flattenedText: "[시트: 디자인수정]\n" + rows.map(row => row.join(" | ")).join("\n"), sheetNames: ["디자인수정"],
  assignees: [{ name: "김희진", department: "무역부" }], products: models.map(code => ({ code, brand: "위즈웰" })), platforms: [] };

test("the actual three-model request survives filename preference and the trade-specific override", () => {
  const result = interpretExcelRules(input);
  assert.equal(result.status, "ok");
  assert.equal(result.department, "무역부");
  assert.deepEqual(splitProducts(result.productName), models);
  assert.equal(result.requestContent, "디자인자료(수정)");
  assert.equal(result.newProductCode, undefined);
  assert.deepEqual(extractRequestProducts(input.flattenedText), models);
});

test("explicit product cells keep uncached models, multiple cells, line breaks and numbered targets", () => {
  const source = [["품명", "EW770\nEW820M", "EW880", "요청자", "담당자"], ["참고 품명", "REF100"],
    ["참고"], ["(1) REF200"], ["모델명", "WM6915B/W ; CF918A(BT)"], ["작업 참고 설명 REF300"]];
  assert.deepEqual(extractRequestProducts(source), ["EW770", "EW820M", "EW880", "WM6915B/W", "CF918A(BT)"]);
  const result = interpretExcelRules({ ...input, fileBaseName: "EW770 배너 요청", rows: source,
    assignees: [{ name: "김희진", department: "영업부" }], products: [{ code: "EW770", brand: "엑사이더" }] });
  assert.deepEqual(splitProducts(result.productName), ["EW770", "EW820M", "EW880", "WM6915B/W", "CF918A(BT)"]);
  assert.deepEqual(splitProducts("WM6915B/W, ew770；EW770\nCF918A(BT) / VI25"), ["WM6915B/W", "ew770", "CF918A(BT)", "VI25"]);
});

test("general prose and reference codes are not silently added to an existing extraction", () => {
  const source = "참고 품명 | REF100\n본문 | 비교할 다른 제품 REF200\n참고\n(1) REF300";
  assert.deepEqual(extractRequestProducts(source), []);
  assert.equal(mergeRequestProducts("WSG-9200", source), "WSG-9200");
  assert.equal(mergeRequestProducts("wm6915b/w", "품명 | WM6915B/W"), "WM6915B/W");
  assert.equal(mergeRequestProducts("WM1020", "", "WIM1020_배너.xlsx"), "WM1020", "one conflicting code must not silently replace the chosen product");
  assert.equal(mergeRequestProducts("EW770", "참고 | REF100", "EW770_EW820M_EW880_배너.xlsx"), "EW770, EW820M, EW880");
  const filenameOnly = interpretExcelRules({ ...input, fileBaseName: "WSG-9200_WSG-9890_WSG-9900_배너", rows: [["요청자", "김희진"]],
    assignees: [{ name: "김희진", department: "영업부" }], products: input.products.slice(0, 1) });
  assert.deepEqual(splitProducts(filenameOnly.productName), models, "one catalog match must not hide two other codes explicitly listed in the filename");
});

test("detail-page model fields exclude adjacent quantity and color metadata", () => {
  const detailRows = [["요청자", "검증자"], ["상 품 기 술 서"],
    ["모델명", "ETS511", "발주수량", "그레이 514대, 베이지 514대", "색상", "그레이, 베이지"]];
  const flattenedText = detailRows.map(row => row.join(" | ")).join("\n");
  for (const source of [detailRows, flattenedText]) {
    assert.deepEqual(extractRequestProducts(source), ["ETS511"]);
    assert.equal(mergeRequestProducts("ETS511", source), "ETS511");
  }
  const result = interpretExcelRules({ ...input, fileBaseName: "20261023_ETS511_블루투스 내용 추가_디자인요청서",
    rows: detailRows, flattenedText, sheetNames: ["ETS511"],
    assignees: [{ name: "검증자", department: "마케팅팀" }],
    products: ["ETS511", "발주수량", "그레이 514대"].map(code => ({ code, brand: null })) });
  assert.equal(result.status, "ok");
  assert.equal(result.productName, "ETS511");
  assert.equal(result.newProductCode, undefined, "metadata must not be registered as a new Notion product");
});

test("metadata boundaries support inline values and units while preserving multiple model cells", () => {
  for (const boundary of ["발주 수량", "발주수량(대)", "주문수량：514대", "수량: 514대", "색 상", "색상: 그레이", "컬러：베이지"]) {
    const source = [["품명", "ETS511", "ETS512", boundary, "그레이 514대", "베이지"]];
    assert.deepEqual(extractRequestProducts(source), ["ETS511", "ETS512"], boundary);
    assert.deepEqual(extractRequestProducts(source[0].join(" | ")), ["ETS511", "ETS512"], boundary);
  }
  assert.deepEqual(extractRequestProducts([["품명", "에어 스텝퍼", "색상", "그레이"]]), ["에어 스텝퍼"]);
});

test("registration preserves all explicitly requested products even if an AI/extractor returned one", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "multi-product-import-"));
  const sql = new DatabaseSync(path.join(temp, "test.db"));
  for (const name of fs.readdirSync(path.join(root, "prisma/migrations")).sort()) {
    const migration = path.join(root, "prisma/migrations", name, "migration.sql");
    if (fs.existsSync(migration)) sql.exec(fs.readFileSync(migration, "utf8"));
  }
  sql.close();
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(temp, "test.db").replaceAll("\\", "/")}` } } });
  try {
    await prisma.productCache.createMany({ data: input.products });
    const { createTaskFromInterpretResult } = loader(prisma)("lib/taskCreation.ts");
    const result = await createTaskFromInterpretResult({ watchFolder: temp, fileName, flattenedText: input.flattenedText,
      result: { status: "ok", assignee: "김희진", department: "무역부", category: "디자인자료", requestContent: "디자인자료(수정)",
        productName: models[0], requestDateISO: "2026-11-13" },
      saveFile: folder => fs.writeFileSync(path.join(folder, "요청서.txt"), "isolated test fixture") });
    assert.equal(result.ok, true);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } });
    assert.deepEqual(splitProducts(task.productName), models);
    assert.ok(models.every(code => task.folderName.includes(code)));
    assert.equal(await prisma.productCache.count(), 3);
  } finally {
    await prisma.$disconnect();
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temp));
    assert.ok(relative.startsWith("multi-product-import-") && !relative.includes(path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
