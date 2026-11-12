import type { PluginImageGenerationClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SANDBOX_IMAGE_LIMITS, type SandboxImageConnection, type SandboxImageDescriptor, type SandboxImagePart, type SandboxImageRequest, type SandboxImageState, type SandboxImageTarget, type SandboxJson, type SandboxOperationContract, type SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { randomUUID } from 'node:crypto';
import type { DispatchGuards, SandboxServiceContext } from './broker.js';
import { plainJson } from './materials.js';
import { SandboxError } from './schema.js';

// The person's image generation over the channel (`sdk.imageGeneration`, PG-017 BL-491). The client is the Host's own, already reduced to what a
// package may do (it uses a connection only at the address the person pinned it to); this side adds what a channel needs: bounded JSON in, the pictures
// held for the operation call and read out in bounded parts (BL-918), and the address a call names is one of the operation's approved `networkDomains`
// (checked by the broker with `imageHost`).

/** What the broker may call. The Host builds it for the activation; the sandbox's version of the Host's client has no `Uint8Array` reach beyond `generate`. */
export type SandboxImageGeneration = Pick<PluginImageGenerationClient, 'connections' | 'inspect' | 'bind' | 'unbind' | 'generate'>;

const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);
const SLOT = /^[a-z][a-z0-9-]{0,127}$/u;
const TARGET_KEYS = ['slot_id', 'base_url'] as const;
const REQUEST_KEYS = ['slot_id', 'base_url', 'expected_revision', 'protocol', 'model', 'prompt', 'size', 'aspect_ratio'] as const;
const ADDRESS = 2048;

function text(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw invalid(`${what} is a printable string of at most ${max} characters`);
  return value;
}

/** A slot and the address it is used at: two names and nothing else. */
export function imageTarget(value: SandboxJson | undefined): SandboxImageTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('An image target is { slot_id, base_url }');
  for (const key of Object.keys(value)) if (!(TARGET_KEYS as readonly string[]).includes(key)) throw invalid(`Unknown image target member: ${key}`);
  const slot = text(value.slot_id, 'slot_id', 128);
  if (!SLOT.test(slot)) throw invalid('slot_id is a lowercase name');
  return { slot_id: slot, base_url: text(value.base_url, 'base_url', ADDRESS) };
}

export function imageRequest(value: SandboxJson | undefined): SandboxImageRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('An image request is an object');
  for (const key of Object.keys(value)) if (!(REQUEST_KEYS as readonly string[]).includes(key)) throw invalid(`Unknown image request member: ${key}`);
  const protocol = value.protocol;
  if (protocol !== 'openai-images' && protocol !== 'gemini') throw invalid('protocol is "openai-images" or "gemini"');
  return { ...imageTarget({ slot_id: value.slot_id ?? null, base_url: value.base_url ?? null }),
    expected_revision: text(value.expected_revision, 'expected_revision', 128), protocol, model: text(value.model, 'model', 200), prompt: text(value.prompt, 'prompt', 32_000),
    ...(value.size !== undefined ? { size: text(value.size, 'size', 64) } : {}), ...(value.aspect_ratio !== undefined ? { aspect_ratio: text(value.aspect_ratio, 'aspect_ratio', 64) } : {}) };
}

/** The host name of the address a call names: the one `networkDomains` must list. A page on this machine or at an IP address is never approved by a domain. */
export function imageHost(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw invalid('base_url is not an address'); }
  if (url.protocol !== 'https:') throw new SandboxError('sandbox.not_authorized', 'An image address is https');
  return url.hostname;
}

export const imageConnectionsJson = (connections: readonly { connection_id: string; display_name: string; state: string; target_origin?: string }[]): SandboxJson =>
  plainJson(connections.map(({ connection_id, display_name, state, target_origin }): SandboxImageConnection => ({ connection_id, display_name, state, ...(target_origin ? { target_origin } : {}) })));

export const imageStateJson = (state: { connection_id: string | null; available: boolean; has_key: boolean; revision: string; reason?: string }): SandboxJson =>
  plainJson(({ connection_id: state.connection_id, available: state.available, has_key: state.has_key, revision: state.revision, ...(state.reason !== undefined ? { reason: state.reason } : {}) }) satisfies SandboxImageState);

