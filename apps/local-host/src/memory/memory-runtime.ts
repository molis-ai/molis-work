import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, memoryErrors } from "@molis-ai/molis-work-service-memory";
import type { AgentRuntimeAdapter, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MolisWorkLocalHost } from "../project-host.js";
import { pluginInstallRecords } from "../plugin-install-records.js";
import { memoryHostFor } from "./memory-host.js";
import { memoryRuntimePolicy } from "./memory-runtime-policy.js";
import { memorySources } from "./memory-sources.js";
import { memoryExtractor } from "./memory-extractor.js";

type Options = NonNullable<PrologueNodeAdapterOptions["memory"]>;

/** Reads the installation owner without starting a stopped plugin or creating/upgrading a project database. */
async function sourceSessionAllowed(owner: AgentSessionView["owner"], projectPath: (projectId: string) => Promise<string | undefined>): Promise<boolean> {
  if (owner.actor_id !== LOCAL_PERSON_ACTOR_ID) return false;
  if (owner.plugin_id === ASSISTANT_PLUGIN_ID) return owner.install_id === ASSISTANT_INSTALL_ID;
  if (owner.plugin_id !== "io.molis.work.coding") return false;
  const path = await projectPath(owner.project_id);
  if (!path) return false;
  const storage = new LocalSqliteStorage(path, { readonly: true });
  try {
    const record = pluginInstallRecords(storage.db).get(owner.install_id);
    return !!record && record.plugin_id === owner.plugin_id && record.install_id === owner.install_id && record.state === "running";
  } finally { storage.close(); }
}

/** One assembly of live permission, canonical sources and the existing Memory ledger's promotion/undo owner. */
export function memoryRuntime(localHost: MolisWorkLocalHost, home: string, adapter: () => AgentRuntimeAdapter,
  projectPath: (projectId: string) => Promise<string | undefined>): Options {
  const current = () => {
    const memory = memoryHostFor(localHost);
    if (!memory?.policy.alive()) throw memoryErrors.unavailable("记忆服务尚未就绪或已经关闭");
    return memory;
  };
  return {
    ...memoryRuntimePolicy(() => memoryHostFor(localHost)?.policy, memoryExtractor(home)),
    sources: memorySources(home, () => {
      const memory = memoryHostFor(localHost);
      if (!memory?.policy.alive()) return undefined;
      return { adapter: adapter(), policy: memory.policy,
        sourceAllowed: (actor, scope, owner, refs) => memory.service.sourceAllowed(actor, scope, owner, refs),
        sessionAllowed: owner => sourceSessionAllowed(owner, projectPath) };
    }),
    promotion: {
      policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
      decide: (caller, request) => current().service.promotion.decide(caller, request),
      undo: {
        prepare: (caller, request) => current().service.promotion.undo.prepare(caller, request),
        record: (caller, request) => current().service.promotion.undo.record(caller, request),
      },
    },
  };
}
