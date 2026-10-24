export * from "./action-scene-configuration.js";
export * from "./action-result.js";
export * from "./action-execution.js";
import { ActionError, type ActionErrorKind } from "./action-errors.js";
export * from "./action-errors.js";
import type { ActionExecutionPolicy } from "./action-execution.js";
import type { ActionResultView } from "./action-result.js";
import type { SubjectOfferChoice } from "./action-offers.js";
export * from "./home-background-tasks.js";
export * from "./home-events.js";
export * from "./due-reminders.js";
export * from "./action-offers.js";
export * from "./action-usages.js";
export * from "./action-subjects.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { WorkflowContentStation } from "./workflow-content.js";
export * from "./workflow-content.js";
import type { SearchSourceDeclaration } from "./search-sources.js";
export * from "./search-sources.js";
import type { FragmentOfferChoice } from "./action-fragments.js";
export * from "./action-fragments.js";
import type { ActionAttach, ActionIntake } from "./item-intake.js";
export * from "./item-intake.js";
import type { FileSourceDeclaration } from "./file-sources.js";
export * from "./file-sources.js";
export * from "./artifact-pins.js";
export * from "./local-person.js";
export * from "./placement.js";
export * from "./work-executors.js";

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

/**
 * The host's number for one operation (a page request, an MCP tool call, an Assistant or Agent round, a command, a timer
 * firing); every call that operation causes carries it. It is a diagnostic handle that names no one and grants nothing:
 * only the host assigns it, a handler may log or return it, and may count what one operation used by it (project knowledge's
 * read budget per Agent round), but must never decide who may do what by it; it is never read from business input.
 */
export interface ActionCallOrigin {
  readonly call_id?: string;
}

/** A file the person gave the Host's entry, and the installation that entry served; see `ActionCallContext.original_file`. */
export interface HostOfferedOriginalFile {
  readonly path: string;
  readonly install_id: string;
}

/** The languages a page is shown in; the words a handler sends back follow the caller's. */
export type ActionLocale = "zh" | "en";

/**
 * Which protected entry a person's operation came through, and where to find it: audit locators that grant nothing on their own (PG-029).
 * Only the entry gives it (a page route: `web`; a management command: `management`). A call made inside a running handler carries the one
 * that handler was given, or none: the dispatcher refuses a nested call that brings its own. Never copied from tool or business input.
 */
export interface ActionUserAction {
  readonly source: string;
  readonly conversation_ref: string;
  readonly message_ref: string;
  /** Protected UI confirmation provenance; optional for operations without a whole-subject decision. */
  readonly whole_confirmation_prompted?: boolean;
  readonly prompted_subject_id?: string;
}

