import { actionCancelledBeforeDispatch, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionOffer, AgentDelegation, AgentDelivery, AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { requireSynchronous, type ActionCallContext, type ActionReference, type ActionView, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { readProjectGuidance } from "../project-guidance-actions.js";
import { assertActionCommandInput, currentCallId, newCallId } from "@molis-ai/molis-work-kernel";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import type { StoredWork } from "./assistant-store.js";
import { hostLog } from "../host-log.js";
import type { WebLocale } from "../web-locale.js";
import { assistantErrors } from "./assistant-errors.js";
import { assistantActionDelegation } from "./assistant-action-delegation.js";
import { acceptanceSubjectOf } from "./assistant-line-actions.js";
import type { assistantWorkConnections } from "./assistant-work-connections.js";

/** The Assistant acts for the local person; its calls are audited as the Assistant's, and its grants are its own. */
const ASSISTANT_ACTOR = LOCAL_PERSON_ACTOR_ID;

function publishResult(publish: () => void, assertCurrent: () => void, capabilityId: string): void {
  try { assertCurrent(); } catch { return; }
  // A projection failure must not turn a committed operation into a retry.
  try { publish(); } catch (error) { hostLog.warn("assistant", "relation_unrecorded", error, { step: "command", capability_id: capabilityId }); }
}

function observeUnsettledCommand(view: ActionView | undefined, call: Promise<unknown>, signal: AbortSignal | undefined,
  unsettled: ((view: Omit<ActionView, "availability">, call: Promise<unknown>) => void) | undefined): void {
  if (!view || view.operation !== "command" || !unsettled || !signal || signal.aborted) return;
  const left = () => unsettled(view, call);
  signal.addEventListener("abort", left, { once: true });
  call.then(() => signal.removeEventListener("abort", left), () => signal.removeEventListener("abort", left));
}

export const actionKey = (ref: Pick<ActionReference, "capability_id" | "version" | "provider_id">) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id ?? ""]);

export const actionReference = (view: Pick<ActionView, "capability_id" | "version" | "provider">) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

export function assistantActionRows<View extends Omit<ActionView, "availability">>(catalog: readonly View[], caller: ActionCallContext, disabled: ReadonlySet<string>): View[] {
  return catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)
    // Memory reaches the Assistant through its own tools and owner checks.
    && view.provider.provider_id !== MEMORY_PROVIDER_ID
    && !disabled.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })));
}

export const assistantActionContext = (work: StoredWork, options: { call_id?: string; locale?: WebLocale; signal?: AbortSignal } = {}): ActionCallContext => ({
  actor_id: ASSISTANT_ACTOR, actor_kind: "runtime", audit_actor_id: "assistant:" + work.work_id, call_id: options.call_id ?? newCallId(),
  ...(work.session_id ? { runtime_session_id: work.session_id } : {}), project_id: work.project_ref?.project_id ?? null,
  audience: "agent", permissions: [], locale: options.locale, signal: options.signal,
  // The work speaks for itself in the platform's requirements and acceptance (S-acceptance-subject-owner, S-assistant-delivery-own-object).
  acting_for: (({ provider_id, subject }) => ({ provider_id, kind: subject.kind, id: subject.id }))(acceptanceSubjectOf(work)),
});

/** The assistant's granted directory uses installed action metadata as its initial scope. Dispatch rechecks availability. */
export function assistantActionScope(caller: ActionCallContext, rows: readonly Omit<ActionView, "availability">[]): ActionCallContext {
  return { ...caller, permissions: [...new Set(rows.flatMap(view => view.action.permissions))], allowed_actions: rows.map(row => ({
    capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id,
  })) };
}

/**
 * Whether a change may run without the person's confirmation: it declares how it is undone, that undo is offered here
 * now, and the person has not asked to confirm it each time. Irreversible changes never do.
 */
export function directEligible(view: ActionView, offered: readonly ActionView[], confirmAlways: ReadonlySet<string>): boolean {
  const undo = view.action.undo;
  if (!undo || view.operation !== "command" || view.action.effect === "irreversible") return false;
  if (confirmAlways.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }))) return false;
  return offered.some(row => row.capability_id === undo.capability_id && row.version === undo.version && row.provider.provider_id === view.provider.provider_id && row.availability.available);
}

