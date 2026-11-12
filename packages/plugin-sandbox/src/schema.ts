import { assertSandboxJson, assertSandboxMatches, assertSandboxSchema, sandboxBackgroundProblems, type SandboxSchemaFailure } from '@molis-ai/molis-work-plugin-sdk';
import type { SandboxEffects, SandboxJson, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export class SandboxError extends Error {
  /** Only trusted Host errors carry outcome; the worker's JSON error never supplies it. */
  constructor(readonly code: string, message: string, readonly outcome?: 'unknown') { super(message); this.name = 'SandboxError'; }
}

/** A call the Host's side refuses as not the person's to allow (`sandbox.not_authorized`), for the Host's own ports that must answer the package with the sandbox's code. */
export const sandboxNotAuthorized = (message: string): SandboxError => new SandboxError('sandbox.not_authorized', message);
/** A result larger than the channel's limits, as the Host's own ports refuse it (BL-918). */
export const sandboxResponseTooLarge = (message: string): SandboxError => new SandboxError('sandbox.response_too_large', message);

const schemaFailure: SandboxSchemaFailure = (kind, reason) => { throw new SandboxError(`sandbox.${kind}`, reason); };

export function assertJson(value: unknown): asserts value is SandboxJson {
  assertSandboxJson(value, schemaFailure);
}

export function assertSchema(schema: unknown): asserts schema is SandboxSchema {
  assertSandboxSchema(schema, schemaFailure);
}

export function assertMatches(schema: SandboxSchema, value: unknown, path = '$'): asserts value is SandboxJson {
  assertSandboxMatches(schema, value, schemaFailure, path);
}

const effectKeys = ['storage', 'artifacts', 'capabilities', 'events', 'networkDomains', 'secretRefs', 'resources', 'projectDatabase', 'homeDatabase', 'projects', 'connections', 'materials', 'ownerFiles', 'model', 'modelSettings', 'imageGeneration', 'background'] as const;
export function assertEffects(effects: unknown): asserts effects is SandboxEffects {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) throw new SandboxError('sandbox.invalid_contract', 'Effects must be an object');
  for (const [key, values] of Object.entries(effects)) {
    if (!effectKeys.includes(key as typeof effectKeys[number]) || !Array.isArray(values) || values.some(v => typeof v !== 'string' || !v || v.length > 256) || new Set(values).size !== values.length) throw new SandboxError('sandbox.invalid_contract', `Invalid effect ${key}`);
    if ((key === 'storage' || key === 'artifacts' || key === 'projectDatabase' || key === 'homeDatabase' || key === 'ownerFiles') && values.some(v => v !== 'read' && v !== 'write')) throw new SandboxError('sandbox.invalid_contract', `Invalid ${key} access`);
    if (key === 'networkDomains' && values.some(v => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(v))) throw new SandboxError('sandbox.invalid_contract', 'Network effects require exact lowercase DNS domains');
    if (key === 'materials' && values.some(v => v !== 'read' && v !== 'fetch' && v !== 'fetch_local' && v !== 'original')) throw new SandboxError('sandbox.invalid_contract', 'Invalid materials access');
    if (key === 'model' && values.some(v => v !== 'read' && v !== 'invoke')) throw new SandboxError('sandbox.invalid_contract', 'Invalid model access');
    if (key === 'modelSettings' && values.some(v => v !== 'read' && v !== 'save')) throw new SandboxError('sandbox.invalid_contract', 'Invalid model settings access');
    if (key === 'imageGeneration' && values.some(v => v !== 'read' && v !== 'generate' && v !== 'bind')) throw new SandboxError('sandbox.invalid_contract', 'Invalid image generation access');
    if (key === 'projects' && values.some(v => v !== 'exist')) throw new SandboxError('sandbox.invalid_contract', 'Invalid projects access');
    if (key === 'background' && values.some(v => !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v))) throw new SandboxError('sandbox.invalid_contract', 'Background effects name operations of the contract');
    if (key === 'connections' && values.some(v => !/^[a-z][a-z0-9-]{0,63}$/.test(v))) throw new SandboxError('sandbox.invalid_contract', 'Connection effects name a slot of the Manifest');
    if (key === 'resources' && values.some(v => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(v))) throw new SandboxError('sandbox.invalid_contract', 'Resources require logical names, not paths');
  }
}


