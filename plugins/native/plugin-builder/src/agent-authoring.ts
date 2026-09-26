/**
 * The designer writes a compact, forgiving authoring format; the host expands it into the strict contract,
 * component plans and browser acceptance that everything downstream checks. Normalization only maps known
 * variants of the same meaning and records what it dropped; it never invents behavior. The expanded result
 * still goes through the strict validators (`validateAgentDesign`, `assertContract`).
 */
import type { SandboxEffects, SandboxJson, SandboxOperationContract, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginComponentIntent, PluginComponentPlan, PluginInputValue, PluginOperationBinding } from '@molis-ai/molis-work-design-system';
import type { AgentDesign, AgentProposal, BrowserAcceptance } from './agent-model.js';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export class AuthoringError extends Error { constructor(message: string) { super(message); this.name = 'AuthoringError'; } }
const fail = (where: string, message: string): never => { throw new AuthoringError(where + '：' + message); };
const ID = /^[a-z][a-z0-9_.-]{0,99}$/, FIELD = /^[a-zA-Z_][a-zA-Z0-9_]{0,99}$/;
/** Lowercase ASCII identifiers; other text becomes a stable slug so a model's casing does not fail a design. */
export function slug(value: unknown, where: string): string {
  const raw = text(value); if (!raw) fail(where, '缺少标识');
  const id = raw.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 100);
  if (!ID.test(id)) fail(where, `标识「${raw}」必须是英文小写字母开头的字母、数字、点或连字符`);
  return id;
}
const pick = (value: Json, ...keys: string[]) => { for (const key of keys) if (value[key] !== undefined) return value[key]; return undefined; };

/* ---------------- types ---------------- */
const SCHEMA_KEYS = new Set(['type', 'description', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'format', 'minimum', 'maximum']);
const SCALARS: Record<string, SandboxSchema> = {
  string: { type: 'string' }, text: { type: 'string' }, number: { type: 'number' }, integer: { type: 'integer' }, int: { type: 'integer' },
  boolean: { type: 'boolean' }, bool: { type: 'boolean' }, date: { type: 'string', format: 'date' }, datetime: { type: 'string', format: 'date-time' },
  'date-time': { type: 'string', format: 'date-time' }, url: { type: 'string', format: 'uri' }, uri: { type: 'string', format: 'uri' }, null: { type: 'null' },
};
/**
 * `string`, `string(1..500) 笔记内容`, `integer(0..5)`, `date`, `url`, `string[]`, `未读|在读|已读`, `enum(a|b)`,
 * nested objects (`{ "note?": "string" }` marks optional keys) and arrays (`[{ ... }]`). A real JSON Schema is accepted too.
 */
