import type { SandboxJson, SandboxMaterialDocumentBatch, SandboxMaterialExtraction, SandboxMaterialRequest } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { MaterialSource, MaterialUpload } from '@molis-ai/molis-work-contracts/services/materials';
import { SandboxError } from './schema.js';

// The Host's readers of files the plugin already holds (`sdk.materials`, PG-017 P2). The reader is the activation's `services.materials`, the
// one the Host's own plugins get; it checks the Manifest's permission, the grant, the running action and the original caller again. This
// side bounds what crosses and takes out of the request what is not the plugin's to choose: the Host's limits, model downloads and progress.

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

/** The choices a plugin has over one read; `keys` narrows them for a reader that takes fewer (a document batch takes only `timeoutMs`). */
export function materialRequest(value: SandboxJson | undefined, keys: ReadonlyArray<typeof READ_KEYS[number]> = READ_KEYS): SandboxMaterialRequest {
  if (value === undefined) return {};
  const request = plainObject(value, 'A read request', keys);
  const { timeoutMs, textFormat, pdfMode, ocrLanguages } = request;
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) <= 0 || (timeoutMs as number) > 30 * 60_000)) throw invalid('timeoutMs is a positive number of milliseconds');
  if (textFormat !== undefined && textFormat !== 'text' && textFormat !== 'markdown') throw invalid('textFormat is text or markdown');
  if (pdfMode !== undefined && pdfMode !== 'text' && pdfMode !== 'ocr') throw invalid('pdfMode is text or ocr');
  if (ocrLanguages !== undefined && (!Array.isArray(ocrLanguages) || ocrLanguages.length > 3 || ocrLanguages.some(item => item !== 'zh-Hans' && item !== 'zh-Hant' && item !== 'en-US'))) throw invalid('ocrLanguages names zh-Hans, zh-Hant or en-US');
  return { ...(timeoutMs !== undefined ? { timeoutMs: timeoutMs as number } : {}), ...(textFormat !== undefined ? { textFormat } : {}),
    ...(pdfMode !== undefined ? { pdfMode } : {}), ...(ocrLanguages !== undefined ? { ocrLanguages: ocrLanguages as SandboxMaterialRequest['ocrLanguages'] } : {}) };
}

/** What a reader answers, as the plain JSON the channel carries: a field it left `undefined` is not there. */
export function plainJson(value: unknown): SandboxJson {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** The answers cross as what the sandbox's declarations promise: a Host reader whose result no longer fits `SandboxMaterial*` fails to compile here. */
export const documentBatchJson = (batch: SandboxMaterialDocumentBatch): SandboxJson => plainJson(batch);
export const extractionJson = (extraction: SandboxMaterialExtraction): SandboxJson => plainJson(extraction);
