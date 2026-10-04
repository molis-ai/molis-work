export * from "./action-scene-configuration.js";
export * from "./action-result.js";
export * from "./action-execution.js";
import { validActionExecutionPolicy, type ActionExecutionPolicy } from "./action-execution.js";
import { validActionResultView, type ActionResultView } from "./action-result.js";
import { SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, SUBJECT_CONTEXT_INPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_PROJECT } from "./action-subjects.js";
import { SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE, SUBJECT_OFFERS_INPUT_SCHEMA, SUBJECT_OFFERS_OUTPUT_SCHEMA, type SubjectOfferChoice } from "./action-offers.js";
import { HOME_EVENTS_INPUT_TYPE, HOME_EVENTS_OUTPUT_TYPE, HOME_EVENT_WINDOW_SCHEMA, HOME_EVENT_COLLECTION_SCHEMA } from "./home-events.js";
export * from "./home-events.js";
import { DUE_REMINDERS_INPUT_TYPE, DUE_REMINDERS_OUTPUT_TYPE, DUE_REMINDER_WINDOW_SCHEMA, DUE_REMINDER_COLLECTION_SCHEMA } from "./due-reminders.js";
export * from "./due-reminders.js";
export * from "./action-offers.js";
export * from "./action-usages.js";
export * from "./action-subjects.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { WorkflowContentStation } from "./workflow-content.js";
import { WORKFLOW_CONTENT_SCHEMAS } from "./workflow-content.js";
export * from "./workflow-content.js";
import { searchSourceDeclarationProblems, type SearchSourceDeclaration } from "./search-sources.js";
export * from "./search-sources.js";
import { fragmentOfferDeclarationProblems, type FragmentOfferChoice } from "./action-fragments.js";
export * from "./action-fragments.js";
import { fileSourceDeclarationProblems, type FileSourceDeclaration } from "./file-sources.js";
export * from "./file-sources.js";
export * from "./artifact-pins.js";
import { placementDeclarationProblems } from "./placement.js";
export * from "./placement.js";

/** JSON Schema is preserved at the boundary; providers must not invent output guarantees. */
export type ActionSchema = Readonly<Record<string, unknown>>;
export type ActionAudience = "user" | "agent" | "workflow" | "mcp" | "plugin";

export interface ActionReference {
  readonly capability_id: string;
  readonly version: number;
  /** Persisted consumers can require the original provider even after re-registration. */
  readonly provider_id?: string;
}

/** Optional author intent; matching schemas alone must not redirect a pinned judgment. */
export interface ActionSceneReference {
  readonly scene_id: string;
  readonly version: number;
  readonly provider_id: string;
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
  /** Trusted typed-capability origin. Never accepted from business arguments or persisted. */
  readonly host_plugin?: import("./app-host.js").HostPluginCaller;
  readonly permissions: readonly string[];
  readonly allowed_capability_ids?: readonly string[];
  /** Exact grants; when present, ID-only restrictions cannot widen versions or providers. */
  readonly allowed_actions?: readonly ActionReference[];
  /** Trusted authority owner rechecks revocable access at dispatch, including after a Host queue. */
  readonly validate_authority?: (reference: ActionReference) => void | Promise<void>;
  /** Recheck permissions consumed directly by a scene, without pretending it invoked another action. */
  readonly validate_permissions?: (permissions: readonly string[]) => void | Promise<void>;
  readonly signal?: AbortSignal;
  /** Trusted transport callback; never accepted as capability input or persisted as run state. */
  readonly on_progress?: (event: { readonly stage: string; readonly progress: number }) => void;
  /** Set by scene execution; result history is committed by the consumer after stale-state checks. */
  readonly scene_binding?: { readonly scene_id: string; readonly binding_id: string };
}

/** Supplied only by the original dispatcher to an active handler, never by business input.
 * After asynchronous work, await this immediately before committing each effect. It rechecks
 * this exact registration, live authority/availability, scope, cancellation and call lifetime.
 * The provider still owns the following transaction and optimistic concurrency checks. */
export interface ActionExecutionContext extends ActionCallContext {
  readonly beforeEffect: () => Promise<void>;
}

