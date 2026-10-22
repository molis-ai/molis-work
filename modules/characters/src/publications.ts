import type { ArtifactReference, ArtifactVersionRecord, ArtifactVersionResult } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent, type CharacterContent, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";

/** Where a person's Characters are published in one project: their own lines of 成果 and the draft each was made from. */
export interface CharacterPublicationScope {
  readonly actorId: string;
  readonly projectId: string;
  /** Includes every publication version in the current project, including archived versions. */
  references(): ArtifactReference[];
  read: PluginArtifactClient["read"];
  readonly drafts: CharactersQuery;
}

/** The Artifact line a Character's publications share. */
const characterArtifactId = (projectId: string, characterId: string): string => `character:${projectId}:${characterId}`;

/**
 * This person's publications of Characters in this project: a record of another project, owner, producer, type or schema is not
 * listed. An invalid owned publication is an error, not permission to overwrite its identity/version.
 */
export function ownedPublications(scope: CharacterPublicationScope): ArtifactVersionRecord[] {
  return scope.references().flatMap(ref => {
    const record = scope.read(ref);
    if (!record || !("origin" in record) || record.project_id !== scope.projectId || record.owner_actor_id !== scope.actorId
      || record.producer_plugin_id !== CHARACTER_PLUGIN_ID || record.producer_binding_signature !== CHARACTER_PUBLISHER_SIGNATURE
      || record.artifact_type_id !== CHARACTER_ARTIFACT_TYPE || record.schema_version !== 1) return [];
    const content = parseCharacterContent(record.payload);
    if (content.source.owner_actor_id !== scope.actorId || record.artifact_id !== characterArtifactId(scope.projectId, content.character_id)) throw new Error("角色发布的来源或身份不一致");
    return [record];
  });
}

/**
 * A publication is runnable while its draft is active and the revision it was made from exists. A publication made from a draft
 * revision that does not exist is not one to run (the check `characters.runnable` answers a plugin running a Character with, PG-086).
 */
function assertRunnableDraft(draft: ReturnType<CharactersQuery["get"]>, content: CharacterContent): void {
  if (!draft || draft.state !== "active") throw new Error("该角色已停用或删除");
  if (content.source.draft_revision > draft.revision) throw new Error("Character 发布来源不是已有草稿修订");
}

/**
 * The publication a caller names by its reference, with the Character it holds. `requireActive` is the check a run makes: the
 * version is active and available, and its Character is still one to run.
 */
export function selectPublication(scope: CharacterPublicationScope, input: Record<string, unknown>, requireActive = true): { content: CharacterContent; reference: ArtifactReference } {
  const ref = input.reference as ArtifactReference | undefined;
  const record = ownedPublications(scope).find(item => item.artifact_id === ref?.artifact_id && item.version === ref.version);
  if (!record || requireActive && (record.lifecycle_state !== "active" || record.availability !== "available")) throw new Error("请选择当前项目已发布的角色版本");
  const content = parseCharacterContent(record.payload), draft = scope.drafts.get(content.character_id);
  if (requireActive) assertRunnableDraft(draft, content);
  return { content, reference: { artifact_id: record.artifact_id, version: record.version } };
}

/**
 * `characters.runnable` answers with the same check as a launch, as data: a version that cannot run is an answer carrying Characters'
 * reason, not a failed call.
 */
export function runnableAnswer(check: () => unknown): { available: true } | { available: false; reason: string } {
  try { check(); return { available: true }; }
  catch (error) { return { available: false, reason: error instanceof Error && error.message ? error.message : "请选择当前项目已发布的角色版本" }; }
}

/** A published character is a pinned revision of its draft (artifact-positioning A1). */
function characterOrigin(content: CharacterContent) {
  return { origin: { kind: "pinned" as const, subject: { kind: "character", id: content.character_id }, revision: String(content.source.draft_revision) },
    title: content.title.trim() || content.character_id, media_type: "application/json" };
}

/**
 * Pin the confirmed draft content as the project's next version of this Character; the same content again returns the version already
 * pinned, also after a plugin upgrade.
 */
export function pinCharacter(scope: CharacterPublicationScope, artifacts: Pick<PluginArtifactClient, "publish">, content: CharacterContent): Pick<ArtifactVersionResult, "artifact" | "replayed"> {
  const artifact_id = characterArtifactId(scope.projectId, content.character_id);
  const existing = ownedPublications(scope).filter(record => record.artifact_id === artifact_id).sort((a, b) => b.version - a.version);
  const same = existing.find(record => record.lifecycle_state === "active" && record.availability === "available"
    && JSON.stringify(parseCharacterContent(record.payload)) === JSON.stringify(content));
  if (same) return { artifact: same, replayed: true };
  const previous = existing[0];
  return artifacts.publish({ artifact_id, version: (previous?.version ?? 0) + 1, artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(content)) }, ...characterOrigin(content),
    ...(previous ? { supersedes_version: previous.version } : {}),
  });
}