/** Supplied by the authenticated host, never taken from model/tool arguments. */
export interface ActionCallContext extends ActionCallOrigin {
  readonly actor_id: string;
  /** Host-authenticated delivery of a completed discussion run; never accepted from business input. */
  readonly assistant_reply?: import("../services/assistant.js").AssistantReplyDelivery;
  /** Optional page evidence supplied by a protected entry adapter, never business/model input. */
  readonly page_context?: { readonly url: string | null; readonly title: string | null; readonly provenance: "host_snapshot" | "client_reported" };
  /**
   * The language of the page the call came from, which the Host resolves from the request (the page's language cookie, else
   * Accept-Language). It only picks the words a handler sends back to be shown; it grants nothing and is never read from
   * business input. Absent when no page asked (a model's tool call, a timer): the handler uses its own default.
   */
  readonly locale?: ActionLocale;
  /** Optional historical author supplied by a trusted adapter; grants still belong to actor_id. Never business input. */
  readonly audit_actor_id?: string;
  /**
   * The plugin (its Manifest `plugin_id`) whose running action made this call through its action directory (`actions:delegate`), on its
   * original caller's behalf. Set only by the Host while it builds that nested caller; the call log keeps it beside the actor. It grants
   * nothing and narrows nothing. Never business input.
   */
  readonly delegated_by?: string;
  /** Stable session supplied by the authenticated Host; never a business input. */
  readonly runtime_session_id?: string;
  /**
   * Set by the trusted MCP adapter on an external Runtime client's call when the host gave it no stable Session.
   * Dispatch refuses an action that declares `authorship: "session"` on such a context, however deeply the call is
   * nested (a wrapper action, a workflow step). Never business input.
   */
  readonly runtime_session_missing?: true;
  /** Trusted audit classification; null when the trusted caller does not know it (not inferred). Never business input. */
  readonly actor_kind?: "user" | "runtime" | null;
  /** Authenticated user-operation provenance supplied only by a protected Host entry (PG-029); see `ActionUserAction`. */
  readonly user_action?: ActionUserAction;
  readonly project_id: string | null;
  readonly audience: ActionAudience;
  /** Host-bound installation identity for private Plugin SDK services. */
  readonly plugin_install_id?: string;
  /** Trusted typed-capability origin. Never accepted from business arguments or persisted. */
  readonly host_plugin?: import("./app-host.js").HostPluginCaller;
  /**
   * The one original file the person handed the Host in this request (an import through the Host's own entry), set only on the control
   * the Host made for that request and only for the installation whose route received it. It names a path and grants nothing: what a
   * plugin may do with it is the `materials:original` service's, which asks for the declaration and the grant. Never business input.
   */
  readonly original_file?: HostOfferedOriginalFile;
  /** Restrict this call and its descendants to registered query operations; never grants authority. */
  readonly query_only?: true;
  /** Read callbacks may inspect the original authorized directory, but execute only non-metered queries. */
  readonly read_only_effects?: true;
  readonly permissions: readonly string[];
  readonly allowed_capability_ids?: readonly string[];
  /** Exact grants; when present, ID-only restrictions cannot widen versions or providers. */
  readonly allowed_actions?: readonly ActionReference[];
  /** Trusted authority owner rechecks revocable access at dispatch, including after a Host queue. */
  readonly validate_authority?: (reference: ActionReference) => void | Promise<void>;
  /** Trusted synchronous check after the final await, never business input or persisted state.
   * Additional permissions come from the current consumer's declaration, not from action input.
   * Without a target, retain only the originating call's authority and lifetime (for disabling a binding). */
  readonly assert_authority_current?: (reference?: ActionReference, requiredPermissions?: readonly string[]) => void;
  /** Recheck permissions consumed directly by a scene, without pretending it invoked another action. */
  readonly validate_permissions?: (permissions: readonly string[]) => void | Promise<void>;
  readonly signal?: AbortSignal;
  /** Trusted entrypoint only: capture revocable authority independently of its completed transport.
   * The dispatcher wraps this with exact registration checks; business input never supplies it. */
  readonly retain_background_authority?: (references: readonly ActionReference[], additionalPermissions?: readonly string[]) => RetainedActionAuthority;
  /**
   * Trusted transport callback; never accepted as capability input or persisted as run state. `text_delta` is new text a
   * model wrote since the last event, a preview only: what the action returns, after its checks, is the result.
   */
  readonly on_progress?: (event: { readonly stage: string; readonly progress: number; readonly text_delta?: string }) => void;
  /** Set by scene execution; result history is committed by the consumer after stale-state checks. */
  readonly scene_binding?: { readonly scene_id: string; readonly binding_id: string };
}

/** Supplied only by the original dispatcher to an active handler, never by business input.
 * After asynchronous work, await this immediately before committing each effect. It rechecks
 * this exact registration, live authority/availability, scope, cancellation and call lifetime.
 * The provider still owns the following transaction and optimistic concurrency checks. */
export interface RetainedActionAuthority {
  (): Promise<void>;
  /** Recheck original authority and registrations after a downstream action's final await. No handler lifetime is retained. */
  readonly assertCurrent: () => void;
}

export interface ActionExecutionContext extends ActionCallContext {
  readonly beforeEffect: () => Promise<void>;
  /** The action this handler runs, with the provider the dispatcher resolved: a plugin finds "its own action" here rather than naming itself (PG-030). */
  readonly current_action?: ExactActionReference;
  /** Capture existing registrations while this handler is active. A background owner must recheck the returned guard before each new action; this grants no new permissions and does not extend beforeEffect.
   * `audience: "workflow"` admits each target as the workflow audience sees it instead of this caller's own audience, for the Host when it calls
   * the targets under that audience on this caller's behalf (the plugin action directory, S-43). Every other check is the same, and the guard still grants nothing. */
  readonly retainAuthority?: (references: readonly ActionReference[], options?: { readonly audience?: "workflow" }) => RetainedActionAuthority;
  /** Capture this command's registration and original authority while active, for explicitly accepted background work.
   * Additional permissions must already belong to this caller and remain revocable. Entry-owned transport may detach;
   * absent a separate authority, the original cancellation boundary remains. */
  readonly retainBackgroundAuthority?: (additionalPermissions?: readonly string[]) => RetainedActionAuthority;
}

