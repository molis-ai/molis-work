import { cliFlagValue as flag } from "@molis-ai/molis-work-app-cli";
import { createLocalUninstallService } from "./local-uninstall.js";
import type { MolisWorkUninstallPlan } from "./installer/uninstall-contract.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

function printDemoHelp(): void {
  console.log(`molis-work demo <create|reset|remove> [--home PATH] [--confirm] [--json]

不带 --confirm 只显示将发生什么；demo 明确标记为可重建数据，不会与用户项目混淆。`);
}

function printUninstallHelp(): void {
  console.log(`molis-work uninstall [--home PATH] [--confirm] [--json]
molis-work uninstall --purge-user-data --confirm --confirm-home PATH --confirm-project-count N [--home PATH] [--json]

普通卸载保留用户项目、catalog、备份和日志。永久清除用户数据是独立操作，必须再次提供精确目录和项目数量。`);
}

function printUninstallPlan(plan: MolisWorkUninstallPlan): void {
  console.log(plan.message);
  console.log(`状态：${plan.status}`);
  console.log(`用户项目：${plan.user_project_count}（${plan.purge_user_data ? "将永久删除" : "保留"}）`);
  console.log(`可重建 demo：${plan.demo_project_count}`);
  for (const change of plan.changes) console.log(`- ${change.description}: ${change.target}`);
  for (const conflict of plan.conflicts) console.log(`冲突：${conflict}`);
  console.log(plan.confirmation);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


export async function runLocalDemoCli(args: string[], withMolisWorkProjectCatalog: LocalWebCatalogRunner): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || !args[1]) {
    printDemoHelp();
    return 0;
  }
  const action = args[1];
  if (!["create", "reset", "remove"].includes(action)) throw new Error(`未知 demo 操作: ${action}`);
  const homeDirectory = flag(args, "--home");
  return await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
    const demo = catalog.listProjects().find((project) => project.data_class === "regenerable_demo") ?? null;
    if (!args.includes("--confirm")) {
      const preview = {
        action,
        status: action === "create" && demo ? "no_change" : action !== "create" && !demo ? "unavailable" : "ready",
        demo_project: demo,
        confirmation: action === "create"
          ? "确认创建明确标记为可重建数据的示例项目"
          : action === "reset"
            ? "确认用内置示例重新生成 demo；其中的改动会被清除"
            : "确认删除这个可重建 demo；用户项目不受影响",
      };
      if (args.includes("--json")) console.log(JSON.stringify(preview, null, 2));
      else console.log(`${preview.confirmation}\n未执行；确认后重新运行并加 --confirm。`);
      return preview.status === "unavailable" ? 1 : 0;
    }
    const result = action === "create"
      ? await catalog.ensureDemoProject({ actor_id: "molis-work-cli", user_confirmed: true })
      : action === "reset"
        ? await catalog.resetDemoProject({ actor_id: "molis-work-cli", user_confirmed: true })
        : demo
          ? await catalog.removeDemoProject({
              project_id: demo.project_id,
              actor_id: "molis-work-cli",
              delete_confirmed: true,
              idempotency_key: `demo-remove-${randomId()}`,
            })
          : null;
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(action === "remove" ? "可重建 demo 已删除；用户项目未修改" : `demo ${action === "create" ? "已创建或打开" : "已重置"}`);
    return result == null ? 1 : 0;
  });
}

export async function runLocalUninstallCli(args: string[], withMolisWorkProjectCatalog: LocalWebCatalogRunner): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printUninstallHelp();
    return 0;
  }
  const service = createLocalUninstallService({ homeDirectory: flag(args, "--home") }, withMolisWorkProjectCatalog);
  const purgeUserData = args.includes("--purge-user-data");
  const plan = await service.prepare({ purge_user_data: purgeUserData });
  if (!args.includes("--confirm")) {
    if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
    else printUninstallPlan(plan);
    return plan.status === "conflict" ? 1 : 0;
  }
  const projectCountFlag = flag(args, "--confirm-project-count");
  const result = await service.confirm({
    plan_id: plan.plan_id,
    decision: "confirmed",
    ...(purgeUserData ? {
      purge_confirmation: {
        home_directory: flag(args, "--confirm-home") ?? "",
        user_project_count: projectCountFlag == null ? Number.NaN : Number(projectCountFlag),
      },
    } : {}),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(result.message);
  return 0;
}
