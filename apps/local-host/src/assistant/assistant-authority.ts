import { actionCancelledBeforeDispatch, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionOffer, AgentDelegation, AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { requireSynchronous, type ActionCallContext, type ActionReference, type ActionView, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { readProjectGuidance, type ProjectGuidanceFacts } from "../goal-callers.js";
import { assertActionCommandInput, currentCallId, newCallId } from "@molis-ai/molis-work-kernel";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import type { StoredWork } from "./assistant-store.js";
import { hostLog } from "../host-log.js";
import type { WebLocale } from "../web-locale.js";
import { assistantErrors } from "./assistant-errors.js";
import { assistantActionDelegation } from "./assistant-action-delegation.js";

/** The Assistant acts for the local person; its calls are audited as the Assistant's, and its grants are its own. */
const ASSISTANT_ACTOR = LOCAL_PERSON_ACTOR_ID;

function publishResult(publish: () => void, assertCurrent: () => void, capabilityId: string): void {
  try { assertCurrent(); } catch { return; }
  // A projection failure must not turn a committed operation into a retry.
  try { publish(); } catch (error) { hostLog.warn("assistant", "relation_unrecorded", error, { step: "command", capability_id: capabilityId }); }
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

/**
 * What the Assistant may call for a work: every action this Home offers to agents in the work's own scope (its
 * project's and the person's own), less the ones the person switched off for the Assistant. The person decided this
 * default on 2026-09-28; each write still stops at a review of its exact parameters, and the grants are the Assistant's
 * own — separate from Coding's and external agents'.
 */
export function assistantAuthority(localHost: Pick<MolisWorkLocalHost, "inspectActions" | "inspectActionMetadata" | "actionClient" | "homeActionClient" | "prepareActionReview">
  & Partial<Pick<MolisWorkLocalHost, "projectActionInstallations" | "homePlugins" | "connectorMcp">>, work: StoredWork, disabled: () => ReadonlySet<string>,
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
  roundSkills: readonly SkillRef[] = [], holdActionPolicy?: (key: string, automatic?: boolean) => () => void): AgentStartAuthority {
  const reference = work.project_ref;
  // This round's number: the request that sent the message when there is one, else a new one. The tools run later, in the Runtime's loop,
  // outside any scope, so the number goes into every call's context.
  const callId = currentCallId() ?? newCallId();
  const base = (signal?: AbortSignal): ActionCallContext => ({ ...assistantActionContext(work, { call_id: callId, locale, signal }), page_context: pageContext?.(),
    // This round's Skill reads are the Assistant's (`skill_round`, specs/capability-pack/contract-design.md §2.3): the catalog lets
    // through the Skills `applies_to: assistant` and those the person named, and refuses the rest. Host-written, never from input.
    skill_round: { consumer: "assistant", named: roundSkills } });
  const accepted = <View extends Omit<ActionView, "availability">>(catalog: readonly View[], caller: ActionCallContext) => assistantActionRows(catalog, caller, disabled());
  let offered: readonly ActionView[] = [];
  const context = async (validate?: () => void | Promise<void>, signal?: AbortSignal): Promise<ActionCallContext> => {
    const caller = base(signal);
    const allowed = accepted(await localHost.inspectActions(caller, reference), caller);
    offered = allowed;
    return { ...assistantActionScope(caller, allowed),
      // Re-read at dispatch: an action switched off, removed or no longer offered to agents after the round began is refused.
      validate_authority: async action => {
        await validate?.();
        const now = accepted(await localHost.inspectActions(caller, reference), caller);
        if (!now.some(view => view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === action.provider_id)) {
          throw assistantErrors.action_revoked("这项能力已对助理关闭或不再可用，未执行");
        }
        await validate?.();
      } };
  };
  const service = () => reference ? localHost.actionClient(reference) : localHost.homeActionClient();
  // What this round was last shown, with availability: a change runs directly only if its undo is available now.
  let discovered: readonly ActionView[] = [];
  const discover = async (validate?: () => void | Promise<void>) => { discovered = await service().discover(await context(validate)); return discovered; };
  return {
    call_id: callId,
    manifest: ASSISTANT_AGENT,
    prompts: ASSISTANT_PROMPTS,
    authorizedDirectories: [],
    actions: async (_runtimeId, validate) => ({
      discover: () => discover(validate),
      prepareReview: async (view, input, automaticPolicy) => {
        await validate?.();
        const caller = base(), action = actionReference(view);
        const undo = automaticPolicy && view.action.undo;
        const related = undo && discovered.find(row => row.capability_id === undo.capability_id && row.version === undo.version && row.provider.provider_id === action.provider_id);
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
          : installations ? { resolveDelegation: () => assistantActionDelegation({ projectActionInstallations: installations, homePlugins: localHost.homePlugins },
            work, view, input, originalCatalog, confirmationRequired,
            (reader, kind, id) => localHost.prepareActionReview({ ...caller, permissions: reader.action.permissions }, reader,
              { subjects: [{ kind, id }], fields: [] }, reference).assertCurrent) } : {}),
        };
      },
      ...(offer ? { offer: async (proposal: AgentActionOffer) => offer(proposal, await service().discover(await context(validate))) } : {}),
      ...(delegation ? { delegate: delegation } : {}),
      ...(memory ? { memory } : {}),
      // A delegated work reports to the work that handed it over, which reads it with the identifiers it needs.
      ...(work.delegated_by ? { reader: "work" as const } : {}),
      // A change that can be undone runs without a confirmation unless the person asked to confirm it each time.
      direct: view => directEligible(view, discovered, confirmAlways?.() ?? new Set()),
      // Exactly the validation dispatch performs, so a bad input is refused before the person is asked.
      check: async (action, input) => {
        const view = (await service().discover(await context(validate))).find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
        if (!view) throw assistantErrors.action_revoked("这项能力已对助理关闭或不再可用");
        assertActionCommandInput(view, base(), input);
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
        try { caller = await context(validate, signal); }
        catch (error) {
          if (!signal?.aborted) throw error;
          const cached = offered.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
          if (cached?.operation === "command") return await stoppedBeforeDispatch(cached);
          // Naming a cancelled operation needs only registered metadata; it must not start a plugin or Runtime.
          const metadataCaller = base();
          let rows: readonly Omit<ActionView, "availability">[];
          try { rows = accepted(localHost.inspectActionMetadata(metadataCaller, reference), metadataCaller); }
          catch { throw error; /* An unavailable diagnostic name does not replace the original cancellation. */ }
          const view = rows.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
          if (view?.operation === "command") return await stoppedBeforeDispatch(view);
          throw error;
        }
        const view = offered.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
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
        const call = service().invoke({ ...caller, ...(memorySelection ? { memory_context_selection: memorySelection } : {}), assert_authority_current: assertCurrent }, action, input);
        // The round may stop while the owner is still changing things: the call goes on, and how it ends is kept for the work.
        if (view && view.operation === "command" && unsettled && signal && !signal.aborted) {
          const left = () => unsettled(view, call);
          signal.addEventListener("abort", left, { once: true });
          call.then(() => signal.removeEventListener("abort", left), () => signal.removeEventListener("abort", left));
        }
        const output = await call;
        if (view?.operation === "command" && changed && !signal?.aborted) publishResult(() => changed(view, input, output),
          () => requireSynchronous(assertCurrent(action, view.action.permissions)), view.capability_id);
        return output;
      },
    }),
  };
}

/** The project's confirmed guidance as the project layer; personal work and unreadable guidance contribute nothing. */
export async function assistantProjectPrompts(localHost: Pick<MolisWorkLocalHost, "actionClient">, work: StoredWork): Promise<AgentPromptText[]> {
  const reference = work.project_ref;
  if (!reference) return [];
  let view: ProjectGuidanceFacts;
  try { view = await readProjectGuidance(localHost.actionClient(reference), reference); }
  catch { return []; }
  if (view.entries.length === 0) return [];
  return [{ prompt_id: "project-guidance", version: view.revisions.length, layer: "project", body: view.runtime_prompt_prefix }];
}
