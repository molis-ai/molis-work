import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import { defaultAgentRuntime, resolveProjectRuntime, type AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { bindSettingsHandlers, defineSettingsActions, type SettingsOwner, type SettingsOwnerScope, type SettingSnapshot } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { hostErrors } from "./host-errors.js";
import { ProjectRuntimeSettings } from "./project-runtime-settings.js";

export const PROJECT_RUNTIME_KEY = "projects.runtime";
const ownerId = "system.project-runtime";

export const runtimeSettingsActions = defineSettingsActions({
  scope: "project",
  read: { capability_id: "projects.settings.read", version: /* @version action.projects.settings.read */ 1,
    title: "读取项目设置", description: "读取项目运行时、来源和修改版本", permissions: [] },
  write: { capability_id: "projects.settings.write", version: /* @version action.projects.settings.write */ 1,
    title: "修改项目设置", description: "根据已查看的版本选择或恢复项目运行时", permissions: ["projects:settings"] },
});
export const projectRuntimeDeclaration: SettingsDeclaration = {
  entries: [{ key: PROJECT_RUNTIME_KEY, title: { key: "workbench.project-settings-folds.agent-runtime" },
    layers: ["project"], schema: { type: "string", minLength: 1, maxLength: 200 }, consequence: ["reach"] }],
  read: { capability_id: runtimeSettingsActions.read.capability_id, version: runtimeSettingsActions.read.version },
  write: { capability_id: runtimeSettingsActions.write.capability_id, version: runtimeSettingsActions.write.version },
};

export const projectRuntimeSettingOwner = {
  provider_id: ownerId, settings_entries: projectRuntimeDeclaration,
};

export function runtimeSettingSnapshot(key: string, pick: ReturnType<ProjectRuntimeSettings["selection"]>, runtimes: readonly AgentRuntimeDescriptor[]): SettingSnapshot {
    const fallback = defaultAgentRuntime(runtimes)?.runtime_id;
    const selected = pick?.runtime_id ?? null, current = resolveProjectRuntime(runtimes, selected);
    const revision = JSON.stringify([pick?.revision ?? 0, fallback ?? null, current.runtime?.runtime_id ?? null]);
    if (!current.runtime) return { key, revision, state: "unavailable", reason: current.reason };
    return { key, revision, state: "ok", layers: {
      ...(selected === null ? {} : { project: selected }), ...(fallback ? { provider_default: fallback } : {}),
    } };
}

export function projectRuntimeSettingProvider(projectId: string, db: SqliteDatabase,
  directory: () => readonly AgentRuntimeDescriptor[], ready: () => Promise<unknown> | undefined): ActionProviderRegistration {
  const store = new ProjectRuntimeSettings(db);
  const checkScope = (scope: SettingsOwnerScope) => {
    if (scope.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "运行时设置属于另一个项目");
  };
  const snapshot = (key: string) => runtimeSettingSnapshot(key, store.selection(projectId), directory());
  const owner: SettingsOwner = {
    owner_id: ownerId, errors: hostErrors,
    read(scope, keys) { checkScope(scope); return keys.map(snapshot); },
    transaction(scope, run) {
      checkScope(scope);
      return db.transaction(() => run({
        readCurrent: snapshot,
        readReceipt: identity => store.receipt(projectId, scope.actor_id, identity.request_id),
        writeChange({ change }) {
          const value = "set" in change ? change.set : null;
          if (value !== null && typeof value !== "string") throw hostErrors.setting_invalid("运行时标识必须是字符串");
          store.select(projectId, value);
        },
        saveReceipt: (identity, receipt) => store.saveReceipt(projectId, scope.actor_id, identity.request_id, receipt),
      })).immediate();
    },
  };
  const handlers = bindSettingsHandlers(runtimeSettingsActions, projectRuntimeDeclaration, owner);
  const afterDirectoryReady = (binding: ActionHandlerBinding): ActionHandlerBinding => ({ ...binding,
    async handle(caller, input) {
      if (binding === handlers.write && (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.audience !== "user" ||
        caller.actor_kind === "runtime" || caller.host_plugin || caller.delegated_by)) {
        throw new ActionError("actions.forbidden", "只有本人能采用项目运行时设置");
      }
      await ready();
      return binding.handle(caller, input);
    },
  });
  return { provider: { provider_id: ownerId, title: "项目运行时", kind: "system", project_id: projectId },
    definitions: [runtimeSettingsActions.read, runtimeSettingsActions.write],
    handlers: [afterDirectoryReady(handlers.read), afterDirectoryReady(handlers.write)] };
}