export function expandType(spec: unknown, where: string, dropped: string[] = []): SandboxSchema {
  if (typeof spec === 'string') {
    const source = spec.trim(), space = source.search(/\s/);
    const token = space < 0 ? source : source.slice(0, space), description = space < 0 ? '' : source.slice(space + 1).trim();
    const with_ = (schema: SandboxSchema): SandboxSchema => description ? { ...schema, description: description.slice(0, 200) } : schema;
    const list = /^(.*)\[\]$/.exec(token);
    if (list) return with_({ type: 'array', items: expandType(list[1]!, where, dropped) });
    const enumeration = /^enum\((.+)\)$/.exec(token)?.[1] ?? (token.includes('|') ? token : undefined);
    if (enumeration) { const values = enumeration.split('|').map(item => item.trim()).filter(Boolean); if (values.length < 2) fail(where, '枚举至少需要两个取值'); return with_({ type: 'string', enum: [...new Set(values)] }); }
    if (token === 'enum') fail(where, '枚举写成 A|B|C，例如 "餐饮|交通|购物|其他"');
    // number(>0), integer(>=1,<=5), string(YYYY-MM): bounds become limits, anything else a hint for whoever fills it in.
    const hinted = /^([a-z-]+)\((.+)\)$/.exec(token);
    if (hinted && SCALARS[hinted[1]!] && !/^\s*-?\d*(?:\.\d+)?\s*\.\.\s*-?\d*(?:\.\d+)?\s*$/.test(hinted[2]!)) {
      const schema: SandboxSchema = { ...SCALARS[hinted[1]!]! }, hints: string[] = [];
      for (const part of hinted[2]!.split(/[,，]/).map(item => item.trim()).filter(Boolean)) {
        const bound = /^(>=|>|<=|<)\s*(-?\d+(?:\.\d+)?)$/.exec(part);
        if (!bound || (schema.type !== 'number' && schema.type !== 'integer')) { hints.push(part); continue; }
        const value = Number(bound[2]), whole = schema.type === 'integer';
        if (bound[1] === '>') { schema.minimum = whole ? value + 1 : value; if (!whole) hints.push('大于 ' + value); }
        else if (bound[1] === '>=') schema.minimum = value;
        else if (bound[1] === '<') { schema.maximum = whole ? value - 1 : value; if (!whole) hints.push('小于 ' + value); }
        else schema.maximum = value;
      }
      const note = [description, hints.join('，')].filter(Boolean).join('，');
      return note ? { ...schema, description: note.slice(0, 200) } : schema;
    }
    const match = /^([a-z-]+)(?:\(\s*(-?\d+(?:\.\d+)?)?\s*\.\.\s*(-?\d+(?:\.\d+)?)?\s*\))?$/.exec(token);
    const base = match ? SCALARS[match[1]!] : undefined;
    if (!match || !base) return fail(where, `无法识别的类型「${token}」，可用 string / integer / number / boolean / date / datetime / url / A|B 枚举 / 类型[]`);
    const schema: SandboxSchema = { ...base };
    const [low, high] = [match[2], match[3]].map(value => value === undefined ? undefined : Number(value));
    if (low !== undefined || high !== undefined) {
      if (schema.type === 'string' && !schema.format) { if (low !== undefined) schema.minLength = Math.max(0, Math.floor(low)); if (high !== undefined) schema.maxLength = Math.floor(high); }
      else if (schema.type === 'number' || schema.type === 'integer') { if (low !== undefined) schema.minimum = low; if (high !== undefined) schema.maximum = high; }
      else fail(where, `「${token}」不能带范围`);
    }
    return with_(schema);
  }
  if (Array.isArray(spec)) {
    if (spec.length === 1) return { type: 'array', items: expandType(spec[0], where + '[]', dropped) };
    if (spec.length > 1 && spec.every(item => typeof item === 'string')) return { type: 'string', enum: [...new Set(spec as string[])] };
    return fail(where, '数组类型写成只含一个元素类型的数组，例如 [{ "id": "string" }]');
  }
  if (!object(spec)) return fail(where, '缺少类型');
  if (typeof spec.type === 'string' && ['null', 'boolean', 'number', 'integer', 'string', 'array', 'object'].includes(spec.type)) return normalizeSchema(spec, where, dropped);
  const properties: Record<string, SandboxSchema> = {}, required: string[] = [];
  for (const [rawKey, value] of Object.entries(spec)) {
    const optional = rawKey.endsWith('?'), key = optional ? rawKey.slice(0, -1) : rawKey;
    if (!FIELD.test(key)) fail(where, `字段名「${key}」必须是英文字母开头的字母、数字或下划线`);
    properties[key] = expandType(value, where + '.' + key, dropped);
    if (!optional) required.push(key);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}
function normalizeSchema(spec: Json, where: string, dropped: string[]): SandboxSchema {
  const result: Json = {};
  for (const [key, value] of Object.entries(spec)) {
    if (!SCHEMA_KEYS.has(key)) { dropped.push(`${where} 的 ${key}`); continue; }
    result[key] = value;
  }
  if (result.type === 'object') {
    const properties: Record<string, SandboxSchema> = {};
    for (const [key, value] of Object.entries(object(result.properties) ? result.properties : {})) {
      if (!FIELD.test(key)) fail(where, `字段名「${key}」必须是英文字母开头的字母、数字或下划线`);
      properties[key] = expandType(value, where + '.' + key, dropped);
    }
    result.properties = properties;
    result.required = Array.isArray(result.required) ? (result.required as unknown[]).filter((key): key is string => typeof key === 'string' && key in properties) : [];
    result.additionalProperties = false;
  }
  if (result.type === 'array') result.items = expandType(result.items ?? 'string', where + '[]', dropped);
  return result as unknown as SandboxSchema;
}
const emptyObject: SandboxSchema = { type: 'object', properties: {}, required: [], additionalProperties: false };

/* ---------------- operations ---------------- */
function kindOf(value: unknown, where: string): 'query' | 'command' {
  const raw = text(value).toLowerCase();
  if (['query', 'read', 'get', 'list'].includes(raw)) return 'query';
  if (['command', 'write', 'mutation', 'action', 'create', 'update', 'delete'].includes(raw)) return 'command';
  return fail(where, 'kind 只能是 query（只读）或 command（会改数据）');
}
/** Storage and the declared platform abilities; a command that writes its storage also reads it. */
export function normalizeEffects(raw: unknown, kind: 'query' | 'command', where: string): SandboxEffects {
  const effects: Record<string, Set<string>> = {};
  const add = (key: string, value: string) => { (effects[key] ??= new Set()).add(value); };
  const storage = (value: unknown) => {
    const values = Array.isArray(value) ? value.map(String) : value === true ? ['read', 'write'] : typeof value === 'string' ? (value === 'rw' || value === 'read-write' ? ['read', 'write'] : [value]) : [];
    for (const item of values) { if (item !== 'read' && item !== 'write') fail(where, `存储权限只能是 read 或 write，不能是「${item}」`); add('storage', item); }
  };
  if (Array.isArray(raw)) for (const item of raw) {
    const value = text(item); if (!value) continue;
    const [key, rest] = value.split(/[.:]/, 2) as [string, string | undefined];
    if (key === 'storage') storage(rest ?? (kind === 'command' ? 'rw' : 'read'));
    else if (key === 'network' && rest) add('networkDomains', rest);
    else add('capabilities', value);
  } else if (object(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const list = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
      if (key === 'storage') storage(value);
      else if (['capabilities', 'events', 'artifacts', 'resources', 'secretRefs'].includes(key)) for (const item of list) add(key, item);
      else if (['networkDomains', 'network', 'domains'].includes(key)) for (const item of list) add('networkDomains', item);
      else if (key === 'secrets') for (const item of list) add('secretRefs', item);
      else fail(where, `未知的副作用「${key}」`);
    }
  } else if (raw !== undefined) fail(where, '副作用写成 {"storage":["read","write"]} 这样的对象');
  if (effects.storage?.has('write')) add('storage', 'read');
  if (kind === 'query' && (effects.storage?.has('write') || effects.events?.size)) fail(where, '查询（query）不能写入存储或发布事件；会改数据的操作用 command');
  // Reads run on their own whenever the page opens; a model call there would cost the person on every visit.
  if (kind === 'query' && effects.capabilities?.has('model.generate')) fail(where, '查询（query）不能调用模型：打开页面就会自动调用、产生费用；调用模型放进 command，由按钮触发，回答存下来再由 query 列出');
  return Object.fromEntries(Object.entries(effects).map(([key, values]) => [key, [...values].sort()])) as SandboxEffects;
}
function normalizeErrors(raw: unknown, where: string): SandboxOperationContract['errors'] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return fail(where, 'errors 写成数组');
  return raw.map((item, index) => {
    if (typeof item === 'string') { const [code, ...rest] = item.split(':'); return { code: slugCode(code!, where), description: rest.join(':').trim() || code!.trim() }; }
    if (!object(item)) return fail(where + ` 第 ${index + 1} 个错误`, '需要 code 和说明');
    return { code: slugCode(item.code, where), description: text(pick(item, 'description', 'when', 'message', 'reason')) || text(item.code) };
  });
}
const slugCode = (value: unknown, where: string) => { const code = text(value).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 128); if (!/^[a-zA-Z0-9]/.test(code)) fail(where, '错误代码必须是英文'); return code; };
/** Date-like strings (2026-09, 2026-09-26, 2026-09-26T10:00…) anywhere in a value. */
function datesIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string' && /^\d{4}-\d{2}(?:-\d{2}(?:[T ]\d{2}:\d{2}.*)?)?$/.test(value.trim())) found.push(value.trim());
  else if (Array.isArray(value)) for (const item of value) datesIn(item, found);
  else if (object(value)) for (const item of Object.values(value)) datesIn(item, found);
  return found;
}
/** An example runs at every check; a date it expects must come from its own input, never from today. */
function timeless(expected: unknown, input: unknown, at: string) {
  const typed = (value: unknown): string | undefined => typeof value === 'string' && /^(?:string|number|integer|boolean|date|datetime|url)(?:\(.*\))?(?:\s.*)?$/.test(value.trim()) ? value.trim()
    : Array.isArray(value) ? value.map(typed).find(Boolean) : object(value) ? Object.values(value).map(typed).find(Boolean) : undefined;
  const word = typed(expected);
  if (word) fail(at, `示例的期望结果里写的是类型「${word}」，示例要写一个具体的值；这个值会变（比如当前月份）就去掉这个字段`);
  const given = new Set(datesIn(input)), pinned = datesIn(expected).filter(date => !given.has(date));
  if (pinned.length) fail(at, `示例的期望结果写了具体日期「${pinned[0]}」，但示例在每次检查时运行，当前日期每天都在变（代码只能把它写死）：去掉这个字段，或者让调用方在输入里给出日期再原样核对`);
}
/** Top-level fields of a partial expectation that no check can meet; they are dropped with a note. */
function settle(expected: unknown, input: unknown, at: string, dropped: string[]): unknown {
  if (!object(expected)) return expected;
  const given = new Set(datesIn(input)), kept: Json = {};
  for (const [key, value] of Object.entries(expected)) {
    const typeName = typeof value === 'string' && /^(?:string|number|integer|boolean|date|datetime|url)(?:\(.*\))?(?:\s.*)?$/.test(value.trim());
    const today = typeof value === 'string' && datesIn(value).length > 0 && !given.has(value.trim());
    if (typeName || today) dropped.push(`${at} 的 ${key}（${typeName ? '写成了类型名' : '依赖当天日期'}，检查时无法满足，已去掉）`); else kept[key] = value;
  }
  return kept;
}
function normalizeExamples(raw: unknown, operation: Omit<SandboxOperationContract, 'examples'>, where: string, dropped: string[] = []): SandboxOperationContract['examples'] {
  if (!Array.isArray(raw) || !raw.length) return fail(where, '每个操作至少写一个示例 {"input":…, "output":…}');
  return raw.map((item, index) => {
    const at = where + ` 第 ${index + 1} 个示例`;
    if (!object(item)) return fail(at, '示例写成 {"input":…, "output":…}');
    const input = (item.input === undefined && operation.input.type === 'object' ? {} : item.input) as SandboxJson;
    const error = pick(item, 'error', 'errorCode');
    if (error !== undefined) return { input, error: text(error) };
    const includes = pick(item, 'includes', 'outputIncludes', 'expect');
    if (includes !== undefined) { const settled = settle(includes, input, at, dropped); timeless(settled, input, at); return { input, outputIncludes: settled as SandboxJson }; }
    if (!('output' in item)) return fail(at, '需要 output、includes 或 error 之一');
    // Each operation's examples run in order on that operation's own empty store.
    if (operation.kind === 'query' && Array.isArray(item.output) && item.output.length)
      fail(at, '查询示例在空存储上运行，只能返回空列表；需要已有数据的情况写进验收（acceptance）');
    timeless(item.output, input, at);
    return { input, output: item.output as SandboxJson };
  });
}
function normalizeOperation(raw: unknown, index: number, dropped: string[], withExamples: boolean): SandboxOperationContract {
  const where = `第 ${index + 1} 个操作`;
  if (!object(raw)) return fail(where, '操作写成对象');
  const id = slug(pick(raw, 'id', 'name', 'operationId'), where), at = `操作 ${id}`;
  const kind = kindOf(raw.kind, at);
  const input = raw.input === undefined || (object(raw.input) && !Object.keys(raw.input).length) ? emptyObject : expandType(raw.input, at + ' 的 input', dropped);
  if (input.type !== 'object') fail(at, 'input 必须是对象（字段表）');
  const output = raw.output === undefined ? { type: 'null' as const } : expandType(raw.output, at + ' 的 output', dropped);
  const base = { id, kind, description: text(raw.description).slice(0, 300) || id, input, output,
    errors: normalizeErrors(raw.errors, at), effects: normalizeEffects(pick(raw, 'effects', 'uses'), kind, at) };
  return { ...base, examples: withExamples ? normalizeExamples(raw.examples, base, at, dropped) : [] };
}

