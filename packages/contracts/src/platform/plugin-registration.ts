import type { HomeStoreDeclaration } from "./plugin-database.js";
import type { PluginDefinition, PluginManifest } from "./plugin.js";
import type { UiContribution } from "./ui.js";

/** A row on a plugin's page that a search result or record opens, found by its selector and the dataset key holding its id. */
export interface PluginSearchRow { readonly selector: string; readonly idDataset: string }

/** One fixed state of a plugin's own view, drawn by its own renderer from sample data for the component board (a development tool). */
export interface PluginBoardSpecimen {
  readonly id: string;
  /** What the state is, in the page's language (through `text`). */
  readonly title: string;
  /** Where the page draws it: a directory column beside the main area, or the main area itself. */
  readonly place: "column" | "page";
  readonly html: string;
}
/** What the component board hands a plugin's specimens: the page's own primitives and the language of the sample's words. */
export interface PluginBoardSpecimenPorts {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
  icon(name: string): string;
  formatDate(value: string): string;
  /** The sample's own words (names, titles), apart from the interface's language. */
  readonly sample: "zh" | "en" | "mixed";
}

/** Named shared feature stylesheets a framed plugin may declare in `workbench.frameStyleFeatures` (PEQ, 102-1). */
export type PluginFrameStyleFeature =
  | "coding-basics"
  | "coding-companions"
  | "composer"
  | "context-toolbar"
  | "detail-reading"
  | "input-receipts"
  | "interaction"
  | "keep-edits"
  | "presentation-form"
  | "settings-document"
  | "source-ladder";

