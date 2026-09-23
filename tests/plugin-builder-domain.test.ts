import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginManifest, PluginPrivateStorage, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { type Behavior, type Design, type Expr, type UiNode } from "../plugins/native/plugin-builder/src/model.js";
import { BuilderStore } from "../plugins/native/plugin-builder/src/store.js";
import { RecordStore } from "../plugins/native/plugin-builder/src/records.js";
import { parseBehavior, parseCandidates, parseDesign, parseModelJson, parseNodes } from "../plugins/native/plugin-builder/src/validation.js";

const design: Design = {
  id: "sales", title: "销售记录", description: "登记数量与单价，自动计算销售额", journey: ["输入商品销售记录", "查看汇总"], acceptance: ["销售额等于数量乘单价"],
  fields: [
    { id: "title", label: "商品", type: "text", required: true },
    { id: "quantity", label: "数量", type: "number", required: true },
    { id: "price", label: "单价", type: "number", required: true },
    { id: "url", label: "链接", type: "url", required: false },
    { id: "tags", label: "标签", type: "tags", required: false },
    { id: "paid", label: "已付款", type: "boolean", required: false },
  ],
  calculations: [
    { id: "revenue", label: "销售额", expression: { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } } },
    { id: "large", label: "大单", expression: { op: "gt", left: { op: "field", id: "revenue" }, right: { op: "literal", value: 100 } } },
  ],
  layout: "table", allowImport: true, allowExport: true,
};
const behavior: Behavior = { calculations: design.calculations, allowImport: true, allowExport: true };
const nodes: UiNode[] = ["heading", "form", "search", "filter", "collection", "actions", "summary"].map(kind => ({ id: kind, kind: kind as UiNode["kind"], label: kind }));
const input = (title = "商品", quantity = 2, price = 25) => ({ title, quantity, price, url: "https://example.com/item", tags: ["现货"], paid: false });
function privateStorage(db: Database.Database, installId = "builder"): PluginPrivateStorage {
  const manifest = { plugin_id: "io.molis.work.builder-test", version: "1.0.0", permissions: [{ permission: "storage:private", required: true, reason: "test" }] } as PluginManifest;
  const context = { plugin_id: manifest.plugin_id, version: manifest.version, install_id: installId, requireGrant() {} } as unknown as PluginStartContext;
  return new SqlitePluginPrivateStorage(db).forPlugin(context, manifest);
}

test("controlled schema rejects executable payloads, bad references/types/cycles, and incomplete UI bindings", () => {
  assert.deepEqual(parseDesign(design), design);
  assert.deepEqual(parseModelJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.throws(() => parseModelJson("prefix {\"ok\":true}"), /完整 JSON/);
  assert.throws(() => parseDesign({ ...design, script: "alert(1)" }), /不支持的属性/);
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "script", label: "代码", expression: { op: "eval", code: "process.exit()" } }] }), /不允许执行代码/);
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "unknown", label: "未知", expression: { op: "field", id: "missing" } }] }), /未知字段/);
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "mixed", label: "混合", expression: { op: "add", left: { op: "field", id: "title" }, right: { op: "literal", value: 1 } } }] }), /必须为数字/);
  assert.throws(() => parseDesign({ ...design, calculations: [
    { id: "first", label: "甲", expression: { op: "field", id: "second" } },
    { id: "second", label: "乙", expression: { op: "field", id: "first" } },
  ] }), /循环/);
  const cyclic = { op: "add", left: { op: "literal", value: 1 }, right: null } as unknown as { op: "add"; left: Expr; right: Expr };
  cyclic.right = cyclic;
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "loop", label: "循环", expression: cyclic }] }), /循环/);
  let expression: Expr = { op: "literal", value: 1 };
  for (let count = 0; count < 8; count += 1) expression = { op: "add", left: expression, right: { op: "literal", value: 1 } };
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "deep", label: "过深", expression }] }), /8 层/);
  assert.throws(() => parseCandidates([{ ...design, rationale: "易用" }, { ...design, rationale: "快速" }]), /id 重复/);
  assert.throws(() => parseNodes([...nodes, nodes[0]], design), /重复/);
  assert.throws(() => parseNodes(nodes.filter(node => node.kind !== "form"), design), /缺少 form/);
  assert.throws(() => parseBehavior({ ...behavior, calculations: [] }, design), /必须与设计/);
});

