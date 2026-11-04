import type { PluginImageGenerationClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SANDBOX_IMAGE_LIMITS, type SandboxImageConnection, type SandboxImageRequest, type SandboxImageResult, type SandboxImageState, type SandboxImageTarget, type SandboxJson, type SandboxOperationContract, type SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { DispatchGuards, SandboxServiceContext } from './broker.js';
import { plainJson } from './materials.js';
import { SandboxError } from './schema.js';

// The person's image generation over the channel (`sdk.imageGeneration`, PG-017 BL-491). The client is the Host's own, already reduced to what a
// package may do (it uses a connection only at the address the person pinned it to); this side adds what a channel needs: bounded JSON in, a bounded
// base64 result out, and the address a call names is one of the operation's approved `networkDomains` (checked by the broker with `imageHost`).

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

/** The pictures as base64, at most the channel's share: more pictures or more bytes than `SANDBOX_IMAGE_LIMITS` is refused, not cut. */
export function imageResultJson(result: { images: readonly { bytes: Uint8Array; mime?: string }[]; revision: string }): SandboxJson {
  let total = 0;
  if (result.images.length > SANDBOX_IMAGE_LIMITS.max_images) throw new SandboxError('sandbox.response_too_large', `At most ${SANDBOX_IMAGE_LIMITS.max_images} images cross the channel`);
  for (const image of result.images) {
    total += image.bytes.byteLength;
    if (total > SANDBOX_IMAGE_LIMITS.max_bytes) throw new SandboxError('sandbox.response_too_large', `At most ${SANDBOX_IMAGE_LIMITS.max_bytes} bytes of images cross the channel`);
  }
  const out: SandboxImageResult = { images: result.images.map(image => ({ base64: Buffer.from(image.bytes).toString('base64'), ...(image.mime ? { mime: image.mime } : {}) })), revision: result.revision };
  return plainJson(out);
}

export async function imageGenerationCall(images: SandboxImageGeneration | undefined, context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, string, missing }: DispatchGuards): Promise<SandboxJson> {
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
  if (method !== 'imageGeneration.generate') throw new SandboxError('sandbox.invalid_request', 'Unknown image generation method');
  permit('imageGeneration', 'generate'); count(1);
  const request = imageRequest(args[0]);
  permit('networkDomains', imageHost(request.base_url));
  if (!images) return missing();
  return imageResultJson(await images.generate(request, { signal: context.signal }));
}
