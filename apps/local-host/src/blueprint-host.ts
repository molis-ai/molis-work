import { EventEmitter } from "node:events";
import { ActionError, requireSynchronous, retainActionAuthority, type ActionCallContext, type ActionClient, type ActionExecutionContext,
  type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SettingsDeclaration, SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { blueprintsErrors, type BlueprintAdoptionTarget } from "@molis-ai/molis-work-contracts/services/blueprints";
import { resolveEffectiveSetting } from "@molis-ai/molis-work-plugin-sdk";
import { blueprintProvider, type AdoptionProgress, type DiscoveredSetting, type SettingBinding, type SettingsAccess } from "@molis-ai/molis-work-service-blueprints";
import { projectRuntimeSettingOwner, runtimeSettingSnapshot } from "./project-runtime-setting-actions.js";
import { restrictLocalCallerToHome } from "./local-web-actions.js";
import { systemSettingOwners } from "./system-setting-owners.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { appearanceLocale } from "./web-locale.js";

const changes = new WeakMap<MolisWorkLocalHost, EventEmitter>();
export function onBlueprintProgress(host: MolisWorkLocalHost, actor: string, previewId: string, notify: (progress: AdoptionProgress) => void) {
  const events = changes.get(host);
  if (!events) throw blueprintsErrors.dependency_unmet("未连接场景服务");
  const key = JSON.stringify([actor, previewId]);
  events.on(key, notify);
  return () => events.off(key, notify);
}

function binding(providerId: string, projectScoped: boolean, declaration: SettingsDeclaration, install?: { install_id: string; installation_generation: string }): SettingBinding {
  return { provider_id: providerId, project_scoped: projectScoped,
    read: { ...declaration.read, provider_id: providerId }, write: { ...declaration.write, provider_id: providerId },
    ...(install && { install_id: install.install_id, generation: install.installation_generation }) };
}

function validateCaller(caller: ActionExecutionContext) {
  requireSynchronous(caller.assert_authority_current?.(), "场景操作的最终检查必须同步完成");
  caller.signal?.throwIfAborted();
}

export function hostBlueprints(home: string, host: MolisWorkLocalHost, catalog: () => LocalWebCatalogRunner | undefined,
  clientFor: (caller: ActionCallContext) => ActionClient, runtimes: () => Promise<readonly AgentRuntimeDescriptor[]>,
  clock: () => Date) {
  const events = new EventEmitter();
  changes.set(host, events);
  async function access(caller: ActionExecutionContext, project: string | null, preview?: BlueprintAdoptionTarget): Promise<SettingsAccess> {
    if (project && project !== caller.project_id) throw new ActionError("actions.scope_mismatch", "请回到这次采用的目标项目");
    const origin = retainActionAuthority(caller, caller.current_action!);
    // A personal target, or a preview before its project exists, reads at Home. Keep the origin's restrictions and
    // check the actual Home authority too: identical installation ids in a project and at Home have separate grants.
    const nested: ActionCallContext = !project && caller.project_id ? await restrictLocalCallerToHome(host, origin)
      : { ...origin, project_id: project, user_action: undefined };
    const client = clientFor(nested);
    const reference = project ? host.projects().find(item => item.project_id === project) : undefined;
    const directory = await client.discover(nested);
    const state = reference && await host.projectActionInstallations(reference);
    const installation = (candidate: SettingBinding) => {
      const id = candidate.install_id;
      return id ? candidate.project_scoped ? state?.get(id) : host.homePlugins?.installation(id) : undefined;
    };
    const assertOwner = (candidate: SettingBinding) => {
      validateCaller(caller);
      if (!candidate.install_id) return;
      const current = installation(candidate);
      if (!current || current.execution !== "host" || current.state !== "running" || current.installation_generation !== candidate.generation)
        throw blueprintsErrors.dependency_unmet("原设置主人已停用、更换或不支持采用");
    };
    const discovered: DiscoveredSetting[] = [];
    const add = (owner: SettingBinding, declaration: SettingsDeclaration, text_owner: string, unavailable?: string) => {
      for (const entry of declaration.entries) discovered.push({ entry, binding: owner, text_owner, ...(unavailable && { unavailable }) });
    };
    const listed = new Set<string>();
    for (const view of directory) {
      const { provider } = view, id = provider.provider_id;
      const providerKey = JSON.stringify([id, provider.project_id ?? null]);
      if (provider.project_id && provider.project_id !== project || listed.has(providerKey)) continue;
      listed.add(providerKey);
      let declaration: SettingsDeclaration | undefined, owner: SettingBinding | undefined;
      if (provider.kind === "system") {
        declaration = systemSettingOwners.find(record => record.provider_id === id)?.settings_entries;
        if (declaration) owner = binding(id, Boolean(provider.project_id), declaration);
      } else if (provider.kind === "plugin" && provider.plugin_install_id && provider.plugin_id) {
        const projectScoped = !!provider.project_id;
        const install = projectScoped ? state?.get(provider.plugin_install_id) : host.homePlugins?.installation(provider.plugin_install_id);
        const manifest = projectScoped ? state?.manifest(provider.plugin_install_id) : host.homePlugins?.manifest(provider.plugin_id);
        declaration = manifest?.settings_entries;
        if (install?.execution === "host" && install.state === "running" && install.plugin_id === provider.plugin_id && declaration)
          owner = binding(id, projectScoped, declaration, install);
      }
      if (!declaration || !owner) continue;
      const unavailable = (action: ExactActionReference) => {
        const view = directory.find(v => v.provider.provider_id === id && v.provider.project_id === provider.project_id
          && v.capability_id === action.capability_id && v.version === action.version);
        if (!view) return "当前调用无法使用这项设置";
        return view.availability.available ? undefined : view.availability.reason;
      };
      add(owner, declaration, provider.plugin_id ?? "workbench", unavailable(owner.read) ?? unavailable(owner.write));
    }
    const defaults = preview?.kind === "new_project" ? await runtimes() : null;
    if (defaults) add(binding(projectRuntimeSettingOwner.provider_id, true, projectRuntimeSettingOwner.settings_entries), projectRuntimeSettingOwner.settings_entries, "workbench");
    const invoke = async (candidate: SettingBinding, action: ExactActionReference, input: unknown): Promise<SettingsValues> => {
      assertOwner(candidate);
      const guarded = { ...nested, assert_authority_current: (ref?: Parameters<NonNullable<ActionCallContext["assert_authority_current"]>>[0], required?: readonly string[]) => {
        nested.assert_authority_current?.(ref, required); assertOwner(candidate);
      } };
      const result = await client.invoke(guarded, action, input) as SettingsValues;
      assertOwner(candidate);
      return result;
    };
    return {
      discover: async () => discovered,
      read: async (owner, keys) => defaults && owner.provider_id === projectRuntimeSettingOwner.provider_id
        ? keys.map(key => resolveEffectiveSetting(runtimeSettingSnapshot(key, undefined, defaults))) : (await invoke(owner, owner.read, { keys })).values,
      write: async (owner, input) => (await invoke(owner, owner.write, input)).values[0]!,
    };
  }
  return blueprintProvider({ home, now: clock, locale: () => appearanceLocale().tag, access,
    notify: (actor, progress) => { events.emit(JSON.stringify([actor, progress.preview_id]), progress); },
    ensureProject: async (caller, id, displayName) => {
      const run = catalog();
      if (!run) throw blueprintsErrors.dependency_unmet("项目目录暂不可用");
      await run({ homeDirectory: home }, db => db.createProject({ project_id: id, display_name: displayName, actor_id: caller.actor_id }, () => validateCaller(caller)));
    },
  });
}
