import type { HostCapabilityDefinition } from "./app-host.js";
import type { WorkflowContentStation } from "./workflow-content.js";
import { WORKFLOW_CONTENT_SCHEMAS } from "./workflow-content.js";
export * from "./workflow-content.js";

/** JSON Schema is preserved at the boundary; providers must not invent output guarantees. */
export type ActionSchema = Readonly<Record<string, unknown>>;
export type ActionAudience = "user" | "agent" | "workflow" | "mcp" | "plugin";

export interface ActionReference {
  readonly capability_id: string;
  readonly version: number;
  /** Persisted consumers can require the original provider even after re-registration. */
  readonly provider_id?: string;
}

/** Supplied by the authenticated host, never taken from model/tool arguments. */
export interface ActionCallContext {
  readonly actor_id: string;
  /** Optional historical author supplied by a trusted adapter; grants still belong to actor_id. Never business input. */
  readonly audit_actor_id?: string;
  /** Stable session supplied by the authenticated Host; never a business input. */
  readonly runtime_session_id?: string;
  /** Trusted audit classification; null preserves legacy callers whose kind was not recorded. Never business input. */
  readonly actor_kind?: "user" | "runtime" | null;
  /** Authenticated user-operation provenance supplied only by a protected Host adapter.
   * These audit locators grant no authority on their own; never copy them from tool/business input. */
  readonly user_action?: {
    readonly source: string;
    readonly conversation_ref: string;
    readonly message_ref: string;
    /** Protected UI confirmation provenance; optional for operations without a whole-subject decision. */
    readonly whole_confirmation_prompted?: boolean;
    readonly prompted_subject_id?: string;
  };
  readonly project_id: string | null;
  readonly audience: ActionAudience;
  /** Host-bound installation identity for private Plugin SDK services. */
  readonly plugin_install_id?: string;
  readonly permissions: readonly string[];
  readonly allowed_capability_ids?: readonly string[];
  /** Exact grants; when present, ID-only restrictions cannot widen versions or providers. */
  readonly allowed_actions?: readonly ActionReference[];
  /** Trusted authority owner rechecks revocable access at dispatch, including after a Host queue. */
  readonly validate_authority?: (reference: ActionReference) => void | Promise<void>;
  readonly signal?: AbortSignal;
  /** Trusted transport callback; never accepted as capability input or persisted as run state. */
  readonly on_progress?: (event: { readonly stage: string; readonly progress: number }) => void;
  /** Set by scene execution; result history is committed by the consumer after stale-state checks. */
  readonly scene_binding?: { readonly scene_id: string; readonly binding_id: string };
}

export interface ActionMetadata {
  readonly title: string;
  readonly description: string;
  readonly kind: "query" | "judgment" | "operation" | "navigation";
  readonly scope: "home" | "project";
  /** Provider owns transaction/conflict safety across awaits; Host still tracks lifetime. Default is serial. */
  readonly scheduling?: "concurrent";
  readonly audiences: readonly ActionAudience[];
  readonly permissions: readonly string[];
  readonly subject_kinds: readonly string[];
  readonly input_schema: ActionSchema;
  readonly output_schema?: ActionSchema;
  /** Semantic contracts supplement JSON shape for references and workflow matching. */
  readonly input_type?: string;
  readonly output_type?: string;
  readonly workflow_content?: WorkflowContentStation;
  /** A trigger action needs an enabled compatible binding in this consumer scene. */
  readonly required_scene?: { readonly scene_id: string; readonly version: number };
  /** Mandatory nested calls use the same caller's authority; this never grants access. */
  readonly required_actions?: readonly ActionReference[];
}

export interface ActionDefinition<Input = unknown, Output = unknown> extends HostCapabilityDefinition<Input, Output> {
  /** An action is a query or a command; a wait (following a live round) only observes and is never offered as one. */
  readonly operation: "query" | "command";
  readonly provider_id?: string;
  readonly action: ActionMetadata;
}

export interface ActionProvider {
  readonly provider_id: string;
  readonly title: string;
  readonly kind: "system" | "plugin" | "mcp";
  /** A project activation cannot accidentally service another project's calls. */
  readonly project_id?: string;
  readonly plugin_id?: string;
}

export type ActionAvailability = { readonly available: true } | {
  readonly available: false;
  readonly code: string;
  readonly reason: string;
};

