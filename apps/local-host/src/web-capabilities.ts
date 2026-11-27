import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { CapabilitiesView, CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import { functionContextActions } from "@molis-ai/molis-work-module-judgment-rules";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { actionUsageActions, type ActionUsagesResult } from "./action-usage-actions.js";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { resolveManifestText } from "@molis-ai/molis-work-plugin-runtime";
import { localeMessageArguments, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { currentInstalledPluginHost } from "./installed-plugin-host.js";
import { manifestWordResolver, registeredBuiltinText, workbenchPlatformText } from "./ui-text-provider.js";
import { localizeWebErrorMessage, readWorkbenchText } from "./ui-error-words.js";
import { shippedParts } from "./plugin-registry.js";
import { activeLocale, currentLocale } from "./web-locale.js";

/** Collect locale readers for installed project packages so sandboxed/pinned actions render in the active language alongside built-ins. */
export async function projectActionLocaleReaders(
  host: Partial<Pick<MolisWorkLocalHost, "withProject">>,
  reference?: LocalHostProjectReference,
): Promise<ReadonlyMap<string, PluginTextReader | null>> {
  const readers = new Map<string, PluginTextReader | null>();
  if (!reference || !host.withProject) return readers;
  await host.withProject(reference, runtime => {
    const installedHost = currentInstalledPluginHost(runtime.store, runtime.project_id);
    if (!installedHost) return;
    for (const record of installedHost.records()) {
      readers.set(record.plugin_id, installedHost.releaseFor(record.plugin_id)?.packaged?.localePacks ?? null);
    }
  }).catch(() => undefined);
  return readers;
}

/** Resolve localized action titles, descriptions, and provider names from `*_text` declarations (falling back to capability-library keys and raw fields). */
export function resolveActionLibraryWords(
  actions: readonly ActionView[],
  options: {
    readonly host?: Pick<MolisWorkLocalHost, "homePlugins">;
    readonly projectReaders?: ReadonlyMap<string, PluginTextReader | null>;
    readonly locale?: string | null;
    readonly libraryKeyTitles?: boolean;
  } = {},
): {
  readonly titles: ReadonlyMap<ActionView, string>;
  readonly descriptions: ReadonlyMap<ActionView, string>;
  readonly providers: ReadonlyMap<ActionView, string>;
} {
  const titles = new Map<ActionView, string>();
  const descriptions = new Map<ActionView, string>();
  const providers = new Map<ActionView, string>();
  const readers = new Map<string, PluginTextReader | null>();
  const locale = options.locale ?? activeLocale() ?? currentLocale();
  const useLibraryKeyTitles = options.libraryKeyTitles !== false;
  for (const view of actions) {
    const { kind, provider_id, plugin_id } = view.provider;
    const identity = JSON.stringify([kind, provider_id, plugin_id]);
    if (!readers.has(identity)) {
      let reader: PluginTextReader | null = null;
      if (kind === "system") {
        reader = workbenchPlatformText;
      } else if (kind === "plugin" && plugin_id) {
        // Host-built Runtime definitions use their Manifest ID as provider ID; installed packages read from project/Home release packs.
        const manifest = provider_id === plugin_id
          ? shippedParts().find(entry => entry.manifest.plugin_id === plugin_id)?.manifest
          : undefined;
        reader = manifest
          ? registeredBuiltinText(manifest)
          : options.projectReaders?.get(plugin_id) ?? options.host?.homePlugins?.packageStage(plugin_id)?.packaged?.localePacks ?? null;
      }
      readers.set(identity, reader);
    }
    const reader = readers.get(identity) ?? null;
    const owner = kind === "system" ? "workbench" : plugin_id ?? provider_id;
    const resolve = manifestWordResolver(reader, locale);
    if (view.action.title_text !== undefined) {
      titles.set(view, resolveManifestText(owner, view.action.title, view.action.title_text, resolve));
    } else if (useLibraryKeyTitles && reader) {
      const scope = kind === "system" ? provider_id.replaceAll(".", "-") + "--" : "";
      // The approved display entries are keyed to their exact capability versions.
      const key = `${textKeyPrefix(reader.owner)}.capability-library.${scope}${view.capability_id.replaceAll(".", "-")}-v${view.version}.title`;
      const selected = locale ? reader.pack(locale) : null;
      const message = selected?.messages[key] ?? reader.pack(reader.default)?.messages[key];
      if (typeof message === "string" && localeMessageArguments(message).length === 0) titles.set(view, message);
    }
    if (view.action.description_text !== undefined) {
      descriptions.set(view, resolveManifestText(owner, view.action.description, view.action.description_text, resolve));
    }
    if (view.provider.title_text !== undefined) {
      const ref = view.provider.title_text;
      const name = "literal" in ref ? ref.literal : resolve?.(ref, view.provider.title) ?? view.provider.title;
      providers.set(view, name);
    }
  }
  return { titles, descriptions, providers };
}

/** Home event actions that name this capability as one of their declared offers. */
function offeredIn(directory: readonly ActionView[], selected: ActionView): { provider: string; title: string }[] {
  return directory.flatMap(view => view.provider.provider_id !== selected.provider.provider_id ? [] : (view.action.subject_offer_choices ?? [])
    .filter(choice => choice.action.capability_id === selected.capability_id && choice.action.version === selected.version)
    .map(choice => ({ provider: view.provider.title, title: choice.title })));
}

/** Read models are derived from the same Host clients used by actual consumers. */
export async function capabilitiesView(options: {
  section: CapabilitySection; url: URL; homeDirectory: string; host: MolisWorkLocalHost; withCatalog: LocalWebCatalogRunner;
}): Promise<CapabilitiesView> {
  const { section, url, homeDirectory, host, withCatalog } = options;
  const projectId = url.searchParams.get("project") || null;
  const project = projectId && (section === "library" || section === "history") ? await withCatalog({ homeDirectory }, catalog => catalog.getProject(projectId)) : null;
  const reference = project ? molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }) : undefined;
  // The local owner's permissions come from the native manifests; Runtime plugins add their installed grants. Never from query parameters.
  const builtinPermissions = LOCAL_OWNER_PERMISSIONS;
  const model: CapabilitiesView = { section, actions: [], query: url.searchParams.get("q") ?? "", kind: url.searchParams.get("kind") ?? "" };
  const callerFor = () => localWebActionContext(host, reference, builtinPermissions);
  if (section === "library") {
    const caller = await callerFor();
    const actions = await (reference ? host.actionClient(reference) : host.homeActionClient()).discover(caller);
    const selectedId = url.searchParams.get("action");
    const selected = actions.find(item => item.capability_id === selectedId && item.version === Number(url.searchParams.get("version")));
    const scenes = host.sceneClient(reference);
    const client = reference ? host.actionClient(reference) : host.homeActionClient();
    // Where it is used comes from the owners of saved references, through the same query MCP and Agents use.
    const reported = selected ? await client.invoke(caller, actionUsageActions.read, { action: { capability_id: selected.capability_id, version: selected.version, provider_id: selected.provider.provider_id } })
      .catch((error: unknown) => ({ usages: [], issues: [localizeWebErrorMessage(error, "common.error.unavailable")] })) as ActionUsagesResult : undefined;
    const projectReaders = await projectActionLocaleReaders(host, reference);
    const words = resolveActionLibraryWords(actions, { host, projectReaders });
    return { ...model, actions, selected, library_titles: words.titles, library_descriptions: words.descriptions, library_providers: words.providers,
      ...(selectedId && !selected ? { selection_error: readWorkbenchText("workbench.capabilities.capability-selection-unavailable") } : {}),
      ...(selected ? { offered_in: offeredIn(actions, selected), reported_usages: reported!.usages, usage_issues: reported!.issues } : {}),
      ...(selected?.action.kind === "judgment" ? {
        scenes: await scenes.discoverScenes(caller, selected), usages: await scenes.usages(caller, selected),
      } : {}),
    };
  }
  if (section === "history") {
    model.calls = host.callLog?.list(project ? project.project_id : null) ?? [];
    const caller = await callerFor();
    const client = reference ? host.actionClient(reference) : host.homeActionClient();
    model.history = (await client.invoke(caller, functionContextActions.history, {}) as { judgments: NonNullable<CapabilitiesView["history"]> }).judgments;
  }
  return model;
}
