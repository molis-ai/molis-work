import { cliText, printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithLocalCliLocale } from "./cli-host.js";
import { createHomeSnapshot } from "./home-snapshot.js";
import { requestResidentHomeSnapshot } from "./home-maintenance-gateway.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";
import { recoverHomeRestore, restoreHomeSnapshot } from "./home-restore.js";
import type { HomeRestoreCatalogInspector, HomeRestoreResult } from "./home-restore-contract.js";
import { homeRestoreErrors } from "./home-restore-input.js";
import { readRollbackPoint, rollbackHome, type RollbackResult } from "./installer/home-rollback.js";
import { resolveConfiguredHome } from "./product-home.js";

function homeUsage(): string {
  return "molis-work home snapshot --to DIRECTORY [--home PATH] [--json]\n"
    + "molis-work home restore --from DIRECTORY [--home PATH] [--json]\n"
    + "molis-work home restore --recover [--home PATH] [--json]\n"
    + "molis-work home rollback --check | --confirm [--save-current DIRECTORY] [--home PATH] [--json]\n\n"
    + cliText("workbench.cli.home-help");
}

const ALLOWED = { snapshot: ["--home", "--to", "--json"], restore: ["--home", "--from", "--recover", "--json"],
  rollback: ["--home", "--check", "--confirm", "--save-current", "--json"] } as const;
const SWITCHES = new Set(["--json", "--recover", "--check", "--confirm"]);

function flags(args: string[], operation: keyof typeof ALLOWED): Map<string, string | true> {
  const allowed: readonly string[] = ALLOWED[operation];
  const values = new Map<string, string | true>();
  for (let at = 1; at < args.length; at += 1) {
    const name = args[at]!;
    if (!allowed.includes(name) || values.has(name)) throw homeSnapshotErrors.invalid(cliText("workbench.cli.home-bad-flag", { flag: name }));
    if (SWITCHES.has(name)) values.set(name, true);
    else {
      const value = args[++at];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--"))
        throw homeSnapshotErrors.invalid(cliText("workbench.cli.home-empty-path", { flag: name }));
      values.set(name, value);
    }
  }
  return values;
}

function rolledBackMessage(result: RollbackResult): string {
  const head = result.data === "unchanged"
    ? cliText("workbench.cli.home-rb-unchanged", { version: result.version })
    : cliText("workbench.cli.home-rb-restored", { version: result.version, count: result.restored.length });
  const saved = result.saved_to ? `\n${cliText("workbench.cli.home-rb-saved", { path: result.saved_to })}` : "";
  return `${head}${saved}\n${cliText("workbench.cli.home-rb-next")}`;
}

function restoredMessage(result: HomeRestoreResult): string {
  if (result.status === "unchanged") return cliText("workbench.cli.home-rs-unchanged");
  if (result.status === "no_recovery") return cliText("workbench.cli.home-rs-none");
  const action = result.status === "restored"
    ? cliText("workbench.cli.home-rs-done")
    : result.status === "rolled_back"
      ? cliText("workbench.cli.home-rs-rb")
      : cliText("workbench.cli.home-rs-final");
  return `${action}\n${cliText("workbench.cli.home-rs-originals", { path: result.originals_directory ?? "" })}`;
}

/** Closed arguments fail before acquiring a Home. The restore inspector comes only from product platform composition. */
export function runLocalHomeCli(args: string[], inspectCatalog?: HomeRestoreCatalogInspector): Promise<number> {
  return runWithLocalCliLocale(undefined, args, async () => {
    if (!args.length || args[0] === "--help" || args[0] === "-h" || ["snapshot", "restore", "rollback"].includes(args[0]!) && args.length === 2 && args[1] === "--help") {
      printCliLine(homeUsage()); return 0;
    }
    const operation = args[0];
    if (operation !== "snapshot" && operation !== "restore" && operation !== "rollback") throw homeSnapshotErrors.invalid(cliText("workbench.cli.unknown-op", { group: "Home", operation: String(operation ?? "") }));
    const values = flags(args, operation), home = values.get("--home"), destination = values.get("--to"), source = values.get("--from");
    if (operation === "snapshot" && typeof destination !== "string") throw homeSnapshotErrors.invalid(cliText("workbench.cli.home-need-flag", { command: "home snapshot", flag: "--to" }));
    if (operation === "restore" && (typeof source === "string") === values.has("--recover")) throw homeRestoreErrors.invalid(cliText("workbench.cli.home-one-of", { command: "home restore", options: "--from / --recover" }));
    if (operation === "rollback" && values.has("--check") === values.has("--confirm")) throw homeSnapshotErrors.invalid(cliText("workbench.cli.home-one-of", { command: "home rollback", options: "--check / --confirm" }));
    if (operation === "rollback" && values.has("--check") && values.has("--save-current")) throw homeSnapshotErrors.invalid(cliText("workbench.cli.home-save-confirm"));
    if (operation === "restore" && !inspectCatalog) throw homeRestoreErrors.dependency_unavailable(cliText("workbench.cli.home-no-inspector"));
    const abort = new AbortController(), cancelled = () => abort.abort(new Error(cliText("workbench.cli.home-cancelled")));
    process.once("SIGINT", cancelled); process.once("SIGTERM", cancelled);
    try {
      const options = { ...(typeof home === "string" ? { homeDirectory: home } : {}), signal: abort.signal };
      if (operation === "rollback") {
        const target = resolveConfiguredHome(typeof home === "string" ? home : undefined);
        if (values.has("--check")) {
          const point = readRollbackPoint(target);
          if (values.has("--json")) printCliJson(point);
          else printCliLine(point.available
            ? cliText(point.data === "restore" ? "workbench.cli.home-check-restore" : "workbench.cli.home-check-unchanged", { version: point.version })
            : cliText("workbench.cli.home-check-no", { reason: point.reason }));
          return 0;
        }
        const save = values.get("--save-current");
        // Asked first so a refusal does not leave a whole copy of the Home behind; the rollback asks again under the lock.
        if (typeof save === "string" && !readRollbackPoint(target).available) await rollbackHome(target);
        const saved = typeof save === "string" ? (await createHomeSnapshot({ ...options, destination: save })).snapshot_directory : null;
        const result = await rollbackHome(target, { saved_to: saved });
        if (values.has("--json")) printCliJson(result); else printCliLine(rolledBackMessage(result));
      } else if (operation === "snapshot") {
        const online = await requestResidentHomeSnapshot({ ...options, destination: destination as string });
        const result = online ?? await createHomeSnapshot({ ...options, destination: destination as string });
        if (values.has("--json")) printCliJson(result);
        else printCliLine(`${cliText("workbench.cli.home-snap-saved", { path: result.snapshot_directory })}\n${cliText("workbench.cli.home-snap-detail", { stores: result.stores, databases: result.databases })}`);
      } else {
        const result = values.has("--recover") ? await recoverHomeRestore({ ...options, inspectCatalog: inspectCatalog! })
          : await restoreHomeSnapshot({ ...options, source: source as string, inspectCatalog: inspectCatalog! });
        if (values.has("--json")) printCliJson(result); else printCliLine(restoredMessage(result));
      }
      return 0;
    } catch (error) {
      if (!values.has("--json") || !(error instanceof ActionError)) throw error;
      process.stderr.write(
        JSON.stringify({ error: { code: error.code, kind: error.kind, message: error.message } }) +
          "\n",
      );
      return 1;
    } finally {
      process.off("SIGINT", cancelled);
      process.off("SIGTERM", cancelled);
    }
  });
}
