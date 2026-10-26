// This file is copied alone to a .mjs file. No host modules or credentials enter the sandbox.
import type { SandboxConnectionDescription, SandboxConnectionResponse, SandboxHostMessage, SandboxJson, SandboxModelAvailability, SandboxModelChoice, SandboxModelResult, SandboxOperations, SandboxOriginalPart, SandboxSdk, SandboxSdkMethod, SandboxSqlRow } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

const write = process.stdout.write.bind(process.stdout);
/** The Host's cap for one original file, and the part the channel carries at a time (the broker holds the same two numbers). */
const ORIGINAL_FILE_BYTES = 32 * 1024 * 1024;
const ORIGINAL_PART_BYTES = 256 * 1024;
const send = (value: unknown) => write(JSON.stringify(value) + '\n');
const pending = new Map<string, { resolve: (value: SandboxJson) => void; reject: (error: Error) => void }>();
let sequence = 0;
/** What crosses the channel is JSON; the Host checks its shape before drawing it. */
const json = (value: unknown) => value as SandboxJson;
/** What the Host answered, as the type the SDK promises; the Host checked its shape before it crossed. */
const answer = <T>(call: Promise<SandboxJson>) => call as Promise<T>;
let active: string | undefined;
let buffer = '';
const bundleUrl = process.argv[2]!;
const operations = (await import(bundleUrl)).operations as SandboxOperations;
if (!operations || typeof operations !== 'object' || Object.values(operations).some(value => typeof value !== 'function')) throw new Error('Plugin must export operations');
const rpc = (callId: string, method: SandboxSdkMethod, args: SandboxJson[]): Promise<SandboxJson> => {
  if (active !== callId) return Promise.reject(new Error('Operation is no longer active'));
  if (pending.size >= 64) return Promise.reject(Object.assign(new Error('SDK queue is full'), { code: 'sandbox.queue_full' }));
  const id = `${callId}:${++sequence}`;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send({ type: 'sdk', id, callId, method, args }); });
};
function sdk(callId: string): SandboxSdk {
  const invoke = (method: SandboxSdkMethod, args: SandboxJson[]) => rpc(callId, method, args);
  return {
    storage: {
      get: key => invoke('storage.get', [key]),
      set: async (key, value) => { await invoke('storage.set', [key, value]); },
      delete: async key => { await invoke('storage.delete', [key]); },
      list: prefix => invoke('storage.list', [prefix ?? '']) as Promise<Array<{ key: string; value: SandboxJson }>>,
    },
    artifacts: { get: id => invoke('artifacts.get', [id]), put: value => invoke('artifacts.put', [value]) },
    capability: { call: (id, input) => invoke('capability.call', [id, input]) },
    events: { publish: async (id, payload) => { await invoke('events.publish', [id, payload]); } },
    network: { request: request => invoke('network.request', [request as unknown as SandboxJson]) as unknown as ReturnType<SandboxSdk['network']['request']> },
    resource: { read: name => invoke('resource.read', [name]) as Promise<string> },
    projectDatabase: {
      get: (sql, parameters) => invoke('projectDatabase.get', [sql, parameters ?? []]) as Promise<SandboxSqlRow | null>,
      all: (sql, parameters) => invoke('projectDatabase.all', [sql, parameters ?? []]) as Promise<SandboxSqlRow[]>,
      transaction: statements => invoke('projectDatabase.transaction', [statements.map(item => ({ sql: item.sql, parameters: item.parameters ?? [] }))]) as Promise<Array<{ changes: number }>>,
    },
    homeDatabase: {
      get: (sql, parameters) => invoke('homeDatabase.get', [sql, parameters ?? []]) as Promise<SandboxSqlRow | null>,
      all: (sql, parameters) => invoke('homeDatabase.all', [sql, parameters ?? []]) as Promise<SandboxSqlRow[]>,
      transaction: statements => invoke('homeDatabase.transaction', [statements.map(item => ({ sql: item.sql, parameters: item.parameters ?? [] }))]) as Promise<Array<{ changes: number }>>,
    },
    connections: {
      request: (slot, request) => answer<SandboxConnectionResponse>(invoke('connections.request', [slot, json(request)])),
      describe: (slot, record) => answer<SandboxConnectionDescription>(invoke('connections.describe', [slot, record ?? null])),
      release: async (slot, record) => { await invoke('connections.release', [slot, record]); },
    },
    materials: {
      imageTextAvailable: () => answer<boolean>(invoke('materials.imageTextAvailable', [])),
      readDocuments: (files, request) => answer<Awaited<ReturnType<SandboxSdk['materials']['readDocuments']>>>(invoke('materials.readDocuments', [json(files), json(request ?? {})])),
      extract: (file, request) => answer<Awaited<ReturnType<SandboxSdk['materials']['extract']>>>(invoke('materials.extract', [json(file), json(request ?? {})])),
      readLocalPage: url => answer<Awaited<ReturnType<SandboxSdk['materials']['readLocalPage']>>>(invoke('materials.readLocalPage', [url])),
      claimOriginal: async recordKey => { await invoke('materials.claimOriginal', [recordKey]); },
      releaseOriginal: async recordKey => { await invoke('materials.releaseOriginal', [recordKey]); },
      // The whole file in parts of at most 256 KiB, each one a call the Host answers on its own; the revision of the first part is passed back with
      // every later one, so a file that changes in between is refused by the Host, not read as a mixture of two files.
      readOriginal: async (recordKey, request) => {
        const limit = request?.maxBytes ?? ORIGINAL_FILE_BYTES;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > ORIGINAL_FILE_BYTES) throw Object.assign(new Error('maxBytes is 1 byte to 32 MiB'), { code: 'sandbox.invalid_request' });
        const parts: Buffer[] = [];
        let offset = 0, revision: string | null = null;
        for (;;) {
          const part: SandboxOriginalPart = await answer<SandboxOriginalPart>(invoke('materials.readOriginalRange', [recordKey, offset, ORIGINAL_PART_BYTES, revision]));
          if (part.size > limit) throw Object.assign(new Error('The original file is larger than the limit'), { code: 'material.original.too_large' });
          revision = part.revision;
          if (part.byte_length) parts.push(Buffer.from(part.data_base64, 'base64'));
          offset += part.byte_length;
          if (!part.byte_length || offset >= part.size) return { bytes: Buffer.concat(parts) };
        }
      },
    },
    ownerFiles: {
      stat: path => answer<Awaited<ReturnType<SandboxSdk['ownerFiles']['stat']>>>(invoke('ownerFiles.stat', [path])),
      list: path => answer<Awaited<ReturnType<SandboxSdk['ownerFiles']['list']>>>(invoke('ownerFiles.list', [path])),
      read: path => answer<Awaited<ReturnType<SandboxSdk['ownerFiles']['read']>>>(invoke('ownerFiles.read', [path])),
      write: async changes => { await invoke('ownerFiles.write', [json(changes)]); },
    },
    model: {
      choices: () => answer<SandboxModelChoice[]>(invoke('model.choices', [])),
      availability: selection => answer<SandboxModelAvailability>(invoke('model.availability', [selection === undefined ? null : json(selection)])),
      complete: request => answer<SandboxModelResult>(invoke('model.complete', [json(request)])),
    },
    background: {
      start: (operation, input) => invoke('background.start', [operation, json(input)]) as Promise<string>,
      cancel: id => invoke('background.cancel', [id]) as Promise<boolean>,
    },
    interaction: {
      questionHtml: (question, options) => invoke('interaction.questionHtml', [json(question), json(options ?? {})]) as Promise<string>,
      cardHtml: (card, options) => invoke('interaction.cardHtml', [json(card), json(options ?? {})]) as Promise<string>,
      nextStepsHtml: input => invoke('interaction.nextStepsHtml', [json(input)]) as Promise<string>,
    },
  };
}
async function receive(message: SandboxHostMessage): Promise<void> {
  if (message.type === 'sdk-result' || message.type === 'sdk-error') {
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.type === 'sdk-result') call.resolve(message.value);
    else call.reject(Object.assign(new Error(message.message), { code: message.code }));
    return;
  }
  if (active || !Object.hasOwn(operations, message.operationId)) process.exit(70);
  active = message.id;
  try {
    const value = await operations[message.operationId]!(message.input, sdk(message.id));
    if (pending.size) throw Object.assign(new Error('Operation returned before awaiting all SDK calls'), { code: 'sandbox.unawaited_sdk' });
    send({ type: 'result', id: message.id, value });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    send({ type: 'error', id: message.id, code: typeof e?.code === 'string' ? e.code : 'sandbox.plugin_error', message: typeof e?.message === 'string' ? e.message.slice(0, 2048) : 'Plugin operation failed' });
  } finally {
    active = undefined;
    for (const call of pending.values()) call.reject(new Error('Operation completed'));
    pending.clear();
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 1024 * 1024) process.exit(71);
  let index: number;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    let message: SandboxHostMessage;
    try { message = JSON.parse(line) as SandboxHostMessage; } catch { process.exit(72); }
    void receive(message).catch(() => process.exit(73));
  }
});
process.stdin.on('end', () => process.exit(0));
send({ type: 'ready', operations: Object.keys(operations).sort() });