/* ---------------- interface parts ---------------- */
const INTENTS: Record<string, PluginComponentIntent> = {
  heading: 'heading', title: 'heading', header: 'heading', description: 'description', text: 'description', paragraph: 'description',
  input: 'input', form: 'input', editor: 'input', action: 'action', button: 'action', collection: 'collection', list: 'collection', table: 'collection',
  cards: 'collection', reading: 'reading', reader: 'reading', conversation: 'conversation', chat: 'conversation', evidence: 'evidence', matrix: 'evidence',
  schedule: 'schedule', calendar: 'schedule', feedback: 'feedback', notice: 'feedback', status: 'feedback',
};
const PROPS = ['title', 'description', 'submitLabel', 'emptyText', 'idField', 'titleField', 'textField', 'roleField', 'hintLevelField', 'citationsField', 'columns'] as const;
function intentOf(value: unknown, where: string): PluginComponentIntent {
  const intent = INTENTS[text(value).toLowerCase()];
  return intent ?? fail(where, `intent「${text(value)}」不在组件池里，可用 heading / description / input / action / collection / reading / conversation / evidence / schedule / feedback`);
}
function source(raw: unknown, field: string, where: string): PluginInputValue {
  if (typeof raw === 'string') {
    if (raw === 'form' || raw === 'form?') return { source: 'form', field };
    const dotted = /^form[.:]([a-zA-Z_]\w*)\??$/.exec(raw); if (dotted) return { source: 'form', field: dotted[1]! };
    const form = /^form:([a-zA-Z_][\w]*)$/.exec(raw); if (form) return { source: 'form', field: form[1]! };
    // A field the person can still edit, filled from another part's result or chosen record.
    const prefill = /^prefill:([a-z][a-z0-9_.-]*)\.([a-zA-Z_][\w]*)$/.exec(raw); if (prefill) return { source: 'form', field, prefill: { componentId: prefill[1]!, field: prefill[2]! } };
    const selection = /^selection:([a-z][a-z0-9_.-]*)\.([a-zA-Z_][\w.]*)$/.exec(raw); if (selection) return { source: 'selection', componentId: selection[1]!, field: selection[2]! };
    return { source: 'literal', value: raw };
  }
  if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) return { source: 'literal', value: raw };
  if (object(raw)) {
    if ('value' in raw) return { source: 'literal', value: raw.value as SandboxJson };
    if (raw.from === 'selection' || raw.source === 'selection') return { source: 'selection', componentId: slug(pick(raw, 'component', 'componentId'), where), field: text(raw.field) || field };
    if (raw.from === 'form' || raw.source === 'form') {
      const prefill = text(raw.prefill), [component, prefillField] = prefill.split('.');
      return { source: 'form', field: text(raw.field) || field, ...(component && prefillField ? { prefill: { componentId: component, field: prefillField } } : {}) };
    }
  }
  return fail(where, `字段 ${field} 的来源写成 "form"、"selection:组件.字段" 或 {"value": 常量}`);
}
/** `formDefaults`: an input form fills every field it does not bind otherwise; an action binds only what it names. */
function binding(raw: unknown, mode: 'read' | 'submit', operations: SandboxOperationContract[], where: string, formDefaults = false): PluginOperationBinding | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const spec = typeof raw === 'string' ? { op: raw } : object(raw) ? raw : fail(where, `${mode} 写成操作标识或 {"op": 操作标识}`);
  const operationId = slug(pick(spec as Json, 'op', 'operation', 'operationId'), where);
  const operation = operations.find(item => item.id === operationId) ?? fail(where, `${mode} 绑定了不存在的操作 ${operationId}`);
  const declared = object((spec as Json).input) ? (spec as Json).input as Json : {};
  const input: Record<string, PluginInputValue> = {};
  for (const field of Object.keys(operation.input.properties ?? {})) {
    if (declared[field] !== undefined) input[field] = source(declared[field], field, where);
    else if (mode === 'submit' && ((spec as Json).input === undefined || formDefaults)) input[field] = { source: 'form', field };
  }
  const path = text(pick(spec as Json, 'show', 'path', 'outputPath'));
  return { operationId, input, ...(path ? { outputPath: path } : {}) };
}
function normalizePart(raw: unknown, pageId: string, operations: SandboxOperationContract[], dropped: string[], sketch: boolean): PluginComponentPlan {
  if (!object(raw)) return fail(`页面 ${pageId}`, '组件写成对象');
  const id = slug(pick(raw, 'id', 'componentId'), `页面 ${pageId} 的组件`), where = `组件 ${id}`;
  const intent = intentOf(pick(raw, 'intent', 'kind', 'type'), where);
  const props: Json = {};
  for (const [key, value] of Object.entries(object(raw.props) ? raw.props : {})) {
    if (!(PROPS as readonly string[]).includes(key)) { dropped.push(`${where} 的 ${key}`); continue; }
    if (key === 'columns') props.columns = (Array.isArray(value) ? value : []).map(column => typeof column === 'string' ? { field: column, label: column } : object(column) ? { field: text(column.field), label: text(column.label) || text(column.field), ...(object(column.values) ? { values: Object.fromEntries(Object.entries(column.values).map(([key, value]) => [key, text(value).slice(0, 60)])) } : {}) } : null).filter(Boolean);
    else if (typeof value === 'string' && value.trim()) props[key] = value.slice(0, 2000);
  }
  for (const key of Object.keys(raw)) if (!['id', 'componentId', 'intent', 'kind', 'type', 'purpose', 'label', 'props', 'read', 'submit', 'uses', 'page', 'pageId', 'region', 'regionId'].includes(key)) dropped.push(`${where} 的 ${key}`);
  const uses = sketch ? text(raw.uses) : '';
  const usesOperation = uses ? operations.find(item => item.id === slug(uses, where)) : undefined;
  const read = binding(raw.read ?? (usesOperation?.kind === 'query' && !usesOperation.input.required?.length ? usesOperation.id : undefined), 'read', operations, where);
  // A sketched action acts on a selection the proposal does not spell out yet, so it shows no form fields.
  const submit = binding(raw.submit ?? (usesOperation?.kind === 'command' ? intent === 'action' ? { op: usesOperation.id, input: {} } : usesOperation.id : undefined), 'submit', operations, where, intent === 'input');
  return { id, pageId, regionId: 'main', intent, purpose: text(pick(raw, 'purpose', 'label', 'description')).slice(0, 600) || id, props: props as PluginComponentPlan['props'],
    ...(read ? { read } : {}), ...(submit ? { submit } : {}) };
}
/** Pages carry their parts; a model that lists parts separately with a pageId gets them grouped the same way. */
function withParts(pages: unknown, parts: unknown): unknown {
  if (!Array.isArray(parts) || !parts.length) return pages;
  const list = Array.isArray(pages) && pages.length ? pages : [{ id: 'home', title: '' }];
  return list.map((page, index) => {
    if (!object(page) || Array.isArray(page.parts)) return page;
    const id = text(page.id);
    return { ...page, parts: parts.filter(part => object(part) && (text(pick(part, 'pageId', 'page')) === id || !pick(part, 'pageId', 'page') && index === 0)) };
  });
}
function normalizePages(raw: unknown, operations: SandboxOperationContract[], dropped: string[], sketch: boolean): { pages: SandboxPluginContract['pages']; parts: PluginComponentPlan[] } {
  const list = Array.isArray(raw) ? raw : fail('界面', 'pages 写成数组，每页列出它的组件 parts');
  if (!list.length || list.length > 12) fail('界面', '需要 1–12 个页面');
  const pages: SandboxPluginContract['pages'] = [], parts: PluginComponentPlan[] = [];
  for (const [index, page] of list.entries()) {
    if (!object(page)) fail(`第 ${index + 1} 个页面`, '页面写成对象');
    const id = slug((page as Json).id ?? 'page' + (index + 1), `第 ${index + 1} 个页面`);
    const own = (Array.isArray((page as Json).parts) ? (page as Json).parts : (page as Json).components) as unknown[] | undefined;
    if (!Array.isArray(own) || !own.length) fail(`页面 ${id}`, '每页至少一个组件');
    const pageParts = own!.map(part => normalizePart(part, id, operations, dropped, sketch));
    parts.push(...pageParts);
    const operationIds = [...new Set(pageParts.flatMap(part => [part.read?.operationId, part.submit?.operationId]).filter((value): value is string => !!value))];
    pages.push({ id, title: text((page as Json).title) || id, regions: [{ id: 'main', title: text((page as Json).title) || id, operationIds }] });
  }
  if (new Set(parts.map(part => part.id)).size !== parts.length) fail('界面', '组件标识重复');
  return { pages, parts };
}

