import { randomUUID } from "node:crypto";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { BuilderError, type Behavior, type Design, type Expr, type Field, type RecordRow, type RecordValue } from "./model.js";
import { calculationTypes, parseBehavior, parseDesign } from "./validation.js";

function fail(message: string): never { throw new BuilderError("invalid_record", message); }
function conflict(): never { throw new BuilderError("revision_conflict", "记录已被其他操作更新，请刷新后重试"); }
function empty(field: Field): RecordValue {
  return field.type === "number" ? 0 : field.type === "boolean" ? false : field.type === "tags" ? [] : "";
}
function validateValues(input: unknown, design: Design): Record<string, RecordValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("记录必须是字段和值组成的对象");
  const values = input as Record<string, unknown>, result: Record<string, RecordValue> = {};
  const allowed = new Set(design.fields.map(field => field.id));
  for (const key of Object.keys(values)) if (!allowed.has(key)) fail(`未知输入字段：${key}`);
  for (const field of design.fields) {
    const value = Object.hasOwn(values, field.id) ? values[field.id] : undefined;
    if (value === undefined || value === null || value === "") {
      if (field.required) fail(`「${field.label}」为必填字段`);
      result[field.id] = empty(field); continue;
    }
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) fail(`「${field.label}」必须为有限数字`);
      result[field.id] = value;
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") fail(`「${field.label}」必须为布尔值`);
      result[field.id] = value;
    } else if (field.type === "tags") {
      if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim())) fail(`「${field.label}」必须为非空文字标签数组`);
      if (field.required && value.length === 0) fail(`「${field.label}」至少需要一个标签`);
      result[field.id] = [...new Set((value as string[]).map(item => item.trim()))];
    } else {
      if (typeof value !== "string") fail(`「${field.label}」必须为文字`);
      if (field.required && !value.trim()) fail(`「${field.label}」为必填字段`);
      if (field.type === "url") {
        try { const url = new URL(value); if (!["https:", "http:"].includes(url.protocol) || !url.hostname) fail(`「${field.label}」需要有效的 http/https 链接`); }
        catch { fail(`「${field.label}」需要有效的 http/https 链接`); }
      }
      result[field.id] = value;
    }
  }
  return result;
}

function derive(row: RecordRow, design: Design, behavior: Behavior): RecordRow {
  const values: Record<string, RecordValue> = {};
  for (const field of design.fields) values[field.id] = structuredClone(row.values[field.id] ?? empty(field));
  const computed = new Map(behavior.calculations.map(field => [field.id, field]));
  function fieldValue(id: string): RecordValue {
    if (Object.hasOwn(values, id)) return values[id];
    const field = computed.get(id);
    if (!field) return fail(`找不到字段：${id}`);
    try { values[id] = evaluate(field.expression); return values[id]; }
    catch (error) { return fail(`「${field.label}」计算失败：${error instanceof Error ? error.message : String(error)}`); }
  }
  function evaluate(expr: Expr): RecordValue {
    if (expr.op === "literal") return structuredClone(expr.value);
    if (expr.op === "field") return fieldValue(expr.id);
    if (expr.op === "if") return evaluate(expr.condition) ? evaluate(expr.then) : evaluate(expr.else);
    const left = evaluate(expr.left), right = evaluate(expr.right);
    if (expr.op === "concat") return String(left) + String(right);
    if (expr.op === "equal") return Array.isArray(left) && Array.isArray(right) ? left.length === right.length && left.every((value, index) => value === right[index]) : left === right;
    if (typeof left !== "number" || typeof right !== "number") return fail("参与运算的值必须为数字");
    if (expr.op === "gt") return left > right;
    if (expr.op === "divide" && right === 0) return fail("除数不能为 0");
    const value = expr.op === "add" ? left + right : expr.op === "subtract" ? left - right : expr.op === "multiply" ? left * right : left / right;
    if (!Number.isFinite(value)) return fail("计算结果超出有限数字范围");
    return value;
  }
  for (const field of behavior.calculations) fieldValue(field.id);
  return { id: row.id, values, revision: row.revision };
}

