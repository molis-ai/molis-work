import type { InstructedPrompt, InstructionPrompt } from '@molis-ai/molis-work-contracts/platform/model-prompts';
import { PLUGIN_MODEL_LIMITS, type PluginModelAvailability, type PluginModelClient, type PluginModelRequest, type PluginModelResult, type PluginModelSelection } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxJson, SandboxModelAvailability, SandboxModelChoice, SandboxModelResult } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { plainJson } from './materials.js';
import { SandboxError } from './schema.js';

// The Host's text model over the channel (`sdk.model`, PG-017 P1). The client is the one the Host's own plugins get: it checks the Manifest's
// `model:*` permissions, the grant, the running instance, that the call is inside one of the plugin's own concurrent actions that declare
// `model:invoke`, the original caller's `beforeEffect()` before and after, and that the instruction is the plugin's own. This side adds what a
// channel needs and a sandboxed package must not have: the text of a prompt never comes from the package (it names an instruction the package
// registered, and the Host sends the person's version of it), and nothing but bounded JSON crosses.

/** The instruction ids are the register's own tokens (`defineInstructionPrompt`). */
const INSTRUCTION_ID = /^[a-z0-9][a-z0-9.-]{0,127}$/u;
/**
 * One call's material, counted in characters as the Host's prompt port counts a prompt (`apps/local-host/src/host-complete-text.ts`): 180_000,
 * the text that port leaves room for next to the longest instruction a person can save and the "\n\n" between them, so data let through here is
 * not refused there (T-238).
 */
export const MODEL_DATA_CHARS = 180_000;
/** The same material in UTF-16 units: the bound it had before, as the channel carries it as JSON inside a megabyte. Counting characters does not raise it. */
const MODEL_DATA_UNITS = 200_000;
const MODEL_NAME = 200;
interface SandboxDeadlines { operationTimeoutMs: number; serviceTimeoutMs: number }
const REQUEST_KEYS = ['prompt_id', 'data', 'system_id', 'selection', 'output', 'timeout_ms', 'max_output_tokens'] as const;

/**
 * What the broker may call: the three members of the Host's client that a channel can carry, and the instructions the package registered.
 * `configuration` (the Home's model settings) is not among them, so it cannot be forwarded by mistake (BL-490/491).
 */
export interface SandboxModel {
  readonly client: Pick<PluginModelClient, 'choices' | 'availability' | 'complete'>;
  readonly instructions: readonly InstructionPrompt[];
}

export function sandboxModel(client: PluginModelClient, instructions: readonly InstructionPrompt[]): SandboxModel {
  return Object.freeze<SandboxModel>({
    client: Object.freeze<SandboxModel['client']>({ choices: () => client.choices(), availability: selection => client.availability(selection), complete: (prompt, request) => client.complete(prompt, request) }),
    instructions,
  });
}

const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);

function name(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MODEL_NAME || /[\u0000-\u001f\u007f]/.test(value)) throw invalid(`${what} is a printable string of at most ${MODEL_NAME} characters`);
  return value;
}

/** A selection as the plugin sent it: two names. Whether the Home has that model is the Host's to say. */
export function modelSelection(value: SandboxJson | undefined): PluginModelSelection | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'provider_id' && key !== 'model_id')) throw invalid('A model selection is { provider_id, model_id }');
  return { provider_id: name(value.provider_id, 'provider_id'), model_id: name(value.model_id, 'model_id') };
}

function instruction(known: readonly InstructionPrompt[], id: unknown, what: string): InstructionPrompt {
  if (typeof id !== 'string' || !INSTRUCTION_ID.test(id)) throw invalid(`${what} is the id of an instruction the package registered`);
  const found = known.find(item => item.prompt_id === id);
  if (!found) throw new SandboxError('sandbox.instruction_unknown', `${what} ${id} is not an instruction this package registered`);
  return found;
}

/** UTF-16 units are never fewer than characters, so only data between the two bounds needs its characters counted, once (as the port does). */
function dataTooLong(data: string): boolean {
  if (data.length > MODEL_DATA_UNITS) return true;
  if (data.length <= MODEL_DATA_CHARS) return false;
  return [...data].length > MODEL_DATA_CHARS;
}

