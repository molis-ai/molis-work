import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { ScheduleService } from "@molis-ai/molis-work-service-scheduler";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { MolisWorkLocalHost } from "./project-host.js";

export interface WebServerOptions {
  /** Trusted embedding/test port. Production uses the shared system directory chooser. */
  chooseDirectory?: import("./plugin-directory-service.js").DirectorySelection;
  /**
   * In-process fixture input. The public Web command always starts from the
   * Molis Work project catalog and never accepts a database path.
   */
  databasePath?: string;
  projectId?: string;
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
  /** Shared Local Host fixture or embedding owner. Production Web owns one when omitted. */
  localHost?: MolisWorkLocalHost;
  /** How often (milliseconds, default one minute) the server finishes project deletions that other processes left pending. */
  deletionSweepMs?: number;
}

export interface ResolvedWebBoardOptions {
  databasePath: string;
  projectId: string;
  demo?: boolean;
  projectRoot?: string;
  project: WebProjectNavigation | null;
  projects: WebProjectNavigation[];
  routePrefix: string;
  homeDirectory?: string;
}

/** What the Host keeps running for one project besides its plugins: the Scheduler service's clock. Feed's source clock is Feed's own (its wakeup job). */
export interface ProjectScheduleRuntime {
  schedule: ScheduleService;
}

export type ResolvedWebRequest =
  | { kind: "catalog_index"; projects: WebProjectNavigation[] }
  | { kind: "project_not_found" }
  | { kind: "board"; pathname: string; options: ResolvedWebBoardOptions };
