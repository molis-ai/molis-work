import type { IncomingMessage } from "node:http";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding,
  type ActionProviderRegistration, type ActionSchema, type ActionUserAction, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { entryUserAction, webEntryMessage } from "./entry-user-action.js";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { pageLocale } from "./web-locale.js";
import { issueWebEntryAction, revokeWebEntryAction } from "./plugin-consent-settings-entry.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * A page's own door into its actions (B9, `specs/visual-ui-experience/work-items/batch27-http-write-actions`). The writes behind it were
 * HTTP-only so that no Agent, MCP client, workflow or plugin could reach them; as actions they keep that: each request the page's route
 * makes issues one frozen `user_action`, and a handler serves only a call that carries one this door issued, for the person, with the
 * project the route named. What the route knows about the request (its owner's ports, the page's fence) rides with that credential,
 * never in the action's input.
 */
export interface WebEntryDoor<Entry> {
  /** One action of this door: the handler first checks the call came through it, then gets this request's entry. */
  define<const S extends ActionSchema, Output>(spec: WebEntryActionSpec<S>, handle: (entry: Entry, input: InferActionInput<S>, caller: ActionExecutionContext) => Output | Promise<Output>):
    { readonly definition: ActionDefinition<InferActionInput<S>, Output>; readonly handler: ActionHandlerBinding };
  /** Calls one of this door's actions as the person, for the request being answered. */
  invoke<Input, Output>(call: WebEntryCall<Entry>, definition: ActionDefinition<Input, Output>, input: Input): Promise<Output>;
}

export interface WebEntryActionSpec<S extends ActionSchema> {
  readonly capability_id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly scope: "home" | "project";
  readonly input_schema: S;
  readonly effect?: "read" | "write" | "irreversible";
  /** Waits for a model or another service (the Host bills it as metered). */
  readonly metered?: boolean;
}

export interface WebEntryCall<Entry> {
  readonly host: Pick<MolisWorkLocalHost, "actionClient" | "homeActionClient">;
  /** Only its headers are read: the one-time key names the act in the audit locator. */
  readonly request: Pick<IncomingMessage, "headers">;
  readonly reference?: LocalHostProjectReference;
  readonly entry: Entry;
  readonly original_file?: ActionCallContext["original_file"];
  readonly signal?: AbortSignal;
}

/** `scope` names the door in the call's audit locator (`web:<scope>`); it grants nothing. */
export function webEntryDoor<Entry>(scope: string, refusal: () => string): WebEntryDoor<Entry> {
  const issued = new WeakMap<ActionUserAction, { readonly entry: Entry; readonly project_id: string | null }>();
  const entryOf = (caller: ActionCallContext): Entry => {
    const held = caller.user_action ? issued.get(caller.user_action) : undefined;
    if (!held || caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.host_plugin || caller.delegated_by
      || caller.project_id !== held.project_id) throw new ActionError("actions.forbidden", refusal());
    return held.entry;
  };
  function define<const S extends ActionSchema, Output>(spec: WebEntryActionSpec<S>,
    handle: (entry: Entry, input: InferActionInput<S>, caller: ActionExecutionContext) => Output | Promise<Output>) {
    const definition: ActionDefinition<InferActionInput<S>, Output> = { capability_id: spec.capability_id, version: spec.version, operation: "command",
      action: { title: spec.title, description: spec.description, kind: "operation", scope: spec.scope, effect: spec.effect ?? "write", scheduling: "concurrent",
        audiences: ["user"], permissions: [], subject_kinds: [], input_schema: spec.input_schema, output_schema: { type: "object" },
        execution: { cost: spec.metered ? "metered" : "none" } } };
    return defineAction<InferActionInput<S>, Output>(definition, (caller, input) => handle(entryOf(caller), input, caller));
  }
  return {
    define,
    invoke: async (call, definition, input) => {
      const user_action: ActionUserAction = Object.freeze(entryUserAction("web", scope, webEntryMessage(call.request)));
      issued.set(user_action, { entry: call.entry, project_id: call.reference?.project_id ?? null });
      issueWebEntryAction(user_action);
      // The door's actions are the Host's own, need no permission and are called by exact identity: the person's call reaches that one
      // action and nothing else, without working out the person's whole directory per request (`invokeLocalWebCatalogAction` likewise).
      const sessionCurrent = captureWebSessionAuthority(), locale = pageLocale();
      const assertAuthority = (target?: ActionReference) => {
        sessionCurrent();
        call.signal?.throwIfAborted();
        if (target && (target.capability_id !== definition.capability_id || target.version !== definition.version)) throw new ActionError("actions.forbidden", refusal());
      };
      assertAuthority();
      const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: call.reference?.project_id ?? null, audience: "user",
        permissions: [], user_action, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version }],
        ...(locale ? { locale } : {}), ...(call.signal ? { signal: call.signal } : {}), ...(call.original_file ? { original_file: call.original_file } : {}),
        validate_authority: async target => { assertAuthority(target); }, assert_authority_current: target => { assertAuthority(target); } };
      try {
        return await bindActionClient(call.reference ? call.host.actionClient(call.reference) : call.host.homeActionClient(), () => caller).invoke(definition, input);
      } finally {
        revokeWebEntryAction(user_action);
        issued.delete(user_action);
      }
    },
  };
}

/** One `system` provider for a door's actions, registered with the Host's platform providers (`project-host.ts`). */
export function webEntryProvider(provider_id: string, title: string, actions: readonly { readonly definition: ActionDefinition; readonly handler: ActionHandlerBinding }[]): ActionProviderRegistration {
  return { provider: { provider_id, title, kind: "system" }, definitions: actions.map(action => action.definition), handlers: actions.map(action => action.handler) };
}
