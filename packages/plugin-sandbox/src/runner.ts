import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { SandboxEffects, SandboxHostMessage, SandboxIdentity, SandboxJson, SandboxOperationContract, SandboxPluginContract, SandboxWorkerMessage } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SandboxBroker, type SandboxServices } from './broker.js';
import { BoundedQueue, RateBudget } from './queue.js';
import { assertContract, assertEffects, assertJson, assertMatches, SandboxError } from './schema.js';
import { seatbeltProfile } from './seatbelt.js';

export interface SandboxLimits {
  operationTimeoutMs: number; startupTimeoutMs: number; serviceTimeoutMs: number;
  operationQueue: number; sdkQueue: number; operationsPerMinute: number; sdkPerMinute: number; eventsPerMinute: number;
  messageBytes: number; bundleBytes: number; storageBytes: number; heapMb: number; rssMb: number; cpuMs: number;
}
export const DEFAULT_SANDBOX_LIMITS: Readonly<SandboxLimits> = Object.freeze({
  operationTimeoutMs: 15_000, startupTimeoutMs: 5_000, serviceTimeoutMs: 10_000,
  operationQueue: 16, sdkQueue: 32, operationsPerMinute: 120, sdkPerMinute: 600, eventsPerMinute: 60,
  messageBytes: 1024 * 1024, bundleBytes: 8 * 1024 * 1024, storageBytes: 5 * 1024 * 1024, heapMb: 64, rssMb: 192, cpuMs: 60_000,
});
export interface SandboxRunnerOptions {
  bundlePath: string; contract: SandboxPluginContract; identity: SandboxIdentity;
  grants: SandboxEffects; services: SandboxServices; limits?: Partial<SandboxLimits>;
}
export interface SandboxRunner {
  readonly pid: number;
  call(operationId: string, input: SandboxJson): Promise<SandboxJson>;
  stop(): Promise<void>;
}

