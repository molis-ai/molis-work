import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { readStorageSpace } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";
import { pendingUpgradeUnits, runHomeUpgrade } from "./home-upgrade.js";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH, sendWebHealth } from "./web-control-token.js";
import { refuseForeignRequest, refuseLocalWebRequest, sendLocalWebJson } from "./web-http.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { installHostUiText } from "./ui-text-provider.js";
import { renderMolisWorkArrivalStylesheet, renderUpgradeOpeningPage } from "@molis-ai/molis-work-app-workbench";
import { htmlLang } from "./web-locale.js";
import { tightenServedCss } from "./served-page-text.js";

/** The opening page runs its own few lines and reads its own numbers; nothing else, from nowhere else. */
const OPENING_CSP = "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'";

/** Which Homes a start has to bring up to date before it can serve. The root Home always comes first when it is among them (§5.2: one large account must not hold it back). */
export interface HomeUpgradePlan {
  readonly needed: boolean;
  readonly homes: readonly string[];
  /** The stores and files waiting, across these Homes. All this feeds is `/health`'s numbers. */
  readonly total: number;
}

/**
 * The account Homes under this one, read only and with nothing created (§4.2, S-upgrade-snapshot-confinement). There is no login yet, so no one
 * can say which identity to expect: a directory counts when it is really here, not through a link, and says of itself that it is this account.
 * Everything else is left for the open that does know, with one line in the log.
 */
function accountHomes(root: string): readonly string[] {
  const spaces = join(root, "spaces"), skipped = (reason: string) => hostLog.warn("host", "home_upgrade_space_skipped", undefined, { reason });
  try {
    if (!lstatSync(spaces, { throwIfNoEntry: false })) return [];
    if (realpathSync(spaces) !== spaces) { skipped("spaces_not_here"); return []; }
    return readdirSync(spaces).sort().filter(name => {
      const directory = join(spaces, name);
      try {
        if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) { skipped("not_here"); return false; }
        const space = readStorageSpace(directory);
        if (space === null) return false;
        if (space.kind !== "personal" || space.spaceId !== name) { skipped("not_this_account"); return false; }
        return true;
      } catch { skipped("unreadable"); return false; }
    }).map(name => join(spaces, name));
  } catch { skipped("unreadable"); return []; }
}

/** Takes no lock and writes nothing. Each Home reads its own stamp, and costs a scan of versions only when that does not match. */
export function planHomeUpgrade(home: string): HomeUpgradePlan {
  let root: string;
  try { root = realpathSync(home); } catch { return { needed: false, homes: [], total: 0 }; }
  const waiting = [root, ...accountHomes(root)].map(directory => [directory, pendingUpgradeUnits(directory)] as const).filter(([, units]) => units > 0);
  return { needed: waiting.length > 0, homes: waiting.map(([directory]) => directory), total: waiting.reduce((sum, [, units]) => sum + units, 0) };
}

export type UpgradeMaintenanceMessage =
  | { readonly kind: "unit" }
  /** Only the code: this travels to a process that answers on a port. */
  | { readonly kind: "failed"; readonly code: string };

/**
 * What the thread does, one Home at a time, each with its own lock and its own `upgrade/`. A store that fails stays in its record and is not a
 * failure here. What is left (the lock taken by someone else, a record that does not check out) is for the ordinary start to say: it takes the
 * same lock and meets the same thing right after this, and an account Home meets it when it is opened.
 */
export function upgradeHomesForMaintenance(homes: readonly string[], post: (message: UpgradeMaintenanceMessage) => void): void {
  for (const home of homes) {
    try { runHomeUpgrade(home, { onUnitDone: () => post({ kind: "unit" }) }); }
    catch (error) {
      hostLog.warn("host", "home_upgrade_maintenance_stopped", error);
      const { code } = (error ?? {}) as { code?: unknown };
      post({ kind: "failed", code: typeof code === "string" ? code : "storage.upgrade_failed" });
    }
  }
}

function readExistingControlToken(home: string): string | undefined {
  try {
    const token = readFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8").trim();
    return token.length >= 32 && token.length <= 512 && !/[\r\n\0]/.test(token) ? token : undefined;
  } catch { return undefined; }
}