/**
 * The prompt and the request of one `complete`, from the JSON the package sent. Unknown keys, a missing instruction and a text that is too long
 * are refused here; the ranges of the limits are the Host's client's, so a mistake there gets the same code as for a plugin the Host runs itself.
 */
export function modelCall(value: SandboxJson | undefined, known: readonly InstructionPrompt[]): { prompt: InstructedPrompt; request: Omit<PluginModelRequest, 'signal'> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('A model request is an object');
  for (const key of Object.keys(value)) if (!(REQUEST_KEYS as readonly string[]).includes(key)) throw invalid(`Unknown model request member: ${key}`);
  if (typeof value.data !== 'string' || dataTooLong(value.data)) throw invalid(`The data of a model request is a string of at most ${MODEL_DATA_CHARS} characters`);
  const { output, timeout_ms: timeout, max_output_tokens: maxTokens } = value;
  if (output !== undefined && output !== 'text' && output !== 'json') throw invalid('output is "text" or "json"');
  if (timeout !== undefined && typeof timeout !== 'number') throw invalid('timeout_ms is a number');
  if (maxTokens !== undefined && typeof maxTokens !== 'number') throw invalid('max_output_tokens is a number');
  const selection = modelSelection(value.selection);
  const system = value.system_id === undefined ? undefined : instruction(known, value.system_id, 'system_id');
  return {
    prompt: { instruction: instruction(known, value.prompt_id, 'prompt_id'), data: value.data },
    request: { ...(system ? { system } : {}), ...(selection ? { selection } : {}), ...(output !== undefined ? { output } : {}),
      ...(timeout !== undefined ? { timeout_ms: timeout } : {}), ...(maxTokens !== undefined ? { max_output_tokens: maxTokens } : {}) },
  };
}

/** The answers cross as what the sandbox's declarations promise: a Host reply that no longer fits `SandboxModel*` fails to compile here. */
export const choicesJson = (choices: readonly SandboxModelChoice[]): SandboxJson => plainJson(choices.map(({ provider_id, model_id, label, vision, reasoning_effort }) => ({ provider_id, model_id, label, vision, reasoning_effort })));

export function availabilityJson(availability: PluginModelAvailability): SandboxJson {
  const shown = { ...(availability.runtime_label !== undefined ? { runtime_label: availability.runtime_label } : {}), ...(availability.vision !== undefined ? { vision: availability.vision } : {}) };
  const out: SandboxModelAvailability = availability.available ? { available: true, ...shown } : { available: false, code: availability.code, reason: availability.reason, ...shown };
  return plainJson(out);
}

/** Text, the decoded value and the token counts; the receipt of the run and the commit guard stay on the Host's side of the channel. */
export function modelResultJson(result: PluginModelResult): SandboxJson {
  const out: SandboxModelResult = { text: result.text,
    ...(result.value !== undefined ? { value: plainJson(result.value) } : {}),
    ...(result.usage ? { usage: { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens } } : {}) };
  return plainJson(out);
}

/**
 * A model call lasts as long as the Host lets it (`PLUGIN_MODEL_LIMITS.max_timeout_ms`), far beyond the deadlines of a read or a save. The
 * deadlines of an operation that may make one are that and a little more, so what the plugin sees is the Host's refusal, not the sandbox's
 * timeout. The Host's own caller can still set shorter ones (`override`), and those win.
 */
export function modelDeadlines(effects: SandboxEffects, base: SandboxDeadlines, override?: Partial<SandboxDeadlines>): SandboxDeadlines {
  const service = effects.model?.includes('invoke') ? Math.max(base.serviceTimeoutMs, PLUGIN_MODEL_LIMITS.max_timeout_ms + 30_000) : base.serviceTimeoutMs;
  const operation = effects.model?.includes('invoke') ? Math.max(base.operationTimeoutMs, service + 30_000) : base.operationTimeoutMs;
  return { operationTimeoutMs: override?.operationTimeoutMs ?? operation, serviceTimeoutMs: override?.serviceTimeoutMs ?? service };
}
