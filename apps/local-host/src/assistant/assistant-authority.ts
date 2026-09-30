import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionOffer, AgentDelegation, AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import { ActionError, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { readProjectGuidanceCapability } from "@molis-ai/molis-work-plugin-goals";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import type { StoredWork } from "./assistant-store.js";

/** The Assistant acts for the local person; its calls are audited as the Assistant's, and its grants are its own. */
export const ASSISTANT_ACTOR = "web-user";

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
export function assistantAuthority(localHost: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, work: StoredWork, disabled: () => ReadonlySet<string>,
  /** Records a suggestion for the person, checked against the capabilities offered now. */
  offer?: (offer: AgentActionOffer, views: readonly ActionView[]) => Promise<{ offer_id: string }>,
  /** Told after a command succeeded, with the action as offered, so the work can keep a relation to what it changed. */
  changed?: (view: ActionView, input: unknown, output: unknown) => void,
  /** Hands independent sub-tasks to separate works (absent for a delegated work: one level deep). */
  delegation?: AgentDelegation,
  /** Told of a change its owner was still running when the round stopped or ran out of time, to learn how it ended. */
  unsettled?: (view: ActionView, call: Promise<unknown>) => void,
  /** Remember, list and forget for the person (absent when forming memories is switched off). */
  memory?: AgentMemoryTools,
  /** Changes the person wants confirmed each time even though they could be undone (action keys). */
  confirmAlways?: () => ReadonlySet<string>): AgentStartAuthority {
  const reference = work.project_ref;
  const base = (session?: string, signal?: AbortSignal): ActionCallContext => ({ actor_id: ASSISTANT_ACTOR, actor_kind: "runtime", audit_actor_id: `assistant:${work.work_id}`,
    ...(session ? { runtime_session_id: session } : {}), project_id: reference?.project_id ?? null, audience: "agent", permissions: [], ...(signal ? { signal } : {}) });
  const accepted = (catalog: readonly ActionView[], caller: ActionCallContext) => {
    const off = disabled();
    return catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)
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
    manifest: ASSISTANT_AGENT,
    prompts: ASSISTANT_PROMPTS,
    authorizedDirectories: [],
    actions: async (_runtimeId, validate) => ({
      discover: () => discover(validate),
      ...(offer ? { offer: async (proposal: AgentActionOffer) => offer(proposal, await service().discover(await context(validate))) } : {}),
      ...(delegation ? { delegate: delegation } : {}),
      ...(memory ? { memory } : {}),
      // A change that can be undone runs without a confirmation unless the person asked to confirm it each time.
      direct: view => directEligible(view, discovered, confirmAlways?.() ?? new Set()),
      // Exactly the validation dispatch performs, so a bad input is refused before the person is asked.
      check: async (action, input) => {
        const view = (await service().discover(await context(validate))).find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
        if (!view) throw new ActionError("assistant.action_revoked", "这项能力已对助理关闭或不再可用");
        assertActionInput(view.action.input_schema, input);
        requireVersionPrecondition(view, input);
      },
      invoke: async (action, input, signal) => {
        const caller = await context(validate, signal);
        const view = offered.find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
        // Stopped before it was sent (working out the person's grants takes a moment): it never reaches its owner, and
        // the work says it did not run rather than leaving it “not known” (seen live on a reversible Todo change).
        if (signal?.aborted && view && view.operation === "command") {
          const refused = Promise.reject(new ActionError("actions.cancelled", "这一轮停止时它还没有发出，没有执行"));
          refused.catch(() => undefined);
          unsettled?.(view, refused);
          return await refused;
        }
        const call = service().invoke(caller, action, input);
        // The round may stop while the owner is still changing things: the call goes on, and how it ends is kept for the work.
        if (view && view.operation === "command" && unsettled && signal && !signal.aborted) {
          const left = () => unsettled(view, call);
          signal.addEventListener("abort", left, { once: true });
          call.then(() => signal.removeEventListener("abort", left), () => signal.removeEventListener("abort", left));
        }
        const output = await call;
        if (view && view.operation === "command") {
          try { changed?.(view, input, output); } catch { /* The change happened; a relation that failed to record is not a failed change. */ }
        }
        return output;
      },
    }),
  };
}

/**
 * A change to an existing object that could carry the revision it was read at must carry it: otherwise it may
 * overwrite what the person (or anything else) changed since. Checked before the person is asked to approve.
 */
export function requireVersionPrecondition(view: Pick<ActionView, "operation" | "action">, input: unknown): void {
  if (view.operation !== "command") return;
  const declared = (view.action.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
  const field = ["expected_version", "expected_revision"].find(name => name in declared);
  if (!field || !input || typeof input !== "object") return;
  const value = (input as Record<string, unknown>)[field];
  if (value === undefined || value === null || value === "") {
    throw new ActionError("assistant.version_required", `修改已有对象时要带上读取时的版本（${field}）：先读取它的当前版本再提交，避免覆盖别人在此之后的修改。`);
  }
}

/** The project's confirmed guidance as the project layer; personal work and unreadable guidance contribute nothing. */
export async function assistantProjectPrompts(localHost: Pick<MolisWorkLocalHost, "client">, work: StoredWork): Promise<AgentPromptText[]> {
  const reference = work.project_ref;
  if (!reference) return [];
  let view: ProjectGuidanceView;
  try { view = await localHost.client(reference).invoke(readProjectGuidanceCapability, { board_id: reference.board_id }); }
  catch { return []; }
  if (view.entries.length === 0) return [];
  return [{ prompt_id: "project-guidance", version: view.revisions.length, layer: "project", body: view.runtime_prompt_prefix }];
}
