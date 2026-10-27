import type { ActionExecutionContext, ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentOriginalInputRef, AgentRuntimeAdapter, AgentRunView, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryLearningSourceAction, isMemoryClassRestrictions, type MemoryLearningEnqueueRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import type { MolisWorkLocalHost } from "../project-host.js";
import { homeAggregatePorts } from "../home-aggregate.js";
import { pluginInstallRecords } from "../plugin-install-records.js";
import { memoryInputSnapshots } from "./memory-source-identity.js";
import type { MemoryLearningRequest } from "./memory-learning.js";

const CODING = "io.molis.work.coding";
export interface CodingMemoryLearningPayload extends MemoryLearningEnqueueRequest {
  kind: "coding";
  project_id: string;
  plugin_id: string;
  install_id: string;
  installation_generation: string;
  provider_id: string;
}
type Task = Pick<AgentScheduledTask, "session_id" | "payload"> & { key?: string };
export const codingMemoryLearningKey = (projectId: string, input: Pick<MemoryLearningEnqueueRequest, "business_session_id" | "runtime_id">, original: AgentOriginalInputRef) =>
  `memory-learn:coding:${JSON.stringify([projectId, input.business_session_id, input.runtime_id, original.session_id, original.input_id, original.version])}`;

/** Even an already-known queue key is private to its trusted source caller. */
export function assertCodingMemoryLearningCaller(context: ActionExecutionContext): void {
  const caller = context.host_plugin;
  if (!caller || caller.plugin_id !== CODING || !context.project_id || caller.project_id !== context.project_id
    || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || context.audience !== "plugin") throw memoryErrors.forbidden("自动形成必须由原来源插件发起");
  caller.assertActive();
}

/** Trusted caller and current registration supply identity; an enqueue payload contains no owner or body fields. */
export async function codingMemoryLearningPayload(host: MolisWorkLocalHost, context: ActionExecutionContext,
  input: MemoryLearningEnqueueRequest): Promise<CodingMemoryLearningPayload> {
  assertCodingMemoryLearningCaller(context);
  const caller = context.host_plugin!;
  const project = homeAggregatePorts(host).openProjects().find(row => row.project_id === context.project_id);
  if (!project) throw memoryErrors.forbidden("来源项目已关闭");
  const views = await host.actionClient(project).discover({ ...await homeAggregatePorts(host).context(project, context.signal), query_only: true });
  await context.beforeEffect();
  const source = views.find(view => view.capability_id === memoryLearningSourceAction.capability_id
    && view.version === memoryLearningSourceAction.version && view.provider.plugin_id === caller.plugin_id
    && view.provider.plugin_install_id === caller.install_id && view.provider.project_id === context.project_id);
  if (!source?.provider.plugin_installation_generation) throw memoryErrors.forbidden("原来源安装无法核验");
  return { ...input, kind: "coding", project_id: context.project_id!, plugin_id: caller.plugin_id, install_id: caller.install_id,
    installation_generation: source.provider.plugin_installation_generation, provider_id: source.provider.provider_id };
}

function payloadOf(task: Task): CodingMemoryLearningPayload | undefined {
  if (!task.payload || typeof task.payload !== "object" || Array.isArray(task.payload)) return undefined;
  const body = task.payload as Partial<CodingMemoryLearningPayload>;
  if (body.kind !== "coding" || body.plugin_id !== CODING || ![body.project_id, body.install_id, body.installation_generation, body.provider_id,
    body.business_session_id, body.runtime_id, body.session_id, body.run_id].every(value => typeof value === "string" && value.length > 0)) return undefined;
  const payload = body as CodingMemoryLearningPayload;
  return task.session_id === payload.session_id ? { ...payload } : undefined;
}

export interface CodingMemoryLearningSources {
  key: string;
  request(): Promise<MemoryLearningRequest>;
  triggerText: string;
  assertCurrent(): void;
  current(): Promise<boolean>;
}

/** One fresh attempt borrows only an already-open project and reads its owner through an exact, read-only Action. */
export async function withCodingMemoryLearningSources<T>(host: MolisWorkLocalHost, adapter: AgentRuntimeAdapter, task: Task,
  alive: () => boolean, work: (sources: CodingMemoryLearningSources) => Promise<T>): Promise<T | undefined> {
  const body = payloadOf(task), ports = homeAggregatePorts(host);
  if (!body || body.runtime_id !== adapter.descriptor.runtime_id) return undefined;
  const project = ports.openProjects().find(row => row.project_id === body.project_id);
  if (!project) return undefined;
  return ports.whileOpen(project, () => host.withProject(project, async runtime => {
    const caller: ActionCallContext = { ...await ports.context(project), query_only: true };
    const client = ports.client(project), source = { capability_id: memoryLearningSourceAction.capability_id,
      version: memoryLearningSourceAction.version, provider_id: body.provider_id };
    if (!client.captureSources) throw memoryErrors.unavailable("原来源缺少同步授权复核");
    // Capture before owner/installation reads. This exact guard survives every wait and the final SDK/Ledger commit.
    const sourceCurrent = client.captureSources([{ context: caller, references: [source] }]);
    const installations = pluginInstallRecords(runtime.store.db);
    let invalid = false;
    const assertCurrent = () => {
      try {
        if (invalid || !alive()) throw memoryErrors.forbidden("原学习执行已失效");
        const install = installations.get(body.install_id);
        if (!install || install.plugin_id !== body.plugin_id || install.installation_generation !== body.installation_generation
          || install.state !== "running" || !install.grants.includes("memory:write")) throw memoryErrors.forbidden("当前来源没有自动形成权限");
        sourceCurrent();
      } catch (error) { invalid = true; throw error; }
    };
    assertCurrent();
    const binding = await client.invoke(caller, source, { session_id: body.session_id }) as import("@molis-ai/molis-work-contracts/services/memory").MemoryLearningSourceBinding | null;
    assertCurrent();
    if (!binding || binding.state !== "active" || binding.business_session_id !== body.business_session_id
      || binding.session_id !== body.session_id || binding.runtime_id !== body.runtime_id) return undefined;
    const readOrigin = async () => {
      assertCurrent();
      const session = await adapter.readSessionStatus?.({ runtime_id: body.runtime_id, session_id: body.session_id });
      assertCurrent();
      if (!session || session.status.recovery || session.owner.actor_id !== LOCAL_PERSON_ACTOR_ID || session.owner.project_id !== body.project_id
        || session.owner.plugin_id !== body.plugin_id || session.owner.install_id !== body.install_id) return undefined;
      const trigger = await adapter.read({ session_id: body.session_id, run_id: body.run_id });
      assertCurrent();
      const original = trigger.original_input, policy = trigger.class_restrictions;
      if (trigger.phase !== "completed" || trigger.frozen.continued_from || !original || original.written_by !== "person" || original.ref.session_id !== body.session_id
        || !policy || policy.policy_version !== 2 || policy.taxonomy_version !== 1 || !isMemoryClassRestrictions(policy.personal)
        || !isMemoryClassRestrictions(policy.project) || trigger.memory_scene !== "coding") return undefined;
      const accepted = await adapter.readOriginalInput?.(original.ref);
      assertCurrent();
      // The owner locates the latest direct attempt; an accepted task keeps its own original Run and policy.
      if (!accepted || accepted.original.written_by !== "person" || accepted.original.text !== original.text) return undefined;
      return { trigger, original, policy };
    };
    const origin = await readOrigin();
    if (!origin) return undefined;
    const key = codingMemoryLearningKey(body.project_id, body, origin.original.ref);
    if (task.key !== undefined && task.key !== key) return undefined;
    const material = async ({ trigger, policy }: NonNullable<Awaited<ReturnType<typeof readOrigin>>>): Promise<MemoryLearningRequest> => {
      assertCurrent();
      const session = await adapter.readSession({ runtime_id: body.runtime_id, session_id: body.session_id });
      assertCurrent();
      const index = session.runs.findIndex(ref => ref.run_id === body.run_id);
      if (index < 0) throw memoryErrors.forbidden("原执行已不属于当前会话");
      const views: AgentRunView[] = [];
      for (const ref of session.runs.slice(Math.max(0, index - 29), index + 1)) {
        const view = ref.run_id === trigger.ref.run_id ? trigger : await adapter.read(ref);
        assertCurrent();
        if (view.phase === "completed") views.push(view);
      }
      const sources = memoryInputSnapshots(LOCAL_PERSON_ACTOR_ID, views).slice(-6);
      return { caller: { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: body.project_id, consumer: "agent", plugin_id: body.plugin_id,
        session_id: body.session_id, operation_id: key, purpose: "task", current_scene: "coding", person: false,
        class_restrictions: structuredClone(policy) }, said: sources.map(item => item.text), sources };
    };
    let request: MemoryLearningRequest | undefined;
    const current = async () => {
      try {
        assertCurrent();
        await caller.validate_authority?.(source);
        const now = await client.invoke(caller, source, { session_id: body.session_id });
        assertCurrent();
        if (JSON.stringify(now) !== JSON.stringify(binding)) { invalid = true; return false; }
        const freshOrigin = await readOrigin();
        if (!request || !freshOrigin) { invalid = true; return false; }
        const fresh = await material(freshOrigin);
        assertCurrent();
        if (JSON.stringify(fresh) !== JSON.stringify(request)) { invalid = true; return false; }
        return true;
      } catch { invalid = true; return false; }
    };
    return work({ key, request: async () => request ??= await material(origin), triggerText: origin.original.text, assertCurrent, current });
  }));
}
