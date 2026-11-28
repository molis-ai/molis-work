import type { PluginMaterialsClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxAttachmentPart, SandboxJson, SandboxMaterialDocumentBatch, SandboxMaterialExtraction, SandboxMaterialRequest, SandboxMaterialSourceContent } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { CONVERSATION_ATTACHMENT_LIMITS, type ConversationAttachmentContent, type MaterialSource, type MaterialUpload } from '@molis-ai/molis-work-contracts/services/materials';
import type { MaterialRef } from '@molis-ai/molis-work-contracts/platform/project-materials';
import { SandboxError } from './schema.js';

// The Host's readers of files the plugin already holds (`sdk.materials`, PG-017 P2). The reader is the activation's `services.materials`, the
// one the Host's own plugins get; it checks the Manifest's permission, the grant, the running action and the original caller again. This
// side bounds what crosses and takes out of the request what is not the plugin's to choose: the Host's limits.

const FILES = 100, FILE_NAME = 1024;
const READ_KEYS = ['timeoutMs', 'textFormat', 'pdfMode', 'ocrLanguages'] as const;
const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);

function plainObject(value: SandboxJson | undefined, what: string, keys: readonly string[]): { [key: string]: SandboxJson } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid(`${what} has unknown or missing fields`);
  return value;
}

/** One file as the plugin sent it: a name and base64 bytes, nothing else. The Host decodes and checks the base64 for documents; `materialSource` does it for one file. */
export function materialUpload(value: SandboxJson | undefined): MaterialUpload {
  const file = plainObject(value, 'A file', ['file_name', 'data_base64']);
  const { file_name, data_base64 } = file;
  if (typeof file_name !== 'string' || !file_name.trim() || file_name.length > FILE_NAME || /[\u0000-\u001f]/.test(file_name)) throw invalid('A file needs a printable name');
  if (typeof data_base64 !== 'string') throw invalid('A file needs its bytes in base64');
  return { file_name, data_base64 };
}

export function materialUploads(value: SandboxJson | undefined): MaterialUpload[] {
  if (!Array.isArray(value) || !value.length || value.length > FILES) throw invalid(`A read takes 1 to ${FILES} files`);
  return value.map(materialUpload);
}

/** One file decoded for `extract`: the encoding is checked before any bytes are allocated, and what does not round-trip is refused. */
export function materialSource(value: SandboxJson | undefined): MaterialSource {
  const { file_name, data_base64 } = materialUpload(value);
  if (data_base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data_base64)) throw invalid('The file bytes are not base64');
  const bytes = Buffer.from(data_base64, 'base64');
  if (bytes.toString('base64') !== data_base64) throw invalid('The file bytes are not base64');
  return { file_name, bytes };
}

const OCR_LANGUAGES: readonly string[] = ['zh-Hans', 'zh-Hant', 'en-US', 'ja-JP'];

/** The choices a plugin has over one read; `keys` narrows them for a reader that takes fewer (a document batch takes only `timeoutMs`). */
export function materialRequest(value: SandboxJson | undefined, keys: ReadonlyArray<typeof READ_KEYS[number]> = READ_KEYS): SandboxMaterialRequest {
  if (value === undefined) return {};
  const request = plainObject(value, 'A read request', keys);
  const { timeoutMs, textFormat, pdfMode, ocrLanguages } = request;
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) <= 0 || (timeoutMs as number) > 30 * 60_000)) throw invalid('timeoutMs is a positive number of milliseconds');
  if (textFormat !== undefined && textFormat !== 'text' && textFormat !== 'markdown') throw invalid('textFormat is text or markdown');
  if (pdfMode !== undefined && pdfMode !== 'text' && pdfMode !== 'ocr') throw invalid('pdfMode is text or ocr');
  if (ocrLanguages !== undefined && (!Array.isArray(ocrLanguages) || !ocrLanguages.length || ocrLanguages.length > OCR_LANGUAGES.length || ocrLanguages.some(item => !OCR_LANGUAGES.includes(item as string)))) throw invalid('ocrLanguages names zh-Hans, zh-Hant, en-US or ja-JP');
  return { ...(timeoutMs !== undefined ? { timeoutMs: timeoutMs as number } : {}), ...(textFormat !== undefined ? { textFormat } : {}),
    ...(pdfMode !== undefined ? { pdfMode } : {}), ...(ocrLanguages !== undefined ? { ocrLanguages: [...new Set(ocrLanguages)] as SandboxMaterialRequest['ocrLanguages'] } : {}) };
}

