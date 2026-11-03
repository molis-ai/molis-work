import type { AttentionInboxDeclarations, AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, type PluginRuntimeDatabase, type PluginRuntimeReleaseArtifactDatabase } from "@molis-ai/molis-work-plugin-runtime";

/**
 * What the person's Inbox shows besides the unassigned entries (PG-094 S12): of each running installation in this project, the kinds its
 * trusted Manifest lists in `attention.inbox`, keyed by the installation's plugin id. The Manifest is the build's row in the release
 * archive (a start writes the build it runs there before installing it), so a plugin that is stopped, uninstalled, not archived or
 * declares nothing adds nothing; the Inbox names no plugin of its own.
 */
export function inboxDeclarationsOf(db: PluginRuntimeDatabase & PluginRuntimeReleaseArtifactDatabase): AttentionInboxDeclarations {
  const archive = new SqlitePluginRuntimeReleaseArtifactRepository(db), declared = new Map<string, Set<AttentionSubjectType>>();
  for (const record of new SqlitePluginRuntimeRepository(db).list()) {
    if (record.state !== "running") continue;
    const kinds = archive.declaredAttention(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest)?.inbox;
    if (!kinds?.length) continue;
    const own = declared.get(record.plugin_id) ?? new Set<AttentionSubjectType>();
    for (const kind of kinds) own.add(kind);
    declared.set(record.plugin_id, own);
  }
  return declared;
}
