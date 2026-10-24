import { projectVersionStores } from "@molis-ai/molis-work-module-artifacts";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { builtinTypeDeclared } from "./declared-types.js";
import type { LocalProjectDatabase } from "./project-database.js";

/** A project library's two version stores. */
export interface ProjectVersionStores {
  readonly artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  readonly processItems: ProcessItemsApplicationApi;
}

/**
 * The 成果库 and the process items of one open project library. The project's runtime opens them once, and the Host's actions and
 * the plugin platform both write through that pair (D3). Each refuses a built-in producer's undeclared type (A7).
 */
export function openProjectVersionStores(store: LocalProjectDatabase, clock: () => Date = () => new Date()): ProjectVersionStores {
  const journal = { now: () => clock().toISOString(), appendEvent: store.appendEvent.bind(store), eventCursor: store.eventCursor.bind(store), declared: builtinTypeDeclared };
  const { artifacts, processItems } = projectVersionStores({ db: store.db, homeOwner: LOCAL_PERSON_ACTOR_ID, ...journal });
  return { artifacts: { query: artifacts.query, commands: artifacts.commands }, processItems: { query: processItems.query, commands: processItems.commands } };
}
