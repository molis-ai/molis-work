/**
 * The designer writes a compact, forgiving authoring format; the host expands it into the strict contract,
 * component plans and browser acceptance that everything downstream checks. Normalization only maps known
 * variants of the same meaning and records what it dropped; it never invents behavior. The expanded result
 * still goes through the strict validators (`validateAgentDesign`, `assertContract`).
 */
import type { SandboxEffects, SandboxJson, SandboxOperationContract, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { pluginSchemaAt, type PluginComponentIntent, type PluginComponentPlan, type PluginInputValue, type PluginOperationBinding } from '@molis-ai/molis-work-design-system';
import type { AgentDesign, AgentProposal, BrowserAcceptance } from './agent-model.js';
import { MODEL_STAND_IN_PREFIX } from './agent-capabilities.js';

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
    // A hint in brackets may hold spaces ("string(YYYY-MM-DD HH:mm) 查询时间"): the type ends after its bracket.
    const source = spec.trim(), bracket = /^[a-z-]+\([^)]*\)/.exec(source)?.[0].length, space = bracket && /\s/.test(source.slice(0, bracket)) ? (source.slice(bracket).search(/\s/) < 0 ? -1 : bracket + source.slice(bracket).search(/\s/)) : source.search(/\s/);
    const token = space < 0 ? source : source.slice(0, space), description = space < 0 ? '' : source.slice(space + 1).trim();
    const with_ = (schema: SandboxSchema): SandboxSchema => description ? { ...schema, description: description.slice(0, 200) } : schema;
    const list = /^(.*)\[\]$/.exec(token);
    if (list) return with_({ type: 'array', items: expandType(list[1]!, where, dropped) });
    // "设计|阅读|产品", "enum(设计|阅读|产品)" and "string(设计|阅读|产品)" all mean one of these values.
    const enumeration = /^(?:enum|string)\((.+\|.+)\)$/.exec(token)?.[1] ?? /^enum\((.+)\)$/.exec(token)?.[1] ?? (token.includes('|') ? token : undefined);
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
  for (const [rawKey, written] of Object.entries(spec)) {
    // "month": "string?" (or "string?(YYYY-MM)") marks the field optional on its type rather than its name.
    const moved = typeof written === 'string' ? /^([a-z-]+(?:\([^)]*\))?)\?(.*)$/s.exec(written.trim()) : null, value = moved ? moved[1]! + moved[2]! : written;
    const optional = rawKey.endsWith('?') || !!moved, key = rawKey.endsWith('?') ? rawKey.slice(0, -1) : rawKey;
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
  const typed = (value: unknown): string | undefined => typeof value === 'string' && /^(?:string|number|integer|boolean|date|datetime|url|array|object|list)(?:\(.*\))?(?:\s.*)?$/.test(value.trim()) ? value.trim()
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
    const typeName = typeof value === 'string' && /^(?:string|number|integer|boolean|date|datetime|url|array|object|list)(?:\(.*\))?(?:\s.*)?$/.test(value.trim());
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
    if (includes !== undefined && operation.effects.networkDomains?.length && includes && typeof includes === 'object') { dropped.push(`${at} 访问外部网站，结果随网站变化，只检查结果的结构`); return { input, outputIncludes: (Array.isArray(includes) ? [] : {}) as SandboxJson }; }
    // "The list has a record like this" written as the record itself: the list contains it.
    if (includes && typeof includes === 'object' && !Array.isArray(includes) && operation.output.type === 'array') {
      dropped.push(`${at} 结果是列表，期望的那条记录改为"列表里有这样一条"`);
      const settled = settle([includes], input, at, dropped); timeless(settled, input, at); return { input, outputIncludes: settled as SandboxJson };
    }
    if (includes !== undefined) { const settled = settle(includes, input, at, dropped); timeless(settled, input, at); return { input, outputIncludes: settled as SandboxJson }; }
    if (!('output' in item)) return fail(at, '需要 output、includes 或 error 之一');
    // Each operation's examples run in order on that operation's own empty store.
    // A website answers with whatever it has today: only the shape of the result can be promised.
    if (operation.effects.networkDomains?.length) {
      const shape = Array.isArray(item.output) ? [] : item.output && typeof item.output === 'object' ? {} : undefined;
      if (shape !== undefined) { dropped.push(`${at} 访问外部网站，结果随网站变化，只检查结果的结构`); return { input, outputIncludes: shape as SandboxJson }; }
    }
    // A platform capability answers with its stand-in during checks, so an operation that reads one cannot promise an
    // exact result: its example becomes a partial one (for a list, "these items are in it"; [] means any list).
    if (operation.effects.capabilities?.length) {
      dropped.push(`${at} 用到平台能力，精确结果改为部分匹配`);
      const settled = settle(item.output, input, at, dropped); timeless(settled, input, at);
      return { input, outputIncludes: settled as SandboxJson };
    }
    if (operation.kind === 'query' && Array.isArray(item.output) && item.output.length)
      fail(at, '查询示例在空存储上运行，只能返回空列表；需要已有数据的情况写进验收（acceptance）');
    // A result field that depends on today (the current month) cannot be checked exactly; the rest still is.
    const given = new Set(datesIn(input));
    if (object(item.output) && datesIn(item.output).some(date => !given.has(date))) {
      const settled = settle(item.output, input, at, dropped); timeless(settled, input, at);
      return { input, outputIncludes: settled as SandboxJson };
    }
    timeless(item.output, input, at);
    return { input, output: item.output as SandboxJson };
  });
}
/**
 * An example cannot expect a field its own output never has (additional properties are refused): no code could meet
 * both. The expectation keeps the fields the output declares; an exact one becomes partial.
 */
