import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionOffer, AgentDelegation, AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import { MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { ActionError, type ActionCallContext, type ActionReference, type ActionView, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { readProjectGuidance } from "../goal-callers.js";
import { assertActionCommandInput, currentCallId, newCallId } from "@molis-ai/molis-work-kernel";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import type { StoredWork } from "./assistant-store.js";
import { hostLog } from "../host-log.js";

/** The Assistant acts for the local person; its calls are audited as the Assistant's, and its grants are its own. */
const ASSISTANT_ACTOR = LOCAL_PERSON_ACTOR_ID;

export const actionKey = (ref: Pick<ActionReference, "capability_id" | "version" | "provider_id">) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id ?? ""]);

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
export function assistantAuthority(localHost: Pick<MolisWorkLocalHost, "inspectActions" | "inspectActionMetadata" | "actionClient" | "homeActionClient">, work: StoredWork, disabled: () => ReadonlySet<string>,
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
  pageContext?: () => ActionCallContext["page_context"]): AgentStartAuthority {
  const reference = work.project_ref;
  // This round's number: the request that sent the message when there is one, else a new one. The tools run later, in the Runtime's loop,
  // outside any scope, so the number goes into every call's context.
  const callId = currentCallId() ?? newCallId();
  const base = (session?: string, signal?: AbortSignal): ActionCallContext => ({ actor_id: ASSISTANT_ACTOR, actor_kind: "runtime", audit_actor_id: `assistant:${work.work_id}`, call_id: callId,
    ...(session ? { runtime_session_id: session } : {}), project_id: reference?.project_id ?? null, audience: "agent", permissions: [],
    page_context: pageContext?.(), ...(signal ? { signal } : {}) });
  const accepted = <View extends Omit<ActionView, "availability">>(catalog: readonly View[], caller: ActionCallContext) => {
    const off = disabled();
    // Memory reaches the Assistant through its own remember / list / forget tools (under its switches, no extra
    // confirmation); the directory's memory actions are for other Agents, so they are not offered here as well.
    return catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)
      && view.provider.provider_id !== MEMORY_PROVIDER_ID
      && !off.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })));
  };
  let offered: readonly ActionView[] = [];
  const context = async (validate?: () => void | Promise<void>, signal?: AbortSignal): Promise<ActionCallContext> => {
    const caller = base(work.session_id ?? undefined, signal);
    const allowed = accepted(await localHost.inspectActions(caller, reference), caller);
    offered = allowed;
    return { ...caller, permissions: [...new Set(allowed.flatMap(view => view.action.permissions))],
      allowed_actions: allowed.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
      // Re-read at dispatch: an action switched off, removed or no longer offered to agents after the round began is refused.
      validate_authority: async action => {
        await validate?.();
        const now = accepted(await localHost.inspectActions(caller, reference), caller);
        if (!now.some(view => view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === action.provider_id)) {
          throw new ActionError("assistant.action_revoked", "这项能力已对助理关闭或不再可用，未执行");
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
        if (!view) throw new ActionError("assistant.action_revoked", "这项能力已对助理关闭或不再可用");
        assertActionCommandInput(view, base(), input);
      },
      invoke: async (action, input, signal) => {
        const stoppedBeforeDispatch = (view: Omit<ActionView, "availability">) => {
          const refused = Promise.reject(new ActionError("actions.cancelled", "这一轮停止时它还没有发出，没有执行"));
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
          const metadataCaller = base(work.session_id ?? undefined);
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
        if (view && view.operation === "command") dispatched?.(view);
        const call = service().invoke(caller, action, input);
        // The round may stop while the owner is still changing things: the call goes on, and how it ends is kept for the work.
        if (view && view.operation === "command" && unsettled && signal && !signal.aborted) {
          const left = () => unsettled(view, call);
          signal.addEventListener("abort", left, { once: true });
          call.then(() => signal.removeEventListener("abort", left), () => signal.removeEventListener("abort", left));
        }
        const output = await call;
        if (view && view.operation === "command") {
          // The change happened; a relation that failed to record is not a failed change.
          try { changed?.(view, input, output); } catch (error) { hostLog.warn("assistant", "relation_unrecorded", error, { step: "command", capability_id: view.capability_id }); }
        }
        return output;
      },
    }),
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