export interface ActionView extends ActionReference {
  readonly operation: "query" | "command";
  readonly action: ActionMetadata;
  readonly provider: ActionProvider;
  readonly availability: ActionAvailability;
}

export interface ActionHandlerBinding {
  readonly capability_id: string;
  readonly version: number;
  /** Trusted provider promises that this handler completes without yielding. */
  readonly execution?: "sync";
  handle(context: ActionCallContext, input: unknown): unknown | Promise<unknown>;
  availability?(context: ActionCallContext): ActionAvailability;
}

/** A real consumer of a judgment, not just a label for a dropdown. */
export interface ActionSceneDefinition {
  readonly scene_id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly trigger: string;
  readonly scope: "home" | "project";
  readonly subject_kinds: readonly string[];
  readonly input_schema: ActionSchema;
  readonly result_schema: ActionSchema;
  readonly input_type?: string;
  readonly result_type?: string;
  readonly permissions: readonly string[];
  /** Trigger payload is separate from the context passed to the judgment. Required with prepare. */
  readonly event_schema?: ActionSchema;
}

export interface ActionSceneView {
  readonly definition: ActionSceneDefinition;
  readonly provider: ActionProvider;
  readonly availability: ActionAvailability;
  readonly compatible: boolean;
  readonly reason?: string;
}

export interface ActionSceneUsage extends ActionSceneBinding { readonly availability: ActionAvailability }

export interface ActionSceneClient {
  discoverScenes(context: ActionCallContext, judgment?: ActionReference): readonly ActionSceneView[] | Promise<readonly ActionSceneView[]>;
  usages(context: ActionCallContext, judgment?: ActionReference): Promise<readonly ActionSceneUsage[]>;
  bind(context: ActionCallContext, binding: ActionSceneBinding): Promise<void>;
  runScene(context: ActionCallContext, scene: { scene_id: string; version: number }, bindingId: string, event: unknown): Promise<unknown>;
}

/** The consuming module owns this record. Catalogs derive usage from this port. */
export interface ActionSceneBinding {
  readonly binding_id: string;
  readonly scene_id: string;
  readonly scene_version: number;
  readonly project_id: string | null;
  readonly function: ActionReference;
  readonly enabled: boolean;
  readonly title: string;
  readonly href?: string;
  /** Consumer-owned revision detects edits made while a judgment is awaiting a result. */
  readonly revision?: string;
}

