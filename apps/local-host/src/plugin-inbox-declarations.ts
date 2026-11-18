import type { AttentionInboxDeclarations, AttentionSubjectDeclarations, AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { PluginAttentionSubjectDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-attention";
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

/**
 * How the waiting list reads each owner's entries (batch 44, C8): of each running installation in this project, the subject types its
 * trusted Manifest declares in `attention.subjects`, with the object kind each refers to and what each reason asks of the person. Read
 * from the same archived build as the Inbox's kinds; an owner that is not running, or a type it does not declare, is not composed.
 */
export function attentionDeclarationsOf(db: PluginRuntimeDatabase & PluginRuntimeReleaseArtifactDatabase): AttentionSubjectDeclarations {
  const archive = new SqlitePluginRuntimeReleaseArtifactRepository(db), owners = new Map<string, readonly PluginAttentionSubjectDeclaration[]>();
  for (const record of new SqlitePluginRuntimeRepository(db).list()) {
    if (record.state !== "running") continue;
    const subjects = archive.declaredAttention(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest)?.subjects;
    if (subjects?.length) owners.set(record.plugin_id, subjects);
  }
  const of = (owner: string) => owners.get(owner) ?? [];
  return {
    objectKind: (owner, type) => of(owner).find(subject => subject.type === type)?.object_kind,
    subjectType: (owner, kind) => of(owner).find(subject => subject.object_kind === kind)?.type,
    category: (owner, type, reason) => of(owner).find(subject => subject.type === type)?.reasons.find(item => item.id === reason)?.attention,
  };
}
