import {existsSync} from "node:fs";
import {join} from "node:path";
import {connectResidentAccount,type ResidentAccountConnection} from "./resident-account-connection.js";
import {catalogManagementProjects} from "./management-action-client.js";
import {actionGatewayHomeId} from "./action-gateway.js";
import {readStorageSpace} from "@molis-ai/molis-work-storage";
import {NATIVE_SESSION_FILE} from "./personal-native-session.js";
import {WEB_CONTROL_TOKEN_RELATIVE_PATH} from "./web-control-token.js";
import { cliFlagValue as flag, printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { createLocalUninstallService } from "./local-uninstall.js";
import type { MolisWorkUninstallPlan } from "./installer/uninstall-contract.js";
import { resolveConfiguredHome } from "./product-home.js";
import { RESIDENT_HOST_URL_ENV, postToResidentHost, residentHostAddress, residentHostOrigin } from "./resident-host-request.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

function printDemoHelp(): void {
  printCliLine(`molis-work demo <create|reset|remove> [--home PATH] [--confirm] [--json]

不带 --confirm 只显示将发生什么；demo 明确标记为可重建数据，不会与用户项目混淆。

remove --confirm 在 Molis Work 正在运行时交给它来删（示例项目里的终端还开着就拒绝）；常驻服务不在 Home 的地址文件写的端口（没有就是 http://127.0.0.1:4173）时，用环境变量 MOLIS_WORK_WEB_URL 指定它的地址。没有运行中的服务时，命令自己删。`);
}

function printUninstallHelp(): void {
  printCliLine(`molis-work uninstall [--home PATH] [--confirm] [--json]
molis-work uninstall --purge-user-data --confirm --confirm-home PATH --confirm-project-count N [--home PATH] [--json]

普通卸载保留用户项目、catalog、备份和日志。永久清除用户数据是独立操作，必须再次提供精确目录和项目数量。
App 或离线操作占用 Home 时先拒绝；请先关闭 App 并等待操作结束。永久清除成功后只保留互斥锁骨架，Home 文件夹不会删除。`);
}

function printUninstallPlan(plan: MolisWorkUninstallPlan): void {
  printCliLine(plan.message);
  printCliLine(`状态：${plan.status}`);
  printCliLine(`用户项目：${plan.user_project_count}（${plan.purge_user_data ? "将永久删除" : "保留"}）`);
  printCliLine(`可重建 demo：${plan.demo_project_count}`);
  for (const change of plan.changes) printCliLine(`- ${change.description}: ${change.target}`);
  for (const conflict of plan.conflicts) printCliLine(`冲突：${conflict}`);
  printCliLine(plan.confirmation);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


/** What the command prints after create, reset or remove; `result` is null when there was no demo to remove. */
function printDemoResult(action: string, result: object | null, json: boolean): void {
  if (json) { printCliJson(result); return; }
  printCliLine(action === "remove" ? "可重建 demo 已删除；用户项目未修改" : `demo ${action === "create" ? "已创建或打开" : "已重置"}`);
  // Memory and the search index belong to a running Molis Work: what this command could not clear waits for it (a
  // removal keeps it in the receipt for the Host to finish) or stays as it was (a rebuild has no receipt).
  const waiting = result && "deletion" in result ? (result as ProjectDeletionResult).deletion.owner_steps.filter(step => step.state !== "complete").map(step => step.owner_id) : [];
  if (waiting.length) printCliLine(`还有数据要由运行中的 Molis Work 清理（${waiting.join("、")}）；Molis Work 运行时会接着做，做完之前不能再创建 demo。`);
  const left = result && "owners_left" in result ? (result.owners_left as string[] | undefined) ?? [] : [];
  if (left.length) printCliLine(`demo 在 ${left.join("、")} 里的数据由运行中的 Molis Work 保管，这个命令没有清；要连它们一起清，在 Molis Work 里打开这个项目的设置，点「重建 demo」。`);
}

/**
 * Removing the demo is the Host's project-deletion service when this Home has a resident Host that answers: the project's
 * terminals and runtime are that Host's, so it checks the terminals, lets go of the runtime and records the person on this
 * machine, the same as the settings page's "delete the demo" it is asked through. The address is `MOLIS_WORK_WEB_URL` (the
 * variable the Runtime's launcher reads) or the default one. Null when no Host answers (no control token in the Home, or
 * nothing listens): there is nothing to ask, and the command deletes in its own process. A Host that answers and refuses
 * stops the command, whatever the reason; it does not delete behind that Host's back.
 */
async function removeDemoThroughResidentHost(homeDirectory: string | undefined,action="remove",connected?:ResidentAccountConnection): Promise<object | null> {
  const address = residentHostAddress(homeDirectory ?? resolveConfiguredHome());
  const answer = await postToResidentHost({ origin: residentHostOrigin(address), homeDirectory: homeDirectory ?? resolveConfiguredHome(),controlToken:connected?.controlToken,homeId:connected? actionGatewayHomeId(connected.homeDirectory):undefined,
    path: "/api/settings/demo", body: { action, user_confirmed: true },
    retryHint: "先运行不带 --confirm 的 molis-work demo remove，看示例项目还在不在" });
  if (!answer) return null;
  if (!answer.ok) {
    const reason = typeof answer.body.error === "string" ? answer.body.error : `HTTP ${answer.status}`;
    throw new Error(`${address} 上的常驻服务没有删除示例项目：${reason}（如果这个 Home 的常驻服务在别的地址，用环境变量 ${RESIDENT_HOST_URL_ENV} 指定）`);
  }
  if(action!=="remove")return answer.body;
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
  let homeDirectory = flag(args, "--home");
  const home=homeDirectory??resolveConfiguredHome();
  const required=homeDirectory===undefined&&readStorageSpace(home)?.kind!=="personal";
  const connected=required||existsSync(join(home,NATIVE_SESSION_FILE))||existsSync(join(home,WEB_CONTROL_TOKEN_RELATIVE_PATH))?await connectResidentAccount(home,residentHostAddress(home),undefined,required):undefined;
  const allowLocalFallback=homeDirectory!==undefined&&!connected?.installation;
  if(connected)homeDirectory=connected.homeDirectory;
  if ((connected||action === "remove") && args.includes("--confirm")) {
    const forwarded = await removeDemoThroughResidentHost(homeDirectory,action,connected);
    if (forwarded) { printDemoResult(action, forwarded, args.includes("--json")); return 0; }
    if(!allowLocalFallback)throw new Error("当前账号宿主已断开，请显式重连；没有执行本地回退。");
  }
  if(connected&&!args.includes("--confirm")){
    const demo=catalogManagementProjects(homeDirectory!).find(project=>project.data_class==="regenerable_demo")??null;
    const status=action==="create"&&demo?"no_change":action!=="create"&&!demo?"unavailable":"ready";
    const preview={action,status,demo_project:demo,confirmation:"未执行；确认后重新运行并加 --confirm。"};
    if(args.includes("--json"))printCliJson(preview);else printCliLine(preview.confirmation);return status==="unavailable"?1:0;
  }
  if(!allowLocalFallback)throw new Error("当前账号连接凭据缺失，请显式重新连接；不能打开匿名业务。");
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
      if (args.includes("--json")) printCliJson(preview);
      else printCliLine(`${preview.confirmation}\n未执行；确认后重新运行并加 --confirm。`);
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
    if (args.includes("--json")) printCliJson(plan);
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
  if (args.includes("--json")) printCliJson(result);
  else printCliLine(result.message);
  return 0;
}
