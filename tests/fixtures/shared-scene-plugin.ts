import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  MEMORY_SESSION_BINDING_INPUT_TYPE,
  MEMORY_SESSION_BINDING_OUTPUT_TYPE,
  memoryLearningActions,
  type MemoryLearningOwnedSource,
} from "@molis-ai/molis-work-contracts/services/memory";

export const ALT_CODER_PLUGIN_ID = "io.molis.work.example.alt-coder";
export const ALT_CODER_NAME = "Alt Coder";

const idSchema = { type: "string", minLength: 1, maxLength: 200 } as const;

const bindingAction: ActionDefinition<{ session_id: string }, {
  session_id: string; project_id: string; archived: boolean; runtime: { runtime_id: string; session_id: string } | null;
}> = {
  capability_id: "altcoder.sessions.binding.read",
  version: 1,
  operation: "query",
  action: {
    title: "读取 Alt Coder 会话绑定",
    description: "本人只读 Alt Coder 业务会话的原执行引用与归档状态。",
    kind: "query",
    effect: "read",
    scope: "project",
    audiences: ["user"],
    permissions: ["artifact:read"],
    subject_kinds: [],
    input_type: MEMORY_SESSION_BINDING_INPUT_TYPE,
    output_type: MEMORY_SESSION_BINDING_OUTPUT_TYPE,
    input_schema: { type: "object", properties: { session_id: idSchema }, required: ["session_id"], additionalProperties: false },
    output_schema: {
      type: "object",
      properties: {
        session_id: idSchema,
        project_id: idSchema,
        archived: { type: "boolean" },
        runtime: { anyOf: [{ type: "null" }, { type: "object", properties: { runtime_id: idSchema, session_id: idSchema }, required: ["runtime_id", "session_id"], additionalProperties: false }] },
      },
      required: ["session_id", "project_id", "archived", "runtime"],
      additionalProperties: false,
    },
  },
};

export interface AltCoderRunInput {
  session_id: string;
  task: string;
  directory: string;
}

const runAction: ActionDefinition<AltCoderRunInput, { session_id: string; runtime_session_id: string; run: AgentRunRef }> = {
  capability_id: "altcoder.sessions.run",
  version: 1,
  operation: "command",
  action: {
    title: "运行 Alt Coder 会话轮次",
    description: "在共享 coding 场景中以独立插件身份运行一轮 Agent。",
    kind: "operation",
    effect: "write",
    scope: "project",
    audiences: ["user"],
    permissions: ["artifact:read"],
    subject_kinds: [],
    scheduling: "concurrent",
    input_schema: {
      type: "object",
      properties: {
        session_id: idSchema,
        task: { type: "string", minLength: 1, maxLength: 10_000 },
        directory: { type: "string", minLength: 1, maxLength: 4000 },
      },
      required: ["session_id", "task", "directory"],
      additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: {
        session_id: idSchema,
        runtime_session_id: idSchema,
        run: { type: "object", properties: { session_id: idSchema, run_id: idSchema }, required: ["session_id", "run_id"], additionalProperties: false },
      },
      required: ["session_id", "runtime_session_id", "run"],
      additionalProperties: false,
    },
  },
};

const enqueueAction: ActionDefinition<{ session_id: string; run_id: string }, { outcome: "queued" | "skipped"; task_key: string | null }> = {
  capability_id: "altcoder.sessions.learn",
  version: 1,
  operation: "command",
  action: {
    title: "提交 Alt Coder 自动记忆学习",
    description: "将已完成的 Alt Coder 轮次交入平台持久记忆学习队列。",
    kind: "operation",
    effect: "write",
    scope: "project",
    audiences: ["user"],
    permissions: ["artifact:read"],
    subject_kinds: [],
    scheduling: "concurrent",
    input_schema: { type: "object", properties: { session_id: idSchema, run_id: idSchema }, required: ["session_id", "run_id"], additionalProperties: false },
    output_schema: {
      type: "object",
      properties: { outcome: { enum: ["queued", "skipped"] }, task_key: { anyOf: [{ type: "string" }, { type: "null" }] } },
      required: ["outcome", "task_key"],
      additionalProperties: false,
    },
  },
};

