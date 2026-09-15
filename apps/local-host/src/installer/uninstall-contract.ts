import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeIntegrationService } from "./runtime-integration.js";
import type { RuntimeIntegrationPlan } from "./runtime-integration-contract.js";
import type { MolisWorkWebServiceManager } from "./web-service.js";
import type { MolisWorkWebServicePlan } from "./web-service-contract.js";
export const UNINSTALL_OWNER = "molis-work-uninstall-v1";

export interface MolisWorkUninstallChange {
  kind: "runtime" | "web_service" | "demo" | "launcher" | "release" | "install_manifest" | "user_data";
  target: string;
  description: string;
}

export interface MolisWorkUninstallPlan {
  plan_id: string;
  status: "ready" | "no_change" | "conflict";
  home_directory: string;
  purge_user_data: boolean;
  user_project_count: number;
  demo_project_count: number;
  changes: MolisWorkUninstallChange[];
  preserved_paths: string[];
  conflicts: string[];
  confirmation: string;
  message: string;
}

export interface MolisWorkUninstallResult {
  status: "uninstalled" | "purged" | "unchanged" | "declined";
  home_directory: string;
  removed_paths: string[];
  preserved_paths: string[];
  receipt_path: string | null;
  message: string;
}

export interface MolisWorkUninstallServiceOptions {
  homeDirectory?: string;
  projects: UninstallProjectAccess;
  runtimeIntegrationService?: RuntimeIntegrationService;
  webServiceManager?: MolisWorkWebServiceManager;
}

export interface PreparedUninstallPlan {
  publicPlan: MolisWorkUninstallPlan;
  snapshotHash: string;
  runtimePlans: RuntimeIntegrationPlan[];
  webPlan: MolisWorkWebServicePlan;
  ownedPaths: string[];
  purgeDataPaths: string[];
  snapshotPaths: string[];
  demoProjectIds: string[];
}

export interface CatalogInspection {
  projects: ProjectRecord[];
  conflict: string | null;
}

export interface UninstallReceipt {
  schema_version: 1;
  owner: typeof UNINSTALL_OWNER;
  plan_id: string;
  home_directory: string;
  purge_user_data: boolean;
  preserved_projects: Array<{ project_id: string; display_name: string; data_class: string }>;
  completed_steps: string[];
  removed_paths: string[];
  state: "in_progress" | "complete" | "failed";
  error: string | null;
  updated_at: string;
}

export class MolisWorkUninstallError extends Error {
  constructor(
    readonly code:
      | "uninstall.plan_missing"
      | "uninstall.plan_stale"
      | "uninstall.conflict"
      | "uninstall.purge_confirmation_required"
      | "uninstall.step_failed",
    message: string,
  ) {
    super(message);
    this.name = "MolisWorkUninstallError";
  }
}


export interface UninstallProjectAccess {
  inspect(): Promise<CatalogInspection>;
  removeDemos(input: { project_ids: string[]; plan_id: string }): Promise<void>;
}