export interface ActionMetadata {
  readonly title: string;
  readonly description: string;
  readonly kind: "query" | "judgment" | "operation" | "navigation";
  readonly scope: "home" | "project";
  /**
   * What calling it does to the world: reads, changes something that can be changed back, or cannot be undone.
   * Omitted, it is inferred (see `actionEffect`). Irreversible actions are never offered to plugins.
   */
  readonly effect?: "read" | "write" | "irreversible";
  /** `false` keeps an agent-facing action away from generated plugins even when it is reversible. */
  readonly plugin?: false;
  /** Provider owns transaction/conflict safety across awaits; Host still tracks lifetime. Default is serial. */
  readonly scheduling?: "concurrent";
  /** Declarative limits shared by every entry; cancellation uses signal + beforeEffect. */
  readonly execution?: ActionExecutionPolicy;
  readonly audiences: readonly ActionAudience[];
  readonly permissions: readonly string[];
  readonly subject_kinds: readonly string[];
  readonly input_schema: ActionSchema;
  readonly output_schema?: ActionSchema;
  /** Plain-language result and original-object link, declared by the provider for all consumers. */
  readonly result_view?: ActionResultView;
  /** Semantic contracts supplement JSON shape for references and workflow matching. */
  readonly input_type?: string;
  readonly output_type?: string;
  readonly workflow_content?: WorkflowContentStation;
  /** A system search source: the object kinds it lists and the Workbench surface each opens in (specs/archive/system-search §5.1). */
  readonly search_source?: SearchSourceDeclaration;
  /** A side panel file source: the file kinds it lists (or previews) and where each opens (specs/archive/side-panel §3.3). */
  readonly file_source?: FileSourceDeclaration;
  /** Optional rule choices owned by this subject-offer query; targets belong to the same provider. */
  readonly subject_offer_choices?: readonly SubjectOfferChoice[];
  /** Finite choices of a fragment-offer query (specs/archive/contextual-interaction §5.1); targets belong to the same provider. */
  readonly fragment_offer_choices?: readonly FragmentOfferChoice[];
  /** A trigger action needs an enabled compatible binding in this consumer scene. */
  readonly required_scene?: { readonly scene_id: string; readonly version: number };
  readonly result_scene?: ActionSceneReference;
  /** Mandatory nested calls use the same caller's authority; this never grants access. */
  readonly required_actions?: readonly ActionReference[];
  /**
   * Where a command's output names the object it created or changed: dot paths to its id and new revision, e.g.
   * `{ id: "document.id", revision: "document.version" }`. The object's kind is the action's single subject kind.
   * Callers that keep relations to results (the Assistant's work) use it; undeclared, see `actionResultSubject`.
   */
  readonly result_subject?: { readonly id: string; readonly revision?: string };
  /**
   * A command that starts background work (a research run, a generation job): how a caller follows it to its end.
   * `id` is the dot path to the job id in this command's output; the `status` query of the same provider takes it in
   * its `input` field and reports the state at the dot path `state`; `done` and `failed` list the final states.
   * The Assistant uses it to watch a job it started and tell the person when it ends (the convention for long work).
   */
  readonly background_job?: {
    readonly status: { readonly capability_id: string; readonly version: number };
    readonly id: string;
    readonly input: string;
    readonly state: string;
    readonly done: readonly string[];
    readonly failed: readonly string[];
  };
  /**
   * How this change is taken back: another command of the same provider, with its input read from this command's
   * output (a path such as "spark.id"; a one-item array wraps the value in an array, e.g. ["spark.id"]). A change that
   * declares it may run without a confirmation when the person asked for exactly this effect (they can set it back to
   * confirm each time), and the work then offers “撤销”. Never on an irreversible change.
   */
  readonly undo?: {
    readonly capability_id: string;
    readonly version: number;
    readonly input: Readonly<Record<string, string | readonly [string]>>;
  };
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

/**
 * Declare an action's real effect where its id would be misread by `actionEffect` (a "delete_preview" deletes
 * nothing; a trash can be restored). `plugin: false` keeps an existing exclusion from generated plugins explicit.
 */
export function withActionEffect<D extends ActionDefinition<any, any>>(definition: D, effect: NonNullable<ActionMetadata["effect"]>, plugin?: false): D {
  return { ...definition, action: { ...definition.action, effect, ...(plugin === false ? { plugin } : {}) } };
}

const IRREVERSIBLE_ID = /(?:^|[._-])(delete|trash|purge|destroy|erase|wipe|reset|uninstall|remove)(?:$|[._-])/u;
/** An action's effect as declared, or inferred: queries and navigation read; deleting-like ids cannot be undone; the rest write. */
export function actionEffect(action: Pick<ActionMetadata, "kind" | "effect">, capabilityId: string): "read" | "write" | "irreversible" {
  if (action.effect) return action.effect;
  if (action.kind === "query" || action.kind === "navigation") return "read";
  return IRREVERSIBLE_ID.test(capabilityId) ? "irreversible" : "write";
}
/**
 * Whether an action is offered to a caller of this audience. Generated plugins reach every action already offered to
 * agents unless it cannot be undone or opts out; a plugin still needs the person's install-time grant to call it.
 */
export function actionReachesAudience(action: Pick<ActionMetadata, "kind" | "effect" | "plugin" | "audiences">, capabilityId: string, audience: ActionAudience): boolean {
  if (action.audiences.includes(audience)) return audience !== "plugin" || actionEffect(action, capabilityId) !== "irreversible";
  return audience === "plugin" && action.audiences.includes("agent") && action.plugin !== false && actionEffect(action, capabilityId) !== "irreversible";
}

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
  handle(context: ActionExecutionContext, input: unknown): unknown | Promise<unknown>;
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
  /** Recommendation results refer to declared, currently authorized subject-offer choices. */
  readonly recommendation_source?: "subject-offers";
  /** Display labels for the consumer's finite symbolic recommendation enum. */
  readonly recommendation_labels?: Readonly<Record<string, string>>;
  readonly permissions: readonly string[];
  /** Required when the owner offers configurable targets; discovery does not grant these permissions. */
  readonly configuration_permissions?: readonly string[];
  /** Trigger payload is separate from the context passed to the judgment. Required with prepare. */
  readonly event_schema?: ActionSchema;
}

