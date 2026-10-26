import type { BoundActionClient } from "./actions.js";
import type { UiContribution } from "./ui.js";
import type { PluginArtifactClient, PluginProcessItemClient } from "./plugin-artifacts.js";
import type { PluginEventsClient } from "./plugin-events.js";
import type { PluginInputsClient, PluginOutputsClient } from "./plugin-wiring.js";
import type { PluginModelClient } from "./plugin-model.js";
import type { PluginMaterialsClient } from "./plugin-materials.js";
import type { PluginExecutionControl } from "./plugin-routes.js";

/** Opaque, personal installation data. The author owns serialization, not storage paths or SQL. */
export interface PluginPrivateStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  /**
   * Optional atomic replacement within this installation. null expects an absent
   * key; a string expects that exact stored value. false means nothing changed.
   * Authors needing conflict detection must reject a Host without this method;
   * get followed by set is not an equivalent implementation.
   */
  compareAndSet?(key: string, expected: string | null, value: string): boolean;
}

export interface PluginUiClient {
  register<TModel>(contribution: UiContribution<TModel>): void;
  unregister(contributionId: string): void;
  /**
   * This installation's open views may show something stale: the pages watching it (`scope.watchRevision`) read again, under
   * their reader's own authority. Only its own views, for a Manifest that declares `ui.views`; no permission. From any code of
   * this activation, inside an action or not. A hint, never a receipt: nothing is recorded, and before the activation runs it
   * does nothing. Refused (`ui_host.plugin_denied`) without declared views, and from the moment this activation stops (PG-061).
   */
  invalidate(): void;
}

/**
 * The Host's action directory as the plugin's own running action's caller sees it, for a plugin whose Manifest declares `actions:delegate`.
 * Every call runs as the original caller under the workflow audience, never with the plugin's own grants; a target that audience or that
 * caller's permissions do not reach is refused (docs/system/SECURITY-INVARIANTS.md S-43).
 */
export interface PluginActionDirectory {
  discover(): Promise<readonly import("./actions.js").ActionView[]>;
  invoke<Output = unknown>(reference: import("./actions.js").ActionReference, input: unknown, control?: PluginExecutionControl): Promise<Output>;
  /** Refuses as `invoke` would before the target runs (a target this caller cannot reach, an input its schema rejects); runs and logs nothing. */
  check(reference: import("./actions.js").ActionReference, input: unknown): Promise<void>;
}

/** Query delegation uses the active Runtime action's caller, never a caller supplied by the plugin. */
export interface PluginActionClient extends BoundActionClient {
  /**
   * Whether an action this Manifest consumes is registered and ready, without calling it; synchronous, so an action's own
   * availability can depend on it. Not consumed, a stopped instance, or a Host with no check answer unavailable. A call still
   * checks its caller, input and authority.
   */
  availability(reference: import("./actions.js").ActionReference): import("./actions.js").ActionAvailability;
  invokeQuery<Input = unknown, Output = unknown>(reference: import("./actions.js").ActionReference, input: Input): Promise<Output>;
  /** Dynamic dependencies as this installation, with its own grants and plugin audience; requires actions:invoke. */
  readonly dependencies?: PluginActionDirectory;
  /** Present only when the Manifest declares `actions:delegate`; every call also needs the installation's grant. */
  readonly directory?: PluginActionDirectory;
}

