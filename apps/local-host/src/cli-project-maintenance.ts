import {existsSync} from "node:fs";
import {join} from "node:path";
import {connectResidentAccount,type ResidentAccountConnection} from "./resident-account-connection.js";
import {catalogManagementProjects} from "./management-action-client.js";
import {actionGatewayHomeId} from "./action-gateway.js";
import {readStorageSpace} from "@molis-ai/molis-work-storage";
import {NATIVE_SESSION_FILE} from "./personal-native-session.js";
import {WEB_CONTROL_TOKEN_RELATIVE_PATH} from "./web-control-token.js";
import { cliFlagValue as flag, cliText, printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { runWithLocalCliLocale } from "./cli-host.js";
import { createLocalUninstallService } from "./local-uninstall.js";
import type { MolisWorkUninstallPlan } from "./installer/uninstall-contract.js";
import { resolveConfiguredHome } from "./product-home.js";
import { RESIDENT_HOST_URL_ENV, postToResidentHost, residentHostAddress, residentHostOrigin } from "./resident-host-request.js";
import { listJoin, type WebLocale } from "./web-locale.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

function printDemoHelp(): void {
  printCliLine(`molis-work demo <create|reset|remove> [--home PATH] [--confirm] [--json]

${cliText("workbench.cli.demo-help")}`);
}

function printUninstallHelp(): void {
  printCliLine(`molis-work uninstall [--home PATH] [--confirm] [--json]
molis-work uninstall --purge-user-data --confirm --confirm-home PATH --confirm-project-count N [--home PATH] [--json]

${cliText("workbench.cli.uninstall-help")}`);
}

function printUninstallPlan(plan: MolisWorkUninstallPlan): void {
  printCliLine(plan.message);
  printCliLine(cliText("workbench.cli.field-status", { status: plan.status }));
  printCliLine(cliText(plan.purge_user_data ? "workbench.cli.uninst-proj-purge" : "workbench.cli.uninst-proj-keep", { count: plan.user_project_count }));
  printCliLine(cliText("workbench.cli.uninst-demo", { count: plan.demo_project_count }));
  for (const change of plan.changes) printCliLine(`- ${change.description}: ${change.target}`);
  for (const conflict of plan.conflicts) printCliLine(cliText("workbench.cli.uninst-conflict", { reason: conflict }));
  printCliLine(plan.confirmation);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


/** What the command prints after create, reset or remove; `result` is null when there was no demo to remove. */
function printDemoResult(action: string, result: object | null, json: boolean, locale: WebLocale): void {
  if (json) { printCliJson(result); return; }
  printCliLine(cliText(action === "remove" ? "workbench.cli.demo-removed" : action === "create" ? "workbench.cli.demo-created" : "workbench.cli.demo-reset"));
  // Memory and the search index belong to a running Molis Work: what this command could not clear waits for it (a
  // removal keeps it in the receipt for the Host to finish) or stays as it was (a rebuild has no receipt).
  const waiting = result && "deletion" in result ? (result as ProjectDeletionResult).deletion.owner_steps.filter(step => step.state !== "complete").map(step => step.owner_id) : [];
  if (waiting.length) printCliLine(cliText("workbench.cli.demo-waiting", { owners: listJoin(waiting, locale) }));
  const left = result && "owners_left" in result ? (result.owners_left as string[] | undefined) ?? [] : [];
  if (left.length) printCliLine(cliText("workbench.cli.demo-left", { owners: listJoin(left, locale) }));
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
    retryHint: cliText("workbench.cli.demo-retry-hint") });
  if (!answer) return null;
  if (!answer.ok) {
    const reason = typeof answer.body.error === "string" ? answer.body.error : `HTTP ${answer.status}`;
    throw new Error(cliText("workbench.cli.demo-res-refused", { address, reason, env: RESIDENT_HOST_URL_ENV }));
  }
  if(action!=="remove")return answer.body;
  const { deletion, replayed } = answer.body as { deletion?: ProjectDeletionResult["deletion"]; replayed?: unknown };
  if (!deletion || typeof deletion !== "object" || typeof replayed !== "boolean") throw new Error(cliText("workbench.cli.demo-bad-receipt", { address }));
  return { deletion, replayed };
}

export function runLocalDemoCli(args: string[], withMolisWorkProjectCatalog: LocalWebCatalogRunner): Promise<number> {
  return runWithLocalCliLocale(undefined, args, async locale => {
    if (args.includes("--help") || args.includes("-h") || !args[1]) {
      printDemoHelp();
      return 0;
    }
    const action = args[1];
    if (!["create", "reset", "remove"].includes(action)) throw new Error(cliText("workbench.cli.unknown-op", { group: "demo", operation: action }));
    let homeDirectory = flag(args, "--home");
    const home=homeDirectory??resolveConfiguredHome();
    const required=homeDirectory===undefined&&readStorageSpace(home)?.kind!=="personal";
    const connected=required||existsSync(join(home,NATIVE_SESSION_FILE))||existsSync(join(home,WEB_CONTROL_TOKEN_RELATIVE_PATH))?await connectResidentAccount(home,residentHostAddress(home),undefined,required):undefined;
    const allowLocalFallback=homeDirectory!==undefined&&!connected?.installation;
    if(connected)homeDirectory=connected.homeDirectory;
    if ((connected||action === "remove") && args.includes("--confirm")) {
      const forwarded = await removeDemoThroughResidentHost(homeDirectory,action,connected);
      if (forwarded) { printDemoResult(action, forwarded, args.includes("--json"), locale); return 0; }
      if(!allowLocalFallback)throw new Error(cliText("workbench.cli.demo-disconnected"));
    }
    if(connected&&!args.includes("--confirm")){
      const demo=catalogManagementProjects(homeDirectory!).find(project=>project.data_class==="regenerable_demo")??null;
      const status=action==="create"&&demo?"no_change":action!=="create"&&!demo?"unavailable":"ready";
      const preview={action,status,demo_project:demo,confirmation:cliText("workbench.cli.not-executed")};
      if(args.includes("--json"))printCliJson(preview);else printCliLine(preview.confirmation);return status==="unavailable"?1:0;
    }
    if(!allowLocalFallback)throw new Error(cliText("workbench.cli.demo-no-creds"));
    return await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
      const demo = catalog.listProjects().find((project) => project.data_class === "regenerable_demo") ?? null;
      if (!args.includes("--confirm")) {
        const preview = {
          action,
          status: action === "create" && demo ? "no_change" : action !== "create" && !demo ? "unavailable" : "ready",
          demo_project: demo,
          confirmation: cliText(action === "create" ? "workbench.cli.demo-cf-create" : action === "reset" ? "workbench.cli.demo-cf-reset" : "workbench.cli.demo-cf-remove"),
        };
        if (args.includes("--json")) printCliJson(preview);
        else printCliLine(`${preview.confirmation}\n${cliText("workbench.cli.not-executed")}`);
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
      printDemoResult(action, result, args.includes("--json"), locale);
      return result == null ? 1 : 0;
    });
  });
}

export function runLocalUninstallCli(args: string[], withMolisWorkProjectCatalog: LocalWebCatalogRunner): Promise<number> {
  return runWithLocalCliLocale(undefined, args, async () => {
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
  });
}
