import { randomUUID } from 'node:crypto';
import { mkdir, realpath, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { collectRun, fillSkillBody, prepareSkillIntent, type ExactRef, type Runtime, type ScenarioPack, type Skill, type ToolRunner } from '@prologue/sdk';
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
  /** How long one model request may take; tests shorten it. Defaults to MODEL_CALL_LIMIT_MS for the role. */
  modelCallTimeoutMs?: number;
}
/**
 * One model request, not the whole run. A designer's answer is one long structured reply (up to 32k tokens) and the
 * code role writes whole files; Prologue's own 60-second default cut off a slower model mid-answer. A request must be
 * allowed long enough to spend its whole output budget: MiniMax M3.1-Flash wrote about 110 tokens a second (reasoning
 * included, none of it streamed as text), so 32k tokens take about five minutes. The designer gets the run's whole
 * ten minutes; the code role's 16k turns get five.
 */
export const MODEL_CALL_LIMIT_MS = { designer: 600_000, coder: 300_000 } as const;
/** The most one request may write: a designer's whole answer, or one code turn. */
export const MAX_OUTPUT_TOKENS = { designer: 32768, coder: 16384 } as const;
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
/**
 * Saves of one run record can overlap (a progress update while a step settles). Each save goes through the same temporary
 * file, so they are queued per record: every rename finds its own file and the last save is what stays on disk.
 */
