import { cliFlagValue as flag } from "@molis-ai/molis-work-app-cli";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { createLocalUninstallService } from "./local-uninstall.js";
import type { MolisWorkUninstallPlan } from "./installer/uninstall-contract.js";
import { resolveConfiguredHome } from "./product-home.js";
import { DEFAULT_RESIDENT_HOST_URL, RESIDENT_HOST_URL_ENV, postToResidentHost, residentHostOrigin } from "./resident-host-request.js";
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


/** What the command prints after create, reset or remove; `result` is null when there was no demo to remove. */
function printDemoResult(action: string, result: object | null, json: boolean): void {
  if (json) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(action === "remove" ? "可重建 demo 已删除；用户项目未修改" : `demo ${action === "create" ? "已创建或打开" : "已重置"}`);
  // Memory and the search index belong to a running Molis Work: what this command could not clear waits for it (a
  // removal keeps it in the receipt for the Host to finish) or stays as it was (a rebuild has no receipt).
  const waiting = result && "deletion" in result ? (result as ProjectDeletionResult).deletion.owner_steps.filter(step => step.state !== "complete").map(step => step.owner_id) : [];
  if (waiting.length) console.log(`还有数据要由运行中的 Molis Work 清理（${waiting.join("、")}）；Molis Work 运行时会接着做，做完之前不能再创建 demo。`);
  const left = result && "owners_left" in result ? (result.owners_left as string[] | undefined) ?? [] : [];
  if (left.length) console.log(`demo 在 ${left.join("、")} 里的数据由运行中的 Molis Work 保管，这个命令没有清；要连它们一起清，在 Molis Work 里打开这个项目的设置，点「重建 demo」。`);
}

/**
 * Removing the demo is the Host's project-deletion service when this Home has a resident Host that answers: the project's
 * terminals and runtime are that Host's, so it checks the terminals, lets go of the runtime and records the person on this
 * machine, the same as the settings page's "delete the demo" it is asked through. The address is `MOLIS_WORK_WEB_URL` (the
 * variable the Runtime's launcher reads) or the default one. Null when no Host answers (no control token in the Home, or
 * nothing listens): there is nothing to ask, and the command deletes in its own process. A Host that answers and refuses
 * stops the command, whatever the reason; it does not delete behind that Host's back.
 */
async function removeDemoThroughResidentHost(withCatalog: LocalWebCatalogRunner, homeDirectory: string | undefined): Promise<ProjectDeletionResult | null> {
  const demo = await withCatalog({ homeDirectory }, catalog => catalog.listProjects().find(project => project.data_class === "regenerable_demo"));
  if (!demo) return null;
  const address = process.env[RESIDENT_HOST_URL_ENV]?.trim() || DEFAULT_RESIDENT_HOST_URL;
  const answer = await postToResidentHost({ origin: residentHostOrigin(address), homeDirectory: homeDirectory ?? resolveConfiguredHome(),
    path: "/api/settings/demo", body: { action: "remove", user_confirmed: true },
    retryHint: "先运行不带 --confirm 的 molis-work demo remove，看示例项目还在不在" });
  if (!answer) return null;
  if (!answer.ok) {
    const reason = typeof answer.body.error === "string" ? answer.body.error : `HTTP ${answer.status}`;
    throw new Error(`${address} 上的常驻服务没有删除示例项目：${reason}（如果这个 Home 的常驻服务在别的地址，用环境变量 ${RESIDENT_HOST_URL_ENV} 指定）`);
  }
  const { deletion, replayed } = answer.body as { deletion?: ProjectDeletionResult["deletion"]; replayed?: unknown };
  if (!deletion || typeof deletion !== "object" || typeof replayed !== "boolean") throw new Error(`${address} 上的常驻服务的删除回执无效`);
  return { deletion, replayed };
}

export async function runLocalDemoCli(args: string[], withMolisWorkProjectCatalog: LocalWebCatalogRunner): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || !args[1]) {
    printDemoHelp();
    return 0;
  }
  const action = args[1];
  if (!["create", "reset", "remove"].includes(action)) throw new Error(`未知 demo 操作: ${action}`);
  const homeDirectory = flag(args, "--home");
  if (action === "remove" && args.includes("--confirm")) {
    const forwarded = await removeDemoThroughResidentHost(withMolisWorkProjectCatalog, homeDirectory);
    if (forwarded) { printDemoResult(action, forwarded, args.includes("--json")); return 0; }
  }
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
    printDemoResult(action, result, args.includes("--json"));
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
