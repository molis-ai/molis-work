import { removeManagedConnectorTool } from "./connector-tool-install.js";
import { hostLog } from "./host-log.js";

/** Cleanup is separate from connection success. A failed cleanup leaves its ownership record for recovery. */
export function cleanupConnectorInstallation(home: string, id: string | undefined) {
  if (!id) return undefined;
  try { removeManagedConnectorTool(home, id); return undefined; }
  catch (error) {
    hostLog.warn("connections", "installation_cleanup_failed", error, { installation_id: id });
    return { installation_id: id, status: "retained" as const, message: "连接状态已更新，但旧安装文件未能清理；请检查目录权限后重试移除" };
  }
}