export interface ActionSceneView {
  readonly configuration_availability: ActionAvailability;
  readonly definition: ActionSceneDefinition;
  readonly provider: ActionProvider;
  readonly availability: ActionAvailability;
  readonly compatible: boolean;
  readonly reason?: string;
}

export interface ActionSceneUsage extends ActionSceneBinding { readonly availability: ActionAvailability }

/** An actual configuration location owned by the consumer, including an unbound fixed slot. */
export interface ActionSceneTargetDefinition {
  readonly binding_id: string;
  readonly title: string;
  readonly href?: string;
  readonly revision: string | null;
  readonly availability?: ActionAvailability;
  /** Additional requirements for enabling a binding; do not prevent disabling it. */
  readonly activation_availability?: ActionAvailability;
  /** Per-location permissions needed only for enabling, e.g. an automatic Inbox write. */
  readonly activation_permissions?: readonly string[];
}
export interface ActionSceneTarget extends ActionSceneTargetDefinition {
  readonly scene_id: string;
  readonly scene_version: number;
  readonly provider_id: string;
  readonly project_id: string | null;
  readonly binding: ActionSceneBinding | null;
  readonly availability: ActionAvailability;
  /** Allows disabling an existing binding even when its judgment is unavailable. */
  readonly configuration_availability: ActionAvailability;
}
/** Optimistic configuration writes must be checked atomically by the original owner. */
export interface ActionSceneConfigureOptions {
  readonly provider_id: string;
  readonly expected_revision: string | null;
  /** Filled by the common service for the owner's final installation-grant check; caller values are ignored. */
  readonly required_permissions?: readonly string[];
  /** Trusted transport check, never accepted as business input or persisted. Runs for enable and disable. */
  readonly before_write?: () => void | Promise<void>;
}

