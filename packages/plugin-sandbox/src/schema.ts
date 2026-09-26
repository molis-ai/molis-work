import { isDeepStrictEqual } from 'node:util';
import type { SandboxEffects, SandboxJson, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export class SandboxError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'SandboxError'; }
}

export function assertJson(value: unknown, depth = 0, budget = { remaining: 50_000 }): asserts value is SandboxJson {
  if (--budget.remaining < 0 || depth > 32) throw new SandboxError('INVALID_JSON', 'JSON structure exceeds limits');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) assertJson(item, depth + 1, budget); return; }
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    for (const item of Object.values(value)) assertJson(item, depth + 1, budget);
    return;
  }
  throw new SandboxError('INVALID_JSON', 'Only bounded JSON values are allowed');
}

const common = ['type', 'description', 'enum', 'const'];
const typed: Record<string, string[]> = {
  null: [], boolean: [], number: ['minimum', 'maximum'], integer: ['minimum', 'maximum'],
  string: ['minLength', 'maxLength', 'format'], array: ['items', 'minItems', 'maxItems'],
  object: ['properties', 'required', 'additionalProperties'],
};

export function assertSchema(schema: unknown, depth = 0): asserts schema is SandboxSchema {
  if (depth === 0) assertJson(schema);
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 24) throw new SandboxError('INVALID_SCHEMA', 'Expected a bounded schema object');
  const s = schema as Record<string, unknown>;
  if (typeof s.type !== 'string' || !Object.hasOwn(typed, s.type)) throw new SandboxError('INVALID_SCHEMA', 'Schema requires a supported type');
  const allowed = [...common, ...typed[s.type]!];
  for (const key of Object.keys(s)) if (!allowed.includes(key)) throw new SandboxError('INVALID_SCHEMA', `Unsupported schema keyword: ${key}`);
  if (s.description !== undefined && typeof s.description !== 'string') throw new SandboxError('INVALID_SCHEMA', 'description must be a string');
  if (s.format !== undefined && !['date', 'date-time', 'uri'].includes(s.format as string)) throw new SandboxError('INVALID_SCHEMA', 'Unsupported string format');
  if (s.enum !== undefined && (!Array.isArray(s.enum) || s.enum.length === 0)) throw new SandboxError('INVALID_SCHEMA', 'enum must be nonempty');
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (s[key] !== undefined && (!Number.isSafeInteger(s[key]) || (s[key] as number) < 0)) throw new SandboxError('INVALID_SCHEMA', `${key} must be a nonnegative integer`);
  }
  for (const key of ['minimum', 'maximum']) if (s[key] !== undefined && (typeof s[key] !== 'number' || !Number.isFinite(s[key]))) throw new SandboxError('INVALID_SCHEMA', `${key} must be finite`);
  for (const [min, max] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) {
    if (s[min!] !== undefined && s[max!] !== undefined && (s[min!] as number) > (s[max!] as number)) throw new SandboxError('INVALID_SCHEMA', `${min} exceeds ${max}`);
  }
  if (s.type === 'array') assertSchema(s.items, depth + 1);
  if (s.type === 'object') {
    if (!s.properties || typeof s.properties !== 'object' || Array.isArray(s.properties) || s.additionalProperties !== false) throw new SandboxError('INVALID_SCHEMA', 'Objects require properties and additionalProperties:false');
    if (!Array.isArray(s.required) || s.required.some(k => typeof k !== 'string' || !Object.hasOwn(s.properties as object, k)) || new Set(s.required).size !== s.required.length) throw new SandboxError('INVALID_SCHEMA', 'Object required must name unique declared properties');
    for (const child of Object.values(s.properties)) assertSchema(child, depth + 1);
  }
  const base = { ...s };
  delete base.enum; delete base.const;
  if (Array.isArray(s.enum)) for (const item of s.enum) assertMatches(base as unknown as SandboxSchema, item, 'schema.enum');
  if (Object.hasOwn(s, 'const')) assertMatches(base as unknown as SandboxSchema, s.const, 'schema.const');
}

export function assertMatches(schema: SandboxSchema, value: unknown, path = '$', depth = 0): asserts value is SandboxJson {
  if (depth === 0) assertJson(value);
  const fail = (message: string): never => { throw new SandboxError('SCHEMA_MISMATCH', `${path}: ${message}`); };
  if (schema.enum && !schema.enum.some(item => isDeepStrictEqual(item, value))) fail('value is outside enum');
  if (Object.hasOwn(schema, 'const') && !isDeepStrictEqual(schema.const, value)) fail('value differs from const');
  switch (schema.type) {
    case 'null': if (value !== null) fail('expected null'); break;
    case 'boolean': if (typeof value !== 'boolean') fail('expected boolean'); break;
    case 'integer': case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isSafeInteger(value))) fail(`expected ${schema.type}`);
      if (schema.minimum !== undefined && (value as number) < schema.minimum) fail('below minimum');
      if (schema.maximum !== undefined && (value as number) > schema.maximum) fail('above maximum');
      break;
    case 'string':
      if (typeof value !== 'string') fail('expected string');
      if (schema.minLength !== undefined && [...(value as string)].length < schema.minLength) fail('string too short');
      if (schema.maxLength !== undefined && [...(value as string)].length > schema.maxLength) fail('string too long');
      if (schema.format === 'date' || schema.format === 'date-time') {
        const text = value as string;
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
        if (!match) fail('expected ISO date');
        const year = Number(match![1]), month = Number(match![2]), day = Number(match![3]);
        const date = new Date(`${match![0]}T00:00:00Z`);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) fail('invalid calendar date');
        if (schema.format === 'date' && text.length !== 10) fail('expected date only');
        if (schema.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(text) || !Number.isFinite(Date.parse(text)))) fail('expected ISO timestamp with timezone');
      }
      if (schema.format === 'uri') { try { new URL(value as string); } catch { fail('expected absolute URI'); } }
      break;
    case 'array':
      if (!Array.isArray(value)) fail('expected array');
      if (schema.minItems !== undefined && (value as unknown[]).length < schema.minItems) fail('too few items');
      if (schema.maxItems !== undefined && (value as unknown[]).length > schema.maxItems) fail('too many items');
      (value as unknown[]).forEach((item, index) => assertMatches(schema.items!, item, `${path}[${index}]`, depth + 1));
      break;
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
      const record = value as Record<string, unknown>;
      for (const key of schema.required!) if (!Object.hasOwn(record, key)) fail(`missing ${key}`);
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(schema.properties!, key)) fail(`unexpected property ${key}`);
        assertMatches(schema.properties![key]!, record[key], `${path}.${key}`, depth + 1);
      }
      break;
    }
  }
}

