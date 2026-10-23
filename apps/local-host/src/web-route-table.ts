import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { MolisWorkWebViewCache } from "./web-view.js";

/**
 * One entry of an ordered HTTP route table (specs/repository-anti-corruption W5-07): it answers the request and says true,
 * or says false and the next entry tries. The order of a table is the order addresses are tried; the local control guard
 * (same origin, the token, one-time keys) has already run in front of every table.
 */
export interface WebRoute<Context> {
  readonly id: string;
  readonly handle: (context: Context) => boolean | Promise<boolean>;
}

/** Tries the entries in order; the first one that answers ends the request. */
export async function dispatchWebRoutes<Context>(routes: readonly WebRoute<Context>[], context: Context): Promise<boolean> {
  for (const route of routes) if (await route.handle(context)) return true;
  return false;
}

/** What every web request carries: the request itself and the one web server's long-lived parts. */
export interface WebRequestContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly serverOptions: WebServerOptions;
  readonly runtimeIntegrations: RuntimeIntegrationService;
  readonly webService: MolisWorkWebServiceManager;
  readonly controlToken: string;
  readonly webViewCache: MolisWorkWebViewCache;
  readonly feedSchedulers: Map<string, FeedSchedulerRuntime>;
  readonly ptyHost: MolisWorkPtyHost;
  readonly webUrl: string;
  readonly localHost: MolisWorkLocalHost;
  readonly composition: LocalWebComposition;
  readonly agentHost: AgentHost;
  readonly agentReady: () => Promise<void>;
}
