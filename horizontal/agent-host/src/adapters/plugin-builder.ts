import { randomUUID } from 'node:crypto';
import { mkdir, realpath, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import type { ExactRef, Runtime, ScenarioPack, ToolRunner } from '@prologue/sdk';
import type { PrologueModelConfiguration } from './prologue.js';

import type { BuilderAgentActivity, BuilderAgentRequest, BuilderAgentRecord } from '@molis-ai/molis-work-contracts/services/agent-host';
export type { BuilderAgentActivity, BuilderAgentRequest, BuilderAgentRecord } from '@molis-ai/molis-work-contracts/services/agent-host';

export interface PluginBuilderAgentOptions {
  /** Host-created build directory. Never a user project and never accepted from a tool argument. */
  buildRoot: string;
  storageRoot: string;
  modelConfiguration(): Promise<PrologueModelConfiguration | null>;
  resolveCredential(reference: string): Promise<string | null> | string | null;
  timeoutMs?: number;
}
// No search: every file the code role needs is named in its task, and real runs spent most turns on empty searches.
const TOOLS = ['read', 'write', 'edit', 'plugin-checks'] as const;
const WRITABLE = /^(?:src\/(?!index\.ts$)[a-zA-Z0-9_./-]+\.ts|tests\/[a-zA-Z0-9_./-]+\.ts|package\.json)$/;

/** Only the owning Node adapter supplies these bindings. Plugins never receive a raw Runtime. */
export interface PluginBuilderRuntimeBindings {
  runtime: Runtime;
  /** Whether the Runtime posture lets build mode change files. A read-only Runtime denies every write. */
  writable: boolean;
  credentialRefFor(reference: string): Promise<ExactRef<'credential'>>;
  withDispatchGuard<T>(guard: () => void | Promise<void>, work: () => Promise<T>): Promise<T>;
}
/** Dedicated Builder sessions on the Home Runtime; no global grants or Coding policy changes. */
export async function createPluginBuilderAgent(options: PluginBuilderAgentOptions, bindings: PluginBuilderRuntimeBindings) {
  const root = await realpath(options.buildRoot);
  const storage = await mkdir(options.storageRoot, { recursive: true }).then(() => realpath(options.storageRoot));
  const inside = relative(root, storage);
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('Agent execution history must be outside its build directory');
  const records = join(storage, 'builder-runs');
  await mkdir(records, { recursive: true });
  const save = async (record: BuilderAgentRecord) => {
    const target = join(records, record.id + '.json'), temporary = target + '.tmp';
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, target);
  };
  // A process crash cannot make an old claim of "running" into a success. Host checks resume the build.
  for (const name of await readdir(records)) if (/^[a-f0-9-]+\.json$/.test(name)) {
    const record = JSON.parse(await readFile(join(records, name), 'utf8')) as BuilderAgentRecord;
    if (record.phase === 'running') { record.phase = 'interrupted'; record.error = 'Host restarted during this run; inspect current files and run host checks before continuing'; await save(record); }
  }
  let current: { request: BuilderAgentRequest; abort: AbortController; record: BuilderAgentRecord; sessionId?: string; stop?: () => void } | undefined;
  let closing = false;
  const sdk = bindings.runtime, hookId = 'builder-frozen-authority-' + randomUUID(), ownedSessions = new Set<string>();
  sdk.hooks.register({ id: hookId, event: 'tool-before', blocking: true, handler: async context => {
    if (!context.origin?.session || !ownedSessions.has(context.origin.session)) return { kind: 'later' };
    const denied = (why: string) => ({ kind: 'deny' as const, why });
    if (!current || current.abort.signal.aborted || current.request.role !== 'coder' || context.origin?.session !== current.sessionId)
      return denied('No active code-agent authority for this build');
    if (!TOOLS.includes(context.toolName as typeof TOOLS[number])) return denied('This role only has build-directory text editing and plugin-checks');
    if (context.toolName === 'write' || context.toolName === 'edit') {
      const path = (context.input as { path?: unknown })?.path;
      if (typeof path !== 'string' || path.split('/').some(p => !p || p === '.' || p === '..') || !WRITABLE.test(path))
        return denied('Only src operation modules, tests and package.json are writable; contract, manifest, entrypoint and developer materials are frozen');
      // Native SDK tools also check root realpaths and use no-follow handles, including existing ancestors.
    }
    return { kind: 'allow' };
  } });
  let activeDone: Promise<BuilderAgentRecord> | undefined;
  return {
    async run(request: BuilderAgentRequest): Promise<BuilderAgentRecord> {
      if (closing || current) throw new Error('This build already has an active code/design run');
      request.signal?.throwIfAborted();
      if (request.instruction.length > 64_000 || request.task.length > 180_000) throw new Error('Agent input exceeds the build context limit');
      // Without a writable posture every write is denied mid-run; refuse up front instead of failing silently.
      if (request.role === 'coder' && !bindings.writable) throw new Error('代码 Agent 需要可写的 Agent 运行环境（宿主未装配审阅队列），本次未启动');
      const model = await options.modelConfiguration();
      if (!model) throw new Error('请先配置可用的文字模型');
      const credential = await options.resolveCredential(model.credential_ref);
      if (!credential) throw new Error('文字模型凭据不可用');
      // Recheck after awaits: two starts cannot acquire the same directory.
      if (closing || current) throw new Error('This build already has an active run');
      const abort = new AbortController();
      const record: BuilderAgentRecord = { id: randomUUID(), role: request.role, promptVersion: request.promptVersion,
        contractRevision: request.contractRevision, instruction: request.instruction, input: request.task, output: '',
        configuredModel: model.model, reportedModels: [], phase: 'running', startedAt: new Date().toISOString(), activity: [], usage: [] };
      current = { request, abort, record };
      const configuration = JSON.stringify(model);
      const guard = async () => {
        abort.signal.throwIfAborted();
        if (closing || JSON.stringify(await options.modelConfiguration()) !== configuration || await options.resolveCredential(model.credential_ref) !== credential) throw new Error('构建期间模型配置或凭据已改变，请重试');
        abort.signal.throwIfAborted();
      };
      const execution = bindings.withDispatchGuard(guard, async () => {
        const checkLifetime = new AbortController();
        const activeChecks = new Set<Promise<unknown>>();
        let sealed = false;
        let session: Awaited<ReturnType<Runtime['sessions']['create']>> | undefined;
        let unsubscribe: (() => void) | undefined;
        let stop: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancel = () => { abort.abort(request.signal?.reason ?? new Error('Build stopped')); stop?.(); };
        request.signal?.addEventListener('abort', cancel, { once: true });
        const activity = (entry: BuilderAgentActivity) => { if (sealed) return; record.activity.push(entry); try { request.onActivity?.(entry); } catch { /* observer is not execution authority */ } };
        try {
          await save(record);
          if (request.signal?.aborted) cancel();
          abort.signal.throwIfAborted();
          const checks: ToolRunner = async call => {
            abort.signal.throwIfAborted();
            if (request.role !== 'coder' || !request.checks) throw new Error('plugin-checks is only available to this build code role');
            const args = call.args as { operations?: unknown };
            if (!args || Object.keys(args).some(key => key !== 'operations')) throw new Error('Unexpected plugin-checks argument');
            const allowed = request.operationIds ?? [];
            const ids = args.operations === undefined ? [...allowed] : args.operations;
            if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !allowed.includes(id))) throw new Error('Checks may only target this run\'s operations');
            const timeout = new AbortController();
            const signal = AbortSignal.any([abort.signal, checkLifetime.signal, timeout.signal, ...(call.signal ? [call.signal] : [])]);
            let work: Promise<unknown> | undefined;
            const unsubscribeAbort = call.abort?.subscribe(async () => { timeout.abort(new Error('plugin-checks tool deadline reached')); await work?.catch(() => undefined); });
            if (call.abort?.requested()) timeout.abort(new Error('plugin-checks was cancelled'));
            try {
              signal.throwIfAborted();
              work = request.checks(ids, signal); activeChecks.add(work);
              const result = await work;
              signal.throwIfAborted();
              const detail = JSON.stringify(result);
              activity({ type: 'check', name: 'plugin-checks', detail });
              return detail;
            } finally { unsubscribeAbort?.(); if (work) activeChecks.delete(work); }
          };
          const pack = checkPack();
          session = await sdk.sessions.create(request.role === 'coder' ? { pack, executors: { 'plugin-checks': checks } } : undefined);
          current!.sessionId = session.ref.id; record.sessionId = session.ref.id; ownedSessions.add(session.ref.id);
          const authorized = await sdk.workspace.authorize({ path: root });
          const credentialRef = await bindings.credentialRefFor(model.credential_ref);
          const bytes = new TextEncoder().encode(request.instruction);
          const stage = sdk.resources.stage({ mediaKind: 'text', byteLength: bytes.length, label: request.promptVersion });
          stage.write(bytes); const instructions = await stage.publishDurable();
          const tools = request.role === 'coder' ? [...TOOLS] : [];
          const character = sdk.characters.publish(sdk.characters.create({ id: 'builder-' + record.id, version: 1,
            name: request.role === 'coder' ? 'Plugin Code Agent' : request.role === 'model' ? 'Plugin Model Call' : 'Plugin Designer', role: 'builder-' + request.role,
            instructionsRef: instructions.ref, tools }).ref);
          abort.signal.throwIfAborted();
          const started = await sdk.startAgentRun({ session, rootRef: authorized.ref, grants: { toolNames: tools, paths: request.role === 'coder' ? ['.'] : [] },
            start: { protocol: model.protocol, endpoint: model.endpoint, model: model.model, credentialRef, params: { maxOutputTokens: request.role === 'designer' ? 32768 : request.role === 'model' ? 8192 : 16384 },
              ...(model.prompt_cache && model.prompt_cache !== 'off' ? { promptCache: model.prompt_cache } : {}),
              messages: [{ role: 'user', text: request.task }] },
            agent: { idempotencyKey: record.id, mode: request.role === 'coder' ? 'build' : 'plan',
              characterRef: character.ref, toolNames: tools, budget: { maxTurns: request.role === 'coder' ? 30 : 1, maxWallClockMs: options.timeoutMs ?? 600_000 } } });
          record.runId = started.run.ref.id;
          stop = () => started.control.stop('cancelled'); current!.stop = stop;
          const terminal = new Promise<void>(resolve => {
            const calls = new Map<string, { name: string; path?: string }>();
            unsubscribe = started.run.subscribe(event => {
              if (event.type === 'text-delta') record.output += event.text;
              if (event.type === 'tool-call') { const value = event.call as unknown as { id: string; name: string; input?: { path?: unknown } };
                calls.set(value.id, { name: value.name, ...(typeof value.input?.path === 'string' ? { path: value.input.path } : {}) }); }
              if (event.type === 'tool-result') { const call = calls.get(event.callId);
                activity({ type: ['write', 'edit'].includes(event.name) ? 'file' : 'tool', name: event.name, detail: event.text,
                  ...(call?.path ? { path: call.path } : {}) }); }
              if (event.type === 'model-reported' && !record.reportedModels.includes(event.model)) record.reportedModels.push(event.model);
              if (event.type === 'usage-recorded') record.usage.push(event.receipt);
              if (event.type === 'awaiting-approval' || event.type === 'awaiting-input') {
                record.error = 'This build requested an unavailable tool or decision; the host must revise the task'; stop?.();
              }
              if (event.type === 'completed') { record.phase = 'completed'; resolve(); }
              if (event.type === 'failed') { record.phase = 'failed'; record.error = event.error.safeMessage; resolve(); }
              if (event.type === 'cancelled') { record.phase = 'cancelled'; resolve(); }
            });
          });
          timer = setTimeout(() => { record.error = '代码 Agent 超时，已保留文件，可以修正后继续'; abort.abort(new Error(record.error)); stop?.(); }, options.timeoutMs ?? 600_000);
          if (abort.signal.aborted) stop();
          await save(record);
          await terminal;
          if (abort.signal.aborted) record.phase = 'cancelled';
          if (record.phase !== 'completed') throw new Error(record.error ?? 'Agent run did not complete');
          await guard();
          return record;
        } catch (error) {
          record.phase = abort.signal.aborted ? 'cancelled' : 'failed';
          record.error = error instanceof Error ? error.message : String(error);
          throw Object.assign(new Error(record.error), { record });
        } finally {
          sealed = true;
          checkLifetime.abort(new Error('Agent run ended'));
          await Promise.allSettled([...activeChecks]);
          if (timer) clearTimeout(timer);
          unsubscribe?.(); request.signal?.removeEventListener('abort', cancel);
          record.finishedAt = new Date().toISOString();
          try { await save(record); } finally { try { await session?.archive(); } finally { current = undefined; } }
        }
      });
      activeDone = execution;
      return execution;
    },
    async records(): Promise<BuilderAgentRecord[]> {
      return Promise.all((await readdir(records)).filter(name => /^[a-f0-9-]+\.json$/.test(name)).map(async name => JSON.parse(await readFile(join(records, name), 'utf8')) as BuilderAgentRecord));
    },
    async close() {
      closing = true; current?.abort.abort(new Error('Host closing'));
      current?.stop?.();
      try { await activeDone?.catch(() => undefined); } finally { sdk.hooks.unregister(hookId); ownedSessions.clear(); }
    },
  };
}

function checkPack(): ScenarioPack {
  return { id: 'molis-plugin-checks', version: '1.0.0', source: { kind: 'app-embedded' },
    needs: { hostCapabilities: [], executors: ['plugin-checks'] }, permissions: { tools: ['plugin-checks'], paths: [], network: [] },
    memory: { scope: 'session', write: 'deny' }, roster: [{ role: 'builder-code', skills: [], writes: true }],
    planning: { plannedBy: 'builder-code', planFirst: false }, config: {}, tools: [{ executor: 'plugin-checks', registration: {
      name: 'plugin-checks', version: '1', description: 'Run host-owned type, bundle, contract, tests and sandbox checks for the current operation. Read the exact failure and repair implementation or tests. The host rechecks after your run.',
      parameters: { type: 'object', properties: { operations: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      effectKind: 'mutate-local', gate: 'broker', timeoutMs: 300_000, idempotency: 'none' } }] };
}