export interface ActionMetadata {
  readonly title: string;
  readonly description: string;
  /** Stable name inside this provider. Consumers resolve it within one plugin, then invoke the exact public reference. */
  readonly local_id?: string;
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
  /** `session`: an external AI tool (a Runtime reached through MCP) may call it only from a stable Session, which becomes the author of what it records;
   * dispatch refuses a call whose context says the Session is missing (`runtime_session_missing`), nested or not. Only that entry is asked: for the
   * Assistant and the built-in Agents the Host records the author itself (`audit_actor_id`), and on a page the author is the person (decided 2026-10-10). */
  readonly authorship?: "session";
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
  /** Common owner protocol for reading a discussion and committing its fixed reply destination. */
  readonly thread_source?: { readonly role: "context" | "reply"; readonly subject_kind: string };
  /**
   * The Home may call this query in every open project and keep each project's answer apart (PG-043), as it gathers the background
   * work still running. It only reads: a query of project scope that calls no model and costs nothing, with the `output_type` the
   * Home asks for. Declaring it grants nothing: each call is made in its project with that project's grants, and where the plugin
   * is off or not granted it is not called.
   */
  readonly home_aggregate?: true;
  /** Optional rule choices owned by this subject-offer query; each target is declared in the same registration, in the same scope, and handles the option's subject kinds. */
  readonly subject_offer_choices?: readonly SubjectOfferChoice[];
  /** Finite choices of a fragment-offer query (specs/archive/contextual-interaction §5.1); each target is declared in the same registration and scope. */
  readonly fragment_offer_choices?: readonly FragmentOfferChoice[];
  /** This command creates an Item: the workbench derives a destination for what is in hand and a “✦ 一句话新建” from it (context-program §3.3). */
  readonly intake?: ActionIntake;
  /** This command puts material into an existing Item of the provider's own kind, at a position in it (context-program §3.4). */
  readonly attach?: ActionAttach;
  /** A trigger action needs an enabled compatible binding in this consumer scene. */
  readonly required_scene?: { readonly scene_id: string; readonly version: number };
  readonly result_scene?: ActionSceneReference;
  /** Mandatory nested calls use the same caller's authority; this never grants access. */
  readonly required_actions?: readonly ActionReference[];
  /**
   * Where a command's output names the object it created or changed: dot paths to its id and new revision, e.g.
   * `{ id: "document.id", revision: "document.version" }`. The object's kind is the action's single subject kind. Written, it is an object, and both paths must be
   * in this action's `output_schema` (checked at registration). Callers that keep relations to results (the Assistant's work) use it;
   * undeclared, `actionResultSubject` reads the result by the rule written in its comment.
   */
  readonly result_subject?: { readonly id: string; readonly revision?: string };
  /**
   * A command that starts background work (a research run, a generation job): how a caller follows it to its end.
   * `id` is the dot path to the job id in this command's output; the `status` query, declared in the same registration and scope,
   * takes it in its `input` field and reports the state at the dot path `state` (all three paths are checked against the schemas); `done` and `failed` list the final states.
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
   * How this change is taken back: another command declared in the same registration and scope, with its input read from this command's
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
  /** An action is a query or a command; following a live round is a query declared `scheduling: "concurrent"`. */
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
  /**
   * Set only by the Plugin Runtime's registration: the installation whose grants this provider's availability reads. A plugin
   * that ships with the Host registers under its `plugin_id` (its Host-assembled providers share that id), every other plugin
   * under its installation id, so `provider_id` alone does not say which installation a registration belongs to.
   */
  readonly plugin_install_id?: string;
}

