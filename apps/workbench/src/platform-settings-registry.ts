import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The platform's own settings pages, one entry each (docs/system/EXTENSION-POINTS.md X-2). The directory, the settings page, the cover in
 * the workbench, the address filter and the Host's route all read this list; a page is drawn by its entry in `settings-renderer.ts`
 * (`PLATFORM_SETTINGS_PAGES`), and what it is drawn from is its entry in the Host's `PLATFORM_SETTINGS_DATA` (`web-catalog-settings.ts`). A plugin's settings page
 * is declared in its Manifest and is in none of them.
 */
export interface PlatformSettingsSection {
  /** The last part of its address, and its row's key in the directory. */
  readonly id: string;
  /** What draws it; the id unless the page answers to another name inside the program. */
  readonly page?: string;
  /** The address it lives under; a 能力 page (specs/artifact-positioning S6b) is also a settings category. */
  readonly root?: "/capabilities/";
  /** The page title; a listed page without one takes its row's label. */
  readonly title?: string;
  /** Its row in the directory. Without one, the page is reached from links only. */
  readonly row?: { readonly label: string; readonly icon: PluginIconName; readonly group: string; readonly order: number;
    /** The desktop app's own page (设置 › 运行): listed only there. */ readonly desktop?: true };
  /** The row shown for a page without one of its own. */
  readonly under?: string;
  /** The help topic; its page's name unless it shares another's. */
  readonly help?: string;
  /** The query names it reads beyond the defaults, space-joined (settings-address-params.ts). */
  readonly query?: string;
  /** The fragments it reads, space-joined. */
  readonly hash?: string;
  /** Settings addresses that lead here now, with the parameters they add. */
  readonly moved?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

const SECTIONS = [
  { id: "appearance", title: "workbench.settings-renderer.interface-language", row: { label: "workbench.settings-sections.appearance-and-language", icon: "sun", group: "workbench.settings-sections.this-device", order: 10 } },
  // directories: apps/workbench/src/settings-local-directories.ts:28-29 reads plugin.
  { id: "directories", query: "plugin", row: { label: "workbench.settings-sections.local-directories", icon: "folder", group: "workbench.settings-sections.this-device", order: 12 } },
  { id: "memory", title: "workbench.settings-renderer.memory", query: "memory_session_kind memory_session_id memory_session_plugin memory_session_provider",
    row: { label: "workbench.settings-sections.memory", icon: "bookmark", group: "workbench.settings-sections.personal", order: 15 } },
  { id: "work-records", title: "workbench.settings-renderer.work-records", row: { label: "workbench.settings-sections.work-records", icon: "database", group: "workbench.settings-sections.personal", order: 16 } },
  { id: "sync", title: "workbench.settings-renderer.sync", row: { label: "workbench.settings-sections.sync", icon: "network", group: "workbench.settings-sections.personal", order: 17 } },
  // models: the Host's page data reads setup/template/provider (modelTemplatePageData reads new with template once the shell opens it).
  { id: "models", title: "workbench.settings-renderer.models", query: "setup template provider new", row: { label: "workbench.settings-sections.models", icon: "key", group: "workbench.settings-sections.ai", order: 20 } },
  { id: "assistant", title: "workbench.settings-renderer.assistant", hash: "#contributions", row: { label: "workbench.settings-sections.assistant", icon: "message", group: "workbench.settings-sections.ai", order: 30 } },
  { id: "characters", row: { label: "workbench.settings-sections.characters", icon: "user", group: "workbench.settings-sections.ai", order: 35 } },
  // Prompts have no row of their own: they belong to a role in a kit (09), so their page opens under 能力包.
  // prompts: settings-prompts.ts reads role (and project/desktop from the defaults).
  { id: "prompts", title: "workbench.settings-renderer.prompts", query: "role", under: "kit" },
  // The Home Kit reads a Skill draft from a receipt, just as the project Kit does.
  { id: "kit", query: "draft", row: { label: "workbench.kit.title", icon: "sparkles", group: "workbench.settings-sections.ai", order: 45 } },
  { id: "runtimes", title: "workbench.settings-renderer.ai-execution-tools", row: { label: "workbench.settings-sections.ai-and-runtimes", icon: "terminal", group: "workbench.settings-sections.tools-and-access", order: 50 } },
  // library (the 能力 catalogue and the rules editor inside it): web-capabilities.ts:22-35 reads project/q/kind/action/version;
  // the rules editor (apps/workbench/src/judgment-rules/client-events.ts:305) reads rule/key. It does not read provider.
  { id: "library", root: "/capabilities/", title: "workbench.settings-renderer.capabilities", help: "capabilities", query: "rule key q kind action version",
    row: { label: "workbench.settings-sections.capability-library", icon: "book", group: "workbench.settings-sections.tools-and-access", order: 60 } },
  // connections: web-connector-settings.ts:14 reads setup; scripts/connectors-settings.ts:43,324-335 reads connector/connected/connection_error.
  { id: "connections", page: "connectors", root: "/capabilities/", title: "workbench.settings-renderer.capabilities", query: "setup connector connected connection_error",
    moved: { connectors: {}, functions: { connector: "typesafe" } }, row: { label: "workbench.settings-sections.service-connections", icon: "link", group: "workbench.settings-sections.tools-and-access", order: 61 } },
  { id: "web-search", title: "workbench.settings-web-search.title", row: { label: "workbench.settings-sections.web-search", icon: "search", group: "workbench.settings-sections.tools-and-access", order: 61.5 } },
  // access (MCP access, the page mcp-action-access.ts:49-51,63 renders): it reads client/client_custom (the client selector), project and
  // q/filter. It does not read format; that is web-mcp-action-settings.ts turning a request into an HTML fragment for its caller.
  { id: "access", page: "mcp", root: "/capabilities/", title: "workbench.settings-renderer.capabilities", query: "client client_custom q filter",
    moved: { mcp: {} }, row: { label: "workbench.settings-sections.external-access", icon: "shield", group: "workbench.settings-sections.tools-and-access", order: 62 } },
  { id: "authorizations", title: "workbench.authorization.manage", query: "view", row: { label: "workbench.authorization.manage", icon: "key", group: "workbench.settings-sections.tools-and-access", order: 62.5 } },
  // history: web-capabilities.ts:27 reads q/kind for it.
  { id: "history", root: "/capabilities/", title: "workbench.settings-renderer.capabilities", help: "call-history", query: "q kind",
    row: { label: "workbench.settings-sections.call-history", icon: "workflow", group: "workbench.settings-sections.tools-and-access", order: 63 } },
  // Every project on this machine: reached from its links (onboarding, a page with no project), not listed as a category.
  { id: "projects", title: "workbench.settings-renderer.project-settings" },
  // 运行 is listed only in the desktop app; its address still opens its page in a browser, which says where the switches are.
  { id: "running", title: "workbench.settings-running.title", row: { label: "workbench.settings-sections.running", icon: "clock", group: "workbench.settings-sections.system", order: 88, desktop: true } },
  { id: "update", title: "workbench.settings-update.title", row: { label: "workbench.settings-sections.update", icon: "download", group: "workbench.settings-sections.system", order: 89 } },
  // diagnostics: web-call-diagnostics.ts:20 reads call.
  { id: "diagnostics", title: "workbench.settings-renderer.diagnostics", query: "call", hash: "#agent-diagnostics", row: { label: "workbench.settings-sections.diagnostics", icon: "bug", group: "workbench.settings-sections.system", order: 90 } },
] as const satisfies readonly PlatformSettingsSection[];

type Declared = (typeof SECTIONS)[number];
/** The page a section is drawn by. */
export type PlatformSettingsPage = Declared extends infer S ? S extends { readonly page: infer P extends string } ? P : S extends { readonly id: infer I extends string } ? I : never : never;
/** A section under /capabilities. */
export type CapabilitySection = Extract<Declared, { readonly root: "/capabilities/" }>["id"];
/** A section with its own row in the directory. */
export type ListedSettingsSection = PlatformSettingsSection & { readonly row: NonNullable<PlatformSettingsSection["row"]> };

export const PLATFORM_SETTINGS_REGISTRY: readonly PlatformSettingsSection[] = SECTIONS;

export const listedSettingsSections = (): readonly ListedSettingsSection[] =>
  PLATFORM_SETTINGS_REGISTRY.filter((section): section is ListedSettingsSection => section.row !== undefined);

export const settingsSectionPage = (section: PlatformSettingsSection): PlatformSettingsPage => (section.page ?? section.id) as PlatformSettingsPage;

const byPage = new Map(PLATFORM_SETTINGS_REGISTRY.map(section => [settingsSectionPage(section) as string, section]));
export const platformSettingsPage = (page: string): PlatformSettingsSection | undefined => byPage.get(page);

/** The address a settings section is served from. */
export function settingsSectionPath(id: string): string {
  return `${PLATFORM_SETTINGS_REGISTRY.find(section => section.id === id)?.root ?? "/settings/"}${id}`;
}

/** The sections served from /capabilities, in the directory's order. */
export const CAPABILITY_SETTINGS_SECTIONS: readonly string[] = PLATFORM_SETTINGS_REGISTRY.filter(section => section.root === "/capabilities/").map(section => section.id);

/** The section an address opens, or null: the platform's own pages only, by their exact address. `rules` is the rule editor inside the library. */
export function platformSettingsAt(pathname: string): { readonly section: PlatformSettingsSection; readonly page: PlatformSettingsPage; readonly rules: boolean } | null {
  const rules = pathname === "/capabilities/rules";
  const section = PLATFORM_SETTINGS_REGISTRY.find(entry => (rules ? entry.id === "library" : settingsSectionPath(entry.id) === pathname));
  return section ? { section, page: settingsSectionPage(section), rules } : null;
}

/** Where a settings address that moved leads: `/settings/<moved>` to its section's address and the parameters it adds. */
export const MOVED_SETTINGS_ADDRESSES: Readonly<Record<string, { readonly path: string; readonly query: Readonly<Record<string, string>> }>> =
  Object.fromEntries(PLATFORM_SETTINGS_REGISTRY.flatMap(section => Object.entries(section.moved ?? {})
    .map(([from, query]) => [`/settings/${from}`, { path: settingsSectionPath(section.id), query }] as const)));

/** The row the directory shows for a page it has no row for: pages reached from links, and the desktop's own page in a browser. */
export const UNLISTED_SETTINGS_ROWS: Readonly<Record<string, string>> = Object.fromEntries(PLATFORM_SETTINGS_REGISTRY
  .filter(section => !section.row || section.row.desktop).map(section => [section.id, section.under ?? section.id]));

const named = (read: (section: PlatformSettingsSection) => string | undefined): Readonly<Record<string, string>> =>
  Object.fromEntries(PLATFORM_SETTINGS_REGISTRY.flatMap(section => {
    const value = read(section);
    return value ? [[section.id, value] as const] : [];
  }));
export const PLATFORM_SETTINGS_QUERY: Readonly<Record<string, string>> = named(section => section.query);
export const PLATFORM_SETTINGS_HASHES: Readonly<Record<string, string>> = named(section => section.hash);

/** A platform settings page's help topic. */
export const platformSettingsHelp = (page: string): string => platformSettingsPage(page)?.help ?? page;

/** Whether a section id or a page is the platform's, so no plugin's settings page may take it. */
const platformNames: ReadonlySet<string> = new Set(PLATFORM_SETTINGS_REGISTRY.flatMap(section => [section.id, settingsSectionPage(section)]));
export const isHostGlobalSettingsSection = (section: string): boolean => platformNames.has(section);

/** A project's own settings pages, in their directory's order. 批准规则 has no row: it is reached from its links. */
export const PLATFORM_PROJECT_SETTINGS_REGISTRY = [
  { id: "general", row: { label: "workbench.settings-directory.general", icon: "tune" } },
  { id: "workspaces", row: { label: "workbench.settings-directory.inputs-and-output", icon: "folder" } },
  { id: "guidance", row: { label: "workbench.settings-directory.project-guidance", icon: "book" } },
  { id: "memory", row: { label: "workbench.settings-directory.memory", standalone: "workbench.settings-navigation.project-memory", icon: "bookmark" } },
  { id: "knowledge", row: { label: "workbench.settings-directory.project-knowledge", icon: "file" } },
  { id: "plugins", row: { label: "workbench.settings-directory.plugins", icon: "package" } },
  { id: "kit", row: { label: "workbench.kit.title", icon: "sparkles" } },
  { id: "characters", row: { label: "workbench.settings-sections.characters", icon: "user" } },
  { id: "grants", row: { label: "workbench.settings-directory.access-and-approvals", icon: "shield" } },
  { id: "rules" },
] as const satisfies readonly { readonly id: string; readonly row?: { readonly label: string; readonly icon: PluginIconName;
  /** Its name where the project is not beside it (the page outside the workbench). */ readonly standalone?: string } }[];
export type ProjectSettingsPage = (typeof PLATFORM_PROJECT_SETTINGS_REGISTRY)[number]["id"];
