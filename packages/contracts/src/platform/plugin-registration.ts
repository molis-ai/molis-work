import type { ProjectDataDeclaration } from "../modules/projects.js";
import type { InstructionPrompt } from "./model-prompts.js";
import type { AgentPromptText, AgentSkillDefinition } from "./plugin-agent.js";
import type { HomePluginDatabaseDeclaration, HomeStoreDeclaration } from "./plugin-database.js";
import type { PluginFilesDeclaration } from "./plugin-files.js";
import type { PluginImageGenerationDeclaration } from "./plugin-image-generation.js";
import type { PluginModelConfigurationDeclaration } from "./plugin-model-configuration.js";
import type { PluginOwnerFilesDeclaration, PluginOwnerFilesWriter } from "./plugin-owner-files.js";
import type { PluginDefinition, PluginManifest } from "./plugin.js";
import type { UiContribution } from "./ui.js";

/** A row on a plugin's page that a search result or record opens, found by its selector and the dataset key holding its id. */
export interface PluginSearchRow { readonly selector: string; readonly idDataset: string }

/** What the workbench shell loads for one plugin: its views, styles and browser client. */
export interface PluginWorkbenchRegistration {
  /** Asset cascade/initialization order, independent of navigation order in the Manifest. */
  readonly order: number;
  readonly contributions: readonly UiContribution[];
  readonly stylesheet?: string;
  readonly clientFactory?: string;
  /**
   * The shell sends `clientFactory` without its whole-line comments and indentation (the page does not run them). A script
   * whose multi-line strings or templates carry indentation as content cannot set this; tests/plugin-client-served.test.ts
   * holds the result to the same program as the source.
   */
  readonly clientServed?: true;
  /**
   * The plugin whose client also serves this surface (its short id): its bundle is loaded once and its factory mounts this
   * surface's root, so a companion does not ship a second copy of the same client (W4-03).
   */
  readonly clientFrom?: string;
  /**
   * The plugins whose clients this one calls (their short ids). Their factories travel in this plugin's bundle and reach it as
   * `host.clients[<short id>]`, with the Host's review actions as `host.reviews` (a rendering hook, never a decision); each of
   * them names this plugin in `clientFrom`, so none ships a bundle of its own.
   */
  readonly clientUses?: readonly string[];
  /** Browser dependencies prepared before this factory mounts. */
  readonly clientAssets?: readonly string[];
  readonly settingsClient?: string;
  readonly searchRow?: PluginSearchRow;
  /**
   * The row a record is opened from on this plugin's page, where it differs from `searchRow`: ⌘/Ctrl- or middle-click on it
   * opens the record as a tab in the plugin's group (specs/plugin-tab-groups).
   */
  readonly recordRow?: PluginSearchRow;
}

/**
 * One plugin this build ships and its already exported implementations. This declaration grants no authority. 2026-10-18 改:
 * each plugin package writes its own and the catalog is generated from them (W5-02, PG-065 in
 * specs/repository-anti-corruption/privileges.md).
 */
export interface PluginRegistration {
  /** The plugin's key inside a project (`^[a-z0-9][a-z0-9-]*$`); the Manifest's `plugin_id` stays its identity. */
  readonly project_plugin_id: string;
  /** Position in the catalog, unique across the build; the derived lists keep this order. */
  readonly catalog_order: number;
  readonly manifest: PluginManifest;
  /** One sentence for the plugin market and the page heading. 2026-10-18 改: declared in the Manifest (W5-02). */
  readonly summary: string;
  /**
   * Kept out of the plugin list (switcher and market) unless the Host is in developer mode; still installable and enabled where
   * already added. 2026-10-18 改: declared in the Manifest (W5-02).
   */
  readonly developer?: true;
  /**
   * On in every project unless the person hid it there; not offered for enabling. Trusted: the Host reads it from this
   * registration only, never from a Manifest or an installed package.
   */
  readonly personal?: true;
  /** Short ids enabled together with this plugin in a project, whatever its ports say (Feed brings Inbox). Trusted, as above. */
  readonly companions?: readonly string[];
  /**
   * Explicit Runtime activation in the Home; personal visibility alone never migrates an existing plugin. Trusted, as above.
   * 2026-10-18 改: the stores and model consumers it names are declared in the Manifest and granted like any plugin's (PG-022,
   * PG-102 in specs/repository-anti-corruption/privileges.md).
   */
  readonly runtime?: {
    readonly scope: "home";
    readonly create: () => PluginDefinition;
    readonly database?: HomePluginDatabaseDeclaration;
    readonly files?: PluginFilesDeclaration;
    /** The owner-file store this instance reads and writes through `services.ownerFiles`; its Home store must name this plugin. */
    readonly owner_files?: PluginOwnerFilesDeclaration;
    /** Lays down first-run files once the instance starts, before any action can read them. */
    readonly initialize_owner_files?: (writer: PluginOwnerFilesWriter) => void;
    readonly model_configuration?: PluginModelConfigurationDeclaration;
    readonly image_generation?: PluginImageGenerationDeclaration;
    readonly package_name: string;
    readonly factory_export: string;
    /** The chord (`Mod+Shift+<letter>`) that summons this Home tool's side view from anywhere; global keys are the Host's to give. */
    readonly keys?: string;
    /**
     * This Home instance is one half of a dual-instance plugin (docs/system/GLOSSARY.md): the same plugin also runs as each
     * project's instance from the project start list, and each half offers only its share of the one Manifest. Trusted, as above:
     * no Manifest or installed package can say it. Every permission of such a Manifest is required (specs/dual-instance-plugins).
     */
    readonly dual_instance?: true;
  };
  /**
   * What this plugin keeps in the Home for a project, and how to clear it. The Host runs it when a project is deleted (the
   * owner's id in the receipt is `project_plugin_id`) and lists its label in the confirmation; absent when the plugin keeps
   * nothing outside the project's own directory.
   */
  readonly project_data?: ProjectDataDeclaration;
  /** The Home store this plugin keeps (exported by the plugin, beside the code that opens it), for the Host's one registry of Home stores. */
  readonly home_store?: HomeStoreDeclaration;
  /** Owner-scoped UI words, projected into the page language by the common translator. */
  readonly messages?: Readonly<Record<string, { readonly zh: string; readonly en: string }>>;
  /** Fixed model-call instructions, exported by this plugin and registered by the Host. */
  readonly instructions?: readonly InstructionPrompt[];
  readonly agent?: { readonly prompts: readonly AgentPromptText[]; readonly skills?: readonly AgentSkillDefinition[] };
  /** Bodies of the Manifest's `methods` (offered to other Agents for business work); the package ships them. */
  readonly methods?: readonly AgentSkillDefinition[];
  readonly workbench: PluginWorkbenchRegistration;
}