function assertContractEnvelope(contract: unknown, proposal: boolean): asserts contract is SandboxPluginContract {
  assertJson(contract);
  const c = contract as unknown as SandboxPluginContract;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
  if (!c || c.version !== /* @version format.sandbox.contract */ 1 || !id(c.pluginId) || !id(c.revision) || !Array.isArray(c.operations) || !c.operations.length || c.operations.length > 128 || !Array.isArray(c.entities) || !Array.isArray(c.pages) || !Array.isArray(c.acceptance)) throw new SandboxError('sandbox.invalid_contract', 'Invalid contract envelope');
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(c.operations.map(o => o.id))) throw new SandboxError('sandbox.invalid_contract', 'Duplicate operations');
  for (const op of c.operations) {
    if (!id(op.id)) throw new SandboxError('sandbox.invalid_contract', 'Invalid operation id');
    if (op.kind !== 'query' && op.kind !== 'command') throw new SandboxError('sandbox.invalid_contract', 'Operation kind must be query or command');
    assertSchema(op.input); assertSchema(op.output); assertEffects(op.effects);
    if ((op.effects.imageGeneration?.includes('generate') || op.effects.imageGeneration?.includes('bind')) && !op.effects.networkDomains?.length) throw new SandboxError('sandbox.invalid_contract', 'Image generation names the address it reaches in networkDomains');
    if (op.kind === 'query' && (op.effects.modelSettings?.includes('save') || op.effects.imageGeneration?.some(v => v !== 'read'))) throw new SandboxError('sandbox.invalid_contract', 'Queries cannot save model settings, generate images or bind image connections');
    if (op.kind === 'query' && (op.effects.storage?.includes('write') || op.effects.artifacts?.includes('write') || op.effects.projectDatabase?.includes('write') || op.effects.homeDatabase?.includes('write') || op.effects.ownerFiles?.includes('write') || op.effects.model?.includes('invoke') || op.effects.materials?.some(v => v !== 'read') || op.effects.events?.length || op.effects.background?.length)) throw new SandboxError('sandbox.invalid_contract', 'Queries cannot declare writes, a model request, a page fetch or saved original files, background work, or publish events');
    if (!Array.isArray(op.errors) || op.errors.some(e => !id(e.code) || typeof e.description !== 'string') || !unique(op.errors.map(e => e.code)) || !Array.isArray(op.examples) || (!proposal && !op.examples.length)) throw new SandboxError('sandbox.invalid_contract', 'Operations require errors and examples');
    for (const example of op.examples) {
      assertMatches(op.input, example.input);
      if (['output', 'outputIncludes', 'error'].filter(k => Object.hasOwn(example, k)).length !== 1) throw new SandboxError('sandbox.invalid_contract', 'Example requires exactly one expectation');
      if (Object.hasOwn(example, 'output')) assertMatches(op.output, example.output);
      if (Object.hasOwn(example, 'error') && !op.errors.some(e => e.code === example.error)) throw new SandboxError('sandbox.invalid_contract', 'Example error is undeclared');
    }
  }
  // A background run is a command of the contract with no background work of its own: one level, so a run cannot start more than the person approved.
  const backgroundProblems = sandboxBackgroundProblems(c);
  if (backgroundProblems.length) throw new SandboxError('sandbox.invalid_contract', backgroundProblems.join('; '));
  for (const entity of c.entities) { if (!id(entity.id)) throw new SandboxError('sandbox.invalid_contract', 'Invalid entity id'); assertSchema(entity.schema); }
  if (!unique(c.entities.map(e => e.id)) || !unique(c.pages.map(p => p.id)) || !unique(c.acceptance.map(a => a.id))) throw new SandboxError('sandbox.invalid_contract', 'Duplicate structural ids');
  const operationExists = (value: string) => c.operations.some(o => o.id === value);
  for (const page of c.pages) {
    if (!id(page.id) || typeof page.title !== 'string' || !Array.isArray(page.regions) || !unique(page.regions.map(r => r.id))) throw new SandboxError('sandbox.invalid_contract', 'Invalid page');
    for (const region of page.regions) if (!id(region.id) || typeof region.title !== 'string' || !Array.isArray(region.operationIds) || !region.operationIds.every(operationExists)) throw new SandboxError('sandbox.invalid_contract', 'Invalid region operation binding');
  }
  for (const test of c.acceptance) if (!id(test.id) || typeof test.description !== 'string' || !Array.isArray(test.steps) || !test.steps.length || test.steps.some(s => typeof s.description !== 'string' || typeof s.expected !== 'string' || (s.operationId !== undefined && !operationExists(s.operationId)))) throw new SandboxError('sandbox.invalid_contract', 'Invalid acceptance case');
}

/** Frozen executable contracts always require behavioral examples. */
export function assertContract(contract: unknown): asserts contract is SandboxPluginContract {
  assertContractEnvelope(contract, false);
}

/** A proposal is read-only design content; examples may be absent but every supplied schema and example is checked. */
export function assertProposalContract(contract: unknown): asserts contract is SandboxPluginContract {
  assertContractEnvelope(contract, true);
}
