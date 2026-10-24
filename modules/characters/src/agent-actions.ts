import type { ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";
import { resolveProjectRuntime, type AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";

/** What Characters asks the built-in Agent about: which engines exist and which actions an engine may call, as the platform answers it. */
export interface CharactersAgentCatalog {
  listRuntimes(): Promise<readonly AgentRuntimeDescriptor[]>;
  /** The Runtime the person picked in the project's settings, or null for the Home default. */
  pickedRuntime(): Promise<string | null> | string | null;
  listActions(runtimeId: string): Promise<readonly ActionView[]>;
}

/** The actions the built-in Agent may be given: those of the project's engine (its pick, else the Home default); empty when it does not take action tools or none can host a session, and when the pick is gone: no other engine's actions stand in for it. */
export async function agentActionCatalog(agent: CharactersAgentCatalog | undefined): Promise<readonly ActionView[]> {
  if (!agent) throw new Error("内置 Agent 能力目录尚未接通");
  const { runtime } = resolveProjectRuntime(await agent.listRuntimes(), await agent.pickedRuntime());
  if (!runtime?.supports_action_tools) return [];
  return agent.listActions(runtime.runtime_id);
}

/** A draft's chosen actions must still be in the built-in Agent's catalog, offered to the Agent and available now. */
export async function validateDraftActions(agent: CharactersAgentCatalog | undefined, refs?: ExactActionReference[] | null): Promise<void> {
  if (!refs?.length) return;
  const catalog = await agentActionCatalog(agent);
  for (const ref of refs) {
    const view = catalog.find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    if (!view || !view.action.audiences.includes("agent")) throw characterErrors.invalid(`原能力 ${ref.capability_id} · v${ref.version} 不可用或尚未授权给内置 Agent；草稿引用已保留`);
    if (!view.availability.available) throw characterErrors.invalid(view.availability.reason);
  }
}
