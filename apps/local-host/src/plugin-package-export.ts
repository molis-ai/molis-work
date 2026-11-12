import { bindActionHandler, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPackageExport, PluginPackageExportRequest } from "@molis-ai/molis-work-contracts/services/kit";
import { PLUGIN_INSTALL_READ } from "./plugin-install-actions.js";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { scopeInstallations } from "./scope-installations.js";

// 「导出这个包」's package part (specs/capability-pack/contract-design.md §4.9): the plugin install service hands out a content package
// exactly as it kept it from the install. It never re-signs, so a third party's package keeps its signer and this Home's keeps its own.

const text = { type: "string", minLength: 1, maxLength: 200 } as const;

export const pluginPackageExport: ActionDefinition<PluginPackageExportRequest, PluginPackageExport> = {
  capability_id: "plugins.package.export", version: /* @version action.plugins.package.export */ 1, operation: "query",
  action: { audiences: ["user"], subject_kinds: [], scope: "project", kind: "query", effect: "read", permissions: [PLUGIN_INSTALL_READ],
    title: "导出插件的内容包", description: "把一个装着的内容包（只有声明、不带运行代码）原样交出：安装时验过签、留存的那份包文本，不重新签名。随宿主构建的内置插件、带运行代码的应用包和读不到或验签不过的包导不出。只给本人。",
    input_schema: { type: "object", properties: { install_id: text }, required: ["install_id"], additionalProperties: false },
    output_schema: { type: "object", additionalProperties: false, required: ["plugin_id", "version", "publisher_key_id", "filename", "media_type", "content"], properties: {
      plugin_id: text, version: text, publisher_key_id: text, filename: text, media_type: { const: "application/json" }, content: { type: "string" } } } },
};

/** The kept package of one installation the call reaches. */
export async function exportPluginPackage(home: string, source: ProjectPluginHost, caller: ActionCallContext, installId: string): Promise<PluginPackageExport> {
  const { installations } = await scopeInstallations(source, caller);
  const install = installations.find(row => row.record.install_id === installId);
  if (!install) throw pluginErrors.export_unavailable("没有这个安装", { reason: "package_missing" });
  const { record, manifest } = install;
  if (record.publisher_trust === "host") throw pluginErrors.export_unavailable("随宿主构建的插件没有可分发的包", { reason: "host_build" });
  if (record.execution !== "sandbox" || manifest?.kind !== "content") throw pluginErrors.export_unavailable("带运行代码的应用包不能导出", { reason: "not_content_package" });
  let content: string;
  try { content = new SandboxPackageStore(home).keptText(record.plugin_id, record.publisher_signature, record.version); }
  catch { throw pluginErrors.export_unavailable("留存的包读不到或验签不过", { reason: "package_missing" }); }
  return { plugin_id: record.plugin_id, version: record.version, publisher_key_id: record.publisher_signature,
    filename: `${record.plugin_id}-${record.version}.json`, media_type: "application/json", content };
}

export const pluginPackageExportHandler = (home: string, source: ProjectPluginHost) =>
  bindActionHandler(pluginPackageExport, (input, caller) => exportPluginPackage(home, source, caller, input.install_id));
