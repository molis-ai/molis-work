import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginInstallPreviewResult, PluginInstallService } from "./plugin-install-service.js";

// Installing a plugin from a signed package, as the person's own act (ac-trust T2, specs/repository-anti-corruption/slices/ac-trust-install.md
// §3.1, S-81). The audience is `user` and the writing handlers want the protected entry's `user_action`, so an Agent, MCP, a workflow
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

const permissionView = { type: "object", additionalProperties: false, required: ["permission", "required", "reason", "meaning"],
  properties: { permission: text, required: { type: "boolean" }, reason: text, meaning: { type: ["string", "null"] } } };
const consentRow = {
  type: "object", additionalProperties: false, required: ["consent_id", "plugin_id", "publisher_signature", "kind", "subject", "manifest_digest", "granted_at", "granted_by", "revoked_at"],
  properties: { consent_id: text, plugin_id: text, publisher_signature: text, kind: { enum: ["always_on", "default_wiring", "default_group", "local_directory"] }, subject: text, manifest_digest: text,
    granted_at: text, granted_by: { enum: ["user", "host_build"] }, revoked_at: { type: ["string", "null"] } },
};
const installedView = {
  type: "object", additionalProperties: false,
  required: ["install_id", "plugin_id", "name", "version", "state", "trust", "publisher_signature", "publisher_label", "manifest_available", "permissions", "jobs", "consents"],
  properties: { install_id: text, plugin_id: text, name: text, version: text, state: text, trust: { enum: ["host", "pinned", "unsigned"] }, publisher_signature: text,
    publisher_label: { type: ["string", "null"] }, manifest_available: { type: "boolean" }, permissions: { type: "array", items: permissionView },
    jobs: { type: "array", items: { type: "object", additionalProperties: false, required: ["job_id", "reason", "permissions"], properties: { job_id: text, reason: text, permissions: { type: "array", items: text } } } },
    consents: { type: "array", items: consentRow } },
};

export const pluginInstallActions = {
  preview: { capability_id: "plugins.install.preview", version: 1, operation: "command", action: { ...metadata, scope: "project",
    title: "预览插件包的安装", description: "检查一个签名的沙箱插件包：签名、发布者、包的格式，并说明装上它意味着什么（它要的权限、发布者有没有被固定）；不安装、不固定发布者。包不合格在这里就被拒，什么也不写。",
    kind: "operation", effect: "write", permissions: [PLUGIN_INSTALL_WRITE],
    input_schema: { type: "object", properties: { bundle: { type: "object" } }, required: ["bundle"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["preview_id", "name", "preview", "effects", "publisher"], properties: {
      preview_id: text, name: text, effects,
      publisher: { type: "object", additionalProperties: false, required: ["key_id", "pinned_label"], properties: { key_id: text, pinned_label: { type: ["string", "null"] } } },
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
  installed: { capability_id: "plugins.installed.list", version: 1, operation: "query", action: { ...metadata, scope: "project",
    title: "查看项目里装的插件", description: "列出这个项目里装着的插件：谁签的名、信任到哪一级、它要了哪些权限（含插件自己写的理由和平台对权限的说明）、它在后台常做的事，以及本人给过它的同意（含已撤回的）。",
    kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugins"], properties: { plugins: { type: "array", items: installedView } } } } } as ActionDefinition<Record<string, never>, { plugins: PluginInstalledView[] }>,
};

export function pluginInstallHandlers(service: PluginInstallService): ActionHandlerBinding[] {
  const person = (caller: Parameters<ActionHandlerBinding["handle"]>[0]) => {
    if (!caller.user_action) throw new ActionError("actions.forbidden", "安装插件只接受本人在界面或命令行里的操作");
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择要安装到的项目");
    return { project_id: caller.project_id, actor_id: caller.actor_id };
  };
  return [
    { capability_id: pluginInstallActions.preview.capability_id, version: 1, handle: async (caller, input) => {
      const who = person(caller); await caller.beforeEffect();
      return service.preview(input as { bundle: unknown }, who);
    } },
    { capability_id: pluginInstallActions.confirm.capability_id, version: 1, handle: async (caller, input) => {
      const who = person(caller); await caller.beforeEffect();
      return await service.confirm(input as { preview_id: string; consent: boolean; pin_label?: string }, who);
    } },
    { capability_id: pluginInstallActions.publishers.capability_id, version: 1, handle: () => ({ publishers: service.publishers() }) },
    { capability_id: pluginInstallActions.installed.capability_id, version: 1, handle: async caller => {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择一个项目");
      return { plugins: await service.installed(caller.project_id) };
    } },
  ];
}