function withinOutput(examples: SandboxOperationContract['examples'], output: SandboxSchema, at: string, dropped: string[]): SandboxOperationContract['examples'] {
  const record = output.type === 'object' ? output : output.type === 'array' && output.items?.type === 'object' ? output.items : undefined, known = record?.properties;
  if (!known) return examples;
  const trim = (value: SandboxJson, where: string): SandboxJson => {
    if (Array.isArray(value)) return value.map(item => trim(item, where));
    if (!object(value)) return value;
    const extra = Object.keys(value).filter(key => !Object.hasOwn(known, key));
    if (extra.length) dropped.push(`${where} 期望的 ${extra.join('、')} 不在 output 里，已不核对`);
    // A stand-in for "some value here" ({"loggedAt": "loggedAt"}, "string", "<时间>") cannot be met: the field is still
    // checked by the output schema, just not against that word.
    const placeholder = Object.entries(value).filter(([key, item]) => typeof item === 'string' && (item === key || /^(?:string|number|integer|boolean|date|datetime|date-time|timestamp|iso8601|uuid|<[^>]*>|\{\{[^}]*\}\})$/i.test(item.trim()))).map(([key]) => key);
    if (placeholder.length) dropped.push(`${where} 里 ${placeholder.join('、')} 写的是占位词，只检查有这个字段`);
    return Object.fromEntries(Object.entries(value).filter(([key]) => Object.hasOwn(known, key) && !placeholder.includes(key))) as SandboxJson;
  };
  return examples.map((example, index) => {
    const where = at + ` 第 ${index + 1} 个示例`;
    if (example.outputIncludes !== undefined) return { ...example, outputIncludes: trim(example.outputIncludes, where) };
    if (example.output === undefined) return example;
    const kept = trim(example.output, where);
    return JSON.stringify(kept) === JSON.stringify(example.output) ? example : { input: example.input, outputIncludes: kept };
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
  // A query's inputs are what the person filters by: one its examples leave out is optional, not missing.
  if (withExamples && kind === 'query' && input.type === 'object' && Array.isArray(raw.examples)) {
    const left = (input.required ?? []).filter(field => (raw.examples as unknown[]).some(example => object(example) && (!object(example.input) || !(field in example.input))));
    if (left.length) { input.required = (input.required ?? []).filter(field => !left.includes(field)); dropped.push(`${at} 的 ${left.join('、')} 是筛选条件，示例里没给，改为可选`); }
  }
  const examples = withExamples ? withinOutput(normalizeExamples(raw.examples, base, at, dropped), output, at, dropped) : [];
  const settled = withExamples ? reachable(examples, base, at, dropped) : [];
  return { ...base, examples: settled };
}
/**
 * Each operation's examples run on its own empty store. When a design says a missing record is an error (it has an
 * error example for the id) and also expects success for another id, that id cannot exist there either: the success
 * example is unmeetable whatever the code does. It is dropped with a note; the success belongs in acceptance.
 */
function reachable(examples: SandboxOperationContract['examples'], operation: Omit<SandboxOperationContract, 'examples'>, at: string, dropped: string[]): SandboxOperationContract['examples'] {
  // An operation that only passes a request on to another plugin gets that plugin's stand-in during checks, and the
  // stand-in always succeeds: an error that only the other plugin could raise ("version conflict") never happens there.
  if (operation.effects.capabilities?.length && !operation.effects.storage?.length && !operation.effects.networkDomains?.length) {
    const kept = examples.filter(example => example.error === undefined);
    if (kept.length === examples.length) return examples;
    dropped.push(`${at} 只把请求转给别处，检查时别处由替身代答、总是成功，别处才会报的错误不会出现：改为只检查结果的结构`);
    if (kept.length) return kept;
    const shape = operation.output.type === 'array' ? [] : operation.output.type === 'object' ? {} : undefined;
    return shape === undefined ? kept : [{ input: examples[0]!.input, outputIncludes: shape as SandboxJson }];
  }
  if (operation.effects.capabilities?.length || operation.input.type !== 'object') return examples;
  const ids = Object.keys(operation.input.properties ?? {}).filter(field => (operation.input.required ?? []).includes(field) && /^(?:id|[a-z][a-zA-Z]*Id|[a-z][a-z0-9]*_id)$/.test(field) && operation.input.properties![field]!.type === 'string');
  const looked = (example: SandboxOperationContract['examples'][number]) => ids.some(field => object(example.input) && typeof example.input[field] === 'string');
  if (!ids.length || !examples.some(example => example.error !== undefined && looked(example))) return examples;
  const kept = examples.filter(example => example.error !== undefined || !looked(example));
  if (kept.length !== examples.length) dropped.push(`${at} 找不到 ${ids.join('、')} 时报错，但另有示例期望找到它：示例在空存储上运行，找不到任何记录，这个成功示例已去掉，成功的情形由验收检查`);
  return kept;
}

/* ---------------- interface parts ---------------- */
const INTENTS: Record<string, PluginComponentIntent> = {
  heading: 'heading', title: 'heading', header: 'heading', description: 'description', text: 'description', paragraph: 'description',
  input: 'input', form: 'input', editor: 'input', action: 'action', button: 'action', collection: 'collection', list: 'collection', table: 'collection',
  cards: 'collection', reading: 'reading', reader: 'reading', conversation: 'conversation', chat: 'conversation', evidence: 'evidence', matrix: 'evidence',
  schedule: 'schedule', calendar: 'schedule', feedback: 'feedback', notice: 'feedback', status: 'feedback', summary: 'description', stats: 'description',
  标题: 'heading', 页头: 'heading', 说明: 'description', 正文: 'description', 文本: 'description', 汇总: 'description', 统计: 'description',
  输入: 'input', 表单: 'input', 录入: 'input', 编辑: 'input', 操作: 'action', 按钮: 'action', 集合: 'collection', 列表: 'collection', 表格: 'collection',
  卡片: 'collection', 阅读: 'reading', 原文: 'reading', 对话: 'conversation', 聊天: 'conversation', 证据: 'evidence', 日程: 'schedule', 日历: 'schedule',
  提示: 'feedback', 反馈: 'feedback', 状态: 'feedback',
};
const PROPS = ['title', 'description', 'submitLabel', 'emptyText', 'idField', 'titleField', 'textField', 'roleField', 'hintLevelField', 'citationsField', 'columns'] as const;
function intentOf(value: unknown, where: string): PluginComponentIntent {
  const intent = INTENTS[text(value).toLowerCase()];
  return intent ?? fail(where, `intent「${text(value)}」不在组件池里，可用 heading / description / input / action / collection / reading / conversation / evidence / schedule / feedback`);
}
function source(raw: unknown, field: string, where: string, partId?: string): PluginInputValue {
  if (typeof raw === 'string') {
    if (raw === 'form' || raw === 'form?') return { source: 'form', field };
    // "editor.note" (or "selection:calendar.habitId") on the part itself: the person fills or picks that field.
    const own = partId ? /^(?:selection:|prefill:)?(.+)$/.exec(raw)![1]! : '';
    if (partId && own.startsWith(partId + '.') && /^[a-zA-Z_]\w*$/.test(own.slice(partId.length + 1))) return { source: 'form', field: own.slice(partId.length + 1) };
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
function binding(raw: unknown, mode: 'read' | 'submit', operations: SandboxOperationContract[], where: string, formDefaults = false, partId?: string): PluginOperationBinding | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const spec = typeof raw === 'string' ? { op: raw } : object(raw) ? raw : fail(where, `${mode} 写成操作标识或 {"op": 操作标识}`);
  const operationId = slug(pick(spec as Json, 'op', 'operation', 'operationId'), where);
  const operation = operations.find(item => item.id === operationId) ?? fail(where, `${mode} 绑定了不存在的操作 ${operationId}`);
  const declared = object((spec as Json).input) ? (spec as Json).input as Json : {};
  const input: Record<string, PluginInputValue> = {};
  for (const field of Object.keys(operation.input.properties ?? {})) {
    if (declared[field] !== undefined) input[field] = source(declared[field], field, where, partId);
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
  for (const key of Object.keys(raw)) if (!['id', 'componentId', 'intent', 'kind', 'type', 'purpose', 'label', 'props', 'read', 'submit', 'uses', 'page', 'pageId', 'region', 'regionId', 'submitShow', 'show'].includes(key)) dropped.push(`${where} 的 ${key}`);
  const uses = sketch ? text(raw.uses) : '';
  const usesOperation = uses ? operations.find(item => item.id === slug(uses, where)) : undefined;
  const read = binding(raw.read ?? (usesOperation?.kind === 'query' && !usesOperation.input.required?.length ? usesOperation.id : undefined), 'read', operations, where, false, id);
  // A sketched action acts on a selection the proposal does not spell out yet, so it shows no form fields.
  const submit = binding(raw.submit ?? (usesOperation?.kind === 'command' ? intent === 'action' ? { op: usesOperation.id, input: {} } : usesOperation.id : undefined), 'submit', operations, where, intent === 'input', id);
  // "Show this field of the command's result" written beside the binding rather than inside it.
  const shown = raw.submitShow ?? raw.show, showField = typeof shown === 'string' ? shown : object(shown) ? text(pick(shown as Json, 'show', 'path', 'field', 'outputPath')) : '';
  if (submit && showField && !submit.outputPath) submit.outputPath = showField;
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
/**
 * A button written inside the list it acts on, as a page part: either a full part, or the short form
 * { componentId, operationId, inputFrom } whose one required input is the chosen record's field. One that names no
 * operation of the plugin is left out, as before.
 */
function liftAction(item: Json, host: Json, operations: SandboxOperationContract[]): Json | undefined {
  const submit = item.submit, named = object(submit) ? text(pick(submit as Json, 'op', 'operationId', 'operation')) : typeof submit === 'string' ? submit : text(pick(item, 'operationId', 'op', 'operation', 'uses'));
  const operation = operations.find(op => op.id === named);
  if (!operation || !text(pick(item, 'id', 'componentId'))) return undefined;
  if (pick(item, 'intent', 'kind', 'type') && submit) return item;
  const required = operation.input.required ?? [], from = text(item.inputFrom) || text(object(host.props) ? (host.props as Json).idField : '') || 'id';
  const input = required.length === 1 ? { [required[0]!]: 'selection:' + text(host.id) + '.' + from } : undefined;
  return { id: text(pick(item, 'id', 'componentId')), intent: text(pick(item, 'intent', 'kind', 'type')) || 'action', purpose: text(pick(item, 'purpose', 'label', 'confirm')) || operation.id,
    ...(object(item.props) ? { props: item.props } : {}), submit: object(submit) ? submit : { op: operation.id, ...(input ? { input } : {}) } };
}
function normalizePages(raw: unknown, operations: SandboxOperationContract[], dropped: string[], sketch: boolean): { pages: SandboxPluginContract['pages']; parts: PluginComponentPlan[] } {
  const list = Array.isArray(raw) ? raw : fail('界面', 'pages 写成数组，每页列出它的组件 parts');
  if (!list.length || list.length > 12) fail('界面', '需要 1–12 个页面');
  const pages: SandboxPluginContract['pages'] = [], parts: PluginComponentPlan[] = [];
  for (const [index, page] of list.entries()) {
    if (!object(page)) fail(`第 ${index + 1} 个页面`, '页面写成对象');
    const id = slug((page as Json).id ?? 'page' + (index + 1), `第 ${index + 1} 个页面`);
    const listed = (Array.isArray((page as Json).parts) ? (page as Json).parts : (page as Json).components) as unknown[] | undefined;
    if (!Array.isArray(listed) || !listed.length) fail(`页面 ${id}`, '每页至少一个组件');
    // Buttons written inside the list they act on ("actions": [{ "id": "remove-habit", ... }]) are parts of the page
    // beside it; a button on a list's records is drawn on each record anyway.
    const own = listed!.flatMap(part => {
      if (!object(part)) return [part];
      const host = part as Json, nested = ['actions', 'buttons', 'rowActions'].flatMap(key => Array.isArray(host[key]) ? (host[key] as unknown[]).filter(object).map(item => liftAction(item as Json, host, operations)) : [])
        .filter((item): item is Json => !!item);
      if (!nested.length) return [part];
      const { actions: _a, buttons: _b, rowActions: _r, ...rest } = host;
      dropped.push(`组件 ${text(host.id)} 里嵌套的按钮 ${nested.map(item => text(item.id)).join('、')} 移到页面上，和它并列`);
      return [rest, ...nested];
    });
    const pageParts = own.map(part => normalizePart(part, id, operations, dropped, sketch));
    // A sketch that repeats a part on a later page (a heading, the same list) names the repeat after its page: nothing
    // refers to parts by name yet. A full design keeps the strict check, since its acceptance steps do.
    if (sketch) for (const part of pageParts) {
      if (!parts.some(item => item.id === part.id) && pageParts.filter(item => item.id === part.id).length < 2) continue;
      let name = part.id + '-' + id, n = 2;
      while ([...parts, ...pageParts].some(item => item.id === name)) name = part.id + '-' + id + '-' + n++;
      part.id = name;
    }
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
    // "expect list A before list B": the list may be named again after "before".
    if ((m = /^expect\s+(\S+)\s+([\s\S]+?)\s+before\s+([\s\S]+)$/.exec(s))) { const list = m[1]!; return { action: 'expectOrder', componentId: list, texts: [unquote(m[2]!), ...m[3]!.split(/\s+before\s+/).map(text => unquote(text.startsWith(list + ' ') ? text.slice(list.length + 1) : text))] }; }
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
    // A step with nothing in it ("fill", "expect logs ") does nothing; it is left out rather than failing the case.
    // Filling a part that has no field to fill does nothing either.
    const fillable = (id: string) => { const part = parts.find(entry => entry.id === id); return !part || [...Object.values(part.read?.input ?? {}), ...Object.values(part.submit?.input ?? {})].some(value => value.source === 'form'); };
    const empty = (step: unknown) => typeof step === 'string' && (/^(?:fill|submit|select|expect|expect-not)(?:\s+\S+)?\s*$/.test(step.trim()) && !/^submit\s+\S+$/.test(step.trim())
      || !fillable(/^fill\s+([a-z][a-z0-9_-]*)/.exec(step.trim())?.[1] ?? ''));
    const steps = Array.isArray(item.steps) ? item.steps.filter(step => !empty(step)).map((step, stepIndex) => parseStep(step, parts, `验收 ${id} 第 ${stepIndex + 1} 步`)) : fail(`验收 ${id}`, '缺少 steps');
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
/**
 * One field, one set of values. Designers often type a field as a choice where it is written (tag: 设计|阅读|产品) and
 * as a plain string where it is filtered or listed; the plugin then cannot offer the choices, and examples disagree.
 * A plain string field takes the choice its namesake has elsewhere, when there is exactly one such choice.
 */
function unifyChoices(operations: SandboxPluginContract['operations'], dropped: string[]) {
  const fields = (schema: SandboxSchema | undefined, depth = 0): Array<[string, SandboxSchema]> => {
    if (!schema || depth > 2) return [];
    if (schema.type === 'array') return fields(schema.items, depth + 1);
    return schema.type === 'object' ? Object.entries(schema.properties ?? {}).flatMap(([name, spec]) => [[name, spec] as [string, SandboxSchema], ...fields(spec, depth + 1)]) : [];
  };
  const all = operations.flatMap(operation => [...fields(operation.input), ...fields(operation.output)]);
  const known = new Map<string, Set<string>>();
  for (const [name, spec] of all) if (spec.type === 'string' && spec.enum?.length) known.set(name, (known.get(name) ?? new Set()).add(JSON.stringify(spec.enum)));
  const changed = new Set<string>();
  for (const [name, spec] of all) {
    const choices = known.get(name);
    if (spec.type !== 'string' || spec.enum || spec.format || choices?.size !== 1) continue;
    (spec as { enum?: string[] }).enum = JSON.parse([...choices][0]!) as string[]; changed.add(name);
  }
  for (const name of changed) dropped.push('字段 ' + name + ' 在各操作里统一为同一组取值（' + (JSON.parse([...known.get(name)!][0]!) as string[]).join('/') + '）');
}
/**
 * Parts that name an operation that does not exist, and operations no part uses. Normalization stops at the first of
 * these; a designer told one at a time fixes it and trips over the next, so when there are several they go back together.
 */
function referenceProblems(pages: unknown, operations: SandboxOperationContract[]): string[] {
  const named = (raw: unknown) => typeof raw === 'string' ? raw : object(raw) ? text(pick(raw, 'op', 'operation', 'operationId')) : '';
  const ids = new Set(operations.map(operation => operation.id)), used = new Set<string>(), problems: string[] = [];
  for (const page of Array.isArray(pages) ? pages : []) for (const part of object(page) ? [page.parts, page.components].find(Array.isArray) ?? [] : []) {
    if (!object(part)) continue;
    for (const key of ['read', 'submit', 'uses']) {
      const operationId = named(part[key]); if (!operationId) continue;
      used.add(operationId); if (!ids.has(operationId)) problems.push(`组件 ${text(pick(part, 'id', 'componentId'))} 的 ${key} 绑定了不存在的操作 ${operationId}`);
    }
  }
  const unused = operations.filter(operation => !used.has(operation.id)).map(operation => operation.id);
  if (unused.length) problems.push(`操作 ${unused.join('、')} 没有任何组件使用；删掉它，或给它一个组件（按钮和列表并列写在页面的 parts 里）`);
  return problems;
}
export function expandDesign(raw: unknown, base: { id: string; title: string; description: string; rationale: string; journey: string[] }, pluginId: string, revision: string, dropped: string[]): AgentDesign {
  if (!object(raw)) return fail('细化方案', '写成对象 {"operations":…, "pages":…, "acceptance":…}');
  const design = object(raw.design) ? raw.design as Json : raw;
  const operationsRaw = Array.isArray(design.operations) ? design.operations : object(design.contract) && Array.isArray((design.contract as Json).operations) ? (design.contract as Json).operations as unknown[] : fail('细化方案', '缺少 operations');
  const operations = (operationsRaw as unknown[]).map((operation, index) => normalizeOperation(operation, index, dropped, true));
  if (new Set(operations.map(operation => operation.id)).size !== operations.length) fail('细化方案', '操作标识重复');
  unifyChoices(operations, dropped);
  const pagesRaw = withParts(design.pages ?? (object(design.contract) ? (design.contract as Json).pages : undefined), design.parts), problems = referenceProblems(pagesRaw, operations);
  if (problems.length > 1) fail('细化方案', '有 ' + problems.length + ' 处要一起改：' + problems.map((problem, index) => '（' + (index + 1) + '）' + problem).join('；'));
  const { pages, parts } = normalizePages(pagesRaw, operations, dropped, false);
  // A list-type part over a query that returns one object (a total, today's count) is a summary, whatever intent was written.
  for (const part of parts) {
    if (!part.read || !['collection', 'schedule', 'evidence', 'reading', 'conversation'].includes(part.intent)) continue;
    const output = operations.find(item => item.id === part.read!.operationId)?.output, shown = output ? pluginSchemaAt(output, part.read.outputPath) : undefined;
    if (shown && shown.type !== 'array') { dropped.push(`组件 ${part.id} 读的 ${part.read.operationId} 返回的是一组数字，改用正文显示`); part.intent = 'description'; }
  }
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
  // Examples written in the words the records show ("想读") mean the value those words stand for ("未读").
  const spoken = new Map<string, Map<string, string>>();
  for (const part of parts) for (const column of part.props.columns ?? []) for (const [value, words] of Object.entries(column.values ?? {})) spoken.set(column.field, (spoken.get(column.field) ?? new Map()).set(words, value));
  for (const operation of operations) for (const example of operation.examples) if (object(example.input)) for (const [field, value] of Object.entries(example.input)) {
    const allowed = operation.input.properties?.[field]?.enum, meant = typeof value === 'string' ? spoken.get(field)?.get(value) : undefined;
    if (allowed && !allowed.includes(value as SandboxJson) && meant !== undefined && allowed.includes(meant)) { (example.input as Json)[field] = meant; dropped.push(`操作 ${operation.id} 示例的 ${field}「${value}」是显示用词，按取值「${meant}」核对`); }
  }
  // A filter's value is whatever the person picks; it is never filled in from elsewhere.
  for (const part of parts) for (const [field, value] of Object.entries(part.read?.input ?? {})) if (value.source === 'form' && value.prefill) {
    delete value.prefill; dropped.push(`组件 ${part.id} 的筛选字段 ${field} 不预填，由用户选择`);
  }
  const used = new Set(parts.flatMap(part => [part.read?.operationId, part.submit?.operationId]));
  const unused = operations.filter(operation => !used.has(operation.id)).map(operation => operation.id);
  if (unused.length) fail('细化方案', `操作 ${unused.join('、')} 没有任何组件使用；删掉它，或给它一个组件（按钮和列表并列写在页面的 parts 里）`);
  // Cases written inside a page (pages[].acceptance) are still the plugin's cases.
  const pageCases = (Array.isArray(design.pages) ? design.pages : []).flatMap(page => object(page) && Array.isArray(page.acceptance) ? page.acceptance as unknown[] : []);
  const acceptance = normalizeAcceptance(design.acceptance ?? (object(design.contract) ? (design.contract as Json).acceptance : undefined) ?? (pageCases.length ? pageCases : undefined), written);
  for (const test of acceptance.browser) {
    // Filling a filter is filling the list's filter bar; "submitting" it has nothing left to do.
    test.steps = test.steps.filter(step => !(step.action === 'submit' && merged.has(step.componentId)));
    for (const step of test.steps) if ('componentId' in step && merged.has(step.componentId)) step.componentId = merged.get(step.componentId)!;
  }
  // A case that presses a record's button without choosing a record ("delete something that is not there") cannot
  // happen on screen: the button only exists on records. Such errors are the operation examples' to check.
  const onRecord = (id: string) => { const part = parts.find(item => item.id === id); const sources = Object.values(part?.submit?.input ?? {}); const hosts = new Set(sources.flatMap(item => item.source === 'selection' ? [item.componentId] : []));
    return !part?.read && hosts.size === 1 && sources.every(item => item.source !== 'form') ? [...hosts][0] : undefined; };
  const impossible = acceptance.browser.filter(test => test.steps.some((step, position) => step.action === 'submit' && onRecord(step.componentId) !== undefined
    && !test.steps.slice(0, position).some(earlier => earlier.action === 'select' && earlier.componentId === onRecord(step.componentId))));
  if (impossible.length && impossible.length < acceptance.browser.length) for (const test of impossible) {
    acceptance.browser.splice(acceptance.browser.indexOf(test), 1); acceptance.contract.splice(acceptance.contract.findIndex(item => item.id === test.id), 1);
    dropped.push(`验收「${test.id}」要在没选中记录时按记录上的按钮，界面上做不到，已去掉；这类错误由操作示例检查`);
  }
  // A form asking the person to type a record's id ("habitId") means the record they chose in the list of those records
  // on the same page: the field is prefilled from it (still editable), the way a person would pick rather than type.
  for (const form of parts.filter(part => part.intent === 'input' && part.submit)) {
    for (const [field, value] of Object.entries(form.submit!.input)) {
      if (value.source !== 'form' || value.prefill || !/^(?:id|[a-z][a-zA-Z]*Id|[a-z][a-z0-9]*_id)$/.test(field)) continue;
      const stem = field.replace(/(?:Id|_id)$/, '').toLowerCase();
      const lists = parts.filter(part => part.pageId === form.pageId && part.read && ['collection', 'schedule', 'reading', 'evidence'].includes(part.intent)).filter(part => {
        const items = operations.find(op => op.id === part.read!.operationId)?.output, record = items?.type === 'array' ? items.items : undefined;
        return record?.properties?.[field] || (stem && stem !== 'id' && part.read!.operationId.toLowerCase().includes(stem) && record?.properties?.[part.props.idField ?? 'id']);
      });
      if (lists.length !== 1) continue;
      const list = lists[0]!, items = operations.find(op => op.id === list.read!.operationId)!.output;
      const source = items.type === 'array' && items.items?.properties?.[field] ? field : list.props.idField ?? 'id';
      value.prefill = { componentId: list.id, field: source };
      dropped.push(`组件 ${form.id} 的 ${field} 取自列表 ${list.id} 选中的记录（仍可修改），不需要用户手填`);
    }
  }
  // An idempotency key or request id is the code's business, never the person's: it leaves the command's input (and the
  // forms and examples that carry it); the code makes one when a capability needs it.
  for (const operation of operations.filter(item => item.kind === 'command' && item.input.type === 'object')) {
    for (const field of Object.keys(operation.input.properties ?? {}).filter(key => /^(?:idempotency[_-]?key|idempotencyKey|request[_-]?id|requestId|dedupe[_-]?key)$/.test(key))) {
      delete operation.input.properties![field];
      operation.input.required = (operation.input.required ?? []).filter(item => item !== field);
      for (const example of operation.examples) if (object(example.input)) delete (example.input as Json)[field];
      for (const part of parts) if (part.submit?.operationId === operation.id) delete part.submit.input[field];
      dropped.push(`操作 ${operation.id} 的 ${field} 由插件代码生成，不让用户填写`);
    }
  }
  // The sentence a command just produced ("润色" → polished) is what the next form on the page asks the person to type
  // ("一句进展" → summary): it is prefilled from that result, still editable. Only with one such result on the page.
  const TEXTY = /^(?:summary|text|content|note|sentence|progress|message|result|polished|draft|body)$/;
  for (const form of parts.filter(part => part.submit)) {
    const runners = parts.filter(part => part !== form && part.pageId === form.pageId && part.submit?.outputPath && part.submit.operationId !== form.submit!.operationId
      && operations.find(op => op.id === part.submit!.operationId)?.output.properties?.[part.submit!.outputPath!]?.type === 'string');
    if (runners.length !== 1) continue;
    const runner = runners[0]!, shown = runner.submit!.outputPath!, input = operations.find(op => op.id === form.submit!.operationId)?.input;
    const open = Object.entries(form.submit!.input).filter(([field, value]) => value.source === 'form' && !value.prefill && input?.properties?.[field]?.type === 'string' && (field === shown || TEXTY.test(field)));
    // The person's own words (the draft the command worked from) stay theirs to type.
    const typed = new Set(Object.entries(runner.submit!.input).filter(([, value]) => value.source === 'form').map(([field]) => field));
    const candidates = open.filter(([field]) => !typed.has(field));
    if (candidates.length !== 1) continue;
    const [field, value] = candidates[0]!;
    if (value.source !== 'form') continue;
    value.prefill = { componentId: runner.id, field: shown };
    dropped.push(`组件 ${form.id} 的 ${field} 预填 ${runner.id} 刚得到的结果（仍可修改）`);
  }
  // "显示最新一次的三条" written as "{{task1}}" over a list query: a sentence fills from one object, not a list of records.
  // When a command on the page returns those fields, the sentence meant that command's result (the rule below).
  const templateFields = (part: PluginComponentPlan) => [part.props.title, part.props.description].flatMap(words => typeof words === 'string' ? [...words.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(match => match[1]!) : []);
  for (const part of parts) {
    const fields = templateFields(part), read = part.read && operations.find(op => op.id === part.read!.operationId);
    if (!fields.length || !read || part.submit || part.read!.outputPath || read.output.type !== 'array') continue;
    if (!parts.some(item => item.submit && fields.every(field => operations.find(op => op.id === item.submit!.operationId)?.output.properties?.[field]))) continue;
    delete part.read;
    dropped.push(`组件 ${part.id} 读的 ${read.id} 是记录列表，文字里的 {{…}} 填不进去，改为显示刚执行的命令结果`);
  }
  // "{{action_items}}" on a part that reads nothing, where the field is a command's result: the result shows under the part
  // that runs the command, and the text keeps its plain words.
  for (const part of parts) {
    if (part.read) continue;
    for (const key of ['title', 'description'] as const) {
      const words = part.props[key];
      if (typeof words !== 'string' || !/\{\{\s*[\w.]+\s*\}\}/.test(words)) continue;
      // One field shows alone; several ("{{title}}：1. {{task1}}…") show as the whole result, each with its label.
      const fields = [...new Set([...words.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(match => match[1]!))];
      const runner = parts.find(item => item.submit && fields.some(field => operations.find(op => op.id === item.submit!.operationId)?.output.properties?.[field]));
      if (runner && !runner.submit!.outputPath && fields.length === 1) runner.submit!.outputPath = fields[0]!;
      const plain = words.replace(/\{\{\s*[\w.]+\s*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
      (part.props as Record<string, unknown>)[key] = plain || part.purpose;
      dropped.push(`组件 ${part.id} 不读取任何查询，文字里的 {{…}} 改为显示在执行命令的组件上`);
    }
  }
  // A case expecting an operation's declared error ("今天还没有打卡记录" after undo with nothing to undo) is that
  // operation's example, not something to click through: the runner stops at the failed submit.
  for (const test of [...acceptance.browser]) {
    const submitted = test.steps.flatMap(step => step.action === 'submit' ? [parts.find(part => part.id === step.componentId)?.submit?.operationId] : []);
    // By its words ("今天还没有记录") or its code ("no_records").
    const errors = operations.filter(operation => submitted.includes(operation.id)).flatMap(operation => operation.errors.flatMap(error => [error.description, error.code])).filter(Boolean);
    const expectsError = test.steps.some(step => step.action === 'expect' && errors.some(error => error.includes(step.text) || step.text.includes(error)));
    if (!expectsError || acceptance.browser.length === 1) continue;
    acceptance.browser.splice(acceptance.browser.indexOf(test), 1); acceptance.contract.splice(acceptance.contract.findIndex(item => item.id === test.id), 1);
    dropped.push(`验收「${test.id}」期望操作报错；报错由操作的例子检查，界面验收里去掉这一条`);
  }
  // An order check needs records the case wrote itself; one about texts nothing in the case produces cannot pass.
  for (const test of [...acceptance.browser]) {
    const kept = test.steps.filter((step, position) => {
      if (step.action !== 'expectOrder') return true;
      const typed = test.steps.slice(0, position).flatMap(earlier => earlier.action === 'fill' && typeof earlier.value === 'string' ? [earlier.value] : []);
      return step.texts.every(text => text === '示例' || typed.some(value => value.includes(text) || text.includes(value)));
    });
    if (kept.length === test.steps.length) continue;
    dropped.push(`验收「${test.id}」检查先后顺序用的文字不是这条验收自己写入的内容，这一步已去掉`);
    if (kept.some(step => ['expect', 'expectAbsent', 'expectValue', 'expectOrder'].includes(step.action)) || acceptance.browser.length === 1) { test.steps = kept; continue; }
    acceptance.browser.splice(acceptance.browser.indexOf(test), 1); acceptance.contract.splice(acceptance.contract.findIndex(item => item.id === test.id), 1);
  }
  // Filling a part that has nothing to fill does nothing; a case about a part that does not exist cannot run.
  for (const test of [...acceptance.browser]) {
    const fields = (id: string) => { const part = parts.find(item => item.id === id); return [...Object.values(part?.read?.input ?? {}), ...Object.values(part?.submit?.input ?? {})].filter(value => value.source === 'form').length; };
    const before = test.steps.length;
    test.steps = test.steps.filter(step => !(step.action === 'fill' && parts.some(part => part.id === step.componentId) && !fields(step.componentId)));
    if (test.steps.length !== before) dropped.push(`验收「${test.id}」在没有输入项的组件上填写，这些步骤已去掉`);
    const unknown = test.steps.find(step => 'componentId' in step && !parts.some(part => part.id === step.componentId));
    if (unknown && acceptance.browser.length > 1) {
      acceptance.browser.splice(acceptance.browser.indexOf(test), 1); acceptance.contract.splice(acceptance.contract.findIndex(item => item.id === test.id), 1);
      dropped.push(`验收「${test.id}」用到了不存在的组件 ${(unknown as { componentId: string }).componentId}，已去掉`);
    }
  }
  // A part that reads nothing and runs nothing only shows its own words. Expecting something else there right after
  // another part ran a command means that command's result: it shows under the part that ran it.
  for (const test of acceptance.browser) {
    let last: PluginComponentPlan | undefined;
    for (const step of test.steps) {
      if (step.action === 'submit') { last = parts.find(part => part.id === step.componentId); continue; }
      if (step.action !== 'expect' || !last?.submit) continue;
      const shown = parts.find(part => part.id === step.componentId);
      if (!shown || shown.read || shown.submit || [shown.props.title, shown.props.description].some(words => typeof words === 'string' && words.includes(step.text))) continue;
      const output = operations.find(item => item.id === last!.submit!.operationId)?.output;
      // Its text, or its one field besides ids and times; a result of several such fields shows whole, each with its label.
      const keys = Object.keys(output?.properties ?? {}).filter(key => !/^(?:id|at)$|(?:Id|_id|At|_at)$/.test(key));
      const field = output?.type === 'object' ? (['text', 'summary', 'message', 'result'].find(name => output.properties?.[name]) ?? (keys.length === 1 ? keys[0] : undefined)) : undefined;
      if (!last.submit.outputPath && field) last.submit.outputPath = field;
      if (!last.submit.outputPath && output?.type !== 'array' && output?.type !== 'object') continue;
      dropped.push(`验收「${test.id}」在只显示固定文字的组件 ${shown.id} 上期望「${step.text}」，改为检查执行命令的组件 ${last.id} 显示的结果`);
      step.componentId = last.id;
    }
  }
  // The model's stand-in answers with its prefix and the start of what it was given; what the plugin gives it around the
  // person's words is the code's choice. So "［模型替身］上午写了周报" is checked as the prefix and the words, separately.
  for (const test of acceptance.browser) test.steps = test.steps.flatMap(step => step.action === 'expect' && step.text.startsWith(MODEL_STAND_IN_PREFIX) && step.text.length > MODEL_STAND_IN_PREFIX.length
    ? [{ ...step, text: MODEL_STAND_IN_PREFIX }, { ...step, text: step.text.slice(MODEL_STAND_IN_PREFIX.length).trim() }] : [step]);
  // What another plugin or the platform holds is a fixed stand-in during acceptance: its list always shows one "示例"
  // record and never changes, whatever the plugin wrote there. Expecting it to empty, or a record to leave it, cannot pass.
  // A list is the other plugin's data when its query reaches a capability and nothing in this plugin keeps data of its
  // own that could change what it shows.
  const keepsData = operations.some(item => item.effects.storage?.includes('write'));
  const external = new Set(parts.filter(part => { const read = operations.find(item => item.id === part.read?.operationId);
    return read?.effects.capabilities?.length && (!read.effects.storage?.includes('read') || !keepsData); }).map(part => part.id));
  for (const test of [...acceptance.browser]) {
    let written = false;
    const kept = test.steps.filter(step => {
      if (step.action === 'submit') written = true;
      if (!external.has((step as { componentId?: string }).componentId ?? '')) return true;
      // It never empties, and a write elsewhere never shows in it.
      return !(step.action === 'expectAbsent' || (step.action === 'expect' || step.action === 'expectOrder' || step.action === 'expectValue') && written
        || step.action === 'expect' && step.text === parts.find(part => part.id === step.componentId)?.props.emptyText);
    });
    if (kept.length === test.steps.length) continue;
    dropped.push(`验收「${test.id}」期望别处的数据变化或为空；验收时别处的数据是固定替身（总有一条「示例」，不会变），这些步骤已去掉`);
    if (kept.some(step => ['expect', 'expectAbsent', 'expectValue', 'expectOrder'].includes(step.action))) { test.steps = kept; continue; }
    acceptance.browser.splice(acceptance.browser.indexOf(test), 1); acceptance.contract.splice(acceptance.contract.findIndex(item => item.id === test.id), 1);
  }
  // Every case asked for the other plugin's data to change. What can still be checked: the list shows its record.
  const shown = parts.find(part => external.has(part.id) && part.intent !== 'description');
  if (!acceptance.browser.length && shown) {
    acceptance.browser.push({ id: 'shows-records', description: '打开就能看到别处的记录', steps: [{ action: 'expect', componentId: shown.id, text: '示例' }] });
    acceptance.contract.push({ id: 'shows-records', description: '打开就能看到别处的记录', steps: [{ description: '看列表 ' + shown.id, expected: '示例' }] });
    dropped.push('验收都依赖别处的数据变化，改为检查列表能显示别处的记录');
  }
  if (!acceptance.browser.length) fail('细化方案', '验收时别处（其他插件、平台）的数据是固定替身：列表总有一条「示例」记录，写入后也不会变化。至少写一条能通过的验收：检查操作后界面给出的反馈，或插件自己保存的内容');
  const journey = steps(pick(design, 'journey', 'journal'));
  return { id: base.id, title: text(design.title) || base.title, description: text(design.description) || base.description, rationale: text(design.rationale) || base.rationale,
    journey: journey.length ? journey.slice(0, 20) : base.journey,
    contract: { version: 1, pluginId, revision, entities: [], pages, operations, acceptance: acceptance.contract }, parts, acceptance: acceptance.browser };
}