/** What the workbench shell loads for one plugin: its views, styles and browser client. */
export interface PluginWorkbenchRegistration {
  /** Exact existing HTTP routes for pages whose backend is registered outside Plugin Runtime. This grants no Runtime services. */
  readonly pageRequests?: readonly { readonly method: string; readonly path: string }[];
  /** Asset cascade/initialization order, independent of navigation order in the Manifest. */
  readonly order: number;
  readonly contributions: readonly UiContribution[];
  readonly stylesheet?: string;
  /**
   * Optional specialized platform feature stylesheets prepended into this framed plugin's served on-demand sheet.
   * Core SDK primitives live in `molis-work-plugin-base.css`; only specialized feature sheets are opted in here.
   */
  readonly frameStyleFeatures?: readonly PluginFrameStyleFeature[];
  /**
   * Where the shared workbench sheet puts what it holds of `stylesheet`: "over-shell" (the default) after the shell's own
   * layers, so the plugin's rules win ties with them; "beneath-shell" before those layers (the canvas, density, primitives and
   * finish), for a page the shell draws and restyles, so the shell's later rules still win ties with the plugin's.
   */
  readonly stylesheetLayer?: "over-shell" | "beneath-shell";
  /**
   * A plugin whose page runs in a frame (it has a client) sends the rules of its own namespace (`.<project_plugin_id>-…`,
   * `[data-<project_plugin_id>-…]`) as a sheet of its own, which only the frames that need it link; every other rule stays in
   * the shared workbench sheet. These are the classes (no dot) of that namespace which something outside the plugin's own
   * frame also draws, so the rules naming them stay in the shared sheet too. tests/plugin-styles.test.ts finds the classes
   * this has to list.
   */
  readonly stylesheetShared?: readonly string[];
  /**
   * Further class/attribute prefixes this plugin's rules may be written under, beside `.<project_plugin_id>`. A plugin whose
   * classes were named before the platform had its id (the plugin builder's `as-` and `pb-`) names them here, so its own rules
   * can leave the shared sheet (PG-070). Each entry is a prefix ending in `-`; the Host refuses one that is another plugin's
   * id or prefix, or one of the platform's own (`mw-`, `pc-`). The rules must still be ones the plugin alone can draw;
   * `stylesheetShared` lists whatever something outside its frame also draws.
   */
  readonly stylesheetPrefixes?: readonly string[];
  /**
   * The plugins whose own sheet this plugin's frame links beside its own because it draws their classes (the plugins in
   * `clientUses` are linked already). Their short ids.
   */
  readonly stylesheetUses?: readonly string[];
  readonly clientFactory?: string;
  /** This factory handles each declared interactive surface in its own root/frame using Host mount metadata. */
  readonly clientMounts?: "surfaces";
  /**
   * The shell sends `clientFactory` without its whole-line comments and indentation (the page does not run them). A script
   * whose multi-line strings or templates carry indentation as content cannot set this; tests/plugin-client-served.test.ts
   * holds the result to the same program as the source.
   */
  readonly clientServed?: true;
  /**
   * The plugins whose clients this one calls (their short ids). Each ships a bundle of its own, which the page loads beside this
   * plugin's; their factories reach it as `host.clients[<short id>]` and mount on the ports this plugin gives them, as the
   * plugin they belong to.
   */
  readonly clientUses?: readonly string[];
  /** Browser dependencies prepared before this factory mounts. */
  readonly clientAssets?: readonly string[];
  /** Built-in asset routes served from package specifiers under this plugin's own package (e.g. `{ "/assets/...": "<pkg>/editor" }`). */
  readonly clientAssetSpecifiers?: Readonly<Record<string, string>>;
  readonly settingsClient?: string;
  /**
   * The rules of the settings pages this plugin's settings contributions draw. The settings sheet carries them, and so does the
   * workbench sheet, where settings open inside a project.
   */
  readonly settingsStylesheet?: string;
  /**
   * For a plugin without a frame whose page the shell draws: its page client, a factory script `(host) => client | null` that
   * the shell's page script calls once at start (specs/page-client-lifecycle). The shell takes every registered one from the
   * registration list and never names a plugin; the client returns `null` when this page carries none of its page data.
   */
  readonly pageClient?: string;
  readonly searchRow?: PluginSearchRow;
  /** Surface aliases routed to this plugin's canonical surface (e.g. Feed's `sources`). */
  readonly surfaceAliases?: readonly string[];
  /** Search hit kinds that jump to `searchRow` on the plugin's page instead of opening an item tab. */
  readonly searchRecordKinds?: readonly string[];
  /** Set `false` when reloading the plugin's page should not auto-reopen the previously selected record. */
  readonly reopenRecord?: false;
  /**
   * The row a record is opened from on this plugin's page, where it differs from `searchRow`: ⌘/Ctrl- or middle-click on it
   * opens the record as a tab in the plugin's group (specs/plugin-tab-groups).
   */
  readonly recordRow?: PluginSearchRow;
  /**
   * The plugin's rows in fixed sample states for the component board (`/__ui/catalog`, specs/visual-ui-experience VUX-39), drawn
   * by the renderer its page uses, so the board shows the production row and never a copy of it. Nothing is read or written.
   */
  readonly specimens?: (ports: PluginBoardSpecimenPorts) => readonly PluginBoardSpecimen[];
}

/**
 * One plugin this build ships and its already exported implementations. This declaration grants no authority. 2026-10-18 改:
 * each plugin package writes its own and the catalog is generated from them (W5-02, PG-065 in
 * specs/archive/repository-anti-corruption/privileges.md).
 */
/** One decision outcome digest computed from the owning plugin's immutable rows. */
/** One observation coverage fact declared by a built-in plugin package for the platform's coverage register. */
export interface PluginObservationCoverageDeclaration {
  readonly fact: string;
  readonly entries: readonly ("plugin" | "workbench" | "cli" | "mcp" | "agent" | "workflow" | "schedule" | "background" | "host" | "desktop")[];
  readonly state: "complete" | "not_connected" | "unavailable" | "not_applicable" | "by_rule";
  readonly reason?: string;
  /** Optional display/scope bucket when this plugin reports workflow/automation steps (`"flow"`). */
  readonly record_kind?: "flow" | "content";
}