/** RFC 4180-style cells, including escaped quotes and embedded newlines. */
function parseCsv(input: string): string[][] {
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  function finishCell() { row.push(cell); cell = ""; closed = false; }
  function finishRow() { finishCell(); rows.push(row); row = []; }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else cell += char;
      continue;
    }
    if (char === ",") { finishCell(); continue; }
    if (char === "\n" || char === "\r") { if (char === "\r" && source[index + 1] === "\n") index += 1; finishRow(); continue; }
    if (closed) fail("CSV 引号闭合后只能接逗号或换行");
    if (char === '"') { if (cell.length) fail("CSV 单元格中的引号必须转义"); quoted = true; }
    else cell += char;
  }
  if (quoted) fail("CSV 存在未闭合的引号");
  if (cell.length || closed || row.length) finishRow();
  return rows;
}
function csvCell(value: RecordValue): string {
  let text = Array.isArray(value) ? JSON.stringify(value) : String(value);
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(value)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csvValue(cell: string, field: Field): unknown {
  if (cell === "") return undefined;
  if (field.type === "number") { const value = Number(cell); if (!cell.trim() || !Number.isFinite(value)) fail(`「${field.label}」的 CSV 值必须为数字`); return value; }
  if (field.type === "boolean") { if (cell === "true") return true; if (cell === "false") return false; return fail(`「${field.label}」的 CSV 值必须为 true 或 false`); }
  if (field.type === "tags") {
    try { return JSON.parse(cell) as unknown; }
    catch { return fail(`「${field.label}」的 CSV 标签必须是 JSON 文字数组，例如 ["工作","收藏"]`); }
  }
  return cell;
}

export class RecordStore {
  private readonly key: string;
  private readonly design: Design;
  private readonly behavior: Behavior;
  constructor(private readonly storage: PluginPrivateStorage, namespace: string, design: Design, behavior: Behavior) {
    if (!storage.compareAndSet) throw new BuilderError("storage_unavailable", "记录保存需要支持 compareAndSet 的私有存储");
    if (!namespace.trim()) throw new BuilderError("invalid_input", "记录空间不能为空");
    this.key = `plugin-builder:records:${namespace}`;
    this.design = parseDesign(design); this.behavior = parseBehavior(behavior, this.design);
  }
  private read(): { raw: string | null; rows: RecordRow[] } {
    const raw = this.storage.get(this.key);
    return { raw, rows: raw === null ? [] : JSON.parse(raw) as RecordRow[] };
  }
  private write(raw: string | null, rows: RecordRow[]): void {
    if (!this.storage.compareAndSet!(this.key, raw, JSON.stringify(rows))) conflict();
  }
  list(query?: { search?: string; tag?: string }): RecordRow[] {
    const search = query?.search?.trim().toLocaleLowerCase(), tag = query?.tag;
    return this.read().rows.map(row => derive(row, this.design, this.behavior)).filter(row => {
      const values = Object.values(row.values);
      return (!search || values.some(value => String(value).toLocaleLowerCase().includes(search)))
        && (!tag || values.some(value => Array.isArray(value) && value.includes(tag)));
    });
  }
  save(values: unknown, id?: string, expectedRevision?: number): RecordRow {
    const { raw, rows } = this.read();
    const existing = id === undefined ? undefined : rows.find(row => row.id === id);
    if (id !== undefined && !existing) throw new BuilderError("not_found", "找不到这条记录");
    if (existing && existing.revision !== expectedRevision) conflict();
    const row: RecordRow = { id: existing?.id ?? randomUUID(), values: validateValues(values, this.design), revision: existing ? existing.revision + 1 : 1 };
    const result = derive(row, this.design, this.behavior);
    if (existing) rows[rows.indexOf(existing)] = row; else rows.push(row);
    this.write(raw, rows); return result;
  }
  remove(id: string, expectedRevision: number): boolean {
    const { raw, rows } = this.read(), index = rows.findIndex(row => row.id === id);
    if (index < 0) throw new BuilderError("not_found", "找不到这条记录");
    if (rows[index].revision !== expectedRevision) conflict();
    rows.splice(index, 1); this.write(raw, rows); return true;
  }
  importCsv(csv: string): RecordRow[] {
    if (!this.behavior.allowImport) throw new BuilderError("not_allowed", "此插件未启用 CSV 导入");
    if (typeof csv !== "string") fail("CSV 必须为文字");
    const [header, ...data] = parseCsv(csv);
    if (!header?.length) fail("CSV 缺少字段标题行");
    if (new Set(header).size !== header.length) fail("CSV 字段标题不能重复");
    if (data.length > 2000) fail("每次最多导入 2000 条记录");
    const fields = new Map(this.design.fields.map(field => [field.id, field]));
    const computedIds = new Set(this.behavior.calculations.map(field => field.id));
    for (const id of header) if (!fields.has(id) && !computedIds.has(id)) fail(`CSV 包含未知字段：${id}`);
    for (const field of this.design.fields) if (field.required && !header.includes(field.id)) fail(`CSV 缺少必填字段：${field.label}`);
    const { raw, rows } = this.read();
    const added: RecordRow[] = data.map((cells, index) => {
      try {
        if (cells.length !== header.length) fail("单元格数量与标题行不同");
        const values: Record<string, unknown> = {};
        header.forEach((id, column) => { const field = fields.get(id); if (field) values[id] = csvValue(cells[column], field); });
        const row = { id: randomUUID(), values: validateValues(values, this.design), revision: 1 };
        derive(row, this.design, this.behavior); return row;
      } catch (error) { return fail(`CSV 第 ${index + 2} 行：${error instanceof Error ? error.message : String(error)}`); }
    });
    // A failed row or concurrent writer leaves the entire import unapplied.
    this.write(raw, [...rows, ...added]);
    return added.map(row => derive(row, this.design, this.behavior));
  }
  exportCsv(ids?: string[]): string {
    if (!this.behavior.allowExport) throw new BuilderError("not_allowed", "此插件未启用 CSV 导出");
    const all = this.list(), byId = new Map(all.map(row => [row.id, row]));
    const rows = ids === undefined ? all : ids.map(id => {
      const row = byId.get(id); if (!row) throw new BuilderError("not_found", `导出失败：找不到记录 ${id}`); return row;
    });
    const header = [...this.design.fields, ...this.behavior.calculations].map(field => field.id);
    return "\uFEFF" + [header.map(csvCell).join(","), ...rows.map(row => header.map(id => csvCell(row.values[id])).join(","))].join("\r\n") + "\r\n";
  }
  summary(): { count: number; totals: Record<string, number> } {
    const rows = this.list(), totals: Record<string, number> = {};
    for (const [id, type] of calculationTypes(this.design.fields, this.behavior.calculations)) {
      if (type === "number") totals[id] = rows.reduce((total, row) => total + (row.values[id] as number), 0);
    }
    return { count: rows.length, totals };
  }
}