export function createRunRecordWriter(directory: string): (record: BuilderAgentRecord) => Promise<void> {
  const queued = new Map<string, Promise<void>>();
  return record => {
    const content = JSON.stringify(record), target = join(directory, record.id + '.json'), temporary = target + '.tmp';
    const next = (queued.get(record.id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, target);
    });
    queued.set(record.id, next);
    void next.finally(() => { if (queued.get(record.id) === next) queued.delete(record.id); }).catch(() => undefined);
    return next;
  };
}
const registeredSkills = new WeakMap<Runtime, Map<string, Skill>>();
/** Dedicated Builder sessions on the Home Runtime; no global grants or Coding policy changes. */
export async function createPluginBuilderAgent(options: PluginBuilderAgentOptions, bindings: PluginBuilderRuntimeBindings) {
  const root = await realpath(options.buildRoot);
  const storage = await mkdir(options.storageRoot, { recursive: true }).then(() => realpath(options.storageRoot));
  const inside = relative(root, storage);
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('Agent execution history must be outside its build directory');
  const records = join(storage, 'builder-runs');
  await mkdir(records, { recursive: true });
  const save = createRunRecordWriter(records);
  // A process crash cannot make an old claim of "running" into a success. Host checks resume the build.
  for (const name of await readdir(records)) if (/^[a-f0-9-]+\.json$/.test(name)) {
    const record = JSON.parse(await readFile(join(records, name), 'utf8')) as BuilderAgentRecord;
    if (record.phase === 'running') { record.phase = 'interrupted'; record.error = 'Host restarted during this run; inspect current files and run host checks before continuing'; await save(record); }
  }
  let current: { request: BuilderAgentRequest; abort: AbortController; record: BuilderAgentRecord; sessionId?: string; stop?: () => void } | undefined;
  let closing = false;
  const sdk = bindings.runtime;
  // Builds come and go, the Home Runtime stays: a Skill version is registered once per Runtime and reused by every build.
  const skills = registeredSkills.get(sdk) ?? new Map<string, Skill>(); registeredSkills.set(sdk, skills);
  /**
   * The code role's authority, bound to the one session a run creates. Registered for that session only: a
   * Runtime-wide hook would be asked about every other session on the Home Runtime (another build, Home chat,
   * Coding) and could only answer "later", which defers — and so blocks — every tool call they make.
   */
  const authority = (sessionId: string) => ({ id: 'builder-frozen-authority-' + sessionId, event: 'tool-before' as const, blocking: true, forSession: sessionId, handler: async (context: Parameters<Parameters<Runtime['hooks']['register']>[0]['handler']>[0]) => {
    const denied = (why: string) => ({ kind: 'deny' as const, why });
    if (context.origin?.session !== sessionId) return denied('This hook only answers for its own build session');
    if (!current || current.abort.signal.aborted || current.request.role !== 'coder' || context.origin?.session !== current.sessionId)
      return denied('No active code-agent authority for this build');
    if (!TOOLS.includes(context.toolName as typeof TOOLS[number])) return denied('This role only has build-directory text editing and plugin-checks');
    if (context.toolName === 'write' || context.toolName === 'edit') {
      const path = (context.input as { path?: unknown })?.path;
      if (typeof path !== 'string' || path.split('/').some(p => !p || p === '.' || p === '..') || !WRITABLE.test(path))
        return denied('Only src operation modules, tests and package.json are writable; contract, manifest, entrypoint and developer materials are frozen');
      const own = current.request.writable;
      if (own && !own.includes(path)) return denied('Other operations are being written at the same time: this run may only write ' + own.join(' and ') + '. Keep shared logic inside your own file.');
      // Native SDK tools also check root realpaths and use no-follow handles, including existing ancestors.
    }
    return { kind: 'allow' as const };
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
        let session: Awaited<ReturnType<Runtime['sessions']['create']>> | undefined, hooked: string | undefined;
        let stop: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const images: ExactRef<'resource'>[] = [];
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
          current!.sessionId = session.ref.id; record.sessionId = session.ref.id;
          sdk.hooks.register(authority(session.ref.id)); hooked = session.ref.id;
          const authorized = await sdk.workspace.authorize({ path: root });
          const credentialRef = await bindings.credentialRefFor(model.credential_ref);
          // The standard this stage works to: an exact Skill version in Prologue's registry, inlined once, as Home mounts methods.
          const mounted: string[] = [];
          for (const definition of request.skills ?? []) {
            const key = definition.id + '@' + definition.version;
            let skill = skills.get(key);
            if (skill && skill.manifest.body !== definition.body) throw new Error('Skill 同版本正文发生变化：' + key);
            if (!skill) { skill = sdk.skills.register({ id: definition.id, version: definition.version, label: definition.name, shape: 'bounded', tools: [], body: definition.body, humanInvocable: false }); skills.set(key, skill); }
            const available = request.role === 'coder' ? [...TOOLS] : [];
            prepareSkillIntent({ registry: sdk.skills, skillRef: skill.ref, parameters: {}, mode: 'inline', parentTools: available, hostTools: available });
            mounted.push('本阶段遵循的规范：' + definition.name + '（' + key + '）\n' + fillSkillBody({ body: skill.manifest.body!, parameters: {} }));
          }
          const bytes = new TextEncoder().encode([request.instruction, ...mounted].join('\n\n'));
          const stage = sdk.resources.stage({ mediaKind: 'text', byteLength: bytes.length, label: request.promptVersion });
          stage.write(bytes); const instructions = await stage.publishDurable();
          if ((request.images?.length ?? 0) > 9 || (request.images ?? []).reduce((total, image) => total + image.bytes.length, 0) > 12 * 1024 * 1024) throw new Error('界面截图超过本轮图片预算');
          for (const [index, image] of (request.images ?? []).entries()) {
            if (image.bytes.length < 8 || [137,80,78,71,13,10,26,10].some((byte, index) => image.bytes[index] !== byte)) throw new Error('界面截图必须是 PNG');
            const name = '.preview-' + record.id + '-' + index + '.png', path = join(root, name), intake = sdk.beginIntake(authorized.ref);
            try {
              await writeFile(path, image.bytes, { mode: 0o600, flag: 'wx' });
              await intake.add(name, image.label.slice(0, 160));
              images.push(...(await intake.publish()).map(resource => resource.ref));
            } catch (error) { await intake.cancel(); throw error; }
            finally { await rm(path, { force: true }); }
          }
          const tools = request.role === 'coder' ? [...TOOLS] : [];
          const character = sdk.characters.publish(sdk.characters.create({ id: 'builder-' + record.id, version: 1,
            name: request.role === 'coder' ? 'Plugin Code Agent' : 'Plugin Designer', role: 'builder-' + request.role,
            instructionsRef: instructions.ref, tools }).ref);
          abort.signal.throwIfAborted();
          const started = await sdk.startAgentRun({ session, rootRef: authorized.ref, grants: { toolNames: tools, paths: request.role === 'coder' ? ['.'] : [] },
            start: { protocol: model.protocol, endpoint: model.endpoint, model: model.model, credentialRef, params: { maxOutputTokens: MAX_OUTPUT_TOKENS[request.role] },
              timeoutMs: options.modelCallTimeoutMs ?? MODEL_CALL_LIMIT_MS[request.role],
              ...(model.prompt_cache && model.prompt_cache !== 'off' ? { promptCache: model.prompt_cache } : {}),
              messages: [{ role: 'user', text: request.task }], ...(images.length ? { attachments: images.map(ref => ({ ref, as: 'original' as const })) } : {}) },
            agent: { idempotencyKey: record.id, mode: request.role === 'coder' ? 'build' : 'plan',
              characterRef: character.ref, toolNames: tools, budget: { maxTurns: request.role === 'coder' ? 30 : 1, maxWallClockMs: options.timeoutMs ?? 600_000 } } });
          record.runId = started.run.ref.id;
          stop = () => started.control.stop('cancelled'); current!.stop = stop;
          const calls = new Map<string, { name: string; path?: string }>();
          const terminal = collectRun(started.run, { signal: abort.signal, maxTextChars: 180_000, maxEvents: 100_000,
            onEvent: event => {
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
            },
          });
          // Persistence can await while the collector terminates; keep its rejection handled until the join below.
          void terminal.catch(() => {});
          timer = setTimeout(() => { record.error = '代码 Agent 超时，已保留文件，可以修正后继续'; abort.abort(new Error(record.error)); stop?.(); }, options.timeoutMs ?? 600_000);
          if (abort.signal.aborted) stop();
          await save(record);
          const result = await terminal;
          record.phase = result.state === 'completed' ? 'completed' : result.state === 'cancelled' ? 'cancelled' : 'failed';
          if (result.terminal.type === 'failed') record.error = result.terminal.error.safeMessage;
          else if (record.phase === 'failed') record.error = '构建达到执行限制，已保留文件，请检查后继续';
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
          request.signal?.removeEventListener('abort', cancel);
          await Promise.allSettled(images.map(ref => sdk.resources.revoke(ref)));
          record.finishedAt = new Date().toISOString();
          try { await save(record); } finally { try { await session?.archive(); } finally { if (hooked) sdk.hooks.unregister('builder-frozen-authority-' + hooked); current = undefined; } }
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
      await activeDone?.catch(() => undefined);
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