const invokeDirectly: ReturnType<typeof assistantWorkConnections> = (_action, _input, invoke) => invoke();

/**
 * What the Assistant may call for a work: every action this Home offers to agents in the work's own scope (its
 * project's and the person's own), less the ones the person switched off for the Assistant. The person decided this
 * default on 2026-09-28; each write still stops at a review of its exact parameters, and the grants are the Assistant's
 * own — separate from Coding's and external agents'.
 */
export function assistantAuthority(localHost: Pick<MolisWorkLocalHost, "inspectActions" | "inspectActionMetadata" | "actionClient" | "homeActionClient" | "prepareActionReview">
  & Partial<Pick<MolisWorkLocalHost, "inspectOneActionMetadata" | "inspectPreparedActionMetadata" | "inspectPreparedOneActionMetadata" | "projectActionInstallations" | "homePlugins" | "connectorMcp">>, work: StoredWork, disabled: () => ReadonlySet<string>,
  /** Records a suggestion for the person, checked against the capabilities offered now. */
  offer?: (offer: AgentActionOffer, views: readonly ActionView[]) => Promise<{ offer_id: string }>,
  /** Told after a command succeeded, with the action as offered, so the work can keep a relation to what it changed. */
  changed?: (view: ActionView, input: unknown, output: unknown) => void,
  /** Hands independent sub-tasks to separate works (absent for a delegated work: one level deep). */
  delegation?: AgentDelegation,
  /** Told of a change its owner was still running when the round stopped or ran out of time, to learn how it ended. */
  unsettled?: (view: Omit<ActionView, "availability">, call: Promise<unknown>) => void,
  /** Remember, list and forget for the person (absent when forming memories is switched off). */
  memory?: AgentMemoryTools,
  /** Changes the person wants confirmed each time even though they could be undone (action keys). */
  confirmAlways?: () => ReadonlySet<string>,
  /** Told the moment a change is really handed to its owner (a stopped round's step that never was reads as not run). */
  dispatched?: (view: ActionView) => void,
  pageContext?: () => ActionCallContext["page_context"], locale?: WebLocale,
  /** The Skills the person named for this round (its materials): the round's frozen list, so a `manual` one can be read. */
  roundSkills: readonly SkillRef[] = [],
  /** A delegated work's report of what it delivers against the requirements it was handed (absent when it was handed none). */
  delivery?: AgentDelivery,
  /** False when the person asked for this round without automatic Skills (「这次不用技能」): only the named ones can be read. */
  autoSkills = true, holdActionPolicy?: (key: string, automatic?: boolean) => () => void, accountChoice = invokeDirectly): AgentStartAuthority {
  const reference = work.project_ref;
  // This round's number: the request that sent the message when there is one, else a new one. The tools run later, in the Runtime's loop,
  // outside any scope, so the number goes into every call's context.
  const callId = currentCallId() ?? newCallId();
  const base = (sessionId = work.session_id ?? undefined, signal?: AbortSignal): ActionCallContext => ({ ...assistantActionContext(work, { call_id: callId, locale, signal }), runtime_session_id: sessionId, page_context: pageContext?.(),
    // This round's Skill reads are the Assistant's (`skill_round`, specs/capability-pack/contract-design.md §2.3): the catalog lets
    // through the Skills `applies_to: assistant` and those the person named, and refuses the rest. Host-written, never from input.
    // The round's number lets the catalog count Skills the round reads of its own choice (SKL-02).
    skill_round: { consumer: "assistant", named: roundSkills, round: callId, ...(autoSkills ? {} : { auto: false as const }) } });
  const accepted = <View extends Omit<ActionView, "availability">>(catalog: readonly View[], caller: ActionCallContext) => assistantActionRows(catalog, caller, disabled());
  const inspectCatalog = (caller: ActionCallContext): Promise<readonly Omit<ActionView, "availability">[]> =>
    localHost.inspectPreparedActionMetadata ? localHost.inspectPreparedActionMetadata(caller, reference) : localHost.inspectActions(caller, reference);
  const inspectOneMetadata = async (caller: ActionCallContext, action: ActionReference): Promise<Omit<ActionView, "availability"> | undefined> => {
    if (localHost.inspectPreparedOneActionMetadata) return localHost.inspectPreparedOneActionMetadata(caller, action, reference);
    if (localHost.inspectOneActionMetadata) return localHost.inspectOneActionMetadata(caller, action, reference);
    return (await inspectCatalog(caller)).find(view => view.capability_id === action.capability_id && view.version === action.version
      && (!action.provider_id || view.provider.provider_id === action.provider_id));
  };
  const validateAuthority = (caller: ActionCallContext, validate?: () => void | Promise<void>) => async (action: ActionReference) => {
    await validate?.();
    const found = await inspectOneMetadata(caller, action);
    if (!found || (action.provider_id && found.provider.provider_id !== action.provider_id) || accepted([found], caller).length !== 1) {
      throw assistantErrors.action_revoked("这项能力已对助理关闭或不再可用，未执行");
    }
    await validate?.();
  };
  let offered: readonly Omit<ActionView, "availability">[] = [];
  const context = async (validate?: () => void | Promise<void>, signal?: AbortSignal, sessionId = work.session_id ?? undefined): Promise<ActionCallContext> => {
    const caller = base(sessionId, signal);
    const allowed = accepted(await inspectCatalog(caller), caller);
    offered = allowed;
    return { ...assistantActionScope(caller, allowed),
      // Re-read at dispatch: an action switched off, removed or no longer offered to agents after the round began is refused.
      validate_authority: validateAuthority(caller, validate) };
  };
  const contextForOne = async (action: ActionReference, validate?: () => void | Promise<void>, signal?: AbortSignal, sessionId = work.session_id ?? undefined)
    : Promise<{ caller: ActionCallContext; metadata: Omit<ActionView, "availability"> | undefined }> => {
    const caller = base(sessionId, signal);
    const found = await inspectOneMetadata(caller, action);
    if (!found || (action.provider_id && found.provider.provider_id !== action.provider_id)) {
      return { caller: { ...caller, validate_authority: validateAuthority(caller, validate) }, metadata: undefined };
    }
    const allowed = accepted([found], caller);
    if (allowed.length !== 1) {
      return { caller: { ...caller, validate_authority: validateAuthority(caller, validate) }, metadata: undefined };
    }
    if (found.action.required_actions?.length || found.action.required_roles?.length || found.action.required_scene) {
      return { caller: await context(validate, signal, sessionId), metadata: found };
    }
    return { caller: { ...assistantActionScope(caller, allowed), validate_authority: validateAuthority(caller, validate) }, metadata: found };
  };
  const service = () => reference ? localHost.actionClient(reference) : localHost.homeActionClient();
  // What this round was last shown, with availability: a change runs directly only if its undo is available now.
  let discovered: readonly ActionView[] = [];
  const knownViews = new Map<string, ActionView>();
  const remember = (view: ActionView) => { knownViews.set(actionKey(actionReference(view)), view); };
  const discover = async (validate?: () => void | Promise<void>, sessionId?: string) => {
    discovered = await service().discover(await context(validate, undefined, sessionId));
    knownViews.clear();
    for (const view of discovered) remember(view);
    return discovered;
  };
  const lookupOne = async (action: ActionReference, validate?: () => void | Promise<void>, sessionId?: string): Promise<ActionView | undefined> => {
    const { caller, metadata } = await contextForOne(action, validate, undefined, sessionId);
    if (!metadata) {
      if (action.provider_id) knownViews.delete(actionKey(action));
      return undefined;
    }
    const view = await service().discoverOne(caller, action);
    if (!view || (action.provider_id && view.provider.provider_id !== action.provider_id) || accepted([view], caller).length !== 1) {
      if (action.provider_id) knownViews.delete(actionKey(action));
      return undefined;
    }
    remember(view);
    return view;
  };
  const discoverOne = async (action: ActionReference, validate?: () => void | Promise<void>, sessionId?: string): Promise<ActionView | undefined> => {
    await validate?.();
    const view = await lookupOne(action, validate, sessionId);
    if (view?.action.undo && view.operation === "command" && view.action.effect !== "irreversible") {
      await lookupOne({ capability_id: view.action.undo.capability_id, version: view.action.undo.version, provider_id: view.provider.provider_id }, validate, sessionId);
    }
    return view;
  };
  return {
    call_id: callId,
    manifest: ASSISTANT_AGENT,
    prompts: ASSISTANT_PROMPTS,
    authorizedDirectories: [],
    actions: async (_runtimeId, validate, session) => {
      const sessionId = session?.session_id ?? work.session_id ?? undefined;
      const currentContext = (signal?: AbortSignal) => context(validate, signal, sessionId);
      return {
      discover: () => discover(validate, sessionId),
      discoverOne: action => discoverOne(action, validate, sessionId),
      prepareReview: async (view, input, automaticPolicy) => {
        await validate?.();
        const caller = base(sessionId), action = actionReference(view);
        const undo = automaticPolicy && view.action.undo;
        const undoRef = undo ? { capability_id: undo.capability_id, version: undo.version, provider_id: action.provider_id } : undefined;
        const related = undoRef ? (knownViews.get(actionKey(undoRef)) ?? await lookupOne(undoRef, validate, sessionId)) : undefined;
        const policy = holdActionPolicy?.(actionKey(action), automaticPolicy === "reversible");
        const confirmation = holdActionPolicy?.(actionKey(action), true);
        const undoPolicy = related && holdActionPolicy?.(actionKey(actionReference(related)));
        const assertEnabled = () => {
          policy?.(); undoPolicy?.();
          if (accepted([view], caller).length !== 1 || related && accepted([related], caller).length !== 1)
            throw assistantErrors.action_revoked("原操作或它的撤销能力已对助理关闭，未执行");
          if (automaticPolicy && (!related || !directEligible(view, [related], confirmAlways?.() ?? new Set()))) throw assistantErrors.action_revoked("原操作现在需要本人确认");
        };
        assertEnabled();
        const held = localHost.prepareActionReview({ ...caller, permissions: [...view.action.permissions, ...related?.action.permissions ?? []],
          allowed_actions: related ? [action, actionReference(related)] : [action], assert_authority_current: assertEnabled }, view, input, reference, related && actionReference(related));
        const mcp = await localHost.connectorMcp?.holdTool(view);
        const assertCurrent = () => { held.assertCurrent(); mcp?.assertCurrent(); };
        const confirmationRequired = () => { confirmation?.(); return confirmAlways?.().has(actionKey(action)) === true; };
        assertCurrent();
        const originalCatalog = discovered;
        const installations = localHost.projectActionInstallations?.bind(localHost);
        return { assertCurrent, beforeEffect: async () => { await validate?.(); await held.beforeEffect(); mcp?.assertCurrent(); },
          ...(mcp ? { resolveDelegation: async () => ({ provider_installation_generation: null, mcp_scope: mcp.scope, confirmationRequired,
            assertProviderCurrent: mcp.assertCurrent, target_owners: {} }) }
          : installations ? { resolveDelegation: async () => {
            const catalog = originalCatalog.length ? originalCatalog
              : view.action.delegation && view.action.delegation !== "confirmation-only" && view.action.delegation.targets.length
                ? await discover(validate, sessionId) : [];
            return assistantActionDelegation({ projectActionInstallations: installations, homePlugins: localHost.homePlugins },
              work, view, input, catalog, confirmationRequired,
              (reader, kind, id) => localHost.prepareActionReview({ ...caller, permissions: reader.action.permissions }, reader,
                { subjects: [{ kind, id }], fields: [] }, reference).assertCurrent);
          } } : {}),
        };
      },
      ...(offer ? { offer: async (proposal: AgentActionOffer) => {
        const view = await discoverOne(proposal.reference, validate, sessionId);
        return offer(proposal, view ? [view] : []);
      } } : {}),
      ...(delegation ? { delegate: delegation } : {}),
      ...(delivery ? { deliver: delivery } : {}),
      ...(memory ? { memory } : {}),
      // A delegated work reports to the work that handed it over, which reads it with the identifiers it needs.
      ...(work.delegated_by ? { reader: "work" as const } : {}),
      // A change that can be undone runs without a confirmation unless the person asked to confirm it each time.
      direct: view => directEligible(view, [...knownViews.values()], confirmAlways?.() ?? new Set()),
      // Exactly the validation dispatch performs, so a bad input is refused before the person is asked.
      check: async (action, input) => {
        const view = await discoverOne(action, validate, sessionId);
        if (!view) throw assistantErrors.action_revoked("这项能力已对助理关闭或不再可用");
        assertActionCommandInput(view, base(sessionId), input);
      },
      invoke: async (action, input, signal, memorySelection, review) => {
        memorySelection?.assert_current();
        const stoppedBeforeDispatch = (view: Omit<ActionView, "availability">) => {
          const refused = Promise.reject(actionCancelledBeforeDispatch("这一轮停止时它还没有发出，没有执行", review));
          refused.catch(() => undefined);
          unsettled?.(view, refused);
          return refused;
        };
        let caller: ActionCallContext;
        try { caller = await currentContext(signal); }
        catch (error) {
          if (!signal?.aborted) throw error;
          const cached = offered.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
          if (cached?.operation === "command") return await stoppedBeforeDispatch(cached);
          // Naming a cancelled operation needs only registered metadata; it must not start a plugin or Runtime.
          const metadataCaller = base(sessionId);
          let view: Omit<ActionView, "availability"> | undefined;
          try {
            const raw = localHost.inspectOneActionMetadata
              ? localHost.inspectOneActionMetadata(metadataCaller, action, reference)
              : localHost.inspectActionMetadata(metadataCaller, reference).find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
            view = raw && accepted([raw], metadataCaller)[0];
          } catch { throw error; /* An unavailable diagnostic name does not replace the original cancellation. */ }
          if (view?.operation === "command") return await stoppedBeforeDispatch(view);
          throw error;
        }
        const meta = offered.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
        const view = knownViews.get(actionKey(action)) ?? (meta ? { ...meta, availability: { available: true as const } } : undefined);
        // Stopped before it was sent (working out the person's grants takes a moment): it never reaches its owner, and
        // the work says it did not run rather than leaving it “not known” (seen live on a reversible Todo change).
        if (signal?.aborted && view && view.operation === "command") {
          return await stoppedBeforeDispatch(view);
        }
        review?.assertCurrent();
        if (view && view.operation === "command") dispatched?.(view);
        const assertCurrent: NonNullable<ActionCallContext["assert_authority_current"]> = (ref, required) => {
          memorySelection?.assert_current(); review?.assertCurrent(); caller.assert_authority_current?.(ref, required);
        };
        const call = accountChoice(action, input, () => service().invoke({ ...caller, ...(memorySelection ? { memory_context_selection: memorySelection } : {}), assert_authority_current: assertCurrent }, action, input));
        // The round may stop while the owner is still changing things: the call goes on, and how it ends is kept for the work.
        observeUnsettledCommand(view, call, signal, unsettled);
        const output = await call;
        if (view?.operation === "command" && changed && !signal?.aborted) publishResult(() => changed(view, input, output),
          () => requireSynchronous(assertCurrent(action, view.action.permissions)), view.capability_id);
        return output;
      },
      };
    },
  };
}

/** The project's confirmed guidance as the project layer; personal work and unreadable guidance contribute nothing. */
export async function assistantProjectPrompts(localHost: Pick<MolisWorkLocalHost, "actionClient">, work: StoredWork): Promise<AgentPromptText[]> {
  const reference = work.project_ref;
  if (!reference) return [];
  let view: ProjectGuidanceView;
  try { view = await readProjectGuidance(localHost.actionClient(reference), reference); }
  catch { return []; }
  if (view.entries.length === 0) return [];
  return [{ prompt_id: "project-guidance", version: view.revisions.length, layer: "project", body: view.runtime_prompt_prefix }];
}