export type ActionAvailability = { readonly available: true } | {
  readonly available: false;
  readonly code: string;
  readonly reason: string;
  /** The owner's classification of this refusal; the Kernel and SDK preserve it when raising the failure. */
  readonly kind?: ActionErrorKind;
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

/** Active scene callback control, issued by the Kernel; no action declaration or background authority is implied. */
export interface ActionSceneExecutionContext extends ActionCallContext {
  /** Recheck the original scene, judgment, permissions and caller after each wait and before committing an effect. */
  beforeEffect(): Promise<void>;
}

export interface ActionSceneHandlerBinding {
  readonly scene_id: string;
  readonly version: number;
  bindings(context: ActionCallContext): readonly ActionSceneBinding[] | Promise<readonly ActionSceneBinding[]>;
  targets?(context: ActionCallContext): readonly ActionSceneTargetDefinition[] | Promise<readonly ActionSceneTargetDefinition[]>;
  /** Must write through the authoritative owner; when options are supplied, atomically reject a stale expected_revision. */
  bind(context: ActionSceneExecutionContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void | Promise<void>;
  prepare?(context: ActionCallContext, event: unknown): { input: unknown; state?: unknown } | Promise<{ input: unknown; state?: unknown }>;
  consume(context: ActionSceneExecutionContext, input: unknown, result: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
  /** Optional explicit failure consumption, after the same stale-state and authority checks. */
  failed?(context: ActionSceneExecutionContext, input: unknown, error: unknown, execution: { binding: ActionSceneBinding; state?: unknown }): unknown | Promise<unknown>;
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

/** One progress event a running action reports; on a streamed route the Host writes it as a `progress` line. */
export type ActionProgressEvent = Parameters<NonNullable<ActionCallContext["on_progress"]>>[0];

/** Where a call's progress goes. It carries no identity or authority, so it never changes whose call this is. */
export interface ActionInvokeTransport { readonly on_progress?: (event: ActionProgressEvent) => void }

/** An entrypoint binds its authenticated context once; callers supply only business input. */
export interface BoundActionClient {
  discover(): Promise<readonly ActionView[]>;
  invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: Pick<ActionExecutionContext, "signal" | "beforeEffect" | "page_context" | "locale" | "assert_authority_current" | "retainBackgroundAuthority" | "query_only">, transport?: ActionInvokeTransport): Promise<Output>;
}

export function bindActionClient(client: ActionClient, context: () => ActionCallContext): BoundActionClient {
  return { discover: async () => client.discover(context()),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, control?: Pick<ActionExecutionContext, "signal" | "beforeEffect" | "page_context" | "locale" | "assert_authority_current" | "retainBackgroundAuthority" | "query_only">, transport?: ActionInvokeTransport) => {
      const bound = context(), caller = transport?.on_progress ? { ...bound, on_progress: transport.on_progress } : bound;
      return await client.invoke(control ? { ...caller, query_only: caller.query_only || control.query_only || undefined, signal: caller.signal && control.signal ? AbortSignal.any([caller.signal, control.signal]) : control.signal ?? caller.signal, page_context: control.page_context ?? caller.page_context, locale: control.locale ?? caller.locale,
        retain_background_authority: control.retainBackgroundAuthority ? (references, additionalPermissions) => boundBackgroundAuthority(caller, definition, references, control.retainBackgroundAuthority!(), additionalPermissions) : undefined,
        ...withControlChecks(caller, control) } : caller, definition, input) as Output;
    } };
}

/**
 * A caller's two authority checks with a control in front of each: the control's fence before the caller's own validation, and
 * the control's final check before the caller's, both synchronous at the dispatcher's last boundary. Every client that carries a
 * control into a call it makes (a bound client, the person's own client, a plugin's delegated call) joins it here, so a control
 * that says the call no longer counts stops it whoever forwards it.
 */
export function withControlChecks(caller: ActionCallContext, control: Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current">): Pick<ActionCallContext, "validate_authority" | "assert_authority_current"> {
  return {
    validate_authority: async reference => { await control.beforeEffect(); await caller.validate_authority?.(reference); },
    assert_authority_current: (reference, requiredPermissions) => {
      // The control belongs to its original caller; the bound caller owns the child's reference and permissions.
      requireSynchronous(control.assert_authority_current?.(), "最终授权检查必须同步完成");
      requireSynchronous(caller.assert_authority_current?.(reference, requiredPermissions), "最终授权检查必须同步完成");
    },
  };
}

/** Keep both identities when a bound client accepts work on behalf of a parent. */
function boundBackgroundAuthority(caller: ActionCallContext, definition: ActionDefinition, references: readonly ActionReference[], parent: RetainedActionAuthority, additionalPermissions: readonly string[] = []): RetainedActionAuthority {
  const required = [...new Set([...definition.action.permissions, ...additionalPermissions])];
  if (!required.every(permission => caller.permissions.includes(permission))) throw new ActionError("actions.forbidden", "不能保留调用者没有的权限");
  const own = caller.retain_background_authority?.(references, additionalPermissions);
  const check = () => {
    requireSynchronous(parent.assertCurrent());
    if (own) { requireSynchronous(own.assertCurrent()); return; }
    caller.signal?.throwIfAborted();
    for (const ref of references) requireSynchronous(caller.assert_authority_current?.(ref, required));
  };
  return Object.assign(async () => {
    check(); await parent();
    if (own) await own();
    else { for (const ref of references) await caller.validate_authority?.(ref); await caller.validate_permissions?.(required); }
    check();
  }, { assertCurrent: check });
}

/** Keep the originating operation's transport authority when it calls a nested action or scene.
 * This does not grant permissions; the dispatcher still checks each target's current registration and policy.
 * An origin without a provider is the running action itself: its provider is the one the dispatcher resolved (PG-030). */
export function retainActionAuthority<Context extends ActionCallContext>(context: Context, origin: ActionReference, beforeEffect?: () => Promise<void>): Context {
  const validate = context.validate_authority;
  const assertCurrent = context.assert_authority_current;
  const pinned = pinnedOrigin(context, origin);
  if (!validate && !beforeEffect && !assertCurrent) return context;
  return { ...context, validate_authority: async (reference: ActionReference) => {
    await validate?.(pinned);
    if (reference.capability_id !== pinned.capability_id || reference.version !== pinned.version || reference.provider_id !== pinned.provider_id) await validate?.(reference);
    await beforeEffect?.();
  }, assert_authority_current: (reference?: ActionReference, requiredPermissions?: readonly string[]) => {
    requireSynchronous(assertCurrent?.(), "最终授权检查必须同步完成");
    requireSynchronous(assertCurrent?.(pinned, requiredPermissions), "最终授权检查必须同步完成");
    if (reference && (reference.capability_id !== pinned.capability_id || reference.version !== pinned.version || reference.provider_id !== pinned.provider_id)) {
      requireSynchronous(assertCurrent?.(reference, requiredPermissions), "最终授权检查必须同步完成");
    }
  } };
}

function pinnedOrigin(context: ActionCallContext, origin: ActionReference): ExactActionReference {
  if (origin.provider_id) return { capability_id: origin.capability_id, version: origin.version, provider_id: origin.provider_id };
  const running = (context as Partial<ActionExecutionContext>).current_action;
  if (running?.capability_id !== origin.capability_id || running.version !== origin.version) {
    throw new ActionError("actions.reference_invalid", "只有正在执行的动作可以省略提供方");
  }
  return { capability_id: running.capability_id, version: running.version, provider_id: running.provider_id };
}

/** A Manifest declares every permission its actions use; these stay optional because the Host grants them per call. */
export function actionPermissionDeclarations(definitions: readonly ActionDefinition[], reason: string,
  declared: readonly { readonly permission: string }[] = []): { permission: string; required: boolean; reason: string }[] {
  const known = new Set(declared.map(item => item.permission));
  return [...new Set(definitions.flatMap(definition => definition.action.permissions))].filter(permission => !known.has(permission))
    .map(permission => ({ permission, required: false, reason }));
}

function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function id(v: unknown): v is string { return text(v) && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(v); }
/**
 * A provider id is only ever matched exactly against the directory, and the platform makes ids that follow no one alphabet: an external
 * MCP server's is `system.connectors#mcp:<connection>` or `<plugin_id>#mcp:<server>`, with the server's own id in it. What is refused is
 * what no provider can be named: a blank id, a control character, or one longer than any the platform makes.
 */
const PROVIDER_ID_LIMIT = 512;
function providerId(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0 && v.length <= PROVIDER_ID_LIMIT && !/\p{Cc}/u.test(v); }
function version(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }

/** Exact selections do not grant permission; the action service checks live authority, so a wider provider id reaches no new provider. */
export type ExactActionReference = ActionReference & { readonly provider_id: string };
export function parseExactActionReferences(value: unknown): ExactActionReference[] {
  if (!Array.isArray(value) || value.length > 100) throw new ActionError("actions.reference_invalid", "Invalid action selection or more than 100 actions");
  const refs = value.map(item => {
    if (!object(item) || !id(item.capability_id) || !version(item.version) || !providerId(item.provider_id)) {
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
