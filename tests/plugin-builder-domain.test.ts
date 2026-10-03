import assert from "node:assert/strict";
import test from "node:test";
import { type Behavior, type Design, type Expr, type UiNode } from "../plugins/native/plugin-builder/src/model.js";
import { parseBehavior, parseCandidates, parseDesign, parseModelJson, parseNodes } from "../plugins/native/plugin-builder/src/validation.js";

// The controlled design schema and formulas the studio still reads (the stores and records of the earlier
// interpreter-based builder went with it, specs/artifact-positioning S1b).
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

test("controlled schema rejects executable payloads, bad references/types/cycles, and incomplete UI bindings", () => {
  assert.deepEqual(parseDesign(design), design);
  assert.deepEqual(parseModelJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseModelJson("<think>先想想字段</think>\n{\"ok\":true}"), { ok: true }, "provider reasoning blocks are not part of the answer");
  // contains counts tagged records: if(contains(status,"已读"),1,0) totals to the number read.
  const reading = parseDesign({ id: "books", title: "读书", description: "读书清单", journey: ["记录"], acceptance: ["统计已读"], layout: "table", allowImport: false, allowExport: false,
    fields: [{ id: "title", label: "书名", type: "text", required: true }, { id: "status", label: "状态", type: "tags", required: false }],
    calculations: [{ id: "read", label: "已读", expression: { op: "if", condition: { op: "contains", left: { op: "field", id: "status" }, right: { op: "literal", value: "已读" } }, then: { op: "literal", value: 1 }, else: { op: "literal", value: 0 } } }] });
  assert.equal(reading.calculations[0].id, "read");
  assert.throws(() => parseDesign({ ...reading, calculations: [{ id: "bad", label: "坏", expression: { op: "contains", left: { op: "literal", value: 3 }, right: { op: "literal", value: "x" } } }] }), /contains 左侧必须为标签或文字/);
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

test("formula strings are another notation for the same controlled expression tree", async () => {
  const { parseFormula } = await import("../plugins/native/plugin-builder/src/formula.js");
  assert.deepEqual(parseFormula("quantity * price"), { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } });
  assert.deepEqual(parseFormula("if(contains(status, '已读') and year == 2026, 1, 0)"), { op: "if",
    condition: { op: "and", left: { op: "contains", left: { op: "field", id: "status" }, right: { op: "literal", value: "已读" } }, right: { op: "equal", left: { op: "field", id: "year" }, right: { op: "literal", value: 2026 } } },
    then: { op: "literal", value: 1 }, else: { op: "literal", value: 0 } });
  assert.deepEqual(parseFormula("a < 3"), { op: "gt", left: { op: "literal", value: 3 }, right: { op: "field", id: "a" } });
  assert.deepEqual(parseFormula("x != 'y'"), { op: "if", condition: { op: "equal", left: { op: "field", id: "x" }, right: { op: "literal", value: "y" } }, then: { op: "literal", value: false }, else: { op: "literal", value: true } });
  assert.throws(() => parseFormula("process.exit()"), /公式/);
  assert.throws(() => parseFormula("eval('1')"), /不支持函数 eval/);
  assert.throws(() => parseFormula("(a + b"), /需要「\)」/);
  // Through the design parser, a formula is validated exactly like an object expression.
  const withFormula = parseDesign({ ...design, calculations: [{ id: "revenue", label: "销售额", expression: "quantity * price" }] });
  assert.deepEqual(withFormula.calculations[0].expression, design.calculations[0].expression);
  assert.throws(() => parseDesign({ ...design, calculations: [{ id: "bad", label: "坏", expression: "title * 2" }] }), /计算字段「坏」.*multiply 两侧必须为数字/);
});