const learningRunAction = {
  ...memoryLearningActions.run,
  capability_id: "altcoder.memory.learning.run",
} as typeof memoryLearningActions.run;

export const ALT_CODER_ACTIONS = { binding: bindingAction, run: runAction, learn: enqueueAction, learningRun: learningRunAction } as const;

interface StoredSession {
  session_id: string;
  project_id: string;
  runtime_session_id: string | null;
  archived: boolean;
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionError("actions.input_invalid", "输入必须为对象");
  return value as Record<string, unknown>;
}

/** Independent second plugin declaring `memory_scene: "coding"` with real session binding, Agent runs and durable learning. */
export function createSharedScenePlugin(options: { pluginId?: string; name?: string; scene?: string } = {}) {
  const pluginId = options.pluginId ?? ALT_CODER_PLUGIN_ID;
  const name = options.name ?? ALT_CODER_NAME;
  const scene = options.scene ?? "coding";
  const sessions = new Map<string, StoredSession>();
  const bindingCalls: string[] = [];
  const checkedSourceSessions: string[] = [];
  const contexts = new Map<string, PluginStartContext>();

  const byRuntimeSession = (projectId: string, runtimeSessionId: string) =>
    [...sessions.values()].find(row => row.project_id === projectId && row.runtime_session_id === runtimeSessionId);

  const manifest: PluginManifest = {
    schema_version: 1,
    host_api_version: 1,
    plugin_id: pluginId,
    version: "1.0.0",
    name,
    summary: "与内置 Coding 共享同一 coding 记忆场景的独立测试插件。",
    kind: "app",
    memory_scene: scene,
    publisher: { publisher_id: "example", signature: `fixture:${pluginId}` },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [
      { permission: "artifact:read", required: false, reason: "读取本插件会话绑定与发起受控学习" },
    ],
    capabilities: {
      provides: [],
      consumes: [
        agent.createSession.capability_id,
        agent.startRun.capability_id,
        memoryLearningActions.enqueue.capability_id,
        memoryLearningActions.form.capability_id,
      ],
    },
    artifacts: { produces: [], consumes: [] },
    ports: { inputs: [], outputs: [] },
    events: { publishes: [], subscribes: [] },
    ui: { contributions: [] },
    agent: {
      roles: [{ role_id: "reader", version: 1, name: "Alt Coder Reader", execution: "read-only" }],
      prompts: [{ prompt_id: "reader", version: 1, name: "Alt Coder Role", summary: "Read-only shared-scene coder" }],
    },
    actions: [bindingAction, runAction, enqueueAction, learningRunAction],
    routes: [
      { route_id: "altcoder.sessions.run", method: "POST", path: "/sessions/:sessionId/runs" },
    ],
  };

  const definition: PluginDefinition = {
    manifest,
    agent_prompts: [{ prompt_id: "reader", version: 1, body: "你是共享 coding 场景的独立插件，只阅读并简洁回复。" }],
    async start(context) {
      const projectId = context.project_id!;
      contexts.set(projectId, context);
      const sourceCheck = (assertCurrent?: () => void) => (sources: readonly MemoryLearningOwnedSource[]) => {
        assertCurrent?.();
        for (const source of sources) checkedSourceSessions.push(source.session_id);
        for (const sessionId of new Set(sources.map(source => source.session_id))) {
          const record = byRuntimeSession(projectId, sessionId);
          if (!record || record.archived || record.project_id !== projectId || record.runtime_session_id !== sessionId)
            throw new ActionError("actions.forbidden", "Alt Coder 来源会话已归档或不属于本插件");
        }
        assertCurrent?.();
      };
      const handlers: ActionHandlerBinding[] = [
        {
          capability_id: bindingAction.capability_id,
          version: bindingAction.version,
          handle: (_call, raw) => {
            const sessionId = String(recordOf(raw).session_id);
            bindingCalls.push(sessionId);
            const record = sessions.get(`${projectId}:${sessionId}`);
            if (!record) throw new ActionError("actions.not_found", "Alt Coder 会话不存在");
            return {
              session_id: record.session_id,
              project_id: record.project_id,
              archived: record.archived,
              runtime: record.runtime_session_id ? { runtime_id: "prologue", session_id: record.runtime_session_id } : null,
            };
          },
        },
        {
          capability_id: runAction.capability_id,
          version: runAction.version,
          handle: async (call, raw) => {
            const body = recordOf(raw);
            const sessionId = String(body.session_id);
            const task = String(body.task);
            const dirPath = String(body.directory);
            const originalInput = call.original_input;
            const key = `${projectId}:${sessionId}`;
            let record = sessions.get(key);
            if (!record) {
              record = { session_id: sessionId, project_id: projectId, runtime_session_id: null, archived: false };
              sessions.set(key, record);
            }
            const directory = { canonical_path: dirPath, realpath_verified: true };
            if (!record.runtime_session_id) {
              const created = await context.services!.actions!.invoke(agent.createSession, ["prologue", { directory, title: sessionId }], {
                beforeEffect: call.beforeEffect,
                ...(call.signal ? { signal: call.signal } : {}),
              });
              record.runtime_session_id = created.session_id;
            }
            const started = await context.services!.actions!.invoke(agent.startRun, ["prologue", {
              session: { runtime_id: "prologue", session_id: record.runtime_session_id },
              directory,
              task,
              role_id: "reader",
              model_selection: { provider_id: "fixture", model_id: "fixture-model" },
              ...(originalInput ? {
                original_input: {
                  input_id: originalInput.input_id,
                  text: originalInput.text,
                  written_by: originalInput.written_by,
                  occurred_at: originalInput.occurred_at,
                },
              } : {}),
            }], { beforeEffect: call.beforeEffect, ...(call.signal ? { signal: call.signal } : {}) });
            return { session_id: record.session_id, runtime_session_id: record.runtime_session_id, run: started.ref };
          },
        },
        {
          capability_id: enqueueAction.capability_id,
          version: enqueueAction.version,
          handle: async (call, raw) => {
            const body = recordOf(raw);
            const check = sourceCheck(() => { call.assert_authority_current?.(); });
            return await context.services!.actions!.invoke(memoryLearningActions.enqueue, {
              session_id: String(body.session_id),
              run_id: String(body.run_id),
            }, {
              assert_memory_sources_current: check,
              beforeEffect: call.beforeEffect,
              assert_authority_current: () => { call.assert_authority_current?.(); },
              ...(call.signal ? { signal: call.signal } : {}),
            });
          },
        },
        {
          capability_id: learningRunAction.capability_id,
          version: learningRunAction.version,
          handle: async (call, raw) => {
            const body = recordOf(raw);
            const sessionId = String(body.session_id);
            const check = sourceCheck(() => { call.assert_authority_current?.(); });
            check([{ event_id: "", version: "1", session_id: sessionId }]);
            return await context.services!.actions!.invoke(memoryLearningActions.form, {
              task_key: String(body.task_key),
              session_id: sessionId,
              run_id: String(body.run_id),
            }, {
              assert_memory_sources_current: check,
              beforeEffect: call.beforeEffect,
              assert_authority_current: () => { call.assert_authority_current?.(); },
              ...(call.signal ? { signal: call.signal } : {}),
            });
          },
        },
      ];
      return {
        kind: "app",
        actions: handlers,
        routes: [{
          route_id: "altcoder.sessions.run",
          async handle(request) {
            const body = recordOf(request.body);
            const result = await context.services!.actions!.invoke(runAction, {
              session_id: String(request.params.sessionId),
              task: String(body.task),
              directory: String(body.directory),
            }, request.execution);
            return { status: 200, body: result };
          },
        }],
      };
    },
  };

  return {
    pluginId,
    name,
    scene,
    definition,
    bindingCalls,
    checkedSourceSessions,
    context: (projectId: string) => contexts.get(projectId),
    installId: (projectId: string) => contexts.get(projectId)?.install_id,
    providerId: (projectId: string) => contexts.get(projectId)?.provider_id ?? contexts.get(projectId)?.install_id,
    archive(projectId: string, sessionId: string, archived = true) {
      const record = sessions.get(`${projectId}:${sessionId}`);
      if (!record) throw new Error("missing Alt Coder session: " + sessionId);
      record.archived = archived;
    },
  };
}
