import type { PluginArtifactClient, PluginArtifactWriter, PluginInstanceRecord, PluginProjectDatabase, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { gateFor } from "./plugin-attention-service.js";
import { joinPluginTransaction } from "./plugin-transaction.js";

const ARTIFACT_WRITE = "artifact:write";

/**
 * `services.artifacts.join` (RAC-510): a plugin pins a 成果 version inside its own project transaction, as `services.attention.join` writes an
 * Inbox entry. The 成果库 is on the connection the plugin's write transaction runs on, so the version is a savepoint of that transaction:
 * committed with the plugin's rows or rolled back with them, and announced only once the transaction ends. Every call asks the gate the
 * other platform services ask (S-68): the installation still runs and holds `artifact:write`, the original caller is current, and the
 * action is a concurrent one that declares `artifact:write` (or a kept job, or a scene that declares it). The version is written by that
 * caller, its recorded author first, as attention's rows are (S-63). Without a project database there is no transaction to join, and the
 * plugin gets no `join`.
 */
export function withArtifactJoin(client: PluginArtifactClient, writer: (permit: () => void, author: () => string) => PluginArtifactWriter, database: PluginProjectDatabase | undefined,
  context: PluginStartContext, projectId: string, assertActive: () => void, record: () => PluginInstanceRecord | null): PluginArtifactClient {
  if (!database) return client;
  const gate = gateFor(context, projectId, assertActive, record);
  return Object.freeze<PluginArtifactClient>({ ...client,
    join: (transaction, write) => joinPluginTransaction(database, transaction, (_afterCommit, live) => {
      let actor = "";
      const permit = () => { live(); const { caller } = gate.write(ARTIFACT_WRITE); actor = caller.audit_actor_id ?? caller.actor_id; };
      permit();
      return write(writer(permit, () => actor));
    }),
  });
}
