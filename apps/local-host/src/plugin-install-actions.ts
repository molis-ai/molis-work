import { ActionError, bindActionHandler, inputSchemaFor, type ActionDefinition, type ActionHandlerBinding, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_INSTALL_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_INSTALL_WRITE, type PluginInstalledPermissionView, type PluginInstalledView, type PluginPublisherPin, type PluginUninstallResult, type PluginUninstallTarget, type ProjectPluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
export { PLUGIN_INSTALL_PROVIDER_ID };
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { SKILL_INSTALL_PREVIEW_SCHEMA, SKILL_SCENE_CHOICE_SCHEMA, skillAuthoringActions, skillDraftActions, skillImportActions, type SkillAuthoredFields } from "@molis-ai/molis-work-contracts/services/skills";
import { PROJECT_INSTALLATION } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { assertHomePluginPermissionSettingsEntry, assertPluginConsentSettingsEntry, assertPluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import type { BundledPluginList, PluginInstallConfirmInput, PluginInstallConfirmResult, PluginInstallPreviewInput, PluginInstallPreviewResult, PluginInstallService, ProjectPackageControl } from "./plugin-install-service.js";
import type { ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { adoptDraft, type SkillAuthoringService } from "./skill-authoring.js";
import type { SkillDraftStore } from "./agent-definitions/skill-drafts.js";
import type { SkillImportService } from "./skill-import.js";

// Installing a plugin from a signed package, as the person's own act (ac-trust T2, specs/archive/repository-anti-corruption/slices/ac-trust-install.md
// §3.1, S-84). The audience is `user` and the writing handlers want the protected entry's `user_action`, so an Agent, MCP, a workflow
// or a plugin can neither start an install nor confirm one (nor pin a publisher by confirming). The package is verified at the preview
// and not trusted again after it: confirming takes only a preview the Host made for this person in this project.

export const PLUGIN_INSTALL_READ = "plugin-install:read";
export { PLUGIN_INSTALL_WRITE };
export const PLUGIN_INSTALL_PERMISSIONS = [PLUGIN_INSTALL_READ, PLUGIN_INSTALL_WRITE];

const metadata = { audiences: ["user"], subject_kinds: [] } as const;
const text = { type: "string" };
const effects = { type: "object", additionalProperties: { type: "array", items: text } };
const pinView = {
  type: "object", additionalProperties: false, required: ["key_id", "public_key_spki_base64", "label", "pinned_at", "pinned_by", "revoked_at"],
  properties: { key_id: text, public_key_spki_base64: text, label: text, pinned_at: text, pinned_by: text, revoked_at: { type: ["string", "null"] } },
};

const installedPermissionView = { type: "object", additionalProperties: false, required: ["permission", "required", "requested", "reason", "meaning", "granted"],
  properties: { permission: text, required: { type: "boolean" }, requested: { type: "boolean" }, reason: text, meaning: { type: ["string", "null"] }, granted: { type: "boolean" } } };
const permissionSwitch = {
  input_schema: { type: "object", properties: { install_id: { type: "string", minLength: 1, maxLength: 200 }, permission: { type: "string", minLength: 1, maxLength: 200 }, granted: { type: "boolean" } },
    required: ["install_id", "permission", "granted"], additionalProperties: false },
  output_schema: { type: "object", additionalProperties: false, required: ["install_id", "permissions", "changed"], properties: { install_id: text, changed: { type: "boolean" },
    permissions: { type: "array", items: installedPermissionView } } },
} as const;
type PermissionSwitch = ActionDefinition<{ install_id: string; permission: string; granted: boolean }, { install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }>;
const consentRow = {
  oneOf: [
    { properties: { kind: { const: "project_reach" }, approved_capability_ids: { type: "array" }, granted_by: { const: "user" } } },
    { properties: { kind: { enum: ["default_wiring", "default_group", "local_directory"] }, approved_capability_ids: { type: "null" } } },
  ],
  type: "object", additionalProperties: false, required: ["consent_id", "plugin_id", "publisher_signature", "kind", "subject", "manifest_digest", "granted_at", "granted_by", "revoked_at", "approved_capability_ids"],
  properties: { consent_id: text, plugin_id: text, publisher_signature: text, kind: { enum: ["default_wiring", "default_group", "local_directory", "project_reach"] }, subject: text, manifest_digest: text,
    granted_at: text, granted_by: { enum: ["user", "host_build"] }, revoked_at: { type: ["string", "null"] }, approved_capability_ids: { type: ["array", "null"], items: text } },
};
/** The installation an uninstall names (BL-915): the `uninstall_target` of the row the person acted on, checked against the trusted row under its lock. */
const uninstallTarget = { type: "object", additionalProperties: false, required: ["install_id", "installation_generation", "version", "manifest_digest"],
  properties: { install_id: { type: "string", minLength: 1, maxLength: 200 }, installation_generation: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "string", minLength: 1, maxLength: 200 }, manifest_digest: { type: "string", minLength: 1, maxLength: 200 } } } as const;
const installedView = {
  type: "object", additionalProperties: false,
  required: ["install_id", "plugin_id", "name", "version", "state", "trust", "publisher_signature", "publisher_label", "manifest_available", "permissions", "jobs", "consents", "pending_defaults", "recovery_error"],
  properties: { install_id: text, plugin_id: text, name: text, version: text, state: text, trust: { enum: ["host", "pinned", "unsigned"] }, publisher_signature: text,
    publisher_label: { type: ["string", "null"] }, manifest_available: { type: "boolean" }, permissions: { type: "array", items: installedPermissionView },
    jobs: { type: "array", items: { type: "object", additionalProperties: false, required: ["job_id", "reason", "permissions"], properties: { job_id: text, reason: text, permissions: { type: "array", items: text } } } },
    consents: { type: "array", items: consentRow },
    pending_defaults: { type: "array", items: { type: "object", additionalProperties: false, required: ["port", "source_plugin_id", "source_name", "source_port"],
      properties: { port: text, source_plugin_id: text, source_name: text, source_port: text } } },
    recovery_error: { type: ["string", "null"] }, uninstall_target: uninstallTarget, pending_keep_data: { type: "boolean" } },
};

export const pluginInstallActions = {
  preview: { capability_id: "plugins.install.preview", version: /* @version action.plugins.install.preview */ 1, operation: "command", action: { ...metadata, scope: "project",
    title: "预览插件包的安装", description: "检查一个签名的插件包（沙箱包，或只有声明的插件的内容包）：签名、发布者、包的格式，并说明装上它意味着什么（它要的权限、它带的技能与依赖、升级时每个技能变了什么、发布者有没有被固定）；不安装、不固定发布者。包可以整个交进来（`bundle`），也可以是这个安装包随带的一个（`bundled`：plugins.bundled.list 列出的 ID 和版本），后者照样验签、照样预览。包不合格在这里就被拒，什么也不写。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { bundle: { type: "object" },
      bundled: { type: "object", properties: { plugin_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "string", minLength: 1, maxLength: 64 } }, required: ["plugin_id", "version"], additionalProperties: false } },
    oneOf: [{ required: ["bundle"] }, { required: ["bundled"] }], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["preview_id", "name", "runtime_scope", "preview", "effects", "publisher", "kept_data_incompatible"], properties: {
      preview_id: text, name: text, kept_data_incompatible: { type: "boolean" }, runtime_scope: { enum: ["home", "project"] }, dual_instance: { const: true }, effects,
      publisher: { type: "object", additionalProperties: false, required: ["key_id", "pinned_label"], properties: { key_id: text, pinned_label: { type: ["string", "null"] }, local: { const: true } } },
      secrets: { type: "array", maxItems: 64, items: { type: "object", additionalProperties: false, required: ["name", "saved"], properties: { name: text, saved: { type: "boolean" } } } },
      // The package declares a memory scene this running Molis Work lists only after a restart (BL-b44-coding-scene-enum).
      memory_scene_after_restart: { const: true },
      agent_bodies: { type: "array", maxItems: 128, items: { type: "object", additionalProperties: false, required: ["kind", "name", "excerpt", "body", "total_chars", "truncated"], properties: {
        kind: { type: "string", enum: ["role"] }, name: { type: "string", maxLength: 80 }, excerpt: { type: "string", maxLength: 400 }, body: { type: "string", maxLength: 8000 }, total_chars: { type: "integer", minimum: 0, maximum: 8000 }, truncated: { type: "boolean" }, change: { type: "string", enum: ["added", "changed", "removed"] } } } },
      // An upgrade lists the Skills it removes besides the package's own, so twice the most one package declares.
      skills: { type: "array", maxItems: 2 * SKILL_LIMITS.skillsPerPackage, items: SKILL_INSTALL_PREVIEW_SCHEMA },
      skill_scenes: { type: "array", maxItems: 200, items: SKILL_SCENE_CHOICE_SCHEMA },
      requires: { type: "array", items: { type: "object", additionalProperties: false, required: ["capability_id", "version", "optional", "reason", "satisfied"], properties: {
        capability_id: text, version: { type: "integer", minimum: 1 }, optional: { type: "boolean" }, reason: text, satisfied: { type: "boolean" } } } },
      origins: { type: "array", items: { type: "object", additionalProperties: false, required: ["service_id", "title", "origins"], properties: { service_id: text, title: text, origins: { type: "array", items: text } } } },
      preview: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "trust", "publisher_signature", "publisher_pinned", "permissions", "declarations", "jobs"], properties: {
        plugin_id: text, version: text, trust: { enum: ["host", "pinned", "unsigned"] }, publisher_signature: text, publisher_pinned: { type: "boolean" },
        permissions: { type: "array", items: { type: "object", required: ["permission", "required", "requested", "reason", "meaning"], properties: { permission: text, required: { type: "boolean" }, requested: { type: "boolean" }, reason: text, meaning: { type: ["string", "null"] } }, additionalProperties: false } },
        jobs: { type: "array", items: { type: "object", required: ["job_id", "reason", "permissions"], properties: { job_id: text, reason: text, permissions: { type: "array", items: text } }, additionalProperties: false } },
        declarations: { type: "array", items: { type: "object", required: ["kind", "subject", "summary"], properties: { kind: text, subject: text, summary: text }, additionalProperties: false } } } } } } } } as ActionDefinition<PluginInstallPreviewInput, PluginInstallPreviewResult>,
  bundled: { capability_id: "plugins.bundled.list", version: /* @version action.plugins.bundled.list */ 1, operation: "query", action: { ...metadata, scope: "home",
    title: "查看随安装包带上的插件", description: "列出这个安装包随带的插件包（如官方技能包）：ID、版本、名称、说明、装到个人空间还是项目，以及签名它的发布者和本人是否已固定或撤销这个发布者；随包带上但没有签名的（signed_here），安装时由这个 Home 用自己的发布身份签名，key_id 是那个身份的（还没有身份时为空）。每次都重新读、重新验签；读不了或验签不过的单列出原因。只读：不安装、不固定发布者、不登记技能、不留设置；要装，就把 ID 和版本交给 plugins.install.preview 的 bundled，和别的包同一条预览、确认的路。装没装看 plugins.installed.list 与 plugins.home.installed.list。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins", "refused"], properties: {
      plugins: { type: "array", items: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "name", "summary", "runtime_scope", "publisher"], properties: {
        plugin_id: text, version: text, name: text, summary: { type: ["string", "null"] }, runtime_scope: { enum: ["home", "project"] }, dual_instance: { const: true },
        publisher: { type: "object", additionalProperties: false, required: ["publisher_id", "key_id", "pinned_label", "revoked"], properties: {
          publisher_id: text, key_id: { type: "string" }, pinned_label: { type: ["string", "null"] }, revoked: { type: "boolean" } } },
        signed_here: { const: true } } } },
      refused: { type: "array", items: { type: "object", additionalProperties: false, required: ["file", "code", "message"], properties: { file: text, code: text, message: text } } } } } } } as ActionDefinition<Record<string, never>, BundledPluginList>,
  confirm: { capability_id: "plugins.install.confirm", version: /* @version action.plugins.install.confirm */ 1, operation: "command", action: { ...metadata, scope: "project",
    title: "确认安装插件包", description: "安装一次预览里看过的包：确认它要的权限；这个发布者还没被固定时，给出名称才会固定它（固定是本人对这个发布者的信任，之后它签的包都按这个信任安装）。可以同时给出装好后要开着的可选权限（`optional_permissions`，只能是预览里列为可选且请求了的）：第一次安装就带着它们启动，升级则把和现在不一样的开关改过去，没改成的在结果里列出，升级本身不受影响。预览提示无法读取旧数据时，只有本人明确选择放弃旧数据才能安装。预览用过一次就作废。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { preview_id: { type: "string", minLength: 1, maxLength: 80 }, consent: { type: "boolean" }, discard_kept_data: { type: "boolean" }, pin_label: { type: "string", minLength: 1, maxLength: 80 },
      optional_permissions: { type: "array", maxItems: 64, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 200 } } },
      required: ["preview_id", "consent"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "publisher_key_id"], properties: { plugin_id: text, version: text, publisher_key_id: text,
      retained_cleanup_incomplete: { type: "boolean" }, permission_changes_failed: { type: "array", minItems: 1, items: text } } } } } as ActionDefinition<PluginInstallConfirmInput, PluginInstallConfirmResult>,
  publishers: { capability_id: "plugins.publishers.list", version: /* @version action.plugins.publishers.list */ 1, operation: "query", action: { ...metadata, scope: "home",
    title: "查看已固定的发布者", description: "列出本人固定过的插件发布者（含已撤销的）：公钥指纹、名称、固定与撤销的时间。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["publishers"], properties: { publishers: { type: "array", items: pinView } } } } } as ActionDefinition<Record<string, never>, { publishers: unknown[] }>,
  revokePublisher: { capability_id: "plugins.publishers.revoke", version: /* @version action.plugins.publishers.revoke */ 1, operation: "command", action: { ...metadata, scope: "home",
    title: "撤销对发布者的信任", description: "撤销本机对一个发布者的信任：它签的包不能再安装，已经装进任何项目的它的插件马上不能再做任何事、随后停用，数据保留，之后只能卸载；撤销不能撤回，要再信任它得换一个发布者密钥。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { key_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["key_id"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["publisher"], properties: { publisher: pinView } } } } as ActionDefinition<{ key_id: string }, { publisher: PluginPublisherPin }>,
  setPermission: { capability_id: "plugins.permissions.set", version: /* @version action.plugins.permissions.set */ 1, operation: "command", action: { ...metadata, scope: "project",
    title: "开关插件的一项可选权限", description: "本人在项目设置里，为这个项目里装着的一个插件打开或关掉它的一项可选权限（必需的关不掉，没声明的开不了）。关掉的权限马上收回：插件会被停下、换上新的授权再启动，正在做的事走到下一次写入就被拒、不留业务记录；打开则在重启后生效。只有宿主的项目设置入口能调，Agent、MCP、工作流和插件都调不到。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    ...permissionSwitch } } as PermissionSwitch,
  // The same switch for the plugins that run as the Home's own instance, from the Host settings (BL-700); no project in the call.
  setHomePermission: { capability_id: "plugins.home.permissions.set", version: /* @version action.plugins.home.permissions.set */ 1, operation: "command", action: { ...metadata, scope: "home",
    title: "开关个人空间里插件的一项可选权限", description: "本人在宿主设置里，为运行在个人空间（所有项目共用）的一个插件打开或关掉它的一项可选权限（必需的关不掉，没声明的开不了）。关掉的权限马上收回：插件会被停下、换上新的授权再启动，正在做的事走到下一次写入就被拒、不留业务记录；打开则在重启后生效。只有宿主设置入口能调，Agent、MCP、工作流和插件都调不到。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    ...permissionSwitch } } as PermissionSwitch,
  homeInstalled: { capability_id: "plugins.home.installed.list", version: /* @version action.plugins.home.installed.list */ 1, operation: "query", action: { ...metadata, scope: "home",
    title: "查看个人空间里的插件", description: "列出运行在个人空间（所有项目共用）的插件：谁签的名、信任到哪一级、它要了哪些权限（含现在开着没有）、它在后台常做的事和本人给过的同意，以及它没能启动时的原因。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins"], properties: { plugins: { type: "array", items: installedView } } } } } as ActionDefinition<Record<string, never>, { plugins: PluginInstalledView[] }>,
  installed: { capability_id: "plugins.installed.list", version: /* @version action.plugins.installed.list */ 1, operation: "query", action: { ...metadata, scope: "project",
    title: "查看项目里装的插件", description: "列出这个项目里装着的插件：谁签的名、信任到哪一级、它要了哪些权限（含插件自己写的理由和平台对权限的说明）、它在后台常做的事，以及本人给过它的同意（含已撤回的），以及它没能启动时的原因。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins"], properties: { plugins: { type: "array", items: {
      ...installedView, required: [...installedView.required, "installation_generation", "manifest_digest"],
      properties: { ...installedView.properties, installation_generation: text, manifest_digest: text },
    } } } } } } as ActionDefinition<Record<string, never>, { plugins: ProjectPluginInstalledView[] }>,
};

const controlOutput = { type: "object", additionalProperties: false, required: ["plugin_id", "state"], properties: { plugin_id: text, state: text } };
/** What an uninstall kept that it would otherwise have taken off, and why (BL-915); present only when something stayed behind. No path, reference or secret. */
const retainedItem = { type: "object", additionalProperties: false, required: ["kind", "reason"], properties: {
  kind: { enum: ["home_library", "owner_files", "network_credential", "installation_binding", "task_grant", "declared_rule"] },
  reason: { enum: ["ownership_unverified", "other_holder", "inventory_unavailable"] }, label: { type: "string", maxLength: 200 } } };
const uninstallOutput = { ...controlOutput, properties: { ...controlOutput.properties, retained: { type: "array", minItems: 1, items: retainedItem } } };
const controlInput = { plugin_id: { type: "string", minLength: 1, maxLength: 200 } } as const;
type EnableInput = Pick<Extract<ProjectPackageControl, { action: "enable" }>, "plugin_id" | "expected_installation">;
const controlled = (title: string, description: string) => ({ ...metadata, scope: "project", title, description, kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE] }) as const;
const homeControlled = (title: string, description: string) => ({ ...metadata, scope: "home", title, description, kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE] }) as const;

/**
 * What the person does with a plugin installed from a signed package once it is installed (ac-trust BL-623): switch it off, switch it on,
 * take it off. Upgrading is installing a newer package of the same plugin and publisher (`preview`, then `confirm`). Each is the person's act
 * in a project, like the install: `user` audience and the protected entry's `user_action`. The same three for a package installed in the Home are the
 * Host settings door's (BL-715), with no project.
 */
const repairContract = {
  input_schema: { type: "object", additionalProperties: false, required: ["plugin_id", "target"],
    properties: { plugin_id: { type: "string", minLength: 1, maxLength: 200 }, target: uninstallTarget, bundle: { type: "object" } } },
  output_schema: { type: "object", additionalProperties: false, required: ["plugin_id", "version"], properties: { plugin_id: text, version: text } },
} as const;
type RepairAction = ActionDefinition<InferActionInput<typeof repairContract.input_schema>, { plugin_id: string; version: string }>;
const repairTitle = "装回插件的已安装版本";
const repairDescription = "本人在宿主设置入口装回损坏的插件包。重新验签并核对原安装，沿用已批准的权限和现有数据。";

export const pluginControlActions = {
  repair: { capability_id: "plugins.installed.repair", version: /* @version action.plugins.installed.repair */ 1, operation: "command",
    action: { ...controlled(repairTitle, repairDescription), ...repairContract } } as RepairAction,
  homeRepair: { capability_id: "plugins.home.installed.repair", version: /* @version action.plugins.home.installed.repair */ 1, operation: "command",
    action: { ...homeControlled(repairTitle, repairDescription), ...repairContract } } as RepairAction,
  disable: { capability_id: "plugins.installed.disable", version: /* @version action.plugins.installed.disable */ 1, operation: "command", action: { ...controlled("停用签名包装的插件",
    "停用这个项目里一个从签名的包装进来的插件：它的动作停止提供，数据保留，之后可以再启用或卸载。有常开同意的插件不能停用。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  enable: { capability_id: "plugins.installed.enable", version: /* @version action.plugins.installed.enable */ 1, operation: "command", action: { ...controlled("启用签名包装的插件",
    "启用刚才看到的、已停用的项目签名插件安装。安装或发行物变化后须重新查看；发布者已被撤销信任的插件只能卸载。"),
    input_schema: inputSchemaFor<EnableInput>()({ type: "object", additionalProperties: false, required: ["plugin_id", "expected_installation"], properties: {
      ...controlInput, expected_installation: PROJECT_INSTALLATION,
    } }), output_schema: controlOutput } } as ActionDefinition<EnableInput, { plugin_id: string; state: string }>,
  uninstall: { capability_id: "plugins.installed.uninstall", version: /* @version action.plugins.installed.uninstall */ 1, operation: "command", action: { ...controlled("卸载签名包装的插件",
    "把这个项目里一个从签名的包装进来的插件卸载：`keep_data` 为真时它的数据留下（以后重装可以接上），为假时数据一并删除，也删除它存的密钥。有常开同意的插件不能卸载。发布者已被撤销信任的插件可以卸载。"),
    input_schema: { type: "object", properties: { ...controlInput, keep_data: { type: "boolean" }, target: uninstallTarget }, required: ["plugin_id", "keep_data", "target"], additionalProperties: false }, output_schema: uninstallOutput } } as ActionDefinition<{ plugin_id: string; keep_data: boolean; target: PluginUninstallTarget }, PluginUninstallResult>,
  // The same three for a signed package installed in the Home (BL-715): the person's act in the Host settings, no project in the call.
  homeDisable: { capability_id: "plugins.home.installed.disable", version: /* @version action.plugins.home.installed.disable */ 1, operation: "command", action: { ...homeControlled("停用个人空间里签名包装的插件",
    "停用运行在个人空间（所有项目共用）的一个从签名的包装进来的插件：它的动作在每个项目里都停止提供，数据保留，之后可以再启用或卸载。有常开同意的插件不能停用。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  homeEnable: { capability_id: "plugins.home.installed.enable", version: /* @version action.plugins.home.installed.enable */ 1, operation: "command", action: { ...homeControlled("启用个人空间里签名包装的插件",
    "启用个人空间里一个停用了的、从签名的包装进来的插件。发布者已被撤销信任的插件不能启用，只能卸载。"),
    input_schema: { type: "object", properties: controlInput, required: ["plugin_id"], additionalProperties: false }, output_schema: controlOutput } } as ActionDefinition<{ plugin_id: string }, { plugin_id: string; state: string }>,
  homeUninstall: { capability_id: "plugins.home.installed.uninstall", version: /* @version action.plugins.home.installed.uninstall */ 1, operation: "command", action: { ...homeControlled("卸载个人空间里签名包装的插件",
    "把个人空间里一个从签名的包装进来的插件卸载，每个项目都不再有它：`keep_data` 为真时它的数据留下（以后重装可以接上），为假时数据一并删除，也删除它存的密钥。有常开同意的插件不能卸载。发布者已被撤销信任的插件可以卸载。"),
    input_schema: { type: "object", properties: { ...controlInput, keep_data: { type: "boolean" }, target: uninstallTarget }, required: ["plugin_id", "keep_data", "target"], additionalProperties: false }, output_schema: uninstallOutput } } as ActionDefinition<{ plugin_id: string; keep_data: boolean; target: PluginUninstallTarget }, PluginUninstallResult>,
};

/** Importing Skills from this machine is installing the content package the import makes, so this provider offers it too (batch 08, 08-8). */
export const pluginInstallDefinitions = (imports?: SkillImportService, authoring?: SkillAuthoring) =>
  [...Object.values(pluginInstallActions), ...Object.values(pluginControlActions), ...imports ? Object.values(skillImportActions) : [],
    ...authoring ? [skillDraftActions.adopt, skillAuthoringActions.remove, skillAuthoringActions.draft] : []] as ActionDefinition[];

/**
 * Writing Skills of one's own (batch 41): adopting a draft (batch 42) and removing are installing and taking off the scope's package of
 * own Skills, so this provider offers them; drafting asks the text model and writes nothing. Reading a Skill's fields and every other
 * draft action are the catalog's (`system.skills`).
 */
export interface SkillAuthoring {
  service: SkillAuthoringService;
  /** The drafts adopting reads and closes: the catalog owner's store. */
  drafts: SkillDraftStore;
  draft(intent: string, caller: Parameters<ActionHandlerBinding["handle"]>[0]): Promise<SkillAuthoredFields>;
  draftAvailability(): ActionAvailability;
}

export function pluginInstallPerson(caller: Parameters<ActionHandlerBinding["handle"]>[0]): { project_id: string; actor_id: string } {
  if (!caller.user_action) throw new ActionError("actions.forbidden", "安装插件只接受本人在界面或命令行里的操作");
  if (!caller.project_id) throw new ActionError("actions.project_required", "请选择要安装到的项目");
  return { project_id: caller.project_id, actor_id: caller.actor_id };
}

export function pluginInstallHandlers(service: PluginInstallService, imports?: SkillImportService, authoring?: SkillAuthoring): ActionHandlerBinding[] {
  return [
    { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version, handle: async (caller, input) => {
      const who = pluginInstallPerson(caller); await caller.beforeEffect();
      return service.preview(input as PluginInstallPreviewInput, who, caller);
    } },
    bindActionHandler(pluginInstallActions.bundled, () => service.bundled()),
    { capability_id: pluginInstallActions.confirm.capability_id, version: pluginInstallActions.confirm.version, handle: async (caller, input) => {
      const who = pluginInstallPerson(caller); await caller.beforeEffect();
      return await service.confirm(input as PluginInstallConfirmInput, who, caller);
    } },
    { capability_id: pluginInstallActions.publishers.capability_id, version: pluginInstallActions.publishers.version, handle: () => ({ publishers: service.publishers() }) },
    { capability_id: pluginInstallActions.revokePublisher.capability_id, version: pluginInstallActions.revokePublisher.version, handle: async (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      await caller.beforeEffect();
      return { publisher: service.revokePublisher((input as { key_id: string }).key_id) };
    } },
    ...(["disable", "uninstall"] as const).map((action): ActionHandlerBinding => ({ capability_id: pluginControlActions[action].capability_id, version: pluginControlActions[action].version, handle: async (caller, input) => {
      // Taking a plugin off is the project settings door's alone, like switching its permissions (S-94, BL-915); switching it off and on stays the person's act in the project.
      if (action === "uninstall") assertPluginPermissionSettingsEntry(caller);
      const who = pluginInstallPerson(caller); await caller.beforeEffect();
      const { plugin_id, keep_data, target } = input as { plugin_id: string; keep_data?: boolean; target?: PluginUninstallTarget };
      return { plugin_id, ...await service.control({ action, plugin_id, keep_data: keep_data === true, ...target ? { target } : {} }, who, caller) };
    } })),
    bindActionHandler(pluginControlActions.repair, async ({ plugin_id, target, bundle }, caller) => {
      assertPluginPermissionSettingsEntry(caller);
      return service.repair({ plugin_id, expected_installation: { scope: "project", ...target }, bundle }, caller);
    }),
    bindActionHandler(pluginControlActions.homeRepair, async ({ plugin_id, target, bundle }, caller) => {
      assertHomePluginPermissionSettingsEntry(caller);
      return service.repair({ plugin_id, expected_installation: { scope: "home", ...target }, bundle }, caller);
    }),
    bindActionHandler(pluginControlActions.enable, async (input, caller) => {
      const who = pluginInstallPerson(caller);
      return { plugin_id: input.plugin_id, ...await service.control({ ...input, action: "enable", caller }, who) };
    }),
    ...([["homeDisable", "disable"], ["homeEnable", "enable"], ["homeUninstall", "uninstall"]] as const).map(([name, action]): ActionHandlerBinding => ({ capability_id: pluginControlActions[name].capability_id, version: pluginControlActions[name].version, handle: async (caller, input) => {
      // Only the Host settings door's credential for the Home's own plugins (S-94), asked before the Home's plugin host is touched.
      assertHomePluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { plugin_id, keep_data, target } = input as { plugin_id: string; keep_data?: boolean; target?: PluginUninstallTarget };
      return { plugin_id, ...await service.controlHome(action, { plugin_id, keep_data: keep_data === true, ...target ? { target } : {} }, caller) };
    } })),
    { capability_id: pluginInstallActions.setPermission.capability_id, version: pluginInstallActions.setPermission.version, handle: async (caller, input) => {
      assertPluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { install_id, permission, granted } = input as { install_id: string; permission: string; granted: boolean };
      return await service.setPermission(caller.project_id!, install_id, permission, granted, caller.locale);
    } },
    { capability_id: pluginInstallActions.setHomePermission.capability_id, version: pluginInstallActions.setHomePermission.version, handle: async (caller, input) => {
      assertHomePluginPermissionSettingsEntry(caller);
      await caller.beforeEffect();
      const { install_id, permission, granted } = input as { install_id: string; permission: string; granted: boolean };
      return await service.setHomePermission(install_id, permission, granted, caller.locale);
    } },
    { capability_id: pluginInstallActions.homeInstalled.capability_id, version: pluginInstallActions.homeInstalled.version, handle: async caller => ({ plugins: await service.homeInstalled(caller.locale) }) },
    { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version, handle: async caller => {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择一个项目");
      return { plugins: await service.installed(caller.project_id, caller.locale) };
    } },
    // The person's own, as installing is: a Skill imported here is a package installed here.
    ...imports ? [
      bindActionHandler(skillImportActions.preview, async (input, caller) => {
        const who = pluginInstallPerson(caller); await caller.beforeEffect();
        return imports.preview(input, who, caller.locale);
      }),
      bindActionHandler(skillImportActions.confirm, async (input, caller) => {
        const who = pluginInstallPerson(caller); await caller.beforeEffect();
        return imports.confirm(input, who, caller);
      }),
    ] : [],
    ...authoring ? [
      bindActionHandler(skillDraftActions.adopt, async (input, caller) => {
        // The person's own act alone (S-skill-authoring): an Agent may open a draft and replay it, never adopt it.
        const who = pluginInstallPerson(caller); await caller.beforeEffect();
        return adoptDraft(authoring.service, authoring.drafts, input, who, caller);
      }),
      bindActionHandler(skillAuthoringActions.remove, async (input, caller) => {
        // Removing the last one takes the package off, which is the project settings door's alone (S-94); so every removal asks that door.
        assertPluginPermissionSettingsEntry(caller);
        const who = pluginInstallPerson(caller); await caller.beforeEffect();
        const removed = await authoring.service.remove(input, who, caller);
        authoring.drafts.forgetSkill(input.scope === "home" ? "home" : who.project_id, input.skill_id);
        return removed;
      }),
      { ...bindActionHandler(skillAuthoringActions.draft, async (input, caller) => { pluginInstallPerson(caller); return authoring.draft(input.intent, caller); }),
        availability: () => authoring.draftAvailability() },
    ] : [],
  ];
}