export interface ActionSceneClient {
  discoverScenes(context: ActionCallContext, judgment?: ActionReference): readonly ActionSceneView[] | Promise<readonly ActionSceneView[]>;
  usages(context: ActionCallContext, judgment?: ActionReference): Promise<readonly ActionSceneUsage[]>;
  targets(context: ActionCallContext, judgment?: ActionReference, scene?: Pick<ActionSceneTarget, "scene_id" | "scene_version" | "provider_id">): Promise<readonly ActionSceneTarget[]>;
  bind(context: ActionCallContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): Promise<void>;
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
  targets?(context: ActionCallContext): readonly ActionSceneTargetDefinition[] | Promise<readonly ActionSceneTargetDefinition[]>;
  /** Must write through the authoritative owner; when options are supplied, atomically reject a stale expected_revision. */
  bind(context: ActionCallContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void | Promise<void>;
  prepare?(context: ActionCallContext, event: unknown): { input: unknown; state?: unknown } | Promise<{ input: unknown; state?: unknown }>;
  consume(context: ActionCallContext, input: unknown, result: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
  /** Optional explicit failure consumption, after the same stale-state and authority checks. */
  failed?(context: ActionCallContext, input: unknown, error: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
  availability?(context: ActionCallContext): ActionAvailability;
  /** Configuration-only availability must not depend on execution/model grants. */
  configuration_availability?(context: ActionCallContext): ActionAvailability;
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

/** Keep the originating operation's transport authority when it calls a nested action or scene.
 * This does not grant permissions; the dispatcher still checks each target's current registration and policy. */
export function retainActionAuthority<Context extends ActionCallContext>(context: Context, origin: ActionReference & { provider_id: string }, beforeEffect?: () => Promise<void>): Context {
  const validate = context.validate_authority;
  if (!validate && !beforeEffect) return context;
  const pinned = { capability_id: origin.capability_id, version: origin.version, provider_id: origin.provider_id };
  return { ...context, validate_authority: async (reference: ActionReference) => {
    await beforeEffect?.();
    await validate?.(pinned);
    if (reference.capability_id !== pinned.capability_id || reference.version !== pinned.version || reference.provider_id !== pinned.provider_id) await validate?.(reference);
  } };
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

/** A Manifest declares every permission its actions use; these stay optional because the Host grants them per call. */
export function actionPermissionDeclarations(definitions: readonly ActionDefinition[], reason: string,
  declared: readonly { readonly permission: string }[] = []): { permission: string; required: boolean; reason: string }[] {
  const known = new Set(declared.map(item => item.permission));
  return [...new Set(definitions.flatMap(definition => definition.action.permissions))].filter(permission => !known.has(permission))
    .map(permission => ({ permission, required: false, reason }));
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
          || (a.effect !== undefined && !["read", "write", "irreversible"].includes(String(a.effect))) || (a.plugin !== undefined && a.plugin !== false)
          || !object(a.input_schema) || (a.output_schema !== undefined && !object(a.output_schema))) {
          problems.push(`能力 ${key} 的输入输出、权限或展示定义不完整`);
          continue;
        }
        if (a.result_scene !== undefined && (!object(a.result_scene) || !id(a.result_scene.scene_id) || !version(a.result_scene.version) || !text(a.result_scene.provider_id))) {
          problems.push(`能力 ${key} 的结果场景引用无效`);
        }
        if (a.result_view !== undefined && !validActionResultView(a.result_view)) {
          problems.push(`能力 ${key} 的结果展示定义无效`);
        }
        if (a.execution !== undefined && !validActionExecutionPolicy(a.execution)) {
          problems.push(`能力 ${key} 的执行策略无效`);
        }
        if (a.required_scene !== undefined && (!object(a.required_scene) || !id(a.required_scene.scene_id) || !version(a.required_scene.version))) {
          problems.push(`能力 ${key} 的消费场景依赖无效`);
        }
        if (a.required_actions !== undefined && (!Array.isArray(a.required_actions)
          || a.required_actions.some(ref => !object(ref) || !id(ref.capability_id) || !version(ref.version)
            || (ref.provider_id !== undefined && !id(ref.provider_id))))) {
          problems.push(`能力 ${key} 的能力依赖无效`);
        }
        if (a.output_type === SUBJECT_CONTEXT_TYPE || a.input_type === SUBJECT_REFERENCE_TYPE) {
          if (raw.operation !== "query" || (a.scope !== "project" && a.scope !== "home") || a.kind !== "query" || !a.subject_kinds.length
            || a.input_type !== SUBJECT_REFERENCE_TYPE || a.output_type !== SUBJECT_CONTEXT_TYPE
            || canonicalSchema(a.input_schema) !== canonicalSchema(SUBJECT_CONTEXT_INPUT_SCHEMA)
            || ![SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_PROJECT, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN].some(schema => canonicalSchema(a.output_schema) === canonicalSchema(schema))) {
            problems.push(`能力 ${key} 没有兑现对象上下文协议 v1 的输入输出合同`);
          }
        }
        if (a.input_type === SUBJECT_OFFERS_INPUT_TYPE || a.output_type === SUBJECT_OFFERS_OUTPUT_TYPE) {
          if (raw.operation !== "query" || a.kind !== "query" || a.scope !== "project" || !a.subject_kinds.length
            || a.input_type !== SUBJECT_OFFERS_INPUT_TYPE || a.output_type !== SUBJECT_OFFERS_OUTPUT_TYPE
            || canonicalSchema(a.input_schema) !== canonicalSchema(SUBJECT_OFFERS_INPUT_SCHEMA)
            || canonicalSchema(a.output_schema) !== canonicalSchema(SUBJECT_OFFERS_OUTPUT_SCHEMA)) {
            problems.push(`能力 ${key} 没有兑现事项动作协议 v1 的输入输出合同`);
          }
        }
        if (a.subject_offer_choices !== undefined) {
          const choices = a.subject_offer_choices;
          const subjectKinds = a.subject_kinds;
          if (a.input_type !== SUBJECT_OFFERS_INPUT_TYPE || a.output_type !== SUBJECT_OFFERS_OUTPUT_TYPE || !Array.isArray(choices)
            || choices.some(choice => !object(choice) || !id(choice.offer_id) || !text(choice.title) || choice.title.length > 120
              || !object(choice.action) || !id(choice.action.capability_id) || !version(choice.action.version) || choice.action.provider_id !== undefined
              || (choice.subject_kinds !== undefined && (!Array.isArray(choice.subject_kinds) || !choice.subject_kinds.length
                || choice.subject_kinds.some(kind => !subjectKinds.includes(kind)) || new Set(choice.subject_kinds).size !== choice.subject_kinds.length)))
            || new Set(choices.map(choice => choice.offer_id)).size !== choices.length) {
            problems.push(`能力 ${key} 的事项推荐选项必须有唯一标识、名称及本提供方的目标动作版本`);
          }
        }
        if (a.input_type === HOME_EVENTS_INPUT_TYPE || a.output_type === HOME_EVENTS_OUTPUT_TYPE) {
          if (raw.operation !== "query" || a.kind !== "query" || a.scope !== "project" || !a.subject_kinds.length
            || a.input_type !== HOME_EVENTS_INPUT_TYPE || a.output_type !== HOME_EVENTS_OUTPUT_TYPE
            || canonicalSchema(a.input_schema) !== canonicalSchema(HOME_EVENT_WINDOW_SCHEMA)
            || canonicalSchema(a.output_schema) !== canonicalSchema(HOME_EVENT_COLLECTION_SCHEMA)) {
            problems.push(`${key} 首页事件查询必须使用完整规范合同`);
          }
        }
        if (a.input_type === DUE_REMINDERS_INPUT_TYPE || a.output_type === DUE_REMINDERS_OUTPUT_TYPE) {
          if (raw.operation !== "query" || a.kind !== "query" || a.scope !== "home"
            || a.input_type !== DUE_REMINDERS_INPUT_TYPE || a.output_type !== DUE_REMINDERS_OUTPUT_TYPE
            || canonicalSchema(a.input_schema) !== canonicalSchema(DUE_REMINDER_WINDOW_SCHEMA)
            || canonicalSchema(a.output_schema) !== canonicalSchema(DUE_REMINDER_COLLECTION_SCHEMA)) {
            problems.push(`${key} 到期提醒查询必须是 Home 范围、使用完整规范合同`);
          }
        }
        if (a.background_job !== undefined) {
          const job = a.background_job;
          const path = (value: unknown) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
          const states = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.length > 0);
          if (raw.operation !== "command" || !object(job) || !object(job.status) || !id(job.status.capability_id) || !version(job.status.version)
            || !path(job.id) || !path(job.input) || !path(job.state) || !states(job.done) || !states(job.failed)) {
            problems.push(`能力 ${key} 的后台任务声明必须是命令，并写明状态查询、任务标识与状态的位置和结束状态`);
          }
        }
        if (a.undo !== undefined) {
          const undo = a.undo;
          const path = (value: unknown) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
          const fields = object(undo) && object(undo.input) ? Object.entries(undo.input) : [];
          if (raw.operation !== "command" || a.effect === "irreversible" || !object(undo) || !id(undo.capability_id) || !version(undo.version) || !fields.length
            || fields.some(([, value]) => !(path(value) || (Array.isArray(value) && value.length === 1 && path(value[0]))))) {
            problems.push(`能力 ${key} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`);
          }
        }
        problems.push(...searchSourceDeclarationProblems(key, a, raw.operation, canonicalSchema));
        problems.push(...fragmentOfferDeclarationProblems(key, a, raw.operation, canonicalSchema));
        problems.push(...fileSourceDeclarationProblems(key, a, raw.operation, canonicalSchema));
        problems.push(...placementDeclarationProblems(key, a, raw.operation, canonicalSchema));
        if (a.workflow_content !== undefined) {
          const w = a.workflow_content;
          if (!object(w) || !/^[a-z][a-z0-9-]{1,40}$/.test(String(w.id)) || !text(w.title) || !text(w.icon)
            || w.protocol !== 1 || !["list", "read", "receive", "create"].includes(String(w.role)) || (w.receives !== undefined && (w.receives !== false || w.role === "receive"))) {
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
        if (s.recommendation_source !== undefined && (s.recommendation_source !== "subject-offers" || s.result_type !== "molis.behavior-recommendation.v1")) {
          problems.push(`消费场景 ${s.scene_id} 的推荐来源合同无效`);
        }
        if (s.recommendation_labels !== undefined) {
          const schema = s.result_schema as { properties?: { suggested_behavior_ids?: { items?: { enum?: unknown } } } } | undefined;
          const keys = schema?.properties?.suggested_behavior_ids?.items?.enum;
          if (!object(s.recommendation_labels) || s.result_type !== "molis.behavior-recommendation.v1" || s.recommendation_source !== undefined || !Array.isArray(keys)
            || Object.entries(s.recommendation_labels).some(([key, value]) => !keys.includes(key) || !text(value))) {
            problems.push(`消费场景 ${s.scene_id} 的推荐名称必须对应结果合同中的选项`);
          }
        }
        const key = `${s.scene_id}@${s.version}`;
        if (seen.has(key)) problems.push(`消费场景重复：${key}`);
        seen.add(key);
        if (!text(s.title) || !text(s.description) || !text(s.trigger) || !["home", "project"].includes(String(s.scope))
          || !strings(s.permissions) || (s.configuration_permissions !== undefined && !strings(s.configuration_permissions)) || !strings(s.subject_kinds) || !object(s.input_schema) || !object(s.result_schema)) {
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

/** Exact selections do not grant permission; the action service checks live authority. */
export type ExactActionReference = ActionReference & { readonly provider_id: string };
export function parseExactActionReferences(value: unknown): ExactActionReference[] {
  if (!Array.isArray(value) || value.length > 100) throw new ActionError("actions.reference_invalid", "Invalid action selection or more than 100 actions");
  const refs = value.map(item => {
    if (!object(item) || !id(item.capability_id) || !version(item.version) || !id(item.provider_id)) {
      throw new ActionError("actions.reference_invalid", "An action selection requires its exact identity, version and provider");
    }
    return { capability_id: item.capability_id, version: item.version, provider_id: item.provider_id };
  });
  if (new Set(refs.map(ref => JSON.stringify(ref))).size !== refs.length) throw new ActionError("actions.reference_invalid", "Duplicate action selection");
  return refs;
}


/**
 * How a person reads an input field that its schema did not title: the common names in plain words. A capability's own
 * `title` always wins; this only covers the fields most business actions share.
 */
const COMMON_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: "标题", name: "名称", text: "内容", body: "正文", content: "内容", notes: "备注", note: "备注", description: "说明", summary: "摘要",
  kind: "类型", type: "类型", status: "状态", priority: "优先级", category_id: "分类", tags: "标签", url: "链接",
  date: "日期", start_date: "开始日期", end_date: "结束日期", due_date: "截止日期", start_time: "开始时间", end_time: "结束时间", time_zone: "时区",
  starts_at: "开始", ends_at: "结束", remind_at: "提醒时间", expected_revision: "基于的版本", expected_version: "基于的版本", id: "对象", item: "内容",
  markdown: "正文", folder_id: "文件夹", goal_id: "目标", project_id: "项目", starred: "加星标",
};
export function actionFieldLabel(key: string, declared?: { title?: string; description?: string }): string {
  if (declared?.title) return declared.title;
  if (COMMON_FIELD_LABELS[key]) return COMMON_FIELD_LABELS[key]!;
  return declared?.description && declared.description.length <= 24 ? declared.description : key;
}

/**
 * The choices a field declares, each with the words a person reads: `oneOf`/`anyOf` entries `{ const, title }`, or an
 * `enum` whose description names them as `value=label` (e.g. "personal=个人，project=当前项目"). Null when none.
 */
export function actionFieldOptions(declared?: unknown): Array<{ value: string; label: string }> | null {
  if (!declared || typeof declared !== "object") return null;
  const schema = declared as { enum?: unknown; oneOf?: unknown; anyOf?: unknown; description?: unknown };
  const isNull = (item: unknown) => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "null";
  const listedAll = [schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined;
  // A nullable field wraps its choices with a null branch: read the choices inside.
  const listed = listedAll?.filter(item => !isNull(item));
  if (listed?.length === 1 && listed[0] && typeof listed[0] === "object" && (listed[0] as { const?: unknown }).const === undefined) return actionFieldOptions(listed[0]);
  if (listed?.length && listed.every(item => item && typeof item === "object" && typeof (item as { const?: unknown }).const === "string")) {
    return listed.map(item => ({ value: (item as { const: string }).const, label: typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title : (item as { const: string }).const }));
  }
  if (!Array.isArray(schema.enum) || !schema.enum.length || !schema.enum.every(item => typeof item === "string")) return null;
  const named = new Map<string, string>();
  if (typeof schema.description === "string") for (const [, value, label] of schema.description.matchAll(/([A-Za-z0-9_.-]+)\s*=\s*([^，,；;、\n]+)/g)) named.set(value!, label!.trim());
  return (schema.enum as string[]).map(value => ({ value, label: named.get(value) ?? value }));
}

/**
 * How a person fills a field that is a calendar day or a moment, from its JSON Schema `format` ("date", "date-time"),
 * through a nullable wrapper: picked rather than typed. Null for any other field.
 */
export function actionFieldInput(declared?: unknown): "date" | "datetime" | null {
  if (!declared || typeof declared !== "object") return null;
  const schema = declared as { format?: unknown; oneOf?: unknown; anyOf?: unknown };
  if (schema.format === "date") return "date";
  if (schema.format === "date-time") return "datetime";
  const listed = ([schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined)
    ?.filter(item => !(item && typeof item === "object" && (item as { type?: unknown }).type === "null"));
  return listed?.length === 1 ? actionFieldInput(listed[0]) : null;
}

/** A moment as a person reads it, in this machine's local time. */
const localMoment = (value: string): string | null => {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return null;
  const two = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
};

/** A field's value as a person reads it: a declared choice by its label, a moment in local time, rich text as its text, minutes-of-day as a time, the rest as it is. */
export function actionFieldValue(key: string, value: unknown, declared?: unknown): string {
  if (typeof value === "string" && actionFieldInput(declared) === "datetime") return localMoment(value) ?? value;
  if (typeof value === "string") return actionFieldOptions(declared)?.find(option => option.value === value)?.label ?? value;
  if (typeof value === "number" && /_time$/.test(key) && Number.isInteger(value) && value >= 0 && value < 1440) {
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }
  if (value && typeof value === "object" && (value as { type?: unknown }).type === "doc") {
    const inline = (node: unknown): string => !node || typeof node !== "object" ? "" : typeof (node as { text?: unknown }).text === "string" ? (node as { text: string }).text
      : Array.isArray((node as { content?: unknown }).content) ? ((node as { content: unknown[] }).content).map(inline).join("") : "";
    return ((value as { content?: unknown[] }).content ?? []).map(inline).filter(Boolean).join("\n");
  }
  if (Array.isArray(value) && value.every(item => typeof item === "string")) return value.join("、");
  return typeof value === "boolean" ? (value ? "是" : "否") : typeof value === "number" ? String(value) : JSON.stringify(value, null, 2);
}
