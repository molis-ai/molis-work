import { projectVersionStores, restoreVersionStores } from "@molis-ai/molis-work-module-artifacts";
import type { ArtifactVersionResult, ArtifactsApplicationApi, ProcessItemsApplicationApi, RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectTypeDeclared } from "./declared-types.js";
import type { LocalProjectDatabase } from "./project-database.js";

/** A project library's two version stores. */
export interface ProjectVersionStores {
  readonly artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  readonly processItems: ProcessItemsApplicationApi;
}

/** One version a work-assets bundle brings, as the bundle recorded it. */
export type RestoredArtifactVersion = Omit<RegisterArtifactVersionInput, "project_id" | "actor_id" | "team_share_authorized"> & {
  owner_actor_id: string; availability: "available" | "unavailable"; lifecycle_state: "active" | "archived"; source_supersedes_version?: number | null;
};

/**
 * Puts the versions of a work-assets bundle into the project rebuilt from it (S-81's one exception): each is registered as the bundle
 * recorded it (producer, type, content, none rewritten), and a producer the project has not installed is taken, the restore warns
 * that its plugin is missing. Only `apps/server/src/assets.ts` calls it, and only a project that holds nothing but what the bundle
 * brings accepts it: a project with any other version refuses, so the entry is no way to write into a live library. The versions stay
 * out of every write path of the producer until it is installed here (the ordinary stores refuse it). Never a store handed out, never
 * an action, nothing in the SDK or contracts.
 */
export function restoreArtifactVersions(store: LocalProjectDatabase, projectId: string, assets: readonly RestoredArtifactVersion[]): ArtifactVersionResult[] {
  const journal = { now: () => new Date().toISOString(), appendEvent: store.appendEvent.bind(store), eventCursor: store.eventCursor.bind(store), declared: projectTypeDeclared(store.db, true) };
  const { artifacts } = restoreVersionStores({ db: store.db, homeOwner: LOCAL_PERSON_ACTOR_ID, ...journal });
  const brought = new Set(assets.map(asset => `${asset.artifact_id}@${asset.version}`));
  return store.immediate(() => {
    for (const held of artifacts.query.listArtifacts(projectId)) for (const version of artifacts.query.listArtifactVersions(projectId, held.artifact_id)) {
      if (!brought.has(`${version.artifact_id}@${version.version}`)) throw new ActionError("actions.input_invalid", "这个项目里已有恢复包之外的成果版本，不能按恢复写入");
    }
    return assets.map(asset => {
      const { owner_actor_id, availability, lifecycle_state, source_supersedes_version: _source, ...record } = asset;
      const result = artifacts.commands.registerVersion({ ...record, project_id: projectId, actor_id: owner_actor_id, team_share_authorized: record.scope === "team_project" });
      const version = { artifact_id: asset.artifact_id, version: asset.version };
      if (availability === "unavailable") artifacts.commands.markUnavailable({ project_id: projectId, actor_id: owner_actor_id, ...version, reason: "原成果不可用，需要重新连接来源" });
      if (lifecycle_state === "archived") artifacts.commands.archiveVersion({ project_id: projectId, actor_id: owner_actor_id, ...version });
      return result;
    });
  });
}

/**
 * The 成果库 and the process items of one open project library. The project's runtime opens them once, and the Host's actions and
 * the plugin platform both write through that pair (D3). Each refuses an undeclared type of a producer the Host holds a Manifest for, and any write by a plugin that is no longer in effect (A7, S-69.1, S-70.4).
 */
export function openProjectVersionStores(store: LocalProjectDatabase, clock: () => Date = () => new Date()): ProjectVersionStores {
  const journal = { now: () => clock().toISOString(), appendEvent: store.appendEvent.bind(store), eventCursor: store.eventCursor.bind(store), declared: projectTypeDeclared(store.db) };
  const { artifacts, processItems } = projectVersionStores({ db: store.db, homeOwner: LOCAL_PERSON_ACTOR_ID, ...journal });
  return { artifacts: { query: artifacts.query, commands: artifacts.commands }, processItems: { query: processItems.query, commands: processItems.commands } };
}
