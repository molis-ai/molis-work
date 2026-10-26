import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createFeedContentLedger, type FeedEvidenceCollector } from "./content-ledger.js";
import { createFeedContentLedgerHandlers } from "./content-ledger-actions.js";

/**
 * Feed's Home half: the plugin that keeps the Home's reference ledger for evidence bodies (specs/repository-anti-corruption/slices/
 * feed-inbox-home-reference-ledger.md). It is the same plugin as each project's Feed and shares its Manifest; it runs once for the Home and
 * answers two actions, which only the project instances call. `evidence` is the platform's way to delete a body nothing refers to.
 */
export function createFeedHomePlugin(options: { manifest: PluginManifest; evidence(context: PluginStartContext): FeedEvidenceCollector }): PluginDefinition {
  return { manifest: options.manifest, async start(context) {
    for (const permission of options.manifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, installations = context.services?.installations;
    if (!database || !installations) throw new ActionError("actions.unredeemed", "Feed 的 Home 一半需要 Home 库与安装目录服务");
    const ledger = createFeedContentLedger({ read: database, write: (beforeEffect, body) => database.transaction(beforeEffect, body) }, options.evidence(context));
    // A Home that has no installation of Feed anywhere has no body to miss: its ledger is complete from the start. Any other waits for the
    // maintenance that reads each project once, and until then releases nothing; "the ledger is empty" is not "nobody holds it".
    if (!ledger.isComplete()) {
      const where = installations.projects();
      if (where.complete && where.project_ids.length === 0) await ledger.markComplete(async () => {}, new Date().toISOString());
    }
    return { kind: "app", actions: createFeedContentLedgerHandlers(ledger) };
  } };
}
