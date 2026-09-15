import path from "node:path";
import { isOwnedWebServiceReceipt, type MolisWorkWebServiceDetection } from "./web-service-contract.js";
import { WebServiceEnvironment, fileExists, readText, readReceipt, digest, launchAgentProcessId } from "./web-service-platform.js";

export async function detectWebService(environment: WebServiceEnvironment): Promise<MolisWorkWebServiceDetection> {
    const command = environment.command();
    if (environment.platform !== "darwin") {
      return environment.detection("unsupported", false, false, false, command, "当前系统尚未提供 Molis Work 常驻服务集成");
    }
    const launcherAvailable = await fileExists(command[0]);
    const plist = await readText(environment.plistPath);
    const legacyPlist = await readText(environment.legacyPlistPath);
    const receipt = await readReceipt(environment.receiptPath);
    const receiptOwned = isOwnedWebServiceReceipt(receipt);
    if (plist == null) {
      if (legacyPlist != null && receiptOwned) {
        const status = await environment.launchctl(["print", environment.legacyServiceTarget()]);
        const running = launchAgentProcessId(status) != null;
        return launcherAvailable
          ? environment.detection("needs_repair", true, true, running, command, "Molis Work Web 常驻服务仍使用旧 LaunchAgent 标识，可预览并确认升级")
          : environment.detection("unavailable", true, true, running, command, "Molis Work Web 启动器缺失；可移除旧服务或先修复 Molis Work 安装");
      }
      if (receiptOwned) {
        const status = await environment.launchctl(["print", environment.serviceTarget()]);
        const running = launchAgentProcessId(status) != null;
        if (running) {
          return environment.detection(
            "conflict",
            true,
            true,
            true,
            command,
            "Molis Work LaunchAgent 仍在运行，但原 plist 已缺失，无法安全回滚自动修复；请先明确停止服务后再修复",
          );
        }
        return launcherAvailable
          ? environment.detection("needs_repair", true, true, false, command, "LaunchAgent 文件缺失，可重新安装或移除残留记录")
          : environment.detection("unavailable", true, true, false, command, "Molis Work Web 启动器和 LaunchAgent 文件均缺失；可移除残留记录，或先修复 Molis Work 安装");
      }
      if (await environment.portCheck()) {
        return environment.detection(
          "conflict",
          true,
          false,
          false,
          command,
          "127.0.0.1:4173 已有进程监听；Molis Work 不会接管或中断它，请先关闭现有监听后再安装",
        );
      }
      return launcherAvailable
        ? environment.detection("absent", true, false, false, command, "尚未启用常驻 Web 服务")
        : environment.detection("unavailable", true, false, false, command, "Molis Work Web 启动器不存在，请先安装或修复 Molis Work");
    }
    const owned = Boolean(
      receipt
      && receiptOwned
      && path.resolve(receipt.plist_path) === environment.plistPath
      && receipt.plist_hash === digest(plist),
    );
    if (!owned) {
      return environment.detection("conflict", true, false, false, command, "同名 LaunchAgent 不属于 Molis Work 或已被修改，不会覆盖");
    }
    const status = await environment.launchctl(["print", environment.serviceTarget()]);
    const processId = launchAgentProcessId(status);
    const running = processId != null;
    const healthyOwnedInstance = processId != null
      && (await environment.healthCheck(processId) || await environment.legacyInstanceCheck(processId));
    if (!launcherAvailable) {
      return environment.detection("unavailable", true, true, running, command, "Molis Work Web 启动器缺失；可移除服务或先修复 Molis Work 安装");
    }
    if (plist !== environment.plistSource()) {
      if (!healthyOwnedInstance && await environment.portCheck()) {
        return environment.detection(
          "conflict",
          true,
          true,
          running,
          command,
          "4173 的监听者无法证明属于当前 Molis Work LaunchAgent；不会在修复旧配置前停止或接管它",
        );
      }
      return environment.detection("needs_repair", true, true, running, command, "Molis Work Web 常驻服务使用旧配置，可预览并确认修复");
    }
    if (!running) {
      if (await environment.portCheck()) {
        return environment.detection(
          "conflict",
          true,
          true,
          false,
          command,
          "Molis Work LaunchAgent 当前未运行，但 127.0.0.1:4173 已被其他进程占用；不会接管或中断该监听",
        );
      }
      return environment.detection("stopped", true, true, false, command, status.code === 0
        ? "Molis Work Web 常驻服务已加载但进程未运行，请查看错误日志"
        : "Molis Work Web 常驻服务已安装但当前未运行");
    }
    if (!healthyOwnedInstance && await environment.portCheck()) {
      return environment.detection(
        "conflict",
        true,
        true,
        true,
        command,
        "4173 的监听者无法证明属于当前 Molis Work LaunchAgent；不会先停止受管服务或接管现有监听",
      );
    }
    return healthyOwnedInstance
      ? environment.detection("running", true, true, true, command, "Molis Work Web 常驻服务正在运行，页面已可访问")
      : environment.detection("unhealthy", true, true, true, command, "Molis Work Web 进程正在运行，但页面暂时不可访问；可受控重启并查看错误日志");
  }
