import { SERVICE_LABEL, type MolisWorkWebServiceAction, type MolisWorkWebServiceDetection, type MolisWorkWebServicePlan } from "./web-service-contract.js";

export function planStatus(
  action: MolisWorkWebServiceAction,
  detection: MolisWorkWebServiceDetection,
  managedArtifactsAbsent: boolean,
): MolisWorkWebServicePlan["status"] {
  if (!detection.supported) return "unsupported";
  if (detection.state === "conflict") {
    if (action === "remove" && detection.owned) return "ready";
    if (action === "remove" && !detection.owned && managedArtifactsAbsent) return "no_change";
    if (action === "stop" && detection.owned) return detection.running ? "ready" : "no_change";
    return "conflict";
  }
  if (detection.state === "unavailable") {
    if (action === "remove" && detection.owned) return "ready";
    if (action === "remove" && !detection.owned) return "no_change";
    if (action === "stop" && detection.running) return "ready";
    return "conflict";
  }
  if (action === "install") return detection.state === "running" ? "no_change" : "ready";
  if (action === "start") {
    if (detection.state === "absent" || detection.state === "needs_repair") return "conflict";
    return detection.state === "running" ? "no_change" : "ready";
  }
  if (action === "stop") return detection.running ? "ready" : "no_change";
  if (action === "restart") {
    if (detection.state === "needs_repair") return "conflict";
    return detection.owned ? "ready" : "conflict";
  }
  return detection.state === "absent" ? "no_change" : detection.owned ? "ready" : "conflict";
}

export function serviceChanges(
  action: MolisWorkWebServiceAction,
  detection: MolisWorkWebServiceDetection,
  status: MolisWorkWebServicePlan["status"],
  plistPath: string,
): MolisWorkWebServicePlan["changes"] {
  if (status !== "ready") return [];
  if (action === "install") return [
    ...(detection.state === "absent" || detection.state === "needs_repair" ? [{ operation: "create" as const, target: plistPath }] : []),
    { operation: detection.state === "unhealthy" ? "restart" : "start", target: SERVICE_LABEL },
  ];
  return [{ operation: action, target: action === "remove" ? plistPath : SERVICE_LABEL }];
}

export function confirmationFor(action: MolisWorkWebServiceAction, detection: MolisWorkWebServiceDetection): string {
  if (action === "install") return detection.state === "needs_repair"
    ? "确认更新旧配置并重新加载 macOS 用户级常驻 Web 服务"
    : "确认安装并启动 macOS 用户级常驻 Web 服务";
  if (action === "remove") return "确认停止并移除 Molis Work 创建的 LaunchAgent（项目数据和日志保留）";
  return `确认${({ start: "启动", stop: "停止", restart: "重启" } as const)[action]} Molis Work Web 常驻服务`;
}

export function planMessage(action: MolisWorkWebServiceAction, status: MolisWorkWebServicePlan["status"], detection: MolisWorkWebServiceDetection): string {
  if (
    status === "conflict"
    && detection.state === "needs_repair"
    && (action === "start" || action === "restart")
  ) {
    return `${detection.message}；${action} 只会重载旧配置，无法完成修复。请改用 molis-work service install --confirm 原子更新配置`;
  }
  if (status === "unsupported" || status === "conflict") return detection.message;
  if (status === "no_change") return `无需操作：${detection.message}`;
  if (action === "install" && detection.state === "needs_repair") return "准备修复旧配置并重新加载 Molis Work Web 常驻服务";
  return `准备${({ install: "安装并启动", start: "启动", stop: "停止", restart: "重启", remove: "移除" } as const)[action]} Molis Work Web 常驻服务`;
}

export function resultMessage(action: MolisWorkWebServiceAction): string {
  if (action === "install") return "Molis Work Web 已作为 macOS 用户级服务运行；关闭终端或 Runtime Session 不会使它退出";
  if (action === "remove") return "Molis Work Web 常驻服务已移除；项目数据和日志仍保留";
  return `Molis Work Web 常驻服务已${({ start: "启动", stop: "停止", restart: "重启" } as const)[action]}`;
}
