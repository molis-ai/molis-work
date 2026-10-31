import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstalledPermissionView, PluginInstalledView, PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { assertHomePluginPermissionSettingsEntry, assertPluginConsentSettingsEntry, assertPluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import type { PluginInstallPreviewResult, PluginInstallService } from "./plugin-install-service.js";

// Installing a plugin from a signed package, as the person's own act (ac-trust T2, specs/repository-anti-corruption/slices/ac-trust-install.md
// §3.1, S-84). The audience is `user` and the writing handlers want the protected entry's `user_action`, so an Agent, MCP, a workflow
// or a plugin can neither start an install nor confirm one (nor pin a publisher by confirming). The package is verified at the preview
// and not trusted again after it: confirming takes only a preview the Host made for this person in this project.

export const PLUGIN_INSTALL_PROVIDER_ID = "plugin-install";
export const PLUGIN_INSTALL_READ = "plugin-install:read";
export const PLUGIN_INSTALL_WRITE = "plugin-install:write";
export const PLUGIN_INSTALL_PERMISSIONS = [PLUGIN_INSTALL_READ, PLUGIN_INSTALL_WRITE];

const metadata = { audiences: ["user"], subject_kinds: [] } as const;
const text = { type: "string" };
const effects = { type: "object", additionalProperties: { type: "array", items: text } };
const pinView = {
  type: "object", additionalProperties: false, required: ["key_id", "public_key_spki_base64", "label", "pinned_at", "pinned_by", "revoked_at"],
  properties: { key_id: text, public_key_spki_base64: text, label: text, pinned_at: text, pinned_by: text, revoked_at: { type: ["string", "null"] } },
};

const installedPermissionView = { type: "object", additionalProperties: false, required: ["permission", "required", "reason", "meaning", "granted"],
  properties: { permission: text, required: { type: "boolean" }, reason: text, meaning: { type: ["string", "null"] }, granted: { type: "boolean" } } };
const permissionSwitch = {
  input_schema: { type: "object", properties: { install_id: { type: "string", minLength: 1, maxLength: 200 }, permission: { type: "string", minLength: 1, maxLength: 200 }, granted: { type: "boolean" } },
    required: ["install_id", "permission", "granted"], additionalProperties: false },
  output_schema: { type: "object", additionalProperties: false, required: ["install_id", "permissions", "changed"], properties: { install_id: text, changed: { type: "boolean" },
    permissions: { type: "array", items: installedPermissionView } } },
} as const;
type PermissionSwitch = ActionDefinition<{ install_id: string; permission: string; granted: boolean }, { install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }>;
const consentRow = {
  type: "object", additionalProperties: false, required: ["consent_id", "plugin_id", "publisher_signature", "kind", "subject", "manifest_digest", "granted_at", "granted_by", "revoked_at"],
  properties: { consent_id: text, plugin_id: text, publisher_signature: text, kind: { enum: ["always_on", "default_wiring", "default_group", "local_directory"] }, subject: text, manifest_digest: text,
    granted_at: text, granted_by: { enum: ["user", "host_build"] }, revoked_at: { type: ["string", "null"] } },
};
const installedView = {
  type: "object", additionalProperties: false,
  required: ["install_id", "plugin_id", "name", "version", "state", "trust", "publisher_signature", "publisher_label", "manifest_available", "permissions", "jobs", "consents", "recovery_error"],
  properties: { install_id: text, plugin_id: text, name: text, version: text, state: text, trust: { enum: ["host", "pinned", "unsigned"] }, publisher_signature: text,
    publisher_label: { type: ["string", "null"] }, manifest_available: { type: "boolean" }, permissions: { type: "array", items: installedPermissionView },
    jobs: { type: "array", items: { type: "object", additionalProperties: false, required: ["job_id", "reason", "permissions"], properties: { job_id: text, reason: text, permissions: { type: "array", items: text } } } },
    consents: { type: "array", items: consentRow }, recovery_error: { type: ["string", "null"] } },
};

export const pluginInstallActions = {
  preview: { capability_id: "plugins.install.preview", version: 3, operation: "command", action: { ...metadata, scope: "project",
    title: "预览插件包的安装", description: "检查一个签名的沙箱插件包：签名、发布者、包的格式，并说明装上它意味着什么（它要的权限、发布者有没有被固定）；不安装、不固定发布者。包不合格在这里就被拒，什么也不写。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { bundle: { type: "object" } }, required: ["bundle"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["preview_id", "name", "runtime_scope", "preview", "effects", "publisher"], properties: {
      preview_id: text, name: text, runtime_scope: { enum: ["home", "project"] }, effects,
      publisher: { type: "object", additionalProperties: false, required: ["key_id", "pinned_label"], properties: { key_id: text, pinned_label: { type: ["string", "null"] } } },
      origins: { type: "array", items: { type: "object", additionalProperties: false, required: ["service_id", "title", "origins"], properties: { service_id: text, title: text, origins: { type: "array", items: text } } } },
      preview: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "trust", "publisher_signature", "publisher_pinned", "permissions", "declarations", "jobs"], properties: {
        plugin_id: text, version: text, trust: { enum: ["host", "pinned", "unsigned"] }, publisher_signature: text, publisher_pinned: { type: "boolean" },
        permissions: { type: "array", items: { type: "object", required: ["permission", "required", "reason", "meaning"], properties: { permission: text, required: { type: "boolean" }, reason: text, meaning: { type: ["string", "null"] } }, additionalProperties: false } },
        jobs: { type: "array", items: { type: "object", required: ["job_id", "reason", "permissions"], properties: { job_id: text, reason: text, permissions: { type: "array", items: text } }, additionalProperties: false } },
        declarations: { type: "array", items: { type: "object", required: ["kind", "subject", "summary"], properties: { kind: text, subject: text, summary: text }, additionalProperties: false } } } } } } } } as ActionDefinition<{ bundle: unknown }, PluginInstallPreviewResult>,
  confirm: { capability_id: "plugins.install.confirm", version: 1, operation: "command", action: { ...metadata, scope: "project",
    title: "确认安装插件包", description: "安装一次预览里看过的包：确认它要的权限；这个发布者还没被固定时，给出名称才会固定它（固定是本人对这个发布者的信任，之后它签的包都按这个信任安装）。预览用过一次就作废。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { preview_id: { type: "string", minLength: 1, maxLength: 80 }, consent: { type: "boolean" }, pin_label: { type: "string", minLength: 1, maxLength: 80 } },
      required: ["preview_id", "consent"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "publisher_key_id"], properties: { plugin_id: text, version: text, publisher_key_id: text } } } } as ActionDefinition<
    { preview_id: string; consent: boolean; pin_label?: string }, { plugin_id: string; version: string; publisher_key_id: string }>,
  publishers: { capability_id: "plugins.publishers.list", version: 1, operation: "query", action: { ...metadata, scope: "home",
    title: "查看已固定的发布者", description: "列出本人固定过的插件发布者（含已撤销的）：公钥指纹、名称、固定与撤销的时间。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["publishers"], properties: { publishers: { type: "array", items: pinView } } } } } as ActionDefinition<Record<string, never>, { publishers: unknown[] }>,
  revokePublisher: { capability_id: "plugins.publishers.revoke", version: 1, operation: "command", action: { ...metadata, scope: "home",
    title: "撤销对发布者的信任", description: "撤销本机对一个发布者的信任：它签的包不能再安装，已经装进任何项目的它的插件马上不能再做任何事、随后停用，数据保留，之后只能卸载；撤销不能撤回，要再信任它得换一个发布者密钥。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { key_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["key_id"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["publisher"], properties: { publisher: pinView } } } } as ActionDefinition<{ key_id: string }, { publisher: PluginPublisherPin }>,
  setPermission: { capability_id: "plugins.permissions.set", version: 1, operation: "command", action: { ...metadata, scope: "project",
    title: "开关插件的一项可选权限", description: "本人在项目设置里，为这个项目里装着的一个插件打开或关掉它的一项可选权限（必需的关不掉，没声明的开不了）。关掉的权限马上收回：插件会被停下、换上新的授权再启动，正在做的事走到下一次写入就被拒、不留业务记录；打开则在重启后生效。只有宿主的项目设置入口能调，Agent、MCP、工作流和插件都调不到。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    ...permissionSwitch } } as PermissionSwitch,
  // The same switch for the plugins that run as the Home's own instance, from the Host settings (BL-700); no project in the call.
  setHomePermission: { capability_id: "plugins.home.permissions.set", version: 1, operation: "command", action: { ...metadata, scope: "home",
    title: "开关个人空间里插件的一项可选权限", description: "本人在宿主设置里，为运行在个人空间（所有项目共用）的一个插件打开或关掉它的一项可选权限（必需的关不掉，没声明的开不了）。关掉的权限马上收回：插件会被停下、换上新的授权再启动，正在做的事走到下一次写入就被拒、不留业务记录；打开则在重启后生效。只有宿主设置入口能调，Agent、MCP、工作流和插件都调不到。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    ...permissionSwitch } } as PermissionSwitch,
  homeInstalled: { capability_id: "plugins.home.installed.list", version: 2, operation: "query", action: { ...metadata, scope: "home",
    title: "查看个人空间里的插件", description: "列出运行在个人空间（所有项目共用）的插件：谁签的名、信任到哪一级、它要了哪些权限（含现在开着没有）、它在后台常做的事和本人给过的同意，以及它没能启动时的原因。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins"], properties: { plugins: { type: "array", items: installedView } } } } } as ActionDefinition<Record<string, never>, { plugins: PluginInstalledView[] }>,
  installed: { capability_id: "plugins.installed.list", version: 3, operation: "query", action: { ...metadata, scope: "project",
    title: "查看项目里装的插件", description: "列出这个项目里装着的插件：谁签的名、信任到哪一级、它要了哪些权限（含插件自己写的理由和平台对权限的说明）、它在后台常做的事，以及本人给过它的同意（含已撤回的），以及它没能启动时的原因。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins"], properties: { plugins: { type: "array", items: installedView } } } } } as ActionDefinition<Record<string, never>, { plugins: PluginInstalledView[] }>,
};

const controlOutput = { type: "object", additionalProperties: false, required: ["plugin_id", "state"], properties: { plugin_id: text, state: text } };
const controlInput = { plugin_id: { type: "string", minLength: 1, maxLength: 200 } };
const controlled = (title: string, description: string) => ({ ...metadata, scope: "project", title, description, kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE] }) as const;
const homeControlled = (title: string, description: string) => ({ ...metadata, scope: "home", title, description, kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE] }) as const;

/**
 * What the person does with a plugin installed from a signed package once it is installed (ac-trust BL-623): switch it off, switch it on,
 * take it off. Upgrading is installing a newer package of the same plugin and publisher (`preview`, then `confirm`). Each is the person's act
 * in a project, like the install: `user` audience and the protected entry's `user_action`. The same three for a package installed in the Home are the
 * Host settings door's (BL-715), with no project.
 */
export const pluginControlActions = {
  disable: { capability_id: "plugins.installed.disable", version: 1, operation: "command", action: { ...controlled("停用签名包装的插件",
    "停用这个项目里一个从签名的包装进来的插件：它的动作停止提供，数据保留，之后可以再启用或卸载。有常开同意的插件不能停用。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  enable: { capability_id: "plugins.installed.enable", version: 1, operation: "command", action: { ...controlled("启用签名包装的插件",
    "启用这个项目里一个停用了的、从签名的包装进来的插件。发布者已被撤销信任的插件不能启用，只能卸载。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  uninstall: { capability_id: "plugins.installed.uninstall", version: 1, operation: "command", action: { ...controlled("卸载签名包装的插件",
    "把这个项目里一个从签名的包装进来的插件卸载：`keep_data` 为真时它的数据留下（以后重装可以接上），为假时数据一并删除，也删除它存的密钥。有常开同意的插件不能卸载。发布者已被撤销信任的插件可以卸载。"),
    input_schema: { type: "object", properties: { ...controlInput, keep_data: { type: "boolean" } }, required: ["plugin_id", "keep_data"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string; keep_data: boolean }, { plugin_id: string; state: string }>,
  // The same three for a signed package installed in the Home (BL-715): the person's act in the Host settings, no project in the call.
  homeDisable: { capability_id: "plugins.home.installed.disable", version: 1, operation: "command", action: { ...homeControlled("停用个人空间里签名包装的插件",
    "停用运行在个人空间（所有项目共用）的一个从签名的包装进来的插件：它的动作在每个项目里都停止提供，数据保留，之后可以再启用或卸载。有常开同意的插件不能停用。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  homeEnable: { capability_id: "plugins.home.installed.enable", version: 1, operation: "command", action: { ...homeControlled("启用个人空间里签名包装的插件",
    "启用个人空间里一个停用了的、从签名的包装进来的插件。发布者已被撤销信任的插件不能启用，只能卸载。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  homeUninstall: { capability_id: "plugins.home.installed.uninstall", version: 1, operation: "command", action: { ...homeControlled("卸载个人空间里签名包装的插件",
    "把个人空间里一个从签名的包装进来的插件卸载，每个项目都不再有它：`keep_data` 为真时它的数据留下（以后重装可以接上），为假时数据一并删除，也删除它存的密钥。有常开同意的插件不能卸载。发布者已被撤销信任的插件可以卸载。"),
    input_schema: { type: "object", properties: { ...controlInput, keep_data: { type: "boolean" } }, required: ["plugin_id", "keep_data"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string; keep_data: boolean }, { plugin_id: string; state: string }>,
};

export function pluginInstallHandlers(service: PluginInstallService): ActionHandlerBinding[] {
  const person = (caller: Parameters<ActionHandlerBinding["handle"]>[0]) => {
    if (!caller.user_action) throw new ActionError("actions.forbidden", "安装插件只接受本人在界面或命令行里的操作");
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择要安装到的项目");
    return { project_id: caller.project_id, actor_id: caller.actor_id };
  };
  return [
    { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version, handle: async (caller, input) => {
      const who = person(caller); await caller.beforeEffect();
      return service.preview(input as { bundle: unknown }, who);
    } },
    { capability_id: pluginInstallActions.confirm.capability_id, version: 1, handle: async (caller, input) => {
      const who = person(caller); await caller.beforeEffect();
      return await service.confirm(input as { preview_id: string; consent: boolean; pin_label?: string }, who);
    } },
    { capability_id: pluginInstallActions.publishers.capability_id, version: 1, handle: () => ({ publishers: service.publishers() }) },
    { capability_id: pluginInstallActions.revokePublisher.capability_id, version: 1, handle: async (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      await caller.beforeEffect();
      return { publisher: service.revokePublisher((input as { key_id: string }).key_id) };
    } },
    ...(["disable", "enable", "uninstall"] as const).map((action): ActionHandlerBinding => ({ capability_id: pluginControlActions[action].capability_id, version: 1, handle: async (caller, input) => {
      const who = person(caller); await caller.beforeEffect();
      const { plugin_id, keep_data } = input as { plugin_id: string; keep_data?: boolean };
      return { plugin_id, state: await service.control(action, { plugin_id, keep_data: keep_data === true }, who) };
    } })),
    ...([["homeDisable", "disable"], ["homeEnable", "enable"], ["homeUninstall", "uninstall"]] as const).map(([name, action]): ActionHandlerBinding => ({ capability_id: pluginControlActions[name].capability_id, version: 1, handle: async (caller, input) => {
      // Only the Host settings door's credential for the Home's own plugins (S-94), asked before the Home's plugin host is touched.
      assertHomePluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { plugin_id, keep_data } = input as { plugin_id: string; keep_data?: boolean };
      return { plugin_id, state: await service.controlHome(action, { plugin_id, keep_data: keep_data === true }) };
    } })),
    { capability_id: pluginInstallActions.setPermission.capability_id, version: 1, handle: async (caller, input) => {
      assertPluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { install_id, permission, granted } = input as { install_id: string; permission: string; granted: boolean };
      return await service.setPermission(caller.project_id!, install_id, permission, granted);
    } },
    { capability_id: pluginInstallActions.setHomePermission.capability_id, version: 1, handle: async (caller, input) => {
      assertHomePluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { install_id, permission, granted } = input as { install_id: string; permission: string; granted: boolean };
      return await service.setHomePermission(install_id, permission, granted);
    } },
    { capability_id: pluginInstallActions.homeInstalled.capability_id, version: pluginInstallActions.homeInstalled.version, handle: async () => ({ plugins: await service.homeInstalled() }) },
    { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version, handle: async caller => {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择一个项目");
      return { plugins: await service.installed(caller.project_id) };
    } },
  ];
}