/** What a reader answers, as the plain JSON the channel carries: a field it left `undefined` is not there. */
export function plainJson(value: unknown): SandboxJson {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** The most one part of an original file carries over the channel: 256 KiB, a base64 string of about 342 KB, inside half a megabyte for a result. */
export const ORIGINAL_PART_BYTES = 256 * 1024;
const ORIGINAL_FILE_BYTES = 32 * 1024 * 1024;
const ADDRESS = 2048;

/**
 * The page a plugin asked the Host to read: an https address with no credentials and no port of its own, as the sandbox's own network
 * accepts. Its host is what the broker holds to the operation's approved `networkDomains`.
 */
export function materialSourceUrl(value: SandboxJson | undefined): URL {
  let url: URL;
  try { url = new URL(typeof value === 'string' && value.length <= ADDRESS ? value : ''); } catch { throw invalid('A page to read is an https address'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname) throw invalid('A page to read is an https address without credentials or a port');
  return url;
}

/** The hosts one read may contact: those the operation declared and the person approved. The Host's reader takes at most 20. */
export function materialReadDomains(declared: readonly string[] | undefined, approved: readonly string[] | undefined): string[] {
  const domains = (declared ?? []).filter(domain => approved?.includes(domain));
  if (domains.length > 20) throw invalid('A page read can be held to at most 20 approved domains');
  return domains;
}

/** The address of a page on this machine as the plugin sent it: a printable string. Whether it is a loopback address is the Host's judgment alone (S-09). */
export function materialLocalUrl(value: SandboxJson | undefined): string {
  if (typeof value !== 'string' || !value || value.length > ADDRESS || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('An address is a printable string of at most 2048 characters');
  return value;
}

/** The plugin's own key for a saved original file, bounded the way the Host's client bounds it; what it names is the Host's registration, never a path. */
export function originalRecordKey(value: SandboxJson | undefined): string {
  if (typeof value !== 'string' || !value || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('A record key is a printable string of at most 200 characters');
  return value;
}

/** Which part of the file: a start inside the Host's cap, a length of at most 256 KiB, and the revision an earlier part answered (`null` for the first). */
export function originalPart(offset: SandboxJson | undefined, length: SandboxJson | undefined, revision: SandboxJson | undefined): { offset: number; length: number; revision?: string } {
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset > ORIGINAL_FILE_BYTES) throw invalid('A start is a whole number of bytes inside the 32 MiB cap');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 1 || length > ORIGINAL_PART_BYTES) throw invalid('A part is 1 byte to 256 KiB');
  if (revision !== null && (typeof revision !== 'string' || !/^[0-9a-f]{32}$/.test(revision))) throw invalid('A revision is the one an earlier part answered');
  return { offset, length, ...(revision !== null ? { revision } : {}) };
}

/** The answers cross as what the sandbox's declarations promise: a Host reader whose result no longer fits `SandboxMaterial*` fails to compile here. */
export const documentBatchJson = (batch: SandboxMaterialDocumentBatch): SandboxJson => plainJson(batch);
export const extractionJson = (extraction: SandboxMaterialExtraction): SandboxJson => plainJson(extraction);
export const sourceContentJson = (content: SandboxMaterialSourceContent): SandboxJson => plainJson(content);

/**
 * An attachment as the plugin names it back: the plain reference the Host gave it, nothing else. Whether it is this installation's is
 * the Host's to say; this side only bounds what crosses.
 */
export function attachmentRef(value: SandboxJson | undefined): MaterialRef {
  const ref = plainObject(value, 'An attachment', ['subject', 'pin']);
  const subject = plainObject(ref.subject, 'An attachment subject', ['kind', 'id']), pin = plainObject(ref.pin, 'An attachment pin', ['mode', 'read_revision']);
  const short = (item: SandboxJson | undefined) => typeof item === 'string' && item.length > 0 && item.length <= 200;
  if (!short(subject.kind) || !short(subject.id) || pin.mode !== 'current' || !short(pin.read_revision)) throw invalid('An attachment is the reference the Host gave');
  return { subject: { kind: subject.kind as string, id: subject.id as string }, pin: { mode: 'current', read_revision: pin.read_revision as string } };
}

/** Which part of an attached picture: a start inside the 5 MB a picture may be, and at most 256 KiB. */
export function attachmentPart(offset: SandboxJson | undefined, length: SandboxJson | undefined): { offset: number; length: number } {
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset > CONVERSATION_ATTACHMENT_LIMITS.image_bytes) throw invalid('A start is a whole number of bytes inside the picture');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 1 || length > ORIGINAL_PART_BYTES) throw invalid('A part is 1 byte to 256 KiB');
  return { offset, length };
}