export type SandboxImageLimits = Readonly<typeof SANDBOX_IMAGE_LIMITS>;
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,100}$/u;
const tooLarge = (message: string) => new SandboxError('sandbox.response_too_large', message);
const unknownResult = () => new SandboxError('sandbox.not_authorized', 'No image result of this call has that id');
function exactObject(value: SandboxJson | undefined, keys: readonly string[], what: string): Record<string, SandboxJson> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${what} is an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw invalid(`Unknown ${what} member: ${key}`);
  return value;
}
function wholeNumber(value: SandboxJson | undefined, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw invalid(`${what} is a whole number from ${min} to ${max}`);
  return value;
}
const resultId = (value: SandboxJson | undefined) => text(value, 'result_id', 64);

/**
 * The pictures of at most one generation, held in the Host's memory for the runner call whose SDK asked (BL-918). The runner makes one per call and
 * closes it with that call's own controller, which aborts when the call ends in any way (result, plugin error, cancel, timeout, revocation, stop or
 * the process's exit); a closed holder takes nothing and answers nothing. Nothing is written anywhere, and the id is random and good only here.
 */
export class SandboxImageHolder {
  private held: { id: string; images: readonly Uint8Array[]; target: SandboxImageTarget; revision: string } | undefined;
  private released: string | undefined;
  private reserved = false;
  private closed = false;
  constructor(signal: AbortSignal, private readonly limits: SandboxImageLimits = SANDBOX_IMAGE_LIMITS) {
    if (signal.aborted) this.close();
    else signal.addEventListener('abort', () => this.close(), { once: true });
  }
  close(): void { this.closed = true; this.held = undefined; this.released = undefined; }
  /** One generation at a time: a second one while a result is held, or still being made, is refused before anything is sent. */
  reserve(): () => void {
    if (this.closed) throw new SandboxError('sandbox.cancelled', 'The operation call has ended');
    if (this.reserved || this.held) throw new SandboxError('sandbox.queue_full', 'Release the image result this call holds before generating again');
    this.reserved = true;
    return () => { this.reserved = false; };
  }
  /** Keep what the Host returned, after checking the actual bytes against the limits: refused whole, never cut. */
  hold(result: { images: readonly { bytes: Uint8Array; mime?: string }[]; revision: string }, target: SandboxImageTarget): SandboxImageDescriptor {
    if (this.closed) throw new SandboxError('sandbox.cancelled', 'The operation call has ended');
    const { max_images, max_image_bytes, max_bytes } = this.limits;
    if (!Array.isArray(result.images) || !result.images.length) throw new SandboxError('sandbox.host_service_error', 'The image service returned no picture');
    if (result.images.length > max_images) throw tooLarge(`At most ${max_images} images cross the channel`);
    let total = 0;
    for (const image of result.images) {
      if (!(image.bytes instanceof Uint8Array) || !image.bytes.byteLength) throw new SandboxError('sandbox.host_service_error', 'The image service returned an empty picture');
      if (image.bytes.byteLength > max_image_bytes) throw tooLarge(`At most ${max_image_bytes} bytes cross the channel for one image`);
      if ((total += image.bytes.byteLength) > max_bytes) throw tooLarge(`At most ${max_bytes} bytes of images cross the channel`);
      if (image.mime !== undefined && (typeof image.mime !== 'string' || !MIME.test(image.mime))) throw new SandboxError('sandbox.host_service_error', 'The image service returned an unknown kind of picture');
    }
    const id = randomUUID();
    this.held = { id, images: result.images.map(image => image.bytes), target: { ...target }, revision: text(result.revision, 'revision', 128) };
    return { result_id: id, revision: this.held.revision, images: result.images.map(image => ({ byte_length: image.bytes.byteLength, ...(image.mime ? { mime: image.mime } : {}) })) };
  }
  /** The held result an id names, for the gates a part passes again; any id but this call's own is the same refusal. */
  target(value: SandboxJson | undefined): { target: SandboxImageTarget; revision: string; range: SandboxImageRangeRequest } {
    const range = exactObject(value, ['result_id', 'image_index', 'offset', 'length'], 'image range');
    const request = { result_id: resultId(range.result_id), image_index: wholeNumber(range.image_index, 'image_index', 0, this.limits.max_images - 1),
      offset: wholeNumber(range.offset, 'offset', 0, this.limits.max_image_bytes - 1), length: wholeNumber(range.length, 'length', 1, this.limits.part_bytes) };
    const held = this.held;
    if (this.closed || !held || held.id !== request.result_id) throw unknownResult();
    return { target: held.target, revision: held.revision, range: request };
  }
  /** One part, after the gates: a short tail is the bytes that are left; a part outside the picture is refused. */
  part(range: SandboxImageRangeRequest): SandboxImagePart {
    const held = this.held;
    if (this.closed || !held || held.id !== range.result_id) throw unknownResult();
    const image = held.images[range.image_index];
    if (!image) throw invalid('image_index is past the last image');
    if (range.offset >= image.byteLength) throw invalid('offset is past the end of the image');
    const bytes = image.subarray(range.offset, Math.min(image.byteLength, range.offset + range.length));
    return { offset: range.offset, byte_length: bytes.byteLength, size: image.byteLength, data_base64: Buffer.from(bytes).toString('base64') };
  }
  /** Forget the result early; the same id again is nothing, and any other id is refused as unknown. */
  release(value: SandboxJson | undefined): void {
    const id = resultId(exactObject(value, ['result_id'], 'image release').result_id);
    if (this.held?.id === id) { this.held = undefined; this.released = id; return; }
    if (this.released !== id || this.closed) throw unknownResult();
  }
  /** The connection the result came through changed: nothing more of it is delivered. */
  drop(): void { this.held = undefined; }
}
type SandboxImageRangeRequest = { result_id: string; image_index: number; offset: number; length: number };

