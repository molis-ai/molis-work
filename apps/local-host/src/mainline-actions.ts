import { ActionError, bindActionHandler, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { heldHomeSqlite } from "@molis-ai/molis-work-storage";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { scopeInstallations } from "./scope-installations.js";
import { MAINLINE_PROVIDER_ID, mainlineActions, mainlineItemActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { MainlineStore, completeItem, convertItem, createItem, decideBackgroundTask, editGroups, holdsBind, holdsCandidates, holdsCreate, holdsList, holdsRelease, moveItem, MAINLINE_BASELINE, MAINLINE_HOME_STORE,
  openObject, placeTask, readBackgroundTasks, readContents, readItemTasks, readItemSubject, readMainline, readWaiting, readWorkLine, removeItem, renameItem, runBackgroundTaskCommand, switchItem,
  type ItemDeclaration, type MainlineItemPorts } from "@molis-ai/molis-work-service-mainline";

/** What the Host gives the work items: the Home that keeps the store, and the installations a call's project reaches with their Manifests. */
export interface MainlineHostPorts {
  homeDirectory: string;
  /** The presentation declarations of the enabled installations the caller's project reaches, each owned by the plugin whose Manifest it is. */
  declarations(caller: ActionCallContext): Promise<readonly ItemDeclaration[]>;
}

/**
 * The Host's ports over its trusted catalog: the item sources of a project are what its reachable installations' Manifests declare,
 * each owned by that installation's plugin and called under the provider it runs as (the plugin id for one the Host vouches for, its
 * install identity otherwise); a disabled, quarantined or removed installation declares none.
 */
export function mainlineHost(homeDirectory: string, plugins: ProjectPluginHost): MainlineHostPorts {
  return { homeDirectory, declarations: async caller => {
    const { installations } = await scopeInstallations(plugins, caller);
    return installations.filter(({ record }) => !["disabled", "quarantined", "uninstalled"].includes(record.state))
      .flatMap(({ record, manifest }) => (manifest?.presentation?.objects ?? []).map(object => ({ ...object, owner: record.plugin_id,
        provider_id: record.publisher_trust === "host" ? record.plugin_id : record.install_id })));
  } };
}

/** The person's own store in the caller's project: the owner and the project come from the call, never from its input. */
export function mainlineItemPorts(host: MainlineHostPorts): MainlineItemPorts {
  return {
    open: caller => {
      if (!caller.project_id) throw new ActionError("actions.project_required", "主线在项目里读写");
      // The Home's one held connection: borrowed for the call, never closed by it (batch 103-1).
      return new MainlineStore(heldHomeSqlite(host.homeDirectory, MAINLINE_HOME_STORE.path, MAINLINE_BASELINE), caller.actor_id, caller.project_id);
    },
    declarations: caller => host.declarations(caller),
  };
}

/**
 * The mainline service in the Host (specs/work-line §5–§6, specs/work-mainline), registered once as `system.mainline`: every call is
 * answered by `horizontal/mainline` through the caller's own client, so the directory, the grants and the diagnostics are the caller's.
 * Without a Home there are no work items: their actions are left out and a line read for one item is refused.
 */
export function mainlineProvider(clientFor: (caller: ActionCallContext) => ActionClient, host?: MainlineHostPorts): ActionProviderRegistration {
  const items = host ? mainlineItemPorts(host) : undefined;
  const tasks = (caller: ActionCallContext) => (directory: Parameters<typeof readItemTasks>[2]) => readItemTasks(caller, clientFor(caller), directory);
  const itemHandlers = items ? [
    bindActionHandler(mainlineItemActions.read, (input, caller) => readMainline(caller, clientFor(caller), items, input, tasks(caller))),
    bindActionHandler(mainlineItemActions.subject, (input, caller) => readItemSubject(caller, clientFor(caller), items, input)),
    bindActionHandler(mainlineItemActions.create, (input, caller) => createItem(caller, clientFor(caller), items, input)),
    bindActionHandler(mainlineItemActions.convert, (input, caller) => convertItem(caller, clientFor(caller), items, input)),
    bindActionHandler(mainlineItemActions.rename, (input, caller) => renameItem(caller, items, input)),
    bindActionHandler(mainlineItemActions.move, (input, caller) => moveItem(caller, items, input)),
    bindActionHandler(mainlineItemActions.complete, (input, caller) => completeItem(caller, items, input)),
    bindActionHandler(mainlineItemActions.remove, (input, caller) => removeItem(caller, items, input)),
    bindActionHandler(mainlineItemActions.groups, (input, caller) => editGroups(caller, items, input)),
    bindActionHandler(mainlineItemActions.switch, (input, caller) => switchItem(caller, items, input)),
    bindActionHandler(mainlineItemActions.contents, (input, caller) => readContents(caller, clientFor(caller), items, input)),
    bindActionHandler(mainlineItemActions.holdsList, (input, caller) => holdsList(caller, items, input)),
    bindActionHandler(mainlineItemActions.holdsBind, (input, caller) => holdsBind(caller, clientFor(caller), items, input)),
    bindActionHandler(mainlineItemActions.holdsRelease, (input, caller) => holdsRelease(caller, items, input)),
    bindActionHandler(mainlineItemActions.holdsCandidates, (input, caller) => holdsCandidates(caller, items, input)),
    bindActionHandler(mainlineItemActions.holdsCreate, (input, caller) => holdsCreate(caller, clientFor(caller), items, input)),
  ] : [];
  return { provider: { provider_id: MAINLINE_PROVIDER_ID, title: "事项线与后台任务", kind: "system" },
    definitions: [mainlineActions.line, mainlineActions.waiting, mainlineActions.place, mainlineActions.tasks, mainlineActions.command, mainlineActions.decide, mainlineActions.open,
      ...(items ? Object.values(mainlineItemActions) : [])],
    handlers: [
      bindActionHandler(mainlineActions.line, (input, caller) => readWorkLine(caller, clientFor(caller), input, items)),
      bindActionHandler(mainlineActions.waiting, (input, caller) => readWaiting(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.place, (input, caller) => placeTask(caller, clientFor(caller), input, items)),
      bindActionHandler(mainlineActions.tasks, (_input, caller) => readBackgroundTasks(caller, clientFor(caller))),
      bindActionHandler(mainlineActions.command, (input, caller) => runBackgroundTaskCommand(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.decide, (input, caller) => decideBackgroundTask(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.open, (input, caller) => openObject(caller, clientFor(caller), input)),
      ...itemHandlers,
    ] };
}