export interface ActionSceneHandlerBinding {
  readonly scene_id: string;
  readonly version: number;
  bindings(context: ActionCallContext): readonly ActionSceneBinding[] | Promise<readonly ActionSceneBinding[]>;
  /** Must write through the consumer's authoritative configuration API. */
  bind(context: ActionCallContext, binding: ActionSceneBinding): void | Promise<void>;
  prepare?(context: ActionCallContext, event: unknown): { input: unknown; state?: unknown } | Promise<{ input: unknown; state?: unknown }>;
  consume(context: ActionCallContext, input: unknown, result: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
  /** Optional explicit failure consumption, after the same stale-state and authority checks. */
  failed?(context: ActionCallContext, input: unknown, error: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
  availability?(context: ActionCallContext): ActionAvailability;
}

export interface ActionProviderRegistration {
  readonly provider: ActionProvider;
  readonly definitions: readonly ActionDefinition[];
  readonly handlers: readonly ActionHandlerBinding[];
  readonly scenes?: readonly ActionSceneDefinition[];
  readonly scene_handlers?: readonly ActionSceneHandlerBinding[];
  availability?(context: ActionCallContext): ActionAvailability;
}

/** Host lifecycle registers and disposes contributions; clients cannot register implementations. */
export interface ActionRegistryPort {
  registerProvider(registration: ActionProviderRegistration): () => void;
}

export interface ActionClient {
  discover(context: ActionCallContext): readonly ActionView[] | Promise<readonly ActionView[]>;
  invoke(context: ActionCallContext, reference: ActionReference, input: unknown): Promise<unknown>;
}

/** Composition port for transaction-bound SDK operations. Never waits or skips async authority. */
export interface SyncActionClient {
  invokeSync(context: ActionCallContext, reference: ActionReference, input: unknown): unknown;
}

export function requireSynchronous<T>(value: T, message = "此操作需要异步调用"): Exclude<T, PromiseLike<unknown>> {
  if (value && (typeof value === "object" || typeof value === "function") && "then" in value
    && typeof value.then === "function") {
    // A rejected policy promise must not become an unhandled rejection after rejecting this call.
    void Promise.resolve(value).catch(() => undefined);
    throw new ActionError("actions.async_required", message);
  }
  return value as Exclude<T, PromiseLike<unknown>>;
}

/** An entrypoint binds its authenticated context once; callers supply only business input. */
export interface BoundActionClient {
  discover(): Promise<readonly ActionView[]>;
  invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output>;
}

export function bindActionClient(client: ActionClient, context: () => ActionCallContext): BoundActionClient {
  return { discover: async () => client.discover(context()),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) =>
      await client.invoke(context(), definition, input) as Output };
}

/** A compatibility HTTP route only adapts transport; execution always goes through the Host. */
export function bindPluginActionRoute<Input, Output>(
  context: import("./plugin.js").PluginStartContext,
  definition: ActionDefinition<Input, Output>,
  input: (request: import("./plugin.js").PluginRouteRequest) => Input,
  route_id = definition.capability_id,
): import("./plugin.js").PluginRouteBinding {
  return { route_id, async handle(request) {
    try {
      if (!context.actor_id || request.actor_id !== context.actor_id) throw new ActionError("actions.forbidden", "调用者与当前插件入口不一致");
      if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
      return { status: 200, body: await context.services.actions.invoke(definition, input(request)) };
    } catch (error) {
      const code = error instanceof ActionError ? error.code : undefined;
      const status = ["actions.forbidden", "actions.owner_mismatch"].includes(code ?? "") ? 403 : code === "actions.missing" ? 404 : code === "actions.unredeemed" ? 503 : 400;
      return { status, body: { error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) } };
    }
  } };
}

/** Bridge for legacy owner-bound storage/Artifact SDKs. It never impersonates the startup owner. */
export function bindOwnerPluginAction<Input, Output>(
  context: import("./plugin.js").PluginStartContext,
  definition: ActionDefinition<Input, Output>,
  handle: (input: Input, beforeWrite: () => Promise<void>) => Output | Promise<Output>,
  dependencies: readonly ActionReference[] = [],
): ActionHandlerBinding {
  const availability = (caller: ActionCallContext): ActionAvailability => {
    if (!context.actor_id || caller.actor_id !== context.actor_id) return { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" };
    for (const dependency of dependencies) {
      const state = context.services?.capabilities?.availability?.(dependency);
      if (!state) return { available: false, code: "actions.dependency_unknown", reason: "宿主未提供依赖状态检查" };
      if (!state.available) return state;
    }
    return { available: true };
  };
  return { ...definition, availability, async handle(caller, input) {
    const owner = availability(caller);
    if (!owner.available) throw new ActionError(owner.code, owner.reason);
    const beforeWrite = async () => {
      caller.signal?.throwIfAborted();
      const reference = { capability_id: definition.capability_id, version: definition.version, provider_id: context.install_id };
      await caller.validate_authority?.(reference);
      if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
      const current = (await context.services.actions.discover()).find(row => row.capability_id === reference.capability_id
        && row.version === reference.version && row.provider.provider_id === reference.provider_id);
      if (!current) throw new ActionError("actions.missing", "原插件动作已撤下，不能继续保存");
      if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason);
      for (const permission of definition.action.permissions) context.requireGrant(permission);
      caller.signal?.throwIfAborted();
    };
    // A query writes nothing, and the registry already routed it to the live registration after the Host checked its
    // availability. Only a command confirms, before it writes, that the action is still the one published: discovering
    // every action of the project on each read made plain page refreshes pay for it.
    if (definition.operation !== "query") await beforeWrite();
    return handle(input as Input, beforeWrite);
  } };
}

