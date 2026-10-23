import assert from "node:assert/strict";
import { registerMemoryHost } from "../../apps/local-host/dist/memory/memory-host.js";
import type { AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, ASSISTANT_STORE_NAME, memoryRuntimePolicy, memorySources, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MemoryServicePorts } from "@molis-ai/molis-work-service-memory";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

/** These existing embedding cases represent a trusted send owner; ordinary DTO-only calls are covered separately. */
export function sendAsPerson(service: AssistantService, input: Parameters<AssistantService["send"]>[0], caller: Parameters<AssistantService["send"]>[1], ...rest: [Parameters<AssistantService["send"]>[2]?, Parameters<AssistantService["send"]>[3]?]) {
  return service.send(input, { ...caller, original_input: { input_id: input.request_id, text: input.text, written_by: "person", occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID } }, ...rest);
}

/** Direct semantic-tool cases prepare a new round through the same Host recipe seam before assembling tools. */
export async function preparedMemoryTools(service: AssistantService, work: Parameters<AssistantService["memoryTools"]>[0]) {
  await service.memoryForRound(work, "核对记忆");
  const tools = service.memoryTools(work);
  assert.ok(tools, "a prepared session round offers memory tools");
  return tools;
}

export function platformMemory(host: AgentHost, home: string, t: { after(fn: () => void): void }) {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  const store = new AssistantStore(db);
  const localHost = new MolisWorkLocalHost({ completeText: null });
  const registered = registerMemoryHost({ localHost, homeDirectory: home, agentHost: host, ready: async () => {}, executes: () => true,
    projectExists: async projectId => projectId === "project-a" || projectId === "project-b",
    projectTitle: async id => id === "project-a" ? "项目甲" : "项目乙" });
  t.after(async () => { registered.close(); db.close(); await localHost.close(); });
  const memory = registered.service, policy = registered.policy;
  const memoryPolicy = { ...memoryRuntimePolicy(() => policy), sources: memorySources(home, () => ({
    adapter: host.adapter("prologue"), policy, sourceAllowed: (actor, scope, owner, refs) => memory.sourceAllowed(actor, scope, owner, refs),
    sessionAllowed: async owner => owner.actor_id === LOCAL_PERSON_ACTOR_ID
      && ["project-a", "project-b", ASSISTANT_PERSONAL_OWNER].includes(owner.project_id)
      && owner.plugin_id === ASSISTANT_PLUGIN_ID && owner.install_id === ASSISTANT_INSTALL_ID,
  })), promotion: memory.promotion };
  const memoryForCall = (...execution: [] | [AgentMemoryExecutionControl, NonNullable<MemoryServicePorts["bindChangeTarget"]>]) => execution.length ? registered.withExecution(...execution) : memory;
  return { memory, memoryPolicy, store, memoryForCall };
}

export async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