const foreignOrigin = (origin: string | undefined) => origin !== undefined && (!URL.canParse(origin) || !isLoopbackHttpOrigin(new URL(origin)));

export interface UpgradeMaintenanceOptions {
  readonly home: string;
  readonly port: number;
  readonly plan: HomeUpgradePlan;
  /** Tests give a thread that also registers their own stores. */
  readonly workerEntry?: URL;
  readonly onListening?: (address: AddressInfo) => void;
}

/**
 * §4.2: while the Homes upgrade, the port answers, so nothing that waits for this process takes it for dead and kills it mid-upgrade. Only `/health`
 * says anything, with numbers and the proof, and it is 503; everything else is 503 too. No library name and no content reach it. The upgrade runs
 * in a thread because it is synchronous, and this one has to go on answering. It never writes the control token: without one, no proof.
 * Resolves when the listener is closed, whatever became of the upgrade: the ordinary start comes next and says what is wrong, if anything is.
 */
export async function runUpgradeMaintenance({ home, port, plan, workerEntry, onListening }: UpgradeMaintenanceOptions): Promise<void> {
  installHostUiText();
  const started_at = Date.now(), token = readExistingControlToken(home);
  let done = 0, finished = false, arrivalStylesheet: string | undefined;
  const answer = (request: IncomingMessage, response: ServerResponse) => {
    if (refuseForeignRequest(request, response)) return;
    if (foreignOrigin(request.headers.origin)) { refuseLocalWebRequest(response); return; }
    const url = new URL(request.url ?? "/", "http://localhost");
    const progress = { done, total: Math.max(done, plan.total), started_at };
    if (request.method === "GET" && url.pathname === "/health") {
      const payload = { status: "upgrading", process_id: process.pid, service_process_id: serviceProcessId(), upgrade: progress };
      sendWebHealth(response, 503, payload, token ?? "", token === undefined ? null : url.searchParams.get("challenge"));
      return;
    }
    // U3 §4: the two numbers the opening page reads, and nothing else; the same as `/health`'s, without its proof.
    if (request.method === "GET" && url.pathname === "/upgrade-progress") {
      sendLocalWebJson(response, 200, { ...progress, state: finished ? "done" : "upgrading" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/assets/molis-work-arrival.css") {
      response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(arrivalStylesheet ??= tightenServedCss(renderMolisWorkArrivalStylesheet()));
      return;
    }
    if (request.method === "GET" && /\btext\/html\b/u.test(request.headers.accept ?? "")) {
      response.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "1", "content-security-policy": OPENING_CSP });
      response.end(renderUpgradeOpeningPage(htmlLang()));
      return;
    }
    response.setHeader("retry-after", "1");
    sendLocalWebJson(response, 503, { error: "Molis Work 正在升级这个 Home 的数据，稍后再试。", code: "storage.upgrade_in_progress" });
  };
  const server = http.createServer(answer);
  const listening = await new Promise<boolean>(resolve => {
    server.once("error", error => { hostLog.warn("host", "home_upgrade_maintenance_not_listening", error); resolve(false); });
    // Loopback only (S-01), like the server that comes after it.
    try { server.listen(port, "127.0.0.1", () => resolve(true)); } catch (error) { hostLog.warn("host", "home_upgrade_maintenance_not_listening", error); resolve(false); }
  });
  // Someone else has the port, and very likely the Home. The ordinary start has its own answer to both.
  if (!listening) return;
  onListening?.(server.address() as AddressInfo);
  try {
    await new Promise<void>(resolve => {
      const worker = new Worker(workerEntry ?? new URL("./upgrade-maintenance-worker.js", import.meta.url), { workerData: { homes: plan.homes } });
      worker.on("message", (message: UpgradeMaintenanceMessage) => { if (message.kind === "unit") done += 1; });
      worker.once("error", error => { hostLog.warn("host", "home_upgrade_maintenance_thread_failed", error); });
      worker.once("exit", () => { finished = true; resolve(); });
    });
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}