/* ---------------- acceptance ---------------- */
const unquote = (value: string) => value.trim().replace(/^["'“「](.*)["'”」]$/, '$1');
function literal(value: string): string | boolean { const v = unquote(value); return v === 'true' ? true : v === 'false' ? false : v; }
export function parseStep(raw: unknown, parts: PluginComponentPlan[], where: string): BrowserAcceptance['steps'][number] {
  const formField = (componentId: string) => { const part = parts.find(item => item.id === componentId); const fields = [...Object.values(part?.read?.input ?? {}), ...Object.values(part?.submit?.input ?? {})].filter(item => item.source === 'form').map(item => (item as { field: string }).field); return fields.length === 1 ? fields[0] : undefined; };
  if (typeof raw === 'string') {
    const s = raw.trim(); let m: RegExpExecArray | null;
    if (s === 'reload') return { action: 'reload' };
    if ((m = /^page\s+(\S+)$/.exec(s))) return { action: 'page', pageId: slug(m[1], where) };
    if ((m = /^fill\s+([a-z][a-z0-9_.-]*?)(?:\.([a-zA-Z_]\w*))?\s*=\s*([\s\S]+)$/.exec(s))) {
      const componentId = m[1]!, field = m[2] ?? formField(componentId) ?? fail(where, `「${s}」要写成 fill 组件.字段 = 值`);
      return { action: 'fill', componentId, field, value: literal(m[3]!) };
    }
    if ((m = /^submit\s+(\S+)$/.exec(s))) return { action: 'submit', componentId: m[1]! };
    if ((m = /^select\s+(\S+)\s+#(\S+)$/.exec(s))) return { action: 'select', componentId: m[1]!, recordId: m[2]! };
    if ((m = /^select\s+(\S+)\s+([\s\S]+)$/.exec(s))) return { action: 'select', componentId: m[1]!, text: unquote(m[2]!) };
    if ((m = /^expect\s+(\S+)\s+([\s\S]+?)\s+before\s+([\s\S]+)$/.exec(s))) return { action: 'expectOrder', componentId: m[1]!, texts: [unquote(m[2]!), ...m[3]!.split(/\s+before\s+/).map(unquote)] };
    if ((m = /^expect\s+([a-z][a-z0-9_.-]*?)\.([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/.exec(s))) return { action: 'expectValue', componentId: m[1]!, field: m[2]!, value: literal(m[3]!) };
    if ((m = /^(?:expect-not|expect\s+not)\s+(\S+)\s+(?:contains\s+|包含\s*|显示\s*)?([\s\S]+)$/.exec(s)) || (m = /^expect\s+(\S+)\s+(?:lacks|without)\s+([\s\S]+)$/.exec(s))) return { action: 'expectAbsent', componentId: m[1]!, text: unquote(m[2]!) };
    if ((m = /^expect\s+(\S+)\s+(?:contains\s+|shows\s+|包含\s*|显示\s*)?([\s\S]+)$/.exec(s))) return { action: 'expect', componentId: m[1]!, text: unquote(m[2]!) };
    if (/^expect(?:-not)?\s+\S+$/.test(s)) return fail(where, `「${s}」缺少期望的文字：写成 ${s} 要出现的文字`);
    return fail(where, `看不懂的验收步骤「${s}」`);
  }
  if (!object(raw)) return fail(where, '验收步骤写成一行文字，例如 "submit editor"');
  const action = text(raw.action), componentId = text(pick(raw, 'componentId', 'component'));
  if (action === 'reload') return { action: 'reload' };
  if (action === 'page') return { action: 'page', pageId: slug(pick(raw, 'pageId', 'page'), where) };
  if (action === 'fill') return { action: 'fill', componentId, field: text(raw.field) || formField(componentId) || fail(where, 'fill 需要字段'), value: typeof raw.value === 'boolean' ? raw.value : String(raw.value ?? '') };
  if (action === 'submit') return { action: 'submit', componentId };
  if (action === 'select') return raw.recordId ? { action: 'select', componentId, recordId: text(raw.recordId) } : { action: 'select', componentId, text: text(raw.text) };
  if (action === 'expect' && raw.field) return { action: 'expectValue', componentId, field: text(raw.field), value: typeof raw.value === 'boolean' ? raw.value : String(raw.value ?? '') };
  if (action === 'expect' || action === 'expectAbsent') return { action: raw.absent === true || action === 'expectAbsent' ? 'expectAbsent' : 'expect', componentId, text: text(raw.text) };
  return fail(where, `未知的验收步骤 ${action}`);
}
function normalizeAcceptance(raw: unknown, parts: PluginComponentPlan[]): { browser: BrowserAcceptance[]; contract: SandboxPluginContract['acceptance'] } {
  if (!Array.isArray(raw) || !raw.length) return fail('验收', '至少写一条从空数据开始、能在界面上走通的验收（acceptance）');
  const browser = raw.map((item, index) => {
    if (!object(item)) return fail(`第 ${index + 1} 条验收`, '写成 {"id":…, "description":…, "steps":[…]}');
    const id = slug(item.id ?? 'case' + (index + 1), `第 ${index + 1} 条验收`);
    const steps = Array.isArray(item.steps) ? item.steps.map((step, stepIndex) => parseStep(step, parts, `验收 ${id} 第 ${stepIndex + 1} 步`)) : fail(`验收 ${id}`, '缺少 steps');
    return { id, description: text(pick(item, 'description', 'title')) || id, steps };
  });
  const contract = browser.map(item => ({ id: item.id, description: item.description, steps: item.steps.map(step => ({ description: describeStep(step), expected: 'text' in step ? step.text ?? '完成' : 'texts' in step ? step.texts.join(' → ') : '完成' })) }));
  return { browser, contract };
}
function describeStep(step: BrowserAcceptance['steps'][number]): string {
  switch (step.action) {
    case 'page': return '打开页面 ' + step.pageId;
    case 'fill': return `在 ${step.componentId} 填写 ${step.field}`;
    case 'submit': return '提交 ' + step.componentId;
    case 'select': return '在 ' + step.componentId + ' 选择 ' + (step.text ?? step.recordId);
    case 'expect': return `${step.componentId} 显示「${step.text}」`;
    case 'expectAbsent': return `${step.componentId} 不再显示「${step.text}」`;
    case 'expectValue': return `${step.componentId}.${step.field} 为 ${String(step.value)}`;
    case 'expectOrder': return `${step.componentId} 中依次显示「${step.texts.join('」「')}」`;
    default: return '重新打开';
  }
}

/* ---------------- whole answers ---------------- */
/** A journey is a list of steps; one sentence with arrows or semicolons is the same list written inline. */
function steps(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => item.trim());
  if (typeof value === 'string') return value.split(/→|->|；|;|\n/).map(item => item.trim()).filter(Boolean);
  return [];
}
/** Stage one: product-level proposals, cheap to write and good enough to preview on the canvas. */
export function normalizeProposal(raw: unknown, index: number, pluginId: string, dropped: string[]): AgentProposal {
  const where = `方案 ${index + 1}`;
  if (!object(raw)) return fail(where, '方案写成对象');
  const id = slug(pick(raw, 'id', 'candidate-id', 'candidateId', 'key') ?? 'option' + (index + 1), where);
  const title = text(pick(raw, 'title', 'name')) || fail(where, '缺少标题');
  const journey = steps(pick(raw, 'journey', 'journal', 'steps', 'flow'));
  if (!journey.length) fail(`方案 ${id}`, 'journey 写成用户使用步骤的文字数组');
  const operationsRaw = Array.isArray(raw.operations) ? raw.operations : object(raw.contract) && Array.isArray((raw.contract as Json).operations) ? (raw.contract as Json).operations as unknown[] : fail(`方案 ${id}`, '缺少 operations');
  const operations = (operationsRaw as unknown[]).map((operation, operationIndex) => normalizeOperation(operation, operationIndex, dropped, false));
  if (new Set(operations.map(operation => operation.id)).size !== operations.length) fail(`方案 ${id}`, '操作标识重复');
  const { pages, parts } = normalizePages(withParts(raw.pages ?? (object(raw.contract) ? (raw.contract as Json).pages : undefined), raw.parts), operations, dropped, true);
  const effects: SandboxEffects = {};
  for (const operation of operations) for (const [key, values] of Object.entries(operation.effects)) (effects as Record<string, string[]>)[key] = [...new Set([...((effects as Record<string, string[]>)[key] ?? []), ...values])].sort();
  return { id, title: title.slice(0, 120), description: text(raw.description).slice(0, 1000), rationale: (text(pick(raw, 'rationale', 'reason', 'why')) || text(raw.description)).slice(0, 1000),
    journey: journey.map(step => step.slice(0, 300)).slice(0, 20), effects,
    preview: { contract: { version: 1, pluginId, revision: 'proposal-' + id, entities: [], pages, operations, acceptance: [] }, parts } };
}
/** Stage two (and revisions): the one chosen plugin in full, expanded into the strict design. */
export function expandDesign(raw: unknown, base: { id: string; title: string; description: string; rationale: string; journey: string[] }, pluginId: string, revision: string, dropped: string[]): AgentDesign {
  if (!object(raw)) return fail('细化方案', '写成对象 {"operations":…, "pages":…, "acceptance":…}');
  const design = object(raw.design) ? raw.design as Json : raw;
  const operationsRaw = Array.isArray(design.operations) ? design.operations : object(design.contract) && Array.isArray((design.contract as Json).operations) ? (design.contract as Json).operations as unknown[] : fail('细化方案', '缺少 operations');
  const operations = (operationsRaw as unknown[]).map((operation, index) => normalizeOperation(operation, index, dropped, true));
  if (new Set(operations.map(operation => operation.id)).size !== operations.length) fail('细化方案', '操作标识重复');
  const { pages, parts } = normalizePages(withParts(design.pages ?? (object(design.contract) ? (design.contract as Json).pages : undefined), design.parts), operations, dropped, false);
  // A part that only filters a query a list on the same page already shows is that list's own filter bar.
  const written = [...parts], merged = new Map<string, string>();
  for (const filter of written) {
    // Either it reads the query with inputs the person fills, or it "submits" the query a list already reads.
    const query = filter.read && !filter.submit ? filter.read : !filter.read && filter.submit && operations.find(item => item.id === filter.submit!.operationId)?.kind === 'query' ? filter.submit : undefined;
    const inputs = Object.entries(query?.input ?? {}).filter(([, source]) => source.source === 'form');
    if (!query || !inputs.length) continue;
    const list = parts.find(part => part !== filter && part.pageId === filter.pageId && part.read?.operationId === query.operationId && !Object.values(part.read.input).some(source => source.source === 'form'));
    if (!list) continue;
    list.read = { ...list.read!, input: { ...list.read!.input, ...Object.fromEntries(inputs) } };
    parts.splice(parts.indexOf(filter), 1); merged.set(filter.id, list.id);
    dropped.push(`组件 ${filter.id} 是列表 ${list.id} 的筛选，已并入列表上方的筛选栏`);
  }
  const used = new Set(parts.flatMap(part => [part.read?.operationId, part.submit?.operationId]));
  const unused = operations.filter(operation => !used.has(operation.id)).map(operation => operation.id);
  if (unused.length) fail('细化方案', `操作 ${unused.join('、')} 没有任何组件使用；删掉它，或给它一个组件`);
  const acceptance = normalizeAcceptance(design.acceptance ?? (object(design.contract) ? (design.contract as Json).acceptance : undefined), written);
  for (const test of acceptance.browser) {
    // Filling a filter is filling the list's filter bar; "submitting" it has nothing left to do.
    test.steps = test.steps.filter(step => !(step.action === 'submit' && merged.has(step.componentId)));
    for (const step of test.steps) if ('componentId' in step && merged.has(step.componentId)) step.componentId = merged.get(step.componentId)!;
  }
  const journey = steps(pick(design, 'journey', 'journal'));
  return { id: base.id, title: text(design.title) || base.title, description: text(design.description) || base.description, rationale: text(design.rationale) || base.rationale,
    journey: journey.length ? journey.slice(0, 20) : base.journey,
    contract: { version: 1, pluginId, revision, entities: [], pages, operations, acceptance: acceptance.contract }, parts, acceptance: acceptance.browser };
}
