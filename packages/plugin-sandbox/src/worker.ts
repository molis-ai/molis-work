// This file is copied alone to a .mjs file. No host modules or credentials enter the sandbox.
import type { SandboxHostMessage, SandboxJson, SandboxOperations, SandboxSdk, SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

const write = process.stdout.write.bind(process.stdout);
const send = (value: unknown) => write(JSON.stringify(value) + '\n');
const pending = new Map<string, { resolve: (value: SandboxJson) => void; reject: (error: Error) => void }>();
let sequence = 0;
let active: string | undefined;
let buffer = '';
const bundleUrl = process.argv[2]!;
const operations = (await import(bundleUrl)).operations as SandboxOperations;
if (!operations || typeof operations !== 'object' || Object.values(operations).some(value => typeof value !== 'function')) throw new Error('Plugin must export operations');
const rpc = (callId: string, method: SandboxSdkMethod, args: SandboxJson[]): Promise<SandboxJson> => {
  if (active !== callId) return Promise.reject(new Error('Operation is no longer active'));
  if (pending.size >= 64) return Promise.reject(Object.assign(new Error('SDK queue is full'), { code: 'QUEUE_FULL' }));
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
    if (pending.size) throw Object.assign(new Error('Operation returned before awaiting all SDK calls'), { code: 'UNAWAITED_SDK' });
    send({ type: 'result', id: message.id, value });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    send({ type: 'error', id: message.id, code: typeof e?.code === 'string' ? e.code : 'PLUGIN_ERROR', message: typeof e?.message === 'string' ? e.message.slice(0, 2048) : 'Plugin operation failed' });
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
