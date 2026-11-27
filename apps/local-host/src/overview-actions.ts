import { ActionError, bindActionHandler, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_KINDS, OVERVIEW_PROVIDER_ID, OVERVIEW_READ_LIMIT, overviewReadAction, type OverviewKind, type OverviewReadResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { overviewReaderKind, type OverviewGrant } from "@molis-ai/molis-work-service-search";
import { overviewRowsFor, type HomeOverviewPartition, type HomeOverviewSource } from "./home-overview.js";

/** Where the overview read looks: the Home and its partitions now, and the person's grants to the assistant, read again on every call. */
export interface OverviewReadPorts {
  delivered?(caller: ActionCallContext, rows: OverviewReadResult["rows"]): void;
  source(): HomeOverviewSource | undefined;
  partitions(): Promise<readonly HomeOverviewPartition[]>;
  /** The person's grants to the assistant (`assistant.overview_grants`), as saved now; none when the assistant's store is not there. */
  grants(): readonly OverviewGrant[];
}

const refusal = () => new ActionError("actions.forbidden", "只有本人和本人授权的个人助理能读跨项目总览");

/** Who may read: the person, or the assistant acting for them; a project Agent, MCP client, workflow, plugin or delegated call may not. */
function availability(caller: ActionCallContext) {
  if (overviewReaderKind(caller) !== null) return { available: true } as const;
  const refused = refusal();
  return { available: false, code: refused.code, kind: refused.kind, reason: refused.message } as const;
}

/**
 * `overview.read@1` (specs/unified-partition-plugins §6.1, `overview-readers`, batch 108): the person reads every partition's overview; the
 * assistant only what the person granted it, intersected with the partitions there are now. The grants are read again before the rows are
 * handed over (`OverviewService.read`), so a project or field withdrawn while the read ran is not delivered. Dormant partitions stay closed:
 * only libraries marked dirty are read again, on a read-only connection, and no plugin runs.
 */
export function overviewReadProvider(ports: OverviewReadPorts): ActionProviderRegistration {
  return {
    provider: { provider_id: OVERVIEW_PROVIDER_ID, kind: "system", title: "跨项目总览" },
    definitions: [overviewReadAction],
    handlers: [{ ...bindActionHandler(overviewReadAction, async (input, caller): Promise<OverviewReadResult> => {
      const reader = overviewReaderKind(caller);
      if (reader === null) throw refusal();
      const source = ports.source();
      if (!source) return { rows: [] };
      const kinds = (input.kinds?.length ? input.kinds : [...OVERVIEW_KINDS]).filter((kind): kind is OverviewKind => (OVERVIEW_KINDS as readonly string[]).includes(kind));
      const limit = Math.max(1, Math.min(input.limit ?? 200, OVERVIEW_READ_LIMIT));
      caller.signal?.throwIfAborted();
      const read = await overviewRowsFor(source, caller, await ports.partitions(), () => reader === "assistant" ? ports.grants() : [], { kinds, limit });
      caller.signal?.throwIfAborted();
      const rows = read?.rows ?? [];
      if (reader === "assistant") ports.delivered?.(caller, rows);
      return { rows };
    }), availability }],
  };
}
