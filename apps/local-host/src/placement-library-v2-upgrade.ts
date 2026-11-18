import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SqliteBaselineDatabase, SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { rewriteStoredContextEdges } from "@molis-ai/molis-work-module-context-ledger";
import { builtinPluginByProjectKey } from "./plugin-registry.js";

/*
 * The placement library's 1→2 step (batch 44, `docs/system/CONTRACT-CHANGES.md` 「第 44 批存量搬迁」 D2; user 2026-11-17): placement's
 * record that it bound an object to a Goal in a project (`placement.goal_in`, key `["goal_in", kind, id, project]`) becomes its record
 * that it attached the object there onto one plugin's kind (`placement.attached_in`, key `["attached_in", plugin, kind, object kind,
 * object id, project]`): every version-1 binding was Goals', of kind `goal`. Every revision of an edge is rewritten alike, in place (the
 * table's key refuses a rewritten key that would meet another edge's); nothing else in the library changes. Delete with the placement library's version-1 golden support.
 */

const refusal = () => new ActionError("actions.input_invalid", "放置库与第 1 版的登记不符，放置库已保留");
const PLACEMENT_SCOPE = { kind: "personal", id: "placement" } as const;

function upgrade(db: SqliteBaselineDatabase): void {
  const goals = builtinPluginByProjectKey("goals")!.manifest.plugin_id;
  rewriteStoredContextEdges(db, edge => {
    let parts: unknown;
    try { parts = JSON.parse(edge.edge_key); } catch { throw refusal(); }
    if (edge.scope_kind !== PLACEMENT_SCOPE.kind || edge.scope_id !== PLACEMENT_SCOPE.id || !Array.isArray(parts) || parts.length !== 4 || parts[0] !== "goal_in"
      || !parts.every(part => typeof part === "string" && part.length > 0)) throw refusal();
    const [, kind, id, projectId] = parts as string[];
    return { edge_key: JSON.stringify(["attached_in", goals, "goal", kind, id, projectId]), relation_type: "placement.attached_in" };
  }, "placement.goal_in");
}

/** The 1→2 step's run, in one transaction with the library's version mark. */
export const placementLibraryV2Upgrade: Pick<SqliteUpgradeStep, "run"> = { run: upgrade };