test("drafts and installed records survive SQLite restart while instances and preview namespaces stay isolated", () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-builder-domain-")), path = join(directory, "private.sqlite");
  let db = new Database(path);
  try {
    const builds = new BuilderStore(privateStorage(db)), draft = builds.create("做一个销售登记插件");
    const records = new RecordStore(privateStorage(db, "installed-a"), "live", design, behavior);
    const first = records.save(input("铅笔", 3, 12));
    assert.equal(first.values.revenue, 36);
    assert.equal(first.values.large, false);
    assert.deepEqual(records.summary(), { count: 1, totals: { quantity: 3, price: 12, revenue: 36 } });
    assert.deepEqual(new RecordStore(privateStorage(db, "installed-b"), "live", design, behavior).list(), []);
    assert.deepEqual(new RecordStore(privateStorage(db, "installed-a"), "preview", design, behavior).list(), []);
    db.close(); db = new Database(path);
    assert.equal(new BuilderStore(privateStorage(db)).get(draft.id)?.brief, "做一个销售登记插件");
    const recovered = new RecordStore(privateStorage(db, "installed-a"), "live", design, behavior);
    assert.deepEqual(recovered.list(), [first]);
    assert.equal(recovered.list({ search: "铅笔", tag: "现货" }).length, 1);
    assert.equal(recovered.list({ tag: "缺货" }).length, 0);
    const changed = recovered.save(input("铅笔", 4, 30), first.id, first.revision);
    assert.equal(changed.revision, 2); assert.equal(changed.values.revenue, 120); assert.equal(changed.values.large, true);
    assert.throws(() => recovered.save(input(), first.id, 1), /已被其他操作更新/);
    assert.throws(() => recovered.remove(first.id, 1), /已被其他操作更新/);
    assert.equal(recovered.list()[0].values.revenue, 120);
    recovered.remove(first.id, 2); assert.deepEqual(recovered.list(), []);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("CAS rejects a real interleaved write through two SQLite connections without losing the winner", () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-builder-race-")), path = join(directory, "private.sqlite");
  const firstDb = new Database(path), secondDb = new Database(path);
  try {
    const firstStorage = privateStorage(firstDb), secondStorage = privateStorage(secondDb);
    const first = new BuilderStore(firstStorage), second = new BuilderStore(secondStorage), draft = first.create("版本冲突");
    assert.throws(() => first.update(draft.id, draft.revision, doc => {
      doc.title = "loser";
      second.update(draft.id, draft.revision, latest => { latest.title = "winner"; });
    }), /已被其他操作更新/);
    assert.equal(first.get(draft.id)?.title, "winner");
    assert.equal(first.get(draft.id)?.revision, 2);
    const records = new RecordStore(secondStorage, "live", design, behavior);
    let interleave = true;
    const delayed: PluginPrivateStorage = { ...firstStorage, compareAndSet(key, expected, next) {
      if (interleave) { interleave = false; records.save(input("winner")); }
      return firstStorage.compareAndSet!(key, expected, next);
    } };
    assert.throws(() => new RecordStore(delayed, "live", design, behavior).save(input("loser")), /已被其他操作更新/);
    assert.deepEqual(records.list().map(row => row.values.title), ["winner"]);
  } finally { firstDb.close(); secondDb.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("CSV handles BOM, commas, quotes, multiline cells and typed values; invalid imports remain atomic", () => {
  const db = new Database(":memory:");
  try {
    const records = new RecordStore(privateStorage(db), "csv", design, behavior);
    const first = records.save({ ...input('书, "第一版"\n含注释', -2, 12.5), tags: ["收藏,图书", "新\n品"], paid: true });
    const csv = records.exportCsv([first.id]);
    assert.match(csv, /"书, ""第一版""\n含注释"/);
    assert.match(csv, /,-2,12\.5,/);
    const other = new RecordStore(privateStorage(db), "import", design, behavior);
    const imported = other.importCsv(csv);
    assert.deepEqual(imported[0].values, first.values);
    assert.notEqual(imported[0].id, first.id);
    assert.throws(() => other.importCsv("title,quantity,price\r\n可以,2,3\r\n失败,not-a-number,2\r\n"), /第 3 行/);
    assert.equal(other.list().length, 1, "no successful prefix of the failed batch was saved");
    assert.throws(() => other.importCsv("title,quantity,price\n\"unterminated,1,2"), /未闭合/);
    assert.throws(() => other.importCsv("title,quantity,price,alien\n值,1,2,ignored"), /未知字段/);
    assert.throws(() => other.importCsv("title,quantity,quantity\n值,1,2"), /不能重复/);
    assert.throws(() => other.importCsv("title,quantity,price\n" + "值,1,2\n".repeat(2001)), /2000/);
    assert.throws(() => records.exportCsv([first.id, "missing"]), /找不到记录/);
    for (const title of ["=SUM(1,2)", "+cmd", "-danger", "@SUM(A1)", " \t=1+1"]) {
      const row = records.save(input(title));
      const result = records.exportCsv([row.id]);
      assert.ok(result.includes("'" + title), `formula-looking text must be neutralized: ${title}`);
    }
  } finally { db.close(); }
});

test("record inputs reject unknown fields, bad links and invalid numbers before persistence; calculation failures name the field", () => {
  const db = new Database(":memory:");
  try {
    const storage = privateStorage(db), records = new RecordStore(storage, "validation", design, behavior);
    assert.throws(() => records.save({ ...input(), unknown: "value" }), /未知输入字段/);
    assert.throws(() => records.save({ ...input(), url: "javascript:alert(1)" }), /http\/https/);
    assert.throws(() => records.save({ ...input(), quantity: Number.NaN }), /有限数字/);
    assert.throws(() => records.save({ ...input(), title: " " }), /必填/);
    assert.deepEqual(records.list(), []);
    const quotient: Design = { ...design, calculations: [{ id: "ratio", label: "平均成本", expression: { op: "divide", left: { op: "field", id: "price" }, right: { op: "field", id: "quantity" } } }] };
    const division = new RecordStore(storage, "division", quotient, { ...behavior, calculations: quotient.calculations });
    assert.throws(() => division.save(input("除零", 0, 10)), /平均成本.*除数不能为 0/);
    assert.deepEqual(division.list(), []);
    const guarded: Design = { ...quotient, calculations: [{ id: "ratio", label: "安全均值", expression: {
      op: "if", condition: { op: "equal", left: { op: "field", id: "quantity" }, right: { op: "literal", value: 0 } },
      then: { op: "literal", value: 0 }, else: quotient.calculations[0].expression,
    } }] };
    assert.equal(new RecordStore(storage, "guarded", guarded, { ...behavior, calculations: guarded.calculations }).save(input("零数量", 0, 10)).values.ratio, 0);
  } finally { db.close(); }
});

test("publishing snapshots a complete revision, keeps monotonic versions, protects old schemas and supports compatible activation and undo", () => {
  const db = new Database(":memory:");
  try {
    const store = new BuilderStore(privateStorage(db));
    let doc = store.create("销售记录");
    assert.throws(() => store.release(doc.id, doc.revision), /全部完成/);
    doc = store.update(doc.id, doc.revision, draft => { draft.design = design; draft.nodes = nodes; draft.behavior = behavior; draft.phase = "ready"; });
    const first = store.release(doc.id, doc.revision);
    assert.equal(first.version, 1); assert.equal(first.design.title, "销售记录");
    assert.throws(() => store.release(doc.id, doc.revision), /已被其他操作更新/);
    doc = store.get(doc.id)!;
    doc = store.update(doc.id, doc.revision, draft => {
      draft.history.push({ design: structuredClone(draft.design), nodes: structuredClone(draft.nodes), behavior: structuredClone(draft.behavior) });
      draft.design!.title = "新版销售记录";
    });
    assert.equal(store.releases()[0].design.title, "销售记录", "draft edit cannot change the active plugin");
    const second = store.release(doc.id, doc.revision);
    assert.equal(second.version, 2); assert.equal(second.pluginId, first.pluginId);
    store.activate(doc.id, 1); assert.equal(store.releases()[0].version, 1);
    doc = store.get(doc.id)!;
    const third = store.release(doc.id, doc.revision); assert.equal(third.version, 3);
    doc = store.undo(doc.id, store.get(doc.id)!.revision);
    assert.equal(doc.design!.title, "销售记录"); assert.equal(doc.active, null);
    assert.equal(store.releases()[0].version, 3, "undo only changes the draft");
    doc = store.update(doc.id, doc.revision, draft => { draft.design!.fields = draft.design!.fields.filter(field => field.id !== "url"); });
    assert.throws(() => store.release(doc.id, doc.revision), /无法删除/);
    doc = store.update(doc.id, doc.revision, draft => { draft.design = structuredClone(design); draft.design.fields.find(field => field.id === "url")!.type = "text"; });
    assert.throws(() => store.release(doc.id, doc.revision), /无法更改/);
    doc = store.update(doc.id, doc.revision, draft => { draft.design = structuredClone(design); draft.design.fields.push({ id: "category", label: "类别", type: "text", required: true }); });
    assert.throws(() => store.release(doc.id, doc.revision), /必须为可选/);
    doc = store.update(doc.id, doc.revision, draft => { draft.design!.fields.find(field => field.id === "category")!.required = false; });
    const fourth = store.release(doc.id, doc.revision); assert.equal(fourth.version, 4);
    assert.throws(() => store.activate(doc.id, 1), /无法删除/);
    assert.equal(store.releases()[0].version, 4);
    assert.deepEqual(store.versions(doc.id).map(release => release.version), [4, 3, 2, 1]);
  } finally { db.close(); }
});
