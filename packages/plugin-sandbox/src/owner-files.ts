import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxOwnerFileChange, SandboxOwnerFileContent, SandboxOwnerFileEntry, SandboxOwnerFileInfo } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SandboxError } from './schema.js';

// The plugin's own files over the channel (`sdk.ownerFiles`, PG-017 P2c, S-64). The reader and writer are the activation's `services.ownerFiles`,
// the one the Host's own plugins get: it checks the Manifest's permissions, the grant, the running action, the original caller and, in the port
// below it, that every path is a strict relative path inside a declared top-level entry, with no link or special node on the way. This side
// takes out of the request what the Host's client would hand a plugin and a channel cannot carry: the folder's location (`rootPath`) and the
// writer callback. What is left is bounded JSON: relative paths, base64 bytes, a few steps per call, and a size for each file and for each call.

/** One file in either direction; a read of it is a base64 string of about 342 KB, well inside the channel's half megabyte for a result. */
export const OWNER_FILE_BYTES = 256 * 1024;
/** All the bytes of one `write` call: two files of the most, 683 KB as base64, inside the channel's megabyte for a request. */
export const OWNER_FILE_CALL_BYTES = 512 * 1024;
export const OWNER_FILE_STEPS = 16;
export const OWNER_FILE_LIST_ENTRIES = 1000;
const PATH = 512;
const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);
const tooLarge = (message: string) => new SandboxError('sandbox.owner_file_too_large', message);

/** What the broker may call: the reader and `write`; the folder's location is not among them, so it cannot be forwarded by mistake. */
export type SandboxOwnerFiles = Pick<PluginOwnerFilesClient, 'stat' | 'read' | 'list' | 'write'>;

/** The four members and nothing else of the Host's client, so `rootPath` is not reachable from the sandbox whatever the client carries. */
export function sandboxOwnerFiles(client: PluginOwnerFilesClient): SandboxOwnerFiles {
  return Object.freeze<SandboxOwnerFiles>({ stat: relative => client.stat(relative), read: relative => client.read(relative), list: relative => client.list(relative),
    write: run => client.write(run) });
}

