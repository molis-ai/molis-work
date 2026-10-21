import type { ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

/** What Characters asks the built-in Agent about: which engines exist and which actions each may call, as the platform answers it. */
export interface CharactersAgentCatalog {
  listRuntimes(): Promise<ReadonlyArray<{ readonly runtime_id: string; readonly supports_action_tools?: boolean }>>;
  listActions(): Promise<readonly ActionView[]>;
}

/** The actions the built-in Agent may be given; empty when its engine does not take action tools. */
export async function agentActionCatalog(agent: CharactersAgentCatalog | undefined): Promise<readonly ActionView[]> {
  if (!agent) throw new Error("内置 Agent 能力目录尚未接通");
  const runtimes = await agent.listRuntimes();
  if (!runtimes.some(runtime => runtime.runtime_id === "prologue" && runtime.supports_action_tools)) return [];
  return agent.listActions();
}

/** A draft's chosen actions must still be in the built-in Agent's catalog, offered to the Agent and available now. */
export async function validateDraftActions(agent: CharactersAgentCatalog | undefined, refs?: ExactActionReference[] | null): Promise<void> {
  if (!refs?.length) return;
  const catalog = await agentActionCatalog(agent);
  for (const ref of refs) {
    const view = catalog.find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    if (!view || !view.action.audiences.includes("agent")) throw new Error(`原能力 ${ref.capability_id} · v${ref.version} 不可用或尚未授权给内置 Agent；草稿引用已保留`);
    if (!view.availability.available) throw new Error(view.availability.reason);
  }
}
