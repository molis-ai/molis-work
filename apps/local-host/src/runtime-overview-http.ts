import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { homeAggregatePorts } from "./home-aggregate.js";
import { hostHasTextModel } from "./host-complete-text.js";
import { currentHostPresence } from "./host-presence.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { decideRuntimeRun, hasNetwork, runtimeOverview, runtimeRunDecisionRequest, type RunsClient, type RuntimeOverviewPorts } from "./runtime-overview.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/**
 * The person's own client in the Home or in one open project, one context per request (N42): its discovery and every answer it
 * invokes share it, and each call still re-checks the person's authority, so a grant taken back meanwhile refuses.
 */
function personRuns(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined): RunsClient {
  const client = reference ? host.actionClient(reference) : host.homeActionClient();
  let pending: Promise<ActionCallContext> | undefined;
  const context = () => pending ??= localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
  return { discover: async () => client.discover(await context()), invoke: async (action, input) => client.invoke(await context(), action, input) };
}

export function runtimeOverviewPorts(host: MolisWorkLocalHost, homeDirectory: string): RuntimeOverviewPorts {
  return {
    aggregate: homeAggregatePorts(host),
    within: async (projectId, work) => {
      if (projectId === null) return work(personRuns(host, undefined));
      const reference = host.projects().find(row => row.project_id === projectId && row.state !== "closing");
      // A project that is not open now is not opened to decide one of its runs: its row is gone from the panel until it is.
      return reference ? host.withProject(reference, () => work(personRuns(host, reference))) : undefined;
    },
    now: () => new Date(), online: hasNetwork,
    model: () => hostHasTextModel({ homeDirectory }),
    gaps: () => currentHostPresence()?.gaps() ?? [],
  };
}

/**
 * `GET /api/runtime/overview`: what runs on its own here, for the menu-bar panel, the quit confirmation and the Home's missed notice.
 * `POST /api/runtime/runs/decide`: 「现在做」 or 「跳过」 on one missed run, handed to its owner.
 */
export async function handleRuntimeOverviewHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, homeDirectory: string | undefined): Promise<boolean> {
  if (!homeDirectory) return false;
  if (request.method === "GET" && url.pathname === "/api/runtime/overview") {
    sendLocalWebJson(response, 200, await runtimeOverview(runtimeOverviewPorts(host, homeDirectory)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runtime/runs/decide") {
    const decision = runtimeRunDecisionRequest(await readLocalWebBody(request));
    sendLocalWebJson(response, 200, await decideRuntimeRun(runtimeOverviewPorts(host, homeDirectory), decision));
    return true;
  }
  return false;
}
