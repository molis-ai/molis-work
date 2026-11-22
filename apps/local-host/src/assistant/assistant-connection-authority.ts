import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { MolisWorkLocalHost } from "../project-host.js";
import { connectorSetupChecker, type ConnectorSetupCheckScope } from "../connector-setup-checker.js";
import { connectorManagementActions, type ManagedConnectorView } from "../connector-management-actions.js";
import { assistantAuthority } from "./assistant-authority.js";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { connectorReadyChecker } from "../connector-ready-checker.js";
import { ASSISTANT_STORE_NAME, AssistantStore, type StoredWork } from "./assistant-store.js";
import { exactBoundActionView } from "../exact-action-view.js";

/** Restores only permission to read this session's own setup state, never an old round's general action grant. */
async function withConnectionActions<T>(home: string, localHost: MolisWorkLocalHost, scope: ConnectorSetupCheckScope, required: typeof connectorManagementActions.authorization, read: (actions: AgentActionClient, work: StoredWork) => Promise<T>): Promise<T> {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  try {
    const store = new AssistantStore(db);
    const work = store.list(scope.actor_id, { limit: Number.MAX_SAFE_INTEGER }).find(row => row.session_id === scope.session_id);
    if (scope.plugin_id !== ASSISTANT_PLUGIN_ID || !work || work.archived || work.continuation_hold === "stopped" || work.executor.kind !== "assistant" || work.reply_target
      || (work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER) !== scope.project_id) throw new ActionError("actions.forbidden", "原助理工作已不可用");
    const grants = () => JSON.stringify([...store.disabledActions(scope.actor_id)].sort()), expectedGrants = grants();
    const current = () => {
      if (store.get(scope.actor_id, work.work_id).revision !== work.revision || grants() !== expectedGrants) throw new ActionError("actions.forbidden", "等待期间工作或权限已变化，请按最新要求重新核对");
    };
    // The role this work carries is the round's own: its pinned version is checked by the round's guards, not again here.
    const authority = assistantAuthority(localHost, work, () => store.disabledActions(scope.actor_id));
    const actions = await authority.actions!("prologue", current);
    const expected = required;
    const available = !!(await exactBoundActionView(actions, { ...expected, provider_id: "system.connectors" }))?.availability.available;
    if (!available) throw new ActionError("actions.forbidden", "当前助理没有读取接入状态的权限");
    current(); const result = await read(actions, work); current(); return result;
  } finally { db.close(); }
}

/** The factory is shared by the composition root and isolated integration verification. */
export function assistantConnectionCheckers(home: string, localHost: MolisWorkLocalHost): NonNullable<NonNullable<PrologueNodeAdapterOptions["checks"]>["owned"]> {
  return [connectorSetupChecker(home, scope => withConnectionActions(home, localHost, scope, connectorManagementActions.authorization, async () => undefined)),
    connectorReadyChecker((scope, signal) => withConnectionActions(home, localHost, scope, connectorManagementActions.list, async (actions, work) => {
      const result = await actions.invoke({ capability_id: connectorManagementActions.list.capability_id, version: connectorManagementActions.list.version, provider_id: "system.connectors" }, {}, signal) as { connections: ManagedConnectorView[] };
      return { connections: result.connections, paused: work.continuation_hold === "paused" || work.continuation_hold === "input" };
    }))];
}