export type {PluginDistributionVerifier,BuiltinSyncBinding,ReplicaDatabase,AggregateReplicaContext,AggregateCopyContext,SyncDocumentStorage,ProjectSyncServices,ProjectSyncUploadContext,ProjectSyncContentOwner} from './plugin-sync-registration.js';
/**
 * A surface of the platform's own that the shell frames like a plugin's page (47-1 C: the plugin studio; 44B: Shelf): its stage, page
 * requests, sheet and program, and the sync collections it owns. One the runtime hosts (Shelf) also names the code its Home instance
 * starts from (`runtime`) and its Home store (`home_store`). It is not a plugin and is in no plugin catalog: nothing installs, switches
 * off or adds it to a project.
 */
export type HostSurfaceRegistration = Pick<PluginRegistration, "project_plugin_id" | "manifest" | "workbench" | "sync" | "runtime" | "project_runtime" | "home_store" | "observation">;

export interface PluginRegistration {
  readonly sync?: Readonly<Record<string, import('./plugin-sync-registration.js').BuiltinSyncBinding>>;
  /** Optional observation facts reported by this plugin, collected dynamically into the observation coverage plan. */
  readonly observation?: {
    readonly coverage?: readonly PluginObservationCoverageDeclaration[];
  };
  /** The plugin's key inside a project (`^[a-z0-9][a-z0-9-]*$`); the Manifest's `plugin_id` stays its identity. */
  readonly project_plugin_id: string;
  /** Position in the catalog, unique across the build; the derived lists keep this order. */
  readonly catalog_order: number;
  readonly manifest: PluginManifest;
  /** Product setup choice for new projects; stored as ordinary membership and freely removable afterwards. */
  readonly default_enabled?: true;
  /** Short ids enabled together with this plugin in a project, whatever its ports say (Feed brings Inbox). Trusted, as above. */
  readonly companions?: readonly string[];
  /**
   * How the Host gets the code of a plugin that runs in the Home. Where a plugin runs is its Manifest's `runtime.scope` (PG-011),
   * which this entry has exactly when that says `"home"` (`catalogProblems`). Explicit Runtime activation;
   * personal visibility alone never migrates an existing plugin. Trusted: the Host reads it from this registration only, never from a
   * Manifest or an installed package. Its library is the Manifest's `databases.home` (PG-022). Its files, model settings and image
   * generation are the Manifest's `owner_files`, `model_configuration` and `image_generation` (PG-102).
   */
  readonly runtime?: {
    readonly create: () => PluginDefinition;
    readonly package_name: string;
    readonly factory_export: string;
    /** The chord (`Mod+Shift+<letter>`) that summons this Home tool's side view from anywhere; global keys are the Host's to give. */
    readonly keys?: string;
    /**
     * This Home instance is one half of a dual-instance plugin (docs/system/GLOSSARY.md): the same plugin also runs as each
     * project's instance from its `project_runtime`, and each half offers only its share of the one Manifest. Trusted, as above:
     * no Manifest or installed package can say it (S-48). Every permission of such a Manifest is required (specs/archive/dual-instance-plugins).
     */
    readonly dual_instance?: true;
  };
  /**
   * Each project's instance, which the Host's project supervisor starts from this declaration (PG-067). Trusted, as above. A plugin
   * whose library is the Manifest's `databases.home` runs only where the project has a Home. The factory takes nothing from the Host:
   * what a project instance needs from it is a platform service or an action its Manifest declares (BL-616). A dual-instance
   * plugin declares this and `runtime` (Feed, Work Brief).
   */
  readonly project_runtime?: {
    readonly create: () => PluginDefinition;
    readonly package_name: string;
    readonly factory_export: string;
    /**
     * The chord (`Mod+Shift+<letter>`) that opens this plugin's first side view in the personal space from any partition (R14,
     * batch 108). Where the personal space has not enabled the plugin yet, the view offers to enable it in one step. Global keys are
     * the Host's to give.
     */
    readonly keys?: string;
  };
  /**
   * The Home store this plugin keeps (exported by the plugin, beside the code that opens it), for the Host's one registry of Home
   * stores. A library is not written here: the registry reads it from the Manifest's `databases.home`.
   */
  readonly home_store?: HomeStoreDeclaration;
  readonly workbench: PluginWorkbenchRegistration;
}
