import { BuilderError, type Behavior, type CalculatedField, type Candidate, type Design, type Expr, type Field, type Presentation, type RecordValue, type UiNode } from "./model.js";
import { parseFormula } from "./formula.js";

function fail(message: string): never { throw new BuilderError("invalid_input", message); }
function object(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} 必须为对象`);
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} 包含不支持的属性 ${key}`);
  return value;
}
function text(input: unknown, label: string): string {
  if (typeof input !== "string" || !input.trim()) fail(`${label} 必须为非空文字`);
  return input.trim();
}
function id(input: unknown, label: string): string {
  const value = text(input, label);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) fail(`${label} 必须以字母开头，仅包含字母、数字、横线或下划线`);
  return value;
}
function bool(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label} 必须为布尔值`);
  return input;
}
function array(input: unknown, label: string): unknown[] { if (!Array.isArray(input)) fail(`${label} 必须为数组`); return input; }
function texts(input: unknown, label: string): string[] {
  const values = array(input, label).map(item => text(item, label));
  if (!values.length) fail(`${label} 至少需要一项`);
  return values;
}
function unique<T extends { id: string }>(values: T[], label: string): T[] {
  const ids = new Set<string>();
  for (const value of values) { if (ids.has(value.id)) fail(`${label} id 重复：${value.id}`); ids.add(value.id); }
  return values;
}
function parseField(input: unknown): Field {
  const value = object(input, ["id", "label", "type", "required"], "字段");
  if (!["text", "url", "number", "tags", "boolean"].includes(String(value.type))) fail("字段类型不受支持");
  return { id: id(value.id, "字段 id"), label: text(value.label, "字段名称"), type: value.type as Field["type"], required: bool(value.required, "required") };
}
function literal(input: unknown): RecordValue {
  if (typeof input === "string" || typeof input === "boolean" || (typeof input === "number" && Number.isFinite(input))) return input;
  if (Array.isArray(input) && input.every(item => typeof item === "string")) return [...input];
  return fail("表达式常量必须是文字、有限数字、布尔值或文字数组");
}
function expression(input: unknown, depth = 1, ancestors = new Set<object>()): Expr {
  if (depth > 8) fail("表达式最多嵌套 8 层");
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(`表达式必须为受控 AST 对象，实际是${Array.isArray(input) ? "数组" : typeof input === "string" ? `文字「${input.slice(0, 40)}」` : String(input)}；常量请写成 {"op":"literal","value":…}`);
  if (ancestors.has(input)) fail("表达式不能循环引用");
  ancestors.add(input);
  try {
    const op = (input as Record<string, unknown>).op;
    if (op === "literal") { const value = object(input, ["op", "value"], "常量表达式"); return { op, value: literal(value.value) }; }
    if (op === "field") { const value = object(input, ["op", "id"], "字段引用"); return { op, id: id(value.id, "引用字段 id") }; }
    if (op === "if") {
      const value = object(input, ["op", "condition", "then", "else"], "条件表达式");
      return { op, condition: expression(value.condition, depth + 1, ancestors), then: expression(value.then, depth + 1, ancestors), else: expression(value.else, depth + 1, ancestors) };
    }
    if (["add", "subtract", "multiply", "divide", "concat", "equal", "gt", "contains", "and", "or"].includes(String(op))) {
      const value = object(input, ["op", "left", "right"], "二元表达式");
      return { op: op as "add", left: expression(value.left, depth + 1, ancestors), right: expression(value.right, depth + 1, ancestors) };
    }
    return fail(`不支持的表达式操作：${String(op)}；不允许执行代码`);
  } finally { ancestors.delete(input); }
}
function calculations(input: unknown): CalculatedField[] {
  return unique(array(input, "计算字段").map(item => {
    const value = object(item, ["id", "label", "expression"], "计算字段");
    // A formula string is only another notation for the same controlled tree; the tree is validated either way.
    try { return { id: id(value.id, "计算字段 id"), label: text(value.label, "计算字段名称"), expression: expression(typeof value.expression === "string" ? parseFormula(value.expression) : value.expression) }; }
    catch (error) { return fail(`计算字段「${String(value.label ?? value.id)}」：${error instanceof Error ? error.message : "表达式无效"}`); }
  }), "计算字段");
}

type ValueType = "string" | "number" | "boolean" | "tags";
/** Validate references, arithmetic types and cycles across calculated fields. */
export function calculationTypes(fields: Field[], calculated: CalculatedField[]): Map<string, ValueType> {
  const types = new Map<string, ValueType>(fields.map(field => [field.id, field.type === "text" || field.type === "url" ? "string" : field.type]));
  const byId = new Map(calculated.map(field => [field.id, field]));
  const visiting = new Set<string>();
  function fieldType(fieldId: string): ValueType {
    if (types.has(fieldId)) return types.get(fieldId)!;
    const field = byId.get(fieldId);
    if (!field) return fail(`表达式引用未知字段：${fieldId}`);
    if (visiting.has(fieldId)) fail(`计算字段存在循环：${fieldId}`);
    visiting.add(fieldId);
    const type = infer(field.expression);
    visiting.delete(fieldId); types.set(fieldId, type); return type;
  }
  function infer(expr: Expr): ValueType {
    if (expr.op === "literal") return Array.isArray(expr.value) ? "tags" : typeof expr.value as ValueType;
    if (expr.op === "field") return fieldType(expr.id);
    if (expr.op === "if") {
      if (infer(expr.condition) !== "boolean") fail("if 条件必须产生布尔值");
      const yes = infer(expr.then), no = infer(expr.else);
      if (yes !== no) fail("if 两个分支必须产生相同类型");
      return yes;
    }
    const left = infer(expr.left), right = infer(expr.right);
    if (expr.op === "equal") { if (left !== right) fail("equal 两侧必须类型相同"); return "boolean"; }
    if (expr.op === "and" || expr.op === "or") { if (left !== "boolean" || right !== "boolean") fail(`${expr.op} 两侧必须为条件（布尔值）`); return "boolean"; }
    if (expr.op === "contains") { if ((left !== "tags" && left !== "string") || right !== "string") fail("contains 左侧必须为标签或文字，右侧必须为文字"); return "boolean"; }
    if (expr.op === "concat") { if (left !== "string" || right !== "string") fail("concat 两侧必须为文字"); return "string"; }
    if (left !== "number" || right !== "number") fail(`${expr.op} 两侧必须为数字`);
    return expr.op === "gt" ? "boolean" : "number";
  }
  for (const field of calculated) {
    if (types.has(field.id)) fail(`计算字段与输入字段 id 重复：${field.id}`);
  }
  for (const field of calculated) {
    try { fieldType(field.id); }
    catch (error) { const detail = error instanceof Error ? error.message : "类型不正确"; fail(detail.startsWith("计算字段「") ? detail : `计算字段「${field.label}」：${detail}`); }
  }
  return types;
}

function presentation(input: unknown, fields: Field[]): Presentation {
  const value = object(input, ["title", "description", "image", "metadata", "link", "tags", "addLabel"], "展示绑定");
  const result: Presentation = {};
  for (const key of ["title", "description", "image", "metadata", "link", "tags"] as const) {
    // An empty binding means "not bound", the same as leaving the key out.
    if (value[key] === undefined || value[key] === null || value[key] === "") continue;
    const fieldId = id(value[key], `展示绑定 ${key}`);
    const field = fields.find(item => item.id === fieldId);
    if (!field) fail(`展示绑定 ${key} 引用未知字段：${fieldId}`);
    const types: Field["type"][] = key === "tags" ? ["tags"] : key === "image" || key === "link" ? ["url"] : ["text", "url"];
    if (!types.includes(field.type)) fail(`展示绑定 ${key} 的字段类型必须为 ${types.join("/")}`);
    result[key] = fieldId;
  }
  if (value.addLabel !== undefined) {
    result.addLabel = text(value.addLabel, "新增按钮文案");
    if (Array.from(result.addLabel).length > 30) fail("新增按钮文案不能超过 30 字");
  }
  return result;
}

const DESIGN_KEYS = ["id", "title", "description", "journey", "acceptance", "fields", "calculations", "layout", "allowImport", "allowExport", "presentation", "totals"];
export function parseDesign(input: unknown): Design {
  const value = object(input, DESIGN_KEYS, "设计");
  if (!["cards", "list", "table"].includes(String(value.layout))) fail("集合布局仅支持 cards/list/table");
  const fields = unique(array(value.fields, "字段").map(parseField), "字段");
  if (!fields.length) fail("设计至少需要一个输入字段");
  const computed = calculations(value.calculations);
  const types = calculationTypes(fields, computed);
  const totals = value.totals === undefined ? undefined : unique(array(value.totals, "合计项").map(item => ({ id: id(item, "合计项") })), "合计项").map(item => item.id);
  for (const total of totals ?? []) if (types.get(total) !== "number") fail(`合计项「${total}」必须是数字字段或数字计算`);
  return { id: id(value.id, "设计 id"), title: text(value.title, "标题"), description: text(value.description, "描述"), journey: texts(value.journey, "用户旅程"), acceptance: texts(value.acceptance, "验收标准"), fields, calculations: computed, layout: value.layout as Design["layout"], allowImport: bool(value.allowImport, "allowImport"), allowExport: bool(value.allowExport, "allowExport"), ...(value.presentation === undefined ? {} : { presentation: presentation(value.presentation, fields) }), ...(totals === undefined ? {} : { totals }) };
}
export function parseCandidates(input: unknown): Candidate[] {
  const values = array(input, "候选设计");
  if (values.length < 2 || values.length > 3) fail("需要 2–3 个候选设计");
  return unique(values.map((item, index) => {
    try {
      const value = object(item, [...DESIGN_KEYS, "rationale", "samples"], "候选设计");
      const { rationale, samples, ...design } = value;
      const examples = samples === undefined ? [] : array(samples, "示例内容").slice(0, 4).filter((sample): sample is Record<string, RecordValue> => Boolean(sample) && typeof sample === "object" && !Array.isArray(sample));
      return { ...parseDesign(design), rationale: text(rationale, "选择理由"), ...(examples.length ? { samples: examples } : {}) };
    } catch (error) { return fail(`候选 ${index + 1}：${error instanceof Error ? error.message : "格式不正确"}`); }
  }), "候选设计");
}
const OVERRIDES = ["id", "title", "description", "journey", "acceptance", "layout", "presentation", "rationale"];
/**
 * The compact proposal writes what candidates share once (base, samples) and lets each candidate state only how it
 * differs. It is expanded into complete candidates here, which then go through the same strict parsers.
 */
export function expandProposal(value: { base?: unknown; samples?: unknown; candidates?: unknown }): unknown {
  if (value.base === undefined) return value.candidates;
  const base = object(value.base, DESIGN_KEYS.filter(key => !["id", "layout", "presentation"].includes(key)), "共享设计");
  return array(value.candidates, "候选设计").map((item, index) => {
    const candidate = object(item, [...OVERRIDES, "extraFields"], `候选 ${index + 1}`);
    const extra = candidate.extraFields === undefined ? [] : array(candidate.extraFields, `候选 ${index + 1} 的附加字段`);
    const own = Object.fromEntries(OVERRIDES.filter(key => candidate[key] !== undefined).map(key => [key, candidate[key]]));
    return { ...base, ...own, fields: [...array(base.fields, "共享字段"), ...extra], ...(value.samples === undefined ? {} : { samples: value.samples }) };
  });
}
const BINDING_TYPES: Record<string, Field["type"][]> = { title: ["text", "url"], description: ["text", "url"], metadata: ["text", "url"], image: ["url"], link: ["url"], tags: ["tags"] };
/**
 * A model's proposal may point a display hint at a field that cannot carry it. Such hints are dropped and
 * reported, never redirected to another field; everything else still goes through the strict parsers.
 */
export function dropUnfitBindings(input: unknown, label: string, dropped: string[]): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>, presentation = value.presentation;
  if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return input;
  const fields = Array.isArray(value.fields) ? value.fields as Array<Record<string, unknown> | null> : [];
  const kept: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(presentation as Record<string, unknown>)) {
    const types = BINDING_TYPES[key];
    if (!types || binding === undefined || binding === null || binding === "") { if (!types) kept[key] = binding; continue; }
    const field = fields.find(item => item?.id === binding);
    if (field && types.includes(field.type as Field["type"])) kept[key] = binding;
    else dropped.push(`${label}的「${key}」不能显示${field ? `${String(field.type)} 类型的` : "不存在的"}字段 ${String(binding)}`);
  }
  return { ...value, presentation: kept };
}
export function parseNodes(input: unknown, design: Design): UiNode[] {
  const nodes = unique(array(input, "界面节点").map(item => {
    const value = object(item, ["id", "kind", "label"], "界面节点");
    if (!["heading", "form", "search", "filter", "collection", "actions", "summary"].includes(String(value.kind))) fail("界面节点类型不受支持");
    return { id: id(value.id, "节点 id"), kind: value.kind as UiNode["kind"], label: text(value.label, "节点名称") };
  }), "界面节点");
  const kinds = new Set(nodes.map(node => node.kind));
  if (kinds.size !== nodes.length) fail("界面节点类型不能重复");
  for (const kind of ["heading", "form", "collection", "actions"]) if (!kinds.has(kind as UiNode["kind"])) fail(`完整界面缺少 ${kind} 节点`);
  if (kinds.has("filter") && !design.fields.some(field => field.type === "tags")) fail("标签筛选需要 tags 字段");
  return nodes;
}
export function parseBehavior(input: unknown, design: Design): Behavior {
  const value = object(input, ["calculations", "allowImport", "allowExport"], "行为绑定");
  const computed = calculations(value.calculations);
  calculationTypes(design.fields, computed);
  const expected = new Set(design.calculations.map(field => field.id));
  if (computed.length !== expected.size || computed.some(field => !expected.has(field.id))) fail("行为计算字段必须与设计中的字段一致");
  const allowImport = bool(value.allowImport, "allowImport"), allowExport = bool(value.allowExport, "allowExport");
  if (allowImport !== design.allowImport || allowExport !== design.allowExport) fail("导入导出行为必须与设计一致");
  return { calculations: computed, allowImport, allowExport };
}
export function parseModelJson(input: string): unknown {
  if (typeof input !== "string") fail("模型输出必须是 JSON 文本");
  // Some providers emit their reasoning as <think>…</think> ahead of the answer; it is never part of the answer.
  const trimmed = input.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  const source = fenced ? fenced[1]! : trimmed;
  try { return JSON.parse(source) as unknown; }
  catch (error) {
    // Say where the syntax broke, so both the person and a repair round can see the actual problem.
    const position = Number(/position (\d+)/.exec(error instanceof Error ? error.message : "")?.[1]);
    const near = Number.isFinite(position) ? `，第 ${position} 个字符附近：${source.slice(Math.max(0, position - 40), position + 40)}` : "";
    return fail(`模型输出不是完整 JSON${near}；请重试此阶段`);
  }
}