export async function imageGenerationCall(images: SandboxImageGeneration | undefined, holder: SandboxImageHolder | undefined, context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, string, missing }: DispatchGuards): Promise<SandboxJson> {
  // The Host's client asks the connection's pinned address (it never pins one here), the grant, the running instance and the original caller. Here: the
  // declared and approved effect, a command for anything that binds or spends, an address that is one of the operation's approved `networkDomains`
  // (the same approval as `network.request`), and a result inside the channel's share.
  if (method === 'imageGeneration.connections') { permit('imageGeneration', 'read'); count(0); return images ? imageConnectionsJson(await images.connections()) : missing(); }
  if (method === 'imageGeneration.inspect') {
    permit('imageGeneration', 'read'); count(1);
    const target = imageTarget(args[0]);
    permit('networkDomains', imageHost(target.base_url));
    return images ? imageStateJson(await images.inspect(target)) : missing();
  }
  if (operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot bind or generate images');
  if (method === 'imageGeneration.unbind') {
    permit('imageGeneration', 'bind'); count(1);
    const slot = imageTarget({ slot_id: string(0, 128), base_url: 'https://unbind.invalid' }).slot_id;
    if (!images) return missing();
    await context.beforeEffect?.(); await images.unbind(slot);
    return null;
  }
  if (method === 'imageGeneration.bind') {
    permit('imageGeneration', 'bind'); count(2);
    const target = imageTarget(args[0]), connection = string(1, 128);
    permit('networkDomains', imageHost(target.base_url));
    if (!images) return missing();
    await context.beforeEffect?.(); await images.bind(target, connection);
    return null;
  }
  if (method === 'imageGeneration.releaseResult') {
    permit('imageGeneration', 'generate'); count(1);
    if (!holder) throw unknownResult();
    holder.release(args[0]);
    return null;
  }
  if (method === 'imageGeneration.readRange') {
    // Every part passes the gates the generation passed: the effect and the address, the original caller's authority (`beforeEffect`), and the Host's
    // grant and connection revision (`inspect` inside the same action). A changed connection ends the result; no later part of it is delivered.
    permit('imageGeneration', 'generate'); count(1);
    if (!holder) throw unknownResult();
    const { target, revision, range } = holder.target(args[0]);
    permit('networkDomains', imageHost(target.base_url));
    if (!images) return missing();
    await context.beforeEffect?.();
    const state = await images.inspect(target);
    if (!state.available || state.revision !== revision) { holder.drop(); throw new SandboxError('sandbox.not_authorized', 'The image connection changed; the rest of the result is not delivered'); }
    return plainJson(holder.part(range));
  }
  if (method !== 'imageGeneration.generate') throw new SandboxError('sandbox.invalid_request', 'Unknown image generation method');
  permit('imageGeneration', 'generate'); count(1);
  const request = imageRequest(args[0]);
  permit('networkDomains', imageHost(request.base_url));
  if (!images) return missing();
  if (!holder) throw new SandboxError('sandbox.not_authorized', 'Images are generated only inside a running operation call');
  const free = holder.reserve();
  try {
    const result = await images.generate(request, { signal: context.signal });
    context.signal.throwIfAborted();
    return plainJson(holder.hold(result, { slot_id: request.slot_id, base_url: request.base_url }));
  } finally { free(); }
}