/** A path as the plugin sent it. Its structure (segments, the declared entry, links) is the Host port's to refuse; this is the channel's bound. */
export function ownerFilePath(value: SandboxJson | undefined): string {
  if (typeof value !== 'string' || !value || value.length > PATH || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('A file path is a printable string of at most 512 characters');
  return value;
}

/** Bytes of a base64 string checked before anything is allocated: the encoding must round-trip and the size must fit one file. */
function decodeFile(value: SandboxJson | undefined): Buffer {
  if (typeof value !== 'string') throw invalid('A file needs its bytes in base64');
  if (value.length > Math.ceil(OWNER_FILE_BYTES / 3) * 4) throw tooLarge('A file is at most 256 KiB');
  if (value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw invalid('The file bytes are not base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw invalid('The file bytes are not base64');
  if (bytes.byteLength > OWNER_FILE_BYTES) throw tooLarge('A file is at most 256 KiB');
  return bytes;
}

type Step = { op: 'mkdir'; path: string } | { op: 'write'; path: string; bytes: Buffer; mode: 'create' | 'replace' } | { op: 'replace_atomic'; path: string; bytes: Buffer }
  | { op: 'copy'; from: string; to: string } | { op: 'remove'; path: string } | { op: 'set_access'; path: string; access: 'readonly' | 'readwrite' };
const FIELDS: Record<SandboxOwnerFileChange['op'], readonly string[]> = {
  mkdir: ['op', 'path'], write: ['op', 'path', 'data_base64', 'mode'], replace_atomic: ['op', 'path', 'data_base64'], copy: ['op', 'from', 'to'], remove: ['op', 'path'], set_access: ['op', 'path', 'access'],
};

/** The steps of one write, each of one of the six operations of the Host's writer with exactly its fields, every byte decoded and counted. */
export function ownerFileChanges(value: SandboxJson | undefined): Step[] {
  if (!Array.isArray(value) || !value.length || value.length > OWNER_FILE_STEPS) throw invalid(`A write takes 1 to ${OWNER_FILE_STEPS} steps`);
  let total = 0;
  return value.map((item): Step => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid('A step of a write is an object');
    const step = item as { [key: string]: SandboxJson };
    const op = step.op as SandboxOwnerFileChange['op'];
    if (typeof op !== 'string' || !Object.hasOwn(FIELDS, op)) throw invalid('A step of a write names one of mkdir, write, replace_atomic, copy, remove or set_access');
    if (Object.keys(step).length !== FIELDS[op].length || Object.keys(step).some(key => !FIELDS[op].includes(key))) throw invalid(`A ${op} step has exactly the fields ${FIELDS[op].join(', ')}`);
    const bytes = () => {
      const decoded = decodeFile(step.data_base64);
      total += decoded.byteLength;
      if (total > OWNER_FILE_CALL_BYTES) throw tooLarge('A write carries at most 512 KiB');
      return decoded;
    };
    switch (op) {
      case 'mkdir': case 'remove': return { op, path: ownerFilePath(step.path) };
      case 'write': {
        if (step.mode !== 'create' && step.mode !== 'replace') throw invalid('A write is create or replace');
        return { op, path: ownerFilePath(step.path), bytes: bytes(), mode: step.mode };
      }
      case 'replace_atomic': return { op, path: ownerFilePath(step.path), bytes: bytes() };
      case 'copy': return { op, from: ownerFilePath(step.from), to: ownerFilePath(step.to) };
      case 'set_access': {
        if (step.access !== 'readonly' && step.access !== 'readwrite') throw invalid('Access is readonly or readwrite');
        return { op, path: ownerFilePath(step.path), access: step.access };
      }
    }
  });
}

/** Runs the steps in order on the Host's writer, which checks the grant and the call again before each one; the first it refuses ends the write. */
export function applyOwnerFileChanges(writer: PluginOwnerFilesWriter, steps: readonly Step[]): void {
  for (const step of steps) {
    switch (step.op) {
      case 'mkdir': writer.mkdir(step.path); break;
      case 'write': writer.writeFile(step.path, step.bytes, step.mode); break;
      case 'replace_atomic': writer.replaceFileAtomic(step.path, step.bytes); break;
      case 'copy': writer.copyFile(step.from, step.to); break;
      case 'remove': writer.removeTree(step.path); break;
      case 'set_access': writer.setAccess(step.path, step.access); break;
    }
  }
}

export const ownerFileInfo = (files: SandboxOwnerFiles, path: string): SandboxOwnerFileInfo | null => files.stat(path);

export function ownerFileList(files: SandboxOwnerFiles, path: string): SandboxOwnerFileEntry[] {
  const entries = files.list(path);
  if (entries.length > OWNER_FILE_LIST_ENTRIES) throw tooLarge(`A folder lists at most ${OWNER_FILE_LIST_ENTRIES} entries`);
  return entries.map(({ name, kind }) => ({ name, kind }));
}

/** One file of at most 256 KiB, asked for its size first so that a larger one is never read into the Host's memory for a plugin that cannot take it. */
export function ownerFileRead(files: SandboxOwnerFiles, path: string): SandboxOwnerFileContent | null {
  const info = files.stat(path);
  if (!info) return null;
  if (info.kind !== 'file') throw invalid('A path to read names a file');
  if (info.byte_length > OWNER_FILE_BYTES) throw tooLarge('A file is at most 256 KiB');
  const bytes = files.read(path);
  if (!bytes) return null;
  if (bytes.byteLength > OWNER_FILE_BYTES) throw tooLarge('A file is at most 256 KiB');
  return { data_base64: Buffer.from(bytes).toString('base64'), byte_length: bytes.byteLength };
}
