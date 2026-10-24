import type {
  ArtifactsApplicationApi,
  ArtifactsCommandApi,
  ArtifactsQueryApi,
  ProcessItemRecord,
  ProcessItemsApplicationApi,
  RecordProcessItemInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

import {
  ArtifactsRepository,
  PROCESS_ITEM_TABLES,
  type ArtifactsSqliteDatabase,
} from "./repository.js";
import {
  ArtifactsService,
  type ArtifactsServiceOptions,
} from "./service.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-artifacts",
  packagePath: "modules/artifacts",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/artifacts",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ar1","goal-reorg-ar3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "artifacts.identity.v1",
    "artifacts.version-repository.v1",
    "artifacts.opaque-content.v1",
    "artifacts.compatibility.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface ArtifactsModuleOptions extends ArtifactsServiceOptions {
  db: ArtifactsSqliteDatabase;
  /**
   * The person this Home belongs to. Every personal 成果 in it belongs to them, whoever produced it (the producer stays in
   * `created_by`); without it a version belongs to the actor that registered it.
   */
  homeOwner?: string;
}

export class ArtifactsModule implements ArtifactsApplicationApi {
  readonly service: ArtifactsService;
  readonly query: ArtifactsQueryApi;
  readonly commands: ArtifactsCommandApi;

  constructor(options: ArtifactsModuleOptions) {
    const repository = new ArtifactsRepository(options.db, undefined, options.homeOwner);
    this.service = new ArtifactsService(repository, options);
    this.query = this.service;
    this.commands = this.service;
  }
}

/**
 * Process items: the exchange data plugins pass to each other (a file snapshot, a change set, a run's receipt). Same
 * immutable versions as the 成果库 but its own tables and events, so none of it shows up where people look for 成果.
 * Each item belongs to the plugin that produced it (specs/artifact-positioning A2).
 */
export class ProcessItemsModule implements ProcessItemsApplicationApi {
  readonly service: ArtifactsService<ProcessItemRecord, RecordProcessItemInput>;
  readonly query: ProcessItemsApplicationApi["query"];
  readonly commands: ProcessItemsApplicationApi["commands"];

  constructor(options: Omit<ArtifactsModuleOptions, "kind" | "homeOwner">) {
    const repository = new ArtifactsRepository<ProcessItemRecord>(options.db, PROCESS_ITEM_TABLES);
    this.service = new ArtifactsService<ProcessItemRecord, RecordProcessItemInput>(repository, { ...options, kind: "process_item" });
    this.query = this.service;
    this.commands = this.service;
  }
}

/** The 成果库 and the process items of one project library. */
export interface ProjectVersionStores {
  readonly artifacts: ArtifactsModule;
  readonly processItems: ProcessItemsModule;
}

const openStores = new WeakMap<object, { stores: ProjectVersionStores; ports: ArtifactsModuleOptions }>();

/**
 * The one pair of stores a project library has: the same library gives the same pair however many callers ask (the project runtime,
 * the installed-plugin host, Feed), so no two copies keep their own event hooks or checks. The first caller's ports stay; a later
 * caller only fills in a port the earlier ones left out (the clock, the declared-type check).
 */
export function projectVersionStores(options: ArtifactsModuleOptions): ProjectVersionStores {
  const open = openStores.get(options.db);
  if (open) {
    Object.assign(open.ports, Object.fromEntries(Object.entries(options).filter(([key, value]) => value !== undefined && Reflect.get(open.ports, key) === undefined)));
    return open.stores;
  }
  const ports = { ...options };
  const late: Omit<ArtifactsModuleOptions, "db" | "homeOwner"> = {
    now: () => (ports.now ?? (() => new Date().toISOString()))(),
    appendEvent: event => ports.appendEvent(event),
    eventCursor: projectId => ports.eventCursor(projectId),
    declared: (producer, type, kind) => ports.declared?.(producer, type, kind) ?? null,
  };
  const stores = {
    artifacts: new ArtifactsModule({ db: options.db, ...(options.homeOwner === undefined ? {} : { homeOwner: options.homeOwner }), ...late }),
    processItems: new ProcessItemsModule({ db: options.db, ...late }),
  };
  openStores.set(options.db, { stores, ports });
  return stores;
}

export { createPluginArtifactClient } from "./plugin-client.js";
export { createPluginArtifactOperations, type PluginArtifactOperationsInput } from "./plugin-operations.js";
export { pluginArtifactErrors } from "./plugin-errors.js";

export {
  artifactContentDigest,
  artifactContentSize,
  canonicalArtifactJson,
  normalizeArtifactMetadata,
  normalizeArtifactPayload,
} from "./content.js";
export {
  ARTIFACT_TABLES,
  ARTIFACTS_SCHEMA_SQL,
  createArtifactsSchema,
  createProcessItemsSchema,
  PROCESS_ITEM_TABLES,
  PROCESS_ITEMS_SCHEMA_SQL,
  versionStoreSchemaSql,
  type VersionStoreTables,
  mapArtifactIdentity,
  mapArtifactVersion,
  mapFixedVersion,
  type ArtifactsSqliteDatabase,
  type ArtifactsSqliteStatement,
} from "./repository.js";
export { afterTransaction, onVersionStoreWrite } from "./committed.js";
export {
  ArtifactsService,
  type ArtifactEventInput,
  type ArtifactsServiceOptions,
  type VersionStoreKind,
} from "./service.js";

export { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROJECT_PLUGIN_ID, ARTIFACTS_PROVIDER } from "./artifact-provider.js";
export { artifactsActions, ARTIFACT_ACTIONS, ARTIFACT_ACTION_PERMISSIONS, createArtifactActionHandlers } from "./artifact-actions.js";
export type { ArtifactActionPorts, ArtifactFileImport, ArtifactExternalImport, ArtifactImportResult, ArtifactPluginInput } from "./artifact-actions.js";
export { artifactsErrors } from "./artifact-errors.js";
export { openArtifactProjectReference } from "./artifact-project-reference.js";
export type { ArtifactProjectReferencePorts } from "./artifact-project-reference.js";
export { readArtifactBrowser, matchArtifactBrowserRoute, exportArtifactVersion, artifactVersionPath, importedFileOf, requireArtifactAnalysisRecord, artifactAnalysisContext } from "./artifact-browser.js";
export type { ArtifactBrowserView, ArtifactBrowserRoute } from "./artifact-browser.js";
export { importArtifactDocument, documentErrors, DOCUMENT_ARTIFACT_TYPE, DOCUMENT_IMPORT_MAX_BYTES, EXTERNAL_DOCUMENT_SOURCES } from "./artifact-document-import.js";
export type { ArtifactDocumentImportPorts, ArtifactOriginalFile, ImportedArtifactDocument, ExternalDocumentSource, ModelRequired, OfferedOriginal } from "./artifact-document-import.js";
export { ARTIFACT_ORIGINAL_INLINE_MAX_BYTES, ARTIFACTS_HOME_STORE, artifactOriginalPath, openArtifactOriginal, storeArtifactOriginal } from "./artifact-original-store.js";
export type { StoredArtifactOriginal } from "./artifact-original-store.js";
export { readGoalArtifactEmbeds, type GoalArtifactEmbed } from "./artifact-goal-context.js";