/**
 * The three attachment methods the worker calls (attach, read the text, read a picture's part), each with its own argument count; undefined
 * when the Host built no attachment service for this activation. The Host's client names the owner; this side only bounds what crosses.
 */
const attachmentReads = new WeakMap<object, Map<string, NonNullable<ConversationAttachmentContent['image']>>>();

export function attachmentCall(method: string, args: readonly SandboxJson[], materials: PluginMaterialsClient | undefined, signal: AbortSignal | undefined,
  call?: object): Promise<SandboxJson> | undefined {
  const count = (n: number) => { if (args.length !== n) throw invalid('Invalid SDK argument count'); };
  if (method === 'materials.attach') {
    if (args.length !== 2) count(1);
    const upload = materialUpload(args[0]);
    const expected_kind = args.length === 2 ? plainObject(args[1], 'An attachment request', ['expected_kind']).expected_kind : undefined;
    if (expected_kind !== undefined && expected_kind !== 'image') throw invalid('An expected attachment kind is image');
    return materials?.attach && (async () => plainJson(await materials.attach!(upload, { signal, expected_kind })))();
  }
  if (method === 'materials.readAttachment') { count(1); const ref = attachmentRef(args[0]); return materials?.readAttachment && (async () => plainJson(await materials.readAttachment!(ref, { as: 'text', ...(signal ? { signal } : {}) })))(); }
  if (method !== 'materials.readAttachmentPart') throw invalid('Unknown materials method');
  count(3);
  const ref = attachmentRef(args[0]), { offset, length } = attachmentPart(args[1], args[2]);
  return materials?.readAttachment && (async () => {
    let held = call && attachmentReads.get(call);
    if (!held && call) attachmentReads.set(call, held = new Map());
    const key = JSON.stringify([ref.subject.kind, ref.subject.id, ref.pin]);
    let image = held?.get(key);
    if (image) {
      // Recheck the running grant and exact attachment row, without loading the immutable bytes again.
      const meta = await materials.readAttachment!(ref, { as: 'text', signal });
      if (meta.attachment.kind !== 'image') throw invalid('This attachment is not a picture');
    } else {
      image = (await materials.readAttachment!(ref, { as: 'image', signal })).image;
      if (!image || image.bytes.byteLength > CONVERSATION_ATTACHMENT_LIMITS.image_bytes) throw invalid('This attachment is not a supported picture');
    }
    if (held) {
      held.delete(key);
      if (held.size >= CONVERSATION_ATTACHMENT_LIMITS.round_images) held.delete(held.keys().next().value!);
      held.set(key, image);
    }
    const part = image.bytes.subarray(offset, offset + length);
    const bytes = Buffer.from(part.buffer, part.byteOffset, part.byteLength);
    return { data_base64: bytes.toString('base64'), byte_length: bytes.length, size: image.bytes.length, media_type: image.media_type } satisfies SandboxAttachmentPart;
  })();
}
