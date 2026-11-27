import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { overviewReadAction, OVERVIEW_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { hostHasTextModel } from "./host-complete-text.js";
import { currentHostPresence } from "./host-presence.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { homeScheduledRuns } from "./home-overview.js";
import { decideRuntimeRun, hasNetwork, runtimeExpiredSeenRequest, runtimeOverview, runtimeRunDecisionRequest, type RunsClient, type RuntimeOverviewPorts } from "./runtime-overview.js";
import { expiredSeen, markExpiredSeen } from "./runs-expired-seen.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/**
 * The person's own client in the Home or in one open project, one context per request (N42): its discovery and every answer it
 * invokes share it, and each call still re-checks the person's authority, so a grant taken back meanwhile refuses.
 */
function personRuns(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined, assertCurrent?: () => void): RunsClient {
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  let pending: Promise<ActionCallContext> | undefined;
  const context = () => pending ??= localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS, undefined, { assertCurrent });
  return { discover: async () => client.discover(await context()), invoke: async (action, input) => client.invoke(await context(), action, input) };
}

export function runtimeOverviewPorts(host: MolisWorkLocalHost, homeDirectory: string): RuntimeOverviewPorts {
  return {
    projectRuns: async (window, bounds) => homeScheduledRuns({ home: homeDirectory, reach: partitionId => host.projectPluginReach(partitionId) }, await host.partitions(), window, bounds),
    within: async (projectId, work) => {
      if (projectId === null) return work(personRuns(host, undefined));
      // The panel lists a sleeping project's runs from the overview, so the person's 「现在做」 or 「跳过」 opens it to hand the run to its owner.
      const reference = host.projects().find(row => row.project_id === projectId && row.state !== "closing")
        ?? (await host.closedProjects()).find(row => row.project_id === projectId);
      return reference ? host.withProject(reference, () => work(personRuns(host, reference))) : undefined;
    },
    now: () => new Date(), online: hasNetwork,
    model: () => hostHasTextModel({ homeDirectory }),
    gaps: () => currentHostPresence()?.gaps() ?? [],
    expiredSeen: () => expiredSeen(homeDirectory),
  };
}

/**
 * The owners that answered each recent non-empty summary, keyed by home directory and `through`: 「知道了」 names only the summary,
 * and the Host moves the marks of the owners it heard from. Empty polls do not evict real summaries, and a missing cache entry
 * refuses with 409 so the client reloads instead of hiding the banner without persisting anything.
 */
const told = new Map<string, readonly string[]>();
const TOLD_KEPT = 256;

const toldKey = (homeDirectory: string, through: string) => `${homeDirectory}\u0000${through}`;

/**
 * `GET /api/runtime/overview`: what runs on its own here, for the menu-bar panel, the quit confirmation and the Home's missed notice.
 * `POST /api/runtime/runs/decide`: 「现在做」 or 「跳过」 on one missed run, handed to its owner.
 * `POST /api/runtime/expired/seen`: the person read the summary of runs skipped on their own; it is not said again (`runs-expired-seen.ts`).
 */
export async function handleRuntimeOverviewHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, homeDirectory: string | undefined, accountCurrent?: () => void): Promise<boolean> {
  if (!homeDirectory) return false;
  if (request.method === "POST" && url.pathname === "/api/runtime/overview/read") {
    const { assertCurrent } = authorizationSettingsControl(request, response, host, accountCurrent);
    assertCurrent();
    const input = await readLocalWebBody(request);
    const rows = await personRuns(host, undefined, assertCurrent).invoke({ ...overviewReadAction, provider_id: OVERVIEW_PROVIDER_ID }, input);
    assertCurrent();
    sendLocalWebJson(response, 200, rows);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/runtime/overview") {
    const { expired: { owners, ...expired }, ...overview } = await runtimeOverview(runtimeOverviewPorts(host, homeDirectory));
    if (expired.count > 0 && owners.length > 0) {
      const key = toldKey(homeDirectory, expired.through);
      told.delete(key);
      told.set(key, owners);
      for (const entry of told.keys()) {
        if (told.size <= TOLD_KEPT) break;
        told.delete(entry);
      }
    }
    sendLocalWebJson(response, 200, { ...overview, expired });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runtime/runs/decide") {
    const decision = runtimeRunDecisionRequest(await readLocalWebBody(request));
    sendLocalWebJson(response, 200, await decideRuntimeRun(runtimeOverviewPorts(host, homeDirectory), decision));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runtime/expired/seen") {
    const { through } = runtimeExpiredSeenRequest(await readLocalWebBody(request));
    const owners = told.get(toldKey(homeDirectory, through));
    if (!owners || owners.length === 0) {
      sendLocalWebJson(response, 409, {
        applied: false,
        code: "runtime.expired_summary_stale",
        error: "这份汇总已失效，请刷新后再确认",
      });
      return true;
    }
    const now = new Date();
    markExpiredSeen(homeDirectory, through, owners, now);
    sendLocalWebJson(response, 200, {
      applied: true,
      seen_through: new Date(Math.min(Date.parse(through), now.getTime())).toISOString(),
    });
    return true;
  }
  return false;
}
