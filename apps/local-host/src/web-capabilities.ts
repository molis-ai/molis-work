import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { CapabilitiesView, CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import { functionContextActions } from "@molis-ai/molis-work-module-judgment-rules";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { actionUsageActions, type ActionUsagesResult } from "./action-usage-actions.js";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { localeMessageArguments, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { registeredBuiltinText, workbenchPlatformText } from "./ui-text-provider.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { currentLocale } from "./web-locale.js";

/** The existing discovery already distinguishes a Host-built provider from any installed or external one. */
function libraryTitles(actions: readonly ActionView[]): ReadonlyMap<ActionView, string> {
  const titles = new Map<ActionView, string>(), readers = new Map<string, PluginTextReader | null>(), locale = currentLocale();
  for (const view of actions) {
    const { kind, provider_id, plugin_id } = view.provider, identity = JSON.stringify([kind, provider_id, plugin_id]);
    if (!readers.has(identity)) {
      // Only Host-built Runtime definitions and the existing Alchemist assembly use their Manifest ID as provider ID.
      const manifest = kind === "plugin" && provider_id === plugin_id
        ? PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === plugin_id)?.manifest : undefined;
      readers.set(identity, kind === "system" ? workbenchPlatformText : manifest ? registeredBuiltinText(manifest) : null);
    }
    const reader = readers.get(identity);
    if (!reader) continue;
    const scope = kind === "system" ? provider_id.replaceAll(".", "-") + "--" : "";
    // The approved display entries are keyed to their exact capability versions.
    const key = `${textKeyPrefix(reader.owner)}.capability-library.${scope}${view.capability_id.replaceAll(".", "-")}-v${view.version}.title`;
    const selected = locale ? reader.pack(locale) : null;
    const message = selected?.messages[key] ?? reader.pack(reader.default)?.messages[key];
    if (typeof message === "string" && localeMessageArguments(message).length === 0) titles.set(view, message);
  }
  return titles;
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
      .catch((error: unknown) => ({ usages: [], issues: [error instanceof Error ? error.message : "暂时无法读取使用位置"] })) as ActionUsagesResult : undefined;
    return { ...model, actions, selected, library_titles: libraryTitles(actions),
      ...(selectedId && !selected ? { selection_error: "引用的能力或版本已不可访问，请检查插件状态、权限或重新选择。" } : {}),
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
