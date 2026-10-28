import type { ContextEdgePurgeIdentity } from "../modules/context-ledger.js";
import type { AgentSessionOwner, AgentSessionRef } from "./agent-host.js";

/** Only Works whose own canonical Session is the selected Session; executor references grant no deletion authority. */
export interface AssistantSessionPurgeSelection {
  readonly session: AgentSessionRef;
  readonly owner: AgentSessionOwner;
  readonly works: readonly {
    readonly work_id: string;
    readonly actor_id: string;
    readonly project_id: string | null;
    readonly revision: number;
    readonly created_at: string;
    readonly relations: readonly ContextEdgePurgeIdentity[];
  }[];
}
