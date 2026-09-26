import { HOME_TALK_PERMISSIONS } from "./home-talk-actions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import type { CapabilitiesView, CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import { INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Read models are derived from the same Host clients used by actual consumers. */
export async function capabilitiesView(options: {
  section: CapabilitySection; url: URL; homeDirectory: string; host: MolisWorkLocalHost; withCatalog: LocalWebCatalogRunner;
}): Promise<CapabilitiesView> {
  const { section, url, homeDirectory, host, withCatalog } = options;
  const projectId = url.searchParams.get("project") || null;
  const project = projectId && (section === "library" || section === "history") ? await withCatalog({ homeDirectory }, catalog => catalog.getProject(projectId)) : null;
  const reference = project ? molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id }) : undefined;
  // Same local-user grants as the existing Inbox/Functions HTTP composition; never from query parameters.
  const builtinPermissions = [...COGNIA_ACTION_PERMISSIONS, ...JELLY_ACTION_PERMISSIONS, ...(reference ? [...WORK_ACTION_PERMISSIONS, ...HOME_ACTION_PERMISSIONS, ...HOME_TALK_PERMISSIONS, ...INBOX_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, ...LINGGUANG_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, "functions:manage"] : ["functions:invoke", "functions:manage"])];
  const model: CapabilitiesView = { section, actions: [], query: url.searchParams.get("q") ?? "", kind: url.searchParams.get("kind") ?? "" };
  if (section === "library") {
    const caller = await localWebActionContext(host, reference, builtinPermissions);
    const actions = await (reference ? host.actionClient(reference) : host.homeActionClient()).discover(caller);
    const selectedId = url.searchParams.get("action");
    const selected = actions.find(item => item.capability_id === selectedId && item.version === Number(url.searchParams.get("version")));
    const scenes = host.sceneClient(reference);
    return { ...model, actions, selected,
      ...(selectedId && !selected ? { selection_error: "引用的能力或版本已不可访问，请检查插件状态、权限或重新选择。" } : {}),
      ...(selected?.action.kind === "judgment" ? {
        scenes: await scenes.discoverScenes(caller, selected), usages: await scenes.usages(caller, selected),
      } : {}),
    };
  }
  if (section === "history") {
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
