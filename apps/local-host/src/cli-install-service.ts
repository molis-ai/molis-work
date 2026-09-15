import { cliFlagValue as flag } from "@molis-ai/molis-work-app-cli";
import { installMolisWorkHome } from "./installer/home.js";
import type { MolisWorkHomeInstallResult } from "./installer/home-contract.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { MolisWorkWebServiceAction, MolisWorkWebServicePlan } from "./installer/web-service-contract.js";

function printInstallHelp(): void {
  console.log(`molis-work install [--home PATH] [--source PATH] [--version VERSION] [--json]

默认只把 Molis Work 自身写入 ~/.molis-work，不创建或启动项目，也不修改任何 Runtime 配置。`);
}

function printServiceHelp(): void {
  console.log(`molis-work service status [--home PATH] [--json]
molis-work service <install|start|stop|restart|remove> [--home PATH] [--confirm] [--json]

写操作默认只显示预览；只有显式传入 --confirm 才会修改 macOS 用户级 LaunchAgent。`);
}

function installStatusLabel(status: MolisWorkHomeInstallResult["status"]): string {
  if (status === "installed") return "安装完成";
  if (status === "upgraded") return "升级完成";
  if (status === "refreshed") return "同版本内容已刷新";
  if (status === "repaired") return "修复完成";
  return "已经是最新状态";
}

function displayCommand(args: string[]): string {
  return args.map((value) => (/^[0-9A-Za-z_./:+-]+$/.test(value) ? value : JSON.stringify(value))).join(" ");
}

function printInstallResult(result: MolisWorkHomeInstallResult): void {
  console.log(`Molis Work ${installStatusLabel(result.status)}（${result.version}）`);
  console.log(`安装目录：${result.home_directory}`);
  console.log(`CLI：${result.launchers.cli}`);
  console.log(`MCP：${result.launchers.mcp}`);
  console.log(`Web：${result.launchers.web}`);
  console.log(result.next_steps.message);
  console.log(`可选打开 Web：${displayCommand(result.next_steps.web_command)}`);
  console.log(`可选启用常驻 Web，或修复 needs_repair：${displayCommand(result.next_steps.service_install_command)}`);
  if (["upgraded", "refreshed", "repaired"].includes(result.status)) {
    console.log(`仅当配置无需修复、只需加载新内容时确认重启：${displayCommand(result.next_steps.service_restart_command)}`);
  }
}

function printServicePlan(plan: MolisWorkWebServicePlan): void {
  console.log(plan.message);
  console.log(`状态：${plan.status}`);
  console.log(`LaunchAgent：${plan.detection.plist_path}`);
  console.log(`命令：${displayCommand(plan.detection.command)}`);
  console.log(`日志：${plan.detection.stdout_log} / ${plan.detection.stderr_log}`);
  if (plan.next_action === "service_install") console.log("下一步：molis-work service install --confirm");
  for (const change of plan.changes) console.log(`- ${change.operation}: ${change.target}`);
  if (plan.status === "ready") console.log(`未执行。确认后重新运行并加 --confirm：${plan.confirmation}`);
}


export async function runLocalInstallCli(args: string[], defaultSourceDirectory: () => string): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printInstallHelp();
    return 0;
  }
  const result = await installMolisWorkHome({
    homeDirectory: flag(args, "--home"),
    sourceDirectory: flag(args, "--source") ?? defaultSourceDirectory(),
    version: flag(args, "--version"),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else printInstallResult(result);
  return 0;
}

export async function runLocalServiceCli(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || !args[1]) {
    printServiceHelp();
    return 0;
  }
  const manager = new MolisWorkWebServiceManager({ homeDirectory: flag(args, "--home") });
  if (args[1] === "status") {
    const detection = await manager.detect();
    if (args.includes("--json")) console.log(JSON.stringify(detection, null, 2));
    else {
      console.log(detection.message);
      console.log(`状态：${detection.state}`);
      console.log(`LaunchAgent：${detection.plist_path}`);
      console.log(`日志：${detection.stdout_log} / ${detection.stderr_log}`);
    }
    return 0;
  }
  const action = args[1] as MolisWorkWebServiceAction;
  if (!["install", "start", "stop", "restart", "remove"].includes(action)) {
    throw new Error(`未知常驻服务操作: ${args[1]}`);
  }
  const plan = await manager.prepare(action);
  if (!args.includes("--confirm")) {
    if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
    else printServicePlan(plan);
    return plan.status === "conflict" || plan.status === "unsupported" ? 1 : 0;
  }
  const result = await manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(result.message);
  return 0;
}
