import type { AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
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
 * What the Assistant may call for a work: every action this Home offers to agents in the work's own scope (its
 * project's and the person's own), less the ones the person switched off for the Assistant. The person decided this
 * default on 2026-09-28; each write still stops at a review of its exact parameters, and the grants are the Assistant's
 * own — separate from Coding's and external agents'.
 */
export function assistantAuthority(localHost: Pick<MolisWorkLocalHost, "inspectActions" | "actionClient" | "homeActionClient">, work: StoredWork, disabled: () => ReadonlySet<string>): AgentStartAuthority {
  const reference = work.project_ref;
  const base = (session?: string, signal?: AbortSignal): ActionCallContext => ({ actor_id: ASSISTANT_ACTOR, actor_kind: "runtime", audit_actor_id: `assistant:${work.work_id}`,
    ...(session ? { runtime_session_id: session } : {}), project_id: reference?.project_id ?? null, audience: "agent", permissions: [], ...(signal ? { signal } : {}) });
  const accepted = (catalog: readonly ActionView[], caller: ActionCallContext) => {
    const off = disabled();
    return catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)
      && !off.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })));
  };
  const context = async (validate?: () => void | Promise<void>, signal?: AbortSignal): Promise<ActionCallContext> => {
    const caller = base(work.session_id ?? undefined, signal);
    const allowed = accepted(await localHost.inspectActions(caller, reference), caller);
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
  return {
    manifest: ASSISTANT_AGENT,
    prompts: ASSISTANT_PROMPTS,
    authorizedDirectories: [],
    actions: async (_runtimeId, validate) => ({
      discover: async () => service().discover(await context(validate)),
      // Exactly the validation dispatch performs, so a bad input is refused before the person is asked.
      check: async (action, input) => {
        const view = (await service().discover(await context(validate))).find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider.provider_id === action.provider_id);
        if (!view) throw new ActionError("assistant.action_revoked", "这项能力已对助理关闭或不再可用");
        assertActionInput(view.action.input_schema, input);
      },
      invoke: async (action, input, signal) => service().invoke(await context(validate, signal), action, input),
    }),
  };
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