export async function createSandboxRunner(options: SandboxRunnerOptions): Promise<SandboxRunner> {
  if (process.platform !== 'darwin') throw new SandboxError('UNSUPPORTED_PLATFORM', 'Generated plugins require macOS Seatbelt');
  assertContract(options.contract); assertEffects(options.grants);
  const contract = structuredClone(options.contract), grants = structuredClone(options.grants);
  const identity = Object.freeze(structuredClone(options.identity));
  if (identity.pluginId !== contract.pluginId || !identity.projectId || !identity.installationId || !['preview', 'installed'].includes(identity.namespace)) throw new SandboxError('INVALID_IDENTITY', 'Host identity does not match contract');
  const limits = { ...DEFAULT_SANDBOX_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new SandboxError('INVALID_LIMIT', `${key} must be a positive integer`);
  if (limits.heapMb < 16 || limits.messageBytes > 1024 * 1024 || limits.rssMb < limits.heapMb) throw new SandboxError('INVALID_LIMIT', 'Invalid memory or channel bounds');
  const source = await fs.open(options.bundlePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bundle: Buffer;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > limits.bundleBytes) throw new SandboxError('INVALID_BUNDLE', 'Bundle must be a bounded regular file');
    // Bound the read itself, even if a concurrent builder grows the file after stat.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limits.bundleBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await source.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) throw new SandboxError('INVALID_BUNDLE', 'Bundle changed while being staged');
    bundle = buffer.subarray(0, length);
  } finally { await source.close(); }
  const directory = await fs.mkdtemp(join(tmpdir(), 'molis-plugin-sandbox-'));
  const workerPath = join(directory, 'worker.mjs'), bundlePath = join(directory, 'plugin.mjs');
  let child: ChildProcessWithoutNullStreams;
  try {
    await fs.writeFile(bundlePath, bundle, { mode: 0o400 });
    await fs.copyFile(fileURLToPath(new URL('./worker.js', import.meta.url)), workerPath);
    await fs.chmod(workerPath, 0o400);
    const node = await fs.realpath(process.execPath);
    const profile = seatbeltProfile({ node, worker: workerPath, bundle: bundlePath });
    child = spawn('/usr/bin/sandbox-exec', ['-p', profile, node, `--max-old-space-size=${limits.heapMb}`, '--disable-proto=throw', '--no-addons', workerPath, pathToFileURL(bundlePath).href], { cwd: directory, env: {}, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  const queue = new BoundedQueue(limits.operationQueue), calls = new RateBudget(limits.operationsPerMinute), wire = new RateBudget(limits.sdkPerMinute + limits.operationsPerMinute * 2);
  const broker = new SandboxBroker(identity, grants, options.services, limits);
  let stopped: SandboxError | undefined, ready = false, buffer = Buffer.alloc(0), stderrBytes = 0;
  let active: { id: string; operation: SandboxOperationContract; controller: AbortController; resolve: (v: SandboxJson) => void; reject: (e: unknown) => void; timer: NodeJS.Timeout; pendingSdk: Set<string> } | undefined;
  let readyResolve: () => void, readyReject: (e: unknown) => void;
  const started = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let exitResolve: () => void;
  const exited = new Promise<void>(resolve => { exitResolve = resolve; });
  const cleanup = async () => { await exited; await fs.rm(directory, { recursive: true, force: true }); };
  const shutdown = (error: SandboxError) => {
    if (stopped) return;
    stopped = error; clearInterval(watchdog); clearTimeout(startup);
    queue.close(error); broker.stop(error); readyReject(error);
    if (active) { clearTimeout(active.timer); active.controller.abort(error); active.reject(error); active = undefined; }
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    child.stdin.destroy();
  };
  const send = (message: SandboxHostMessage) => {
    if (stopped) throw stopped;
    const json = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(json) > limits.messageBytes || child.stdin.writableLength > limits.messageBytes * 2) throw new SandboxError('CHANNEL_LIMIT', 'Host channel buffer exceeded');
    child.stdin.write(json);
  };
  const receive = (value: unknown) => {
    assertJson(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxError('PROTOCOL_ERROR', 'Invalid channel message');
    wire.consume();
    const message = value as unknown as SandboxWorkerMessage;
    const exact = (keys: string[]) => { if (Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) throw new SandboxError('PROTOCOL_ERROR', 'Unexpected message fields'); };
    if (message.type === 'ready') {
      exact(['type', 'operations']);
      if (ready || !Array.isArray(message.operations) || JSON.stringify(message.operations) !== JSON.stringify(contract.operations.map(o => o.id).sort())) throw new SandboxError('CONTRACT_MISMATCH', 'Implemented operations differ from contract');
      ready = true; clearTimeout(startup); readyResolve(); return;
    }
    if (!ready || !active || typeof message.id !== 'string' || message.id.length > 128) throw new SandboxError('PROTOCOL_ERROR', 'Message has no active operation');
    const current = active;
    if (message.type === 'sdk') {
      exact(['type', 'id', 'callId', 'method', 'args']);
      if (message.callId !== current.id || current.pendingSdk.has(message.id) || !Array.isArray(message.args) || typeof message.method !== 'string') throw new SandboxError('PROTOCOL_ERROR', 'Invalid SDK request');
      if (current.pendingSdk.size >= limits.sdkQueue) throw new SandboxError('QUEUE_FULL', 'Too many outstanding SDK requests');
      current.pendingSdk.add(message.id);
      broker.invoke(current.operation, current.controller.signal, message.method, message.args).then(
        result => { if (active === current && !stopped) send({ type: 'sdk-result', id: message.id, value: result }); },
        error => { if (active === current && !stopped) send({ type: 'sdk-error', id: message.id, code: error instanceof SandboxError ? error.code : 'HOST_SERVICE_ERROR', message: error instanceof SandboxError ? error.message : 'Host service failed' }); },
      ).catch(error => shutdown(error instanceof SandboxError ? error : new SandboxError('CHANNEL_ERROR', 'Failed to send SDK response'))).finally(() => current.pendingSdk.delete(message.id));
      return;
    }
    if (message.id !== current.id || current.pendingSdk.size) throw new SandboxError('PROTOCOL_ERROR', 'Result has wrong id or unawaited SDK calls');
    if (message.type === 'result') { exact(['type', 'id', 'value']); assertMatches(current.operation.output, message.value); }
    else if (message.type === 'error') {
      exact(['type', 'id', 'code', 'message']);
      if (typeof message.code !== 'string' || typeof message.message !== 'string' || message.message.length > 2048) throw new SandboxError('PROTOCOL_ERROR', 'Invalid operation error');
    } else throw new SandboxError('PROTOCOL_ERROR', 'Unknown message type');
    clearTimeout(current.timer); current.controller.abort(); active = undefined;
    if (message.type === 'result') current.resolve(message.value);
    else current.reject(new SandboxError(current.operation.errors.some(e => e.code === message.code) ? message.code : 'PLUGIN_ERROR', message.message));
  };
  child.stdout.on('data', (chunk: Buffer) => {
    try {
      // Bound before concatenation, including a malicious stream without delimiters.
      if (buffer.length + chunk.length > limits.messageBytes) throw new SandboxError('CHANNEL_LIMIT', 'Plugin channel buffer exceeded');
      buffer = Buffer.concat([buffer, chunk]);
      let index: number;
      while ((index = buffer.indexOf(10)) >= 0) { const line = buffer.subarray(0, index); buffer = buffer.subarray(index + 1); receive(JSON.parse(line.toString('utf8'))); }
    } catch (error) { shutdown(error instanceof SandboxError ? error : new SandboxError('PROTOCOL_ERROR', 'Malformed plugin channel')); }
  });
  child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > limits.messageBytes) shutdown(new SandboxError('CHANNEL_LIMIT', 'Plugin stderr exceeded limit')); });
  child.stdin.on('error', () => shutdown(new SandboxError('CHANNEL_ERROR', 'Plugin channel closed')));
  child.on('error', () => { exitResolve(); shutdown(new SandboxError('START_FAILED', 'Could not start sandbox process')); });
  child.on('exit', () => { exitResolve(); shutdown(new SandboxError('PROCESS_EXIT', 'Sandbox process exited')); void cleanup().catch(() => {}); });
  const startup = setTimeout(() => shutdown(new SandboxError('START_TIMEOUT', 'Sandbox startup timed out')), limits.startupTimeoutMs);
  let sampling = false;
  const watchdog = setInterval(() => {
    if (sampling || stopped || !child.pid) return;
    sampling = true;
    execFile('/bin/ps', ['-o', 'rss=', '-o', 'time=', '-p', String(child.pid)], { timeout: 1000, maxBuffer: 1024, env: {} }, (error, output) => {
      sampling = false; if (error || stopped) return;
      const parts = output.trim().split(/\s+/), rss = Number(parts[0]);
      const cpu = parts[1]?.split(':').map(Number) ?? [];
      const seconds = cpu.reduce((total, value) => total * 60 + value, 0);
      if (rss > limits.rssMb * 1024) shutdown(new SandboxError('MEMORY_LIMIT', 'Sandbox resident memory exceeded'));
      else if (seconds * 1000 > limits.cpuMs) shutdown(new SandboxError('CPU_LIMIT', 'Sandbox process CPU budget exceeded'));
    });
  }, 200);
  try { await started; } catch (error) { await cleanup(); throw error; }
  return {
    pid: child.pid!,
    call(operationId, input) {
      try {
        const operation = contract.operations.find(o => o.id === operationId);
        if (!operation) throw new SandboxError('UNKNOWN_OPERATION', 'Operation is outside this contract');
        assertMatches(operation.input, input);
        if (Buffer.byteLength(JSON.stringify(input)) > limits.messageBytes / 2) throw new SandboxError('REQUEST_TOO_LARGE', 'Operation input exceeds channel limit');
        calls.consume(); const snapshot = structuredClone(input);
        return queue.submit(() => new Promise((resolve, reject) => {
          if (stopped) { reject(stopped); return; }
          const id = randomUUID(), controller = new AbortController();
          const timer = setTimeout(() => shutdown(new SandboxError('OPERATION_TIMEOUT', `Operation ${operationId} timed out`)), limits.operationTimeoutMs);
          active = { id, operation, controller, resolve, reject, timer, pendingSdk: new Set() };
          try { send({ type: 'call', id, operationId, input: snapshot }); } catch (error) { shutdown(error instanceof SandboxError ? error : new SandboxError('CHANNEL_ERROR', 'Failed to start operation')); }
        }));
      } catch (error) { return Promise.reject(error); }
    },
    async stop() { shutdown(new SandboxError('STOPPED', 'Sandbox stopped')); await cleanup(); },
  };
}
