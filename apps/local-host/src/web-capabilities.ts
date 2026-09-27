import { HOME_TALK_PERMISSIONS } from "./home-talk-actions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { SCHEDULE_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-schedule";
import { SHELF_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";
import { EXPERIMENTS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-experiments";
import { WORKFLOWS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-workflows";
import { CONNECTOR_ACCOUNT_PERMISSIONS } from "./connector-account-actions.js";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { EXTERNAL_MCP_PERMISSION } from "./external-mcp-actions.js";
import type { CapabilitiesView, CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import { INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { actionUsageActions, type ActionUsagesResult } from "./action-usage-actions.js";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

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
  const reference = project ? molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id }) : undefined;
  // Same local-user grants as the existing Inbox/Functions HTTP composition; never from query parameters.
  const builtinPermissions = [...COGNIA_ACTION_PERMISSIONS, ...JELLY_ACTION_PERMISSIONS, ...CONNECTOR_ACCOUNT_PERMISSIONS, ...SHELF_ACTION_PERMISSIONS, ...EXPERIMENTS_ACTION_PERMISSIONS, ...(reference ? [...WORK_ACTION_PERMISSIONS, ...HOME_ACTION_PERMISSIONS, ...HOME_TALK_PERMISSIONS, ...INBOX_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, ...LINGGUANG_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, ...SCHEDULE_ACTION_PERMISSIONS, ...WORKFLOWS_ACTION_PERMISSIONS, EXTERNAL_MCP_PERMISSION, "functions:manage", "projects:settings"] : ["functions:invoke", "functions:manage"])];
  const model: CapabilitiesView = { section, actions: [], query: url.searchParams.get("q") ?? "", kind: url.searchParams.get("kind") ?? "" };
  if (section === "library") {
    const caller = await localWebActionContext(host, reference, builtinPermissions);
    const actions = await (reference ? host.actionClient(reference) : host.homeActionClient()).discover(caller);
    const selectedId = url.searchParams.get("action");
    const selected = actions.find(item => item.capability_id === selectedId && item.version === Number(url.searchParams.get("version")));
    const scenes = host.sceneClient(reference);
    const client = reference ? host.actionClient(reference) : host.homeActionClient();
    // Where it is used comes from the owners of saved references, through the same query MCP and Agents use.
    const reported = selected ? await client.invoke(caller, actionUsageActions.read, { action: { capability_id: selected.capability_id, version: selected.version, provider_id: selected.provider.provider_id } })
      .catch((error: unknown) => ({ usages: [], issues: [error instanceof Error ? error.message : "暂时无法读取使用位置"] })) as ActionUsagesResult : undefined;
    return { ...model, actions, selected,
      ...(selectedId && !selected ? { selection_error: "引用的能力或版本已不可访问，请检查插件状态、权限或重新选择。" } : {}),
      ...(selected ? { offered_in: offeredIn(actions, selected), reported_usages: reported!.usages, usage_issues: reported!.issues } : {}),
      ...(selected?.action.kind === "judgment" ? {
        scenes: await scenes.discoverScenes(caller, selected), usages: await scenes.usages(caller, selected),
      } : {}),
    };
  }
  if (section === "history") {
    model.calls = host.callLog?.list(project ? project.project_id : null) ?? [];
    const store = openFunctionsStore(homeDirectory);
    try {
      // Existing scene records use board_id; direct action invocations use canonical project_id.
      model.history = store.listJudgments().filter(row => project
        ? row.subject.board_id === project.board_id || row.subject.board_id === project.project_id
        : !row.subject.board_id);
    } finally { store.close(); }
  }
  return model;
}