export const effectKeys = ['storage', 'artifacts', 'capabilities', 'events', 'networkDomains', 'secretRefs', 'resources'] as const;
export function assertEffects(effects: unknown): asserts effects is SandboxEffects {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) throw new SandboxError('INVALID_CONTRACT', 'Effects must be an object');
  for (const [key, values] of Object.entries(effects)) {
    if (!effectKeys.includes(key as typeof effectKeys[number]) || !Array.isArray(values) || values.some(v => typeof v !== 'string' || !v || v.length > 256) || new Set(values).size !== values.length) throw new SandboxError('INVALID_CONTRACT', `Invalid effect ${key}`);
    if ((key === 'storage' || key === 'artifacts') && values.some(v => v !== 'read' && v !== 'write')) throw new SandboxError('INVALID_CONTRACT', `Invalid ${key} access`);
    if (key === 'networkDomains' && values.some(v => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(v))) throw new SandboxError('INVALID_CONTRACT', 'Network effects require exact lowercase DNS domains');
    if (key === 'resources' && values.some(v => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(v))) throw new SandboxError('INVALID_CONTRACT', 'Resources require logical names, not paths');
  }
}

export function assertContract(contract: unknown): asserts contract is SandboxPluginContract {
  assertJson(contract);
  const c = contract as unknown as SandboxPluginContract;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
  if (!c || c.version !== 1 || !id(c.pluginId) || !id(c.revision) || !Array.isArray(c.operations) || !c.operations.length || c.operations.length > 128 || !Array.isArray(c.entities) || !Array.isArray(c.pages) || !Array.isArray(c.acceptance)) throw new SandboxError('INVALID_CONTRACT', 'Invalid contract envelope');
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(c.operations.map(o => o.id))) throw new SandboxError('INVALID_CONTRACT', 'Duplicate operations');
  for (const op of c.operations) {
    if (!id(op.id)) throw new SandboxError('INVALID_CONTRACT', 'Invalid operation id');
    if (op.kind !== 'query' && op.kind !== 'command') throw new SandboxError('INVALID_CONTRACT', 'Operation kind must be query or command');
    assertSchema(op.input); assertSchema(op.output); assertEffects(op.effects);
    if (op.kind === 'query' && (op.effects.storage?.includes('write') || op.effects.artifacts?.includes('write') || op.effects.events?.length)) throw new SandboxError('INVALID_CONTRACT', 'Queries cannot declare writes or publish events');
    if (!Array.isArray(op.errors) || op.errors.some(e => !id(e.code) || typeof e.description !== 'string') || !unique(op.errors.map(e => e.code)) || !Array.isArray(op.examples) || !op.examples.length) throw new SandboxError('INVALID_CONTRACT', 'Operations require errors and examples');
    for (const example of op.examples) {
      assertMatches(op.input, example.input);
      if (['output', 'outputIncludes', 'error'].filter(k => Object.hasOwn(example, k)).length !== 1) throw new SandboxError('INVALID_CONTRACT', 'Example requires exactly one expectation');
      if (Object.hasOwn(example, 'output')) assertMatches(op.output, example.output);
      if (Object.hasOwn(example, 'error') && !op.errors.some(e => e.code === example.error)) throw new SandboxError('INVALID_CONTRACT', 'Example error is undeclared');
    }
  }
  for (const entity of c.entities) { if (!id(entity.id)) throw new SandboxError('INVALID_CONTRACT', 'Invalid entity id'); assertSchema(entity.schema); }
  if (!unique(c.entities.map(e => e.id)) || !unique(c.pages.map(p => p.id)) || !unique(c.acceptance.map(a => a.id))) throw new SandboxError('INVALID_CONTRACT', 'Duplicate structural ids');
  const operationExists = (value: string) => c.operations.some(o => o.id === value);
  for (const page of c.pages) {
    if (!id(page.id) || typeof page.title !== 'string' || !Array.isArray(page.regions) || !unique(page.regions.map(r => r.id))) throw new SandboxError('INVALID_CONTRACT', 'Invalid page');
    for (const region of page.regions) if (!id(region.id) || typeof region.title !== 'string' || !Array.isArray(region.operationIds) || !region.operationIds.every(operationExists)) throw new SandboxError('INVALID_CONTRACT', 'Invalid region operation binding');
  }
  for (const test of c.acceptance) if (!id(test.id) || typeof test.description !== 'string' || !Array.isArray(test.steps) || !test.steps.length || test.steps.some(s => typeof s.description !== 'string' || typeof s.expected !== 'string' || (s.operationId !== undefined && !operationExists(s.operationId)))) throw new SandboxError('INVALID_CONTRACT', 'Invalid acceptance case');
}
