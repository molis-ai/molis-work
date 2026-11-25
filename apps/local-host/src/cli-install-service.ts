import { cliFlagValue as flag, cliText, printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import { runWithLocalCliLocale } from "./cli-host.js";
import { installMolisWorkHome } from "./installer/home.js";
import type { MolisWorkHomeInstallResult } from "./installer/home-contract.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { MolisWorkWebServiceAction, MolisWorkWebServicePlan } from "./installer/web-service-contract.js";

function printInstallHelp(): void {
  printCliLine(`molis-work install [--home PATH] [--source PATH] [--version VERSION] [--json]

${cliText("workbench.cli.install-help")}`);
}

function printServiceHelp(): void {
  printCliLine(`molis-work service status [--home PATH] [--json]
molis-work service <install|start|stop|restart|remove> [--home PATH] [--confirm] [--json]

${cliText("workbench.cli.service-help")}`);
}

function installStatusLabel(status: MolisWorkHomeInstallResult["status"]): string {
  if (status === "installed") return cliText("workbench.cli.install-installed");
  if (status === "upgraded") return cliText("workbench.cli.install-upgraded");
  if (status === "refreshed") return cliText("workbench.cli.install-refreshed");
  if (status === "repaired") return cliText("workbench.cli.install-repaired");
  return cliText("workbench.cli.install-unchanged");
}

function displayCommand(args: string[]): string {
  return args.map((value) => (/^[0-9A-Za-z_./:+-]+$/.test(value) ? value : JSON.stringify(value))).join(" ");
}

function printInstallResult(result: MolisWorkHomeInstallResult): void {
  printCliLine(cliText("workbench.cli.install-summary", { status: installStatusLabel(result.status), version: result.version }));
  printCliLine(cliText("workbench.cli.install-dir", { path: result.home_directory }));
  printCliLine(`CLI: ${result.launchers.cli}`);
  printCliLine(`MCP: ${result.launchers.mcp}`);
  printCliLine(`Web: ${result.launchers.web}`);
  printCliLine(result.next_steps.message);
  printCliLine(cliText("workbench.cli.install-open-web", { command: displayCommand(result.next_steps.web_command) }));
  printCliLine(cliText("workbench.cli.install-service", { command: displayCommand(result.next_steps.service_install_command) }));
  if (["upgraded", "refreshed", "repaired"].includes(result.status)) {
    printCliLine(cliText("workbench.cli.install-restart", { command: displayCommand(result.next_steps.service_restart_command) }));
  }
}

function printServicePlan(plan: MolisWorkWebServicePlan): void {
  printCliLine(plan.message);
  printCliLine(cliText("workbench.cli.field-status", { status: plan.status }));
  printCliLine(`LaunchAgent: ${plan.detection.plist_path}`);
  printCliLine(cliText("workbench.cli.field-command", { command: displayCommand(plan.detection.command) }));
  printCliLine(cliText("workbench.cli.field-logs", { stdout: plan.detection.stdout_log, stderr: plan.detection.stderr_log }));
  if (plan.next_action === "service_install") printCliLine(cliText("workbench.cli.service-next"));
  for (const change of plan.changes) printCliLine(`- ${change.operation}: ${change.target}`);
  if (plan.status === "ready") printCliLine(cliText("workbench.cli.confirm-with-cmd", { command: plan.confirmation }));
}


export function runLocalInstallCli(args: string[], defaultSourceDirectory: () => string): Promise<number> {
  return runWithLocalCliLocale(undefined, args, async () => {
    if (args.includes("--help") || args.includes("-h")) {
      printInstallHelp();
      return 0;
    }
    const result = await installMolisWorkHome({
      homeDirectory: flag(args, "--home"),
      sourceDirectory: flag(args, "--source") ?? defaultSourceDirectory(),
      version: flag(args, "--version"),
    });
    if (args.includes("--json")) printCliJson(result);
    else printInstallResult(result);
    return 0;
  });
}

export function runLocalServiceCli(args: string[]): Promise<number> {
  return runWithLocalCliLocale(undefined, args, async () => {
    if (args.includes("--help") || args.includes("-h") || !args[1]) {
      printServiceHelp();
      return 0;
    }
    const manager = new MolisWorkWebServiceManager({ homeDirectory: flag(args, "--home") });
    if (args[1] === "status") {
      const detection = await manager.detect();
      if (args.includes("--json")) printCliJson(detection);
      else {
        printCliLine(detection.message);
        printCliLine(cliText("workbench.cli.field-status", { status: detection.state }));
        printCliLine(`LaunchAgent: ${detection.plist_path}`);
        printCliLine(cliText("workbench.cli.field-logs", { stdout: detection.stdout_log, stderr: detection.stderr_log }));
      }
      return 0;
    }
    const action = args[1] as MolisWorkWebServiceAction;
    if (!["install", "start", "stop", "restart", "remove"].includes(action)) {
      throw new Error(cliText("workbench.cli.unknown-op", { group: "service", operation: String(args[1] ?? "") }));
    }
    const plan = await manager.prepare(action);
    if (!args.includes("--confirm")) {
      if (args.includes("--json")) printCliJson(plan);
      else printServicePlan(plan);
      return plan.status === "conflict" || plan.status === "unsupported" ? 1 : 0;
    }
    const result = await manager.confirm({ plan_id: plan.plan_id, decision: "confirmed" });
    if (args.includes("--json")) printCliJson(result);
    else printCliLine(result.message);
    return 0;
  });
}
