import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { FeedSourceScheduler } from "@molis-ai/molis-work-plugin-feed";
import type { ScheduleService } from "@molis-ai/molis-work-service-scheduler";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { MolisWorkLocalHost } from "./project-host.js";

export interface WebServerOptions {
  /**
   * In-process fixture input. The public Web command always starts from the
   * Molis Work project catalog and never accepts a database path.
   */
  databasePath?: string;
  boardId?: string;
  /** Shared Web resource Home. Explicit value overrides MOLIS_WORK_HOME, then ~/.molis-work. */
  homeDirectory?: string;
  demo?: boolean;
  /**
   * Read-only root for Evidence locators that name a project-relative file.
   * The server never exposes an arbitrary local path.
   */
  projectRoot?: string;
  /** Shared in-process Runtime integration service. Tests may inject a fixture. */
  runtimeIntegrationService?: RuntimeIntegrationService;
  /** Shared service manager so Web previews and confirmations use one in-memory plan. */
  webServiceManager?: MolisWorkWebServiceManager;
  /** Test-only deterministic local Web control token. Production persists one per Molis Work home. */
  controlToken?: string;
  /** Test/host injection. Production starts a private Codex app-server lazily on first read/resume. */
  runtimeSessionTransport?: RuntimeSessionTransport;
  /** Shared Local Host fixture or embedding owner. Production Web owns one when omitted. */
  localHost?: MolisWorkLocalHost;
}

export interface ResolvedWebBoardOptions {
  databasePath: string;
  boardId: string;
  demo?: boolean;
  projectRoot?: string;
  project: WebProjectNavigation | null;
  projects: WebProjectNavigation[];
  routePrefix: string;
  homeDirectory?: string;
}

export interface FeedSchedulerRuntime {
  scheduler: FeedSourceScheduler;
  schedule: ScheduleService;
}

export type ResolvedWebRequest =
  | { kind: "catalog_index"; projects: WebProjectNavigation[] }
  | { kind: "project_not_found" }
  | { kind: "board"; pathname: string; options: ResolvedWebBoardOptions };
