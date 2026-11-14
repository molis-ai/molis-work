import { isDeepStrictEqual } from "node:util";
import { requireSynchronous, type ActionExecutionContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentMemorySourceRef, AgentRuntimeAdapter, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryLearningActions, type MemoryLearningRequest, type MemoryLearningTaskRequest, type MemoryLearningOwnedSource } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, type MemoryService, type MemoryServicePorts, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { currentPluginAction, currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "../project-host.js";
import { runningProjectPlatform } from "../project-plugins.js";
import type { PluginPlatform } from "../plugin-platform.js";
import { verifiedCaller } from "../plugin-callers.js";
import { controlledMemoryService } from "./memory-effect.js";
import { memoryInputSnapshots } from "./memory-source-identity.js";
import { learnFromWork, formationSourceBinding } from "./memory-learning.js";
import { prologueMemoryBackend } from "./memory-backend.js";

type Owner = { actor_id: string; project_id: string; plugin_id: string; install_id: string; installation_generation: string };
interface PluginLearningPayload { source_kind: "plugin-run"; owner: Owner; owner_action: ExactActionReference;
  session_id: string; run_id: string; sources: AgentMemorySourceRef[] }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const string = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const ownerKeys = ["actor_id", "project_id", "plugin_id", "install_id", "installation_generation"];
const keyFor = (payload: Pick<PluginLearningPayload, "owner" | "session_id" | "run_id">) =>
  "memory-learn:plugin:" + JSON.stringify([payload.owner.install_id, payload.owner.installation_generation, payload.session_id, payload.run_id]);

/** Read the new durable boundary strictly; no callback, recipe, text or authorization snapshot is stored here. */
function payloadOf(task: Pick<AgentScheduledTask, "key" | "session_id" | "payload">): PluginLearningPayload {
  const body = object(task.payload), owner = object(body?.owner), action = object(body?.owner_action);
  if (!body || !only(body, ["source_kind", "owner", "owner_action", "session_id", "run_id", "sources"]) || body.source_kind !== "plugin-run"
    || !owner || !only(owner, ownerKeys) || !ownerKeys.every(key => string(owner[key]))
    || !action || !only(action, ["capability_id", "version", "provider_id"]) || action.capability_id !== memoryLearningActions.run.capability_id
    || action.version !== memoryLearningActions.run.version || !string(action.provider_id) || !string(body.session_id) || !string(body.run_id) || body.session_id !== task.session_id
    || !Array.isArray(body.sources) || !body.sources.length || body.sources.length > 6 || body.sources.some(raw => {
      const ref = object(raw); return !ref || !only(ref, ["event_id", "version"]) || typeof ref.event_id !== "string" || !ref.event_id || ref.event_id.length > 1000 || ref.version !== "1";
    })) throw memoryErrors.invalid("持久学习任务的原来源或安装引用无效");
  const result: PluginLearningPayload = { source_kind: "plugin-run", owner: { actor_id: owner.actor_id as string, project_id: owner.project_id as string,
    plugin_id: owner.plugin_id as string, install_id: owner.install_id as string, installation_generation: owner.installation_generation as string },
    owner_action: { capability_id: action.capability_id, version: action.version, provider_id: action.provider_id }, session_id: body.session_id, run_id: body.run_id,
    sources: body.sources.map(raw => { const ref = raw as { event_id: string; version: string }; return { event_id: ref.event_id, version: ref.version }; }) };
  if (keyFor(result) !== task.key || new Set(result.sources.map(source => source.event_id)).size !== result.sources.length)
    throw memoryErrors.invalid("持久学习任务的原操作身份不一致");
  return structuredClone(result);
}

export function pluginMemoryLearning(input: {
  home: string; localHost: MolisWorkLocalHost; service: MemoryService; ports: MemoryServicePorts;
  adapter(): AgentRuntimeAdapter; store(): Promise<AgentMemoryCapability>; ready(): Promise<void>;
  alive(): boolean; attachQueue(): void; projectReference?(projectId: string): Promise<LocalHostProjectReference>;
  projectExists?(projectId: string): Promise<boolean | null>;
}) {
  const assertAlive = () => { if (!input.alive()) throw memoryErrors.unavailable("原记忆学习服务已关闭"); };
  const platformFor = async (owner: Pick<Owner, "project_id" | "plugin_id">, activatePlugins = false): Promise<{ reference: LocalHostProjectReference; platform: PluginPlatform }> => {
    assertAlive();
    const reference = await input.projectReference?.(owner.project_id);
    if (!reference) throw memoryErrors.unavailable("项目来源主人尚未装配");
    const reaches = await input.localHost.projectPluginReach(owner.project_id);
    if (reaches(owner.plugin_id) !== true) throw memoryErrors.forbidden("项目已关闭这个来源插件");
    // A queued run can be the first call after Host restart. Start the same project runtime directly;
    // an enqueue already comes from its running installation.
    const platform = await input.localHost.withProject(reference, runtime => runningProjectPlatform(runtime.store, owner.project_id), { activatePlugins });
    assertAlive();
    if (!platform) throw memoryErrors.unavailable("当前项目来源主人尚未就绪");
    return { reference, platform };
  };
  const ownerFor = async (context: ActionExecutionContext): Promise<{ owner: Owner; reference: ExactActionReference }> => {
    verifiedCaller(context);
    const plugin = context.host_plugin, scope = currentPluginInvocation();
    if (context.audience !== "plugin" || !plugin || !plugin.project_id || !scope || scope.install_id !== plugin.install_id)
      throw memoryErrors.forbidden("自动学习只能由当前来源安装发起");
    const definition = plugin.declaration.manifest.actions?.find(action => action.capability_id === memoryLearningActions.run.capability_id && action.version === memoryLearningActions.run.version);
    if (!definition || definition.operation !== "command" || !definition.action.audiences?.includes("plugin"))
      throw memoryErrors.unavailable("来源插件没有装配学习主人");
    const { reference, platform } = await platformFor({ project_id: plugin.project_id, plugin_id: plugin.plugin_id });
    const record = platform.runtime.list().find(record => record.install_id === plugin.install_id);
    if (!record || record.state !== "running" || record.plugin_id !== plugin.plugin_id || record.installation_generation !== scope.installation_generation)
      throw memoryErrors.forbidden("原来源安装已经结束");
    const view = input.localHost.inspectActionMetadata(context, reference);
    const own = view.find(view => view.capability_id === definition.capability_id && view.version === definition.version
      && view.provider.plugin_install_id === plugin.install_id);
    if (!own) throw memoryErrors.unavailable("来源插件的原动作注册不可用");
    return { owner: { actor_id: plugin.actor_id, project_id: plugin.project_id, plugin_id: plugin.plugin_id,
      install_id: plugin.install_id, installation_generation: record.installation_generation },
      reference: { capability_id: definition.capability_id, version: definition.version, provider_id: own.provider.provider_id } };
  };
  const originals = async (payload: Pick<PluginLearningPayload, "owner" | "session_id" | "run_id">) => {
    const adapter = input.adapter(), { owner } = payload;
    const session = await adapter.readSessionStatus?.({ runtime_id: adapter.descriptor.runtime_id, session_id: payload.session_id });
    if (!session || session.status.recovery || session.owner.actor_id !== owner.actor_id || session.owner.project_id !== owner.project_id
      || session.owner.plugin_id !== owner.plugin_id || session.owner.install_id !== owner.install_id) return null;
    const run = await adapter.read({ session_id: payload.session_id, run_id: payload.run_id });
    if (run.phase !== "completed" || run.ref.session_id !== payload.session_id || run.ref.run_id !== payload.run_id
      || !run.class_restrictions || run.memory_scene !== "coding" || run.frozen.continued_from) return null;
    const sources = memoryInputSnapshots(owner.actor_id, [run]);
    if (!sources.length || sources.length > 6 || sources.some(source => source.text.length > 1500)) return null;
    const caller: MemoryCaller = { actor_id: owner.actor_id, project_id: owner.project_id, plugin_id: owner.plugin_id, consumer: "agent",
      person: false, session_id: payload.session_id, current_scene: run.memory_scene, class_restrictions: structuredClone(run.class_restrictions), purpose: "task" };
    return { caller, sources, said: sources.map(source => source.text) };
  };
  const authority = (context: ActionExecutionContext, owner: Owner) => () => {
    assertAlive(); context.signal?.throwIfAborted(); verifiedCaller(context);
    context.host_plugin?.assertActive(); requireSynchronous(context.assert_authority_current?.());
    if (context.host_plugin?.install_id !== owner.install_id || context.host_plugin.plugin_id !== owner.plugin_id
      || context.actor_id !== owner.actor_id || context.project_id !== owner.project_id)
      throw memoryErrors.forbidden("原来源调用身份已失效");
  };
  const sourceCheck = (context: ActionExecutionContext) => {
    const check = context.assert_memory_sources_current;
    if (!check) throw memoryErrors.unavailable("来源主人没有提供同步业务检查");
    return (refs: readonly MemoryLearningOwnedSource[]) => requireSynchronous(check(refs), "来源检查必须同步完成");
  };
  const enqueue = async (context: ActionExecutionContext, request: MemoryLearningRequest) => {
    const { owner, reference } = await ownerFor(context), assertCurrent = authority(context, owner), check = sourceCheck(context);
    await input.ready(); assertCurrent();
    const original = await originals({ owner, ...request });
    if (!original || !input.service.worthLearning(original.caller, original.said)) return { outcome: "skipped" as const, task_key: null };
    const payload: PluginLearningPayload = { source_kind: "plugin-run", owner, owner_action: reference, ...request,
      sources: original.sources.map(({ event_id, version }) => ({ event_id, version })) };
    const key = keyFor(payload), refs = original.sources.map(({ event_id, version }) => ({ event_id, version, session_id: request.session_id }));
    const current = () => { assertCurrent(); check(refs);
      if (!input.service.worthLearning(original.caller, original.said)) throw memoryErrors.off("原 Run 或当前学习策略不再允许形成"); };
    const beforeEffect = async () => {
      await context.beforeEffect();
      const next = await originals(payload);
      if (!next || !isDeepStrictEqual(next, original) || await input.projectExists?.(owner.project_id) !== true)
        throw memoryErrors.forbidden("原件、Run 或项目已经变化");
      current();
    };
    await beforeEffect(); input.attachQueue();
    const schedule = input.adapter().schedule;
    if (!schedule) throw memoryErrors.unavailable("持久学习队列不可用");
    const task = await schedule.enqueue({ key, session_id: request.session_id, kind: "memory.learn", payload: { ...payload }, due_at: new Date().toISOString(), max_attempts: 2 },
      { signal: context.signal, beforeCommit: async () => { await beforeEffect(); return current; } });
    return { outcome: "queued" as const, task_key: task.key };
  };
  const form = async (context: ActionExecutionContext, request: MemoryLearningTaskRequest) => {
    const task = input.adapter().schedule?.find(request.task_key);
    if (!task || task.kind !== "memory.learn" || task.state !== "running") throw memoryErrors.forbidden("这份原学习任务不在本次运行中");
    const payload = payloadOf(task), { owner } = payload, scope = currentPluginAction();
    if (request.session_id !== payload.session_id || request.run_id !== payload.run_id || !scope || scope.install_id !== owner.install_id
      || scope.installation_generation !== owner.installation_generation || scope.definition.capability_id !== memoryLearningActions.run.capability_id
      || scope.definition.version !== memoryLearningActions.run.version) throw memoryErrors.forbidden("形成只能嵌套在本次当前来源主人调用内");
    const assertCurrent = authority(context, owner), check = sourceCheck(context), original = await originals(payload);
    if (!original || !isDeepStrictEqual(payload.sources, original.sources.map(({ event_id, version }) => ({ event_id, version }))))
      throw memoryErrors.forbidden("学习任务的完整本人原件已不可核验");
    const binding = formationSourceBinding(input.home, input.adapter(), original.caller, check);
    try {
      const current = () => {
        assertCurrent(); requireSynchronous(scope.caller.assert_authority_current?.());
        check(payload.sources.map(ref => ({ ...ref, session_id: payload.session_id }))); binding.assert_current();
        if (!input.service.worthLearning(original.caller, original.said)) throw memoryErrors.off("原 Run 或当前学习策略不再允许形成");
      };
      const control: AgentMemoryExecutionControl = { assert_current: current, beforeEffect: async () => {
        await context.beforeEffect();
        const next = await originals(payload);
        if (!next || !isDeepStrictEqual(next, original) || await input.projectExists?.(owner.project_id) !== true)
          throw memoryErrors.forbidden("原件、Run 或项目已经变化");
        current();
      } };
      await control.beforeEffect();
      const service = controlledMemoryService({ ...input.ports, bindFormationSources: binding.bind }, control => prologueMemoryBackend(input.store, control), control);
      const result = await learnFromWork(service, { ...original, caller: { ...original.caller, operation_id: task.key, ...(context.signal ? { signal: context.signal } : {}) } });
      if (result.recording_error || result.formation && !["completed", "skipped"].includes(result.formation.outcome))
        throw memoryErrors.conflict("记忆形成尚未全部记账，请携原操作对账", { formation: result.formation, recording_error: result.recording_error });
      current(); return { outcome: result.formation?.outcome === "completed" ? "completed" as const : "skipped" as const };
    } finally { binding.dispose(); }
  };
  const run = async (task: AgentScheduledTask) => {
    const payload = payloadOf(task), { platform } = await platformFor(payload.owner, true);
    const current = () => assertAlive();
    await platform.invokeOwnedAction(payload.owner, payload.owner_action,
      { task_key: task.key, session_id: payload.session_id, run_id: payload.run_id }, { beforeEffect: async () => current(), assert_authority_current: current });
  };
  return { enqueue, form, run };
}
