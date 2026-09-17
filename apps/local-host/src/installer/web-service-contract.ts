export const SERVICE_OWNER = "molis-work-web-service-v1";
export const SERVICE_LABEL = "com.molis.work.web";

export function isOwnedWebServiceReceipt(receipt: { owner?: string; label?: string } | null | undefined): boolean {
  if (!receipt) return false;
  return receipt.owner === SERVICE_OWNER && receipt.label === SERVICE_LABEL;
}

export type MolisWorkWebServiceAction = "install" | "start" | "stop" | "restart" | "remove";
import type { MolisWorkWebServiceDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
export type { MolisWorkWebServiceState, MolisWorkWebServiceDetection } from "@molis-ai/molis-work-contracts/platform/app-host";

export interface MolisWorkWebServicePlan {
  plan_id: string;
  action: MolisWorkWebServiceAction;
  status: "ready" | "no_change" | "unsupported" | "conflict";
  next_action: "service_install" | null;
  detection: MolisWorkWebServiceDetection;
  changes: Array<{ operation: "create" | "start" | "stop" | "restart" | "remove"; target: string }>;
  confirmation: string;
  message: string;
}

export interface MolisWorkWebServiceResult {
  status: "installed" | "started" | "stopped" | "restarted" | "removed" | "unchanged" | "declined";
  action: MolisWorkWebServiceAction;
  detection: MolisWorkWebServiceDetection;
  message: string;
}

export interface MolisWorkWebServiceRestartPending {
  status: "restarting";
  action: "restart";
  previous_process_id: number;
  message: string;
}

export interface MolisWorkWebServiceManagerOptions {
  homeDirectory?: string;
  userHomeDirectory?: string;
  nodeExecutablePath?: string;
  platform?: NodeJS.Platform;
  uid?: number;
  runCommand?: (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  /** Returns true only when the endpoint belongs to the expected managed process. */
  healthCheck?: (expectedProcessId?: number) => Promise<boolean>;
  /** Compatibility proof for legacy health payloads: the endpoint has no identity and the listener PID matches exactly. */
  legacyInstanceCheck?: (expectedProcessId: number) => Promise<boolean>;
  /** Returns true when another process is already accepting connections on the Web port. */
  portCheck?: () => Promise<boolean>;
  /** Tests may remove the real launchd transition wait without changing retry behavior. */
  transitionDelayMilliseconds?: number;
}

export interface WebServiceReceipt {
  schema_version: 1;
  owner: string;
  label: string;
  plist_path: string;
  plist_hash: string;
  installed_at: string;
}

export interface PreparedServicePlan {
  publicPlan: MolisWorkWebServicePlan;
  snapshotHash: string;
  expectedPlist: string;
}

export class MolisWorkWebServiceError extends Error {
  constructor(
    readonly code: "service.unsupported" | "service.conflict" | "service.plan_missing" | "service.plan_stale" | "service.command_failed",
    message: string,
  ) {
    super(message);
    this.name = "MolisWorkWebServiceError";
  }
}