export class ActionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/** Cheap manifest shape validation; the execution owner compiles JSON Schemas. */
export function inspectActionDeclarations(definitions: unknown, scenes: unknown): string[] {
  const problems: string[] = [];
  if (definitions !== undefined) {
    if (!Array.isArray(definitions)) problems.push("actions 必须是数组");
    else {
      const seen = new Set<string>();
      for (const raw of definitions) {
        if (!object(raw) || !id(raw.capability_id) || !version(raw.version)) { problems.push("能力需要有效身份和版本"); continue; }
        const key = `${raw.capability_id}@${raw.version}`;
        if (seen.has(key)) problems.push(`能力重复：${key}`);
        seen.add(key);
        const a = raw.action;
        if (!object(a) || !text(a.title) || !text(a.description)
          || !["query", "judgment", "operation", "navigation"].includes(String(a.kind))
          || !["home", "project"].includes(String(a.scope)) || (a.scheduling !== undefined && a.scheduling !== "concurrent") || !strings(a.permissions) || !strings(a.subject_kinds)
          || !strings(a.audiences) || a.audiences.length === 0
          || !a.audiences.every(v => ["user", "agent", "workflow", "mcp", "plugin"].includes(v))
          || !object(a.input_schema) || (a.output_schema !== undefined && !object(a.output_schema))) {
          problems.push(`能力 ${key} 的输入输出、权限或展示定义不完整`);
          continue;
        }
        if (a.required_scene !== undefined && (!object(a.required_scene) || !id(a.required_scene.scene_id) || !version(a.required_scene.version))) {
          problems.push(`能力 ${key} 的消费场景依赖无效`);
        }
        if (a.required_actions !== undefined && (!Array.isArray(a.required_actions)
          || a.required_actions.some(ref => !object(ref) || !id(ref.capability_id) || !version(ref.version)
            || (ref.provider_id !== undefined && !id(ref.provider_id))))) {
          problems.push(`能力 ${key} 的能力依赖无效`);
        }
        if (a.workflow_content !== undefined) {
          const w = a.workflow_content;
          if (!object(w) || !/^[a-z][a-z0-9-]{1,40}$/.test(String(w.id)) || !text(w.title) || !text(w.icon)
            || w.protocol !== 1 || !["list", "read", "receive", "create"].includes(String(w.role))) {
            problems.push(`能力 ${key} 的工作流内容合同无效`);
          } else {
            const role = w.role as WorkflowContentStation["role"];
            const schemas = WORKFLOW_CONTENT_SCHEMAS[role];
            if (a.scope !== "project" || !a.audiences.includes("workflow")
              || a.input_type !== `molis.workflow.content.${role}.input.v1` || a.output_type !== `molis.workflow.content.${role}.output.v1`
              || canonicalSchema(a.input_schema) !== canonicalSchema(schemas.input)
              || canonicalSchema(a.output_schema) !== canonicalSchema(schemas.output)
              || raw.operation !== (role === "list" || role === "read" ? "query" : "command")) {
              problems.push(`能力 ${key} 没有兑现工作流内容协议 v1 的输入输出合同`);
            }
          }
        }
        if (raw.operation !== (a.kind === "query" || a.kind === "navigation" ? "query" : "command")) {
          problems.push(`能力 ${key} 的 operation 与 kind 不一致`);
        }
      }
    }
  }
  if (scenes !== undefined) {
    if (!Array.isArray(scenes)) problems.push("action_scenes 必须是数组");
    else {
      const seen = new Set<string>();
      for (const s of scenes) {
        if (!object(s) || !id(s.scene_id) || !version(s.version)) { problems.push("消费场景需要有效身份和版本"); continue; }
        if (s.event_schema !== undefined && !object(s.event_schema)) problems.push(`消费场景 ${s.scene_id} 的事件合同无效`);
        const key = `${s.scene_id}@${s.version}`;
        if (seen.has(key)) problems.push(`消费场景重复：${key}`);
        seen.add(key);
        if (!text(s.title) || !text(s.description) || !text(s.trigger) || !["home", "project"].includes(String(s.scope))
          || !strings(s.permissions) || !strings(s.subject_kinds) || !object(s.input_schema) || !object(s.result_schema)) {
          problems.push(`消费场景 ${key} 的触发、输入输出或权限定义不完整`);
        }
      }
    }
  }
  return problems;
}

function canonicalSchema(value: unknown): string {
  const sort = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(sort)
    : object(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, sort(entry[key])])) : entry;
  return JSON.stringify(sort(value));
}

function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function id(v: unknown): v is string { return text(v) && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(v); }
function version(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function strings(v: unknown): v is string[] { return Array.isArray(v) && v.every(text); }