export interface PluginHostServices {
  /** Public metadata of installations in this activation's scope. */
  readonly notifications?: import("./plugin-notifications.js").PluginNotificationClient;
  readonly installations?: import("./plugin-installations.js").PluginInstallationClient;
  /** The project's Attention entries (the Inbox's); present with `attention:read` or `attention:write`. Writes join the plugin's project transaction (PG-087, PG-094 S9-0b). */
  readonly attention?: import("./plugin-attention.js").PluginAttentionClient;
  /** The project's Context Ledger edges; present with `context-ledger:read` or `context-ledger:write`. Writes join the plugin's project transaction (PG-087, PG-094 S9-0b). */
  readonly contextLedger?: import("./plugin-attention.js").PluginContextLedgerClient;
  /** The consumption scenes this plugin's Manifest declares (`action_scenes`); present with `scenes:use`, only inside the plugin's own running action (S-89). */
  readonly scenes?: import("./plugin-scenes.js").PluginSceneClient;
  /** The judgment ledger of the scenes this plugin's Manifest declares; present with `judgments:read` or `judgments:write`. Not part of the plugin's project transaction (S-90). */
  readonly judgments?: import("./plugin-judgments.js").PluginJudgmentsClient;
  /** Awaited, owner-bound Agent work through the Home's shared runtime. */
  readonly agents?: import("./plugin-agents.js").PluginAgentClient;
  /** One finite continuation of an accepted action; business jobs and recovery remain plugin-owned. */
  readonly background?: import("./plugin-background.js").PluginBackgroundClient;
  /** Host-bound entry to this Plugin's declared public actions; no arbitrary capability access. */
  readonly actions?: PluginActionClient;
  /** Present only when the Manifest declares private storage. Actual grant is checked on each operation. */
  readonly storage?: PluginPrivateStorage;
  /**
   * Plugin-owned SQLite, only for trusted Host entries declaring a database. A Home entry's library may be partitioned by project
   * (`HomePluginDatabaseDeclaration.partition`): then each call reaches the library of the project it runs in. 2026-10-18 改: by
   * Manifest declaration (PG-022).
   */
  readonly database?: import("./plugin-database.js").PluginDatabase;
  /**
   * The plugin's own tables in this project's library, present when its Manifest declares `databases.project`. Every statement is
   * checked against the tables the platform made for it (and the project's root row, which it may read); a statement that reaches
   * any other table, a schema step or a pragma is refused (specs/plugin-project-database). `journal` is the project's event log and
   * idempotency records, for a plugin granted `PROJECT_JOURNAL_PERMISSION` (PG-094 S9-0).
   */
  readonly project_database?: import("./plugin-database.js").PluginProjectDatabase;
  /**
   * The same tables for a plugin the Host runs outside its own process (`execution: "sandbox"`): the host entry that carries the
   * plugin's code gets this in place of `project_database`, so its statements run in a process the controller can kill.
   */
  readonly project_statements?: import("./plugin-database.js").PluginProjectStatements;
  /** Project wakeups, scoped to this plugin. Writes join its current project database transaction. */
  readonly scheduler?: import("./plugin-scheduler.js").PluginScheduleClient;
  readonly ownerFiles?: import("./plugin-owner-files.js").PluginOwnerFilesClient;
  readonly terminal?: PluginTerminalClient;
  /**
   * The Host's text model, for a plugin the Host runs itself that declares `model:read` (the list and availability only) or
   * `model:invoke`; requests only from its own concurrent actions that declare `model:invoke`.
   */
  readonly model?: PluginModelClient;
  /** Image inference and connection binding, only for a trusted Home entry declaring this consumer. 2026-10-18 改: by Manifest declaration (PG-102). */
  readonly imageGeneration?: import("./plugin-image-generation.js").PluginImageGenerationClient;
  /** Which of the Manifest's `local_tools` this machine has (PG-112); only for a plugin the Host runs itself that declares them, with `local-tools:read`. */
  readonly localTools?: import("./plugin-local-tools.js").PluginLocalToolsClient;
  /** Host material readers, each declared on its own: materials:read, materials:fetch, materials:fetch_local, materials:original. */
  readonly materials?: PluginMaterialsClient;
  /** Requests through the accounts the person bound to the Manifest's connection slots, when it declares `connections:use` (S-57). */
  readonly connections?: import("./plugin-connections.js").PluginConnectionsClient;
  /** Pulling public sources and reading evidence bodies through the platform, when the Manifest declares `sources:pull_feed`, `sources:pull_query` or `evidence:read` (S-99, provisional). */
  readonly sourcePull?: import("./plugin-source-pull.js").PluginSourcePullClient;
  /** A person-authorized directory, only when the Manifest declares directory:read; the Host never lets the Plugin name an absolute path. */
  readonly directory?: import("./plugin-directory.js").PluginDirectoryService;
  /** Project artifact services are absent from Home activations. */
  readonly artifacts?: PluginArtifactClient;
  /** Present when the Manifest declares `process_items.produces`. */
  readonly processItems?: PluginProcessItemClient;
  readonly ui: PluginUiClient;
  /**
   * The platform's question card, action card and next-step row as html, in the call's language (PG-062): what a plugin that runs
   * an Agent's round on its own page shows the way the Assistant does. The Host gives it to every activation; no permission.
   */
  readonly interaction?: import("./plugin-interaction.js").PluginInteractionClient;
  /** Present when the Manifest declares published events. */
  readonly events?: PluginEventsClient;
  /** Present when the Manifest declares input ports. */
  readonly inputs?: PluginInputsClient;
  /** Present when the Manifest declares output ports. */
  readonly outputs?: PluginOutputsClient;
}

/** A user-started interactive terminal in the plugin's declared owner-files directory. */
export interface PluginTerminalClient {
  /** Backend-selected executable; the page receives only its panel handle. Requires terminal:run. */
  open(input: { key: string; command: string; title: string }): Promise<{ panelId: string }>;
}
