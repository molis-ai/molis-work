import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";

/** The synchronous install boundary: verify the KV owner is available before touching files, then finish the person's non-retaining cleanup. */
export function discardInstallationOwnerData(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord, deleteInstallationData?: (installId: string) => void): void {
  if (!record.retain_private_data && !deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能重装");
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (!record.retain_private_data) deleteInstallationData?.(record.install_id);
}
