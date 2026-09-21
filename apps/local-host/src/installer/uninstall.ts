import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "../product-home.js";
import { PERSONAL_HOME_SQLITE_STORES } from "@molis-ai/molis-work-storage";
import { RuntimeIntegrationService } from "./runtime-integration.js";
import { SUPPORTED_RUNTIME_IDS } from "./runtime-integration-contract.js";
import { MolisWorkWebServiceManager } from "./web-service.js";
import { UNINSTALL_OWNER, MolisWorkUninstallError, type MolisWorkUninstallServiceOptions, type MolisWorkUninstallPlan, type MolisWorkUninstallResult, type MolisWorkUninstallChange, type PreparedUninstallPlan, type UninstallReceipt } from "./uninstall-contract.js";
import { inspectOwnedHomeAssets, existingPaths, assetKind, assetKindLabel, pathFingerprint, digest, removeEmptyDirectory } from "./uninstall-files.js";
export class MolisWorkUninstallService {
  readonly homeDirectory: string;
  readonly receiptPath: string;
  private readonly runtimeIntegrations: RuntimeIntegrationService;
  private readonly webService: MolisWorkWebServiceManager;
  private readonly plans = new Map<string, PreparedUninstallPlan>();

  constructor(private readonly options: MolisWorkUninstallServiceOptions) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
    this.receiptPath = path.join(this.homeDirectory, "config", "uninstall.json");
    this.runtimeIntegrations = options.runtimeIntegrationService
      ?? new RuntimeIntegrationService({ homeDirectory: this.homeDirectory });
    this.webService = options.webServiceManager
      ?? new MolisWorkWebServiceManager({ homeDirectory: this.homeDirectory });
  }

  async prepare(options: { purge_user_data?: boolean } = {}): Promise<MolisWorkUninstallPlan> {
    const purgeUserData = options.purge_user_data === true;
    const catalog = await this.options.projects.inspect();
    const runtimePlans = await Promise.all(
      SUPPORTED_RUNTIME_IDS
        .map((runtimeId) => this.runtimeIntegrations.prepare(runtimeId, "remove")),
    );
    const webPlan = await this.webService.prepare("remove");
    const assets = await inspectOwnedHomeAssets(this.homeDirectory);
    const conflicts = [
      ...(catalog.conflict ? [catalog.conflict] : []),
      ...assets.conflicts,
      ...runtimePlans.filter((plan) => plan.status === "conflict").map((plan) => plan.message),
      ...(webPlan.status === "conflict" ? [webPlan.message] : []),
    ];
    const demos = catalog.projects.filter((project) => project.data_class === "regenerable_demo");
    const userProjects = catalog.projects.filter((project) => project.data_class !== "regenerable_demo");
    const purgeDataPaths = purgeUserData
      ? await existingPaths([
        path.join(this.homeDirectory, "projects"),
        path.join(this.homeDirectory, "backups"),
        path.join(this.homeDirectory, "logs"),
        // Session content and Shelf files are user data living beside the
        // project databases; leaving them behind made "purged" untrue.
        path.join(this.homeDirectory, "sessions"),
        path.join(this.homeDirectory, "shelf"),
        ...PERSONAL_HOME_SQLITE_STORES.map((storeName) => path.join(this.homeDirectory, storeName)),
        path.join(this.homeDirectory, "runtime-config-backups"),
        path.join(this.homeDirectory, "runtime-integrations"),
      ])
      : [];
    const changes: MolisWorkUninstallChange[] = [
      ...runtimePlans.flatMap((plan) => plan.status === "ready"
        ? [{ kind: "runtime" as const, target: plan.display_name, description: `移除 Molis Work 创建的 ${plan.display_name} 接入` }]
        : []),
      ...(webPlan.status === "ready"
        ? [{ kind: "web_service" as const, target: webPlan.detection.plist_path, description: "停止并移除 Molis Work 常驻 Web 服务" }]
        : []),
      ...demos.map((project) => ({ kind: "demo" as const, target: project.project_id, description: `删除可重建演示项目：${project.display_name}` })),
      ...assets.ownedPaths.map((ownedPath) => ({
        kind: assetKind(ownedPath),
        target: ownedPath,
        description: `移除 Molis Work 自有${assetKindLabel(assetKind(ownedPath))}`,
      })),
      ...purgeDataPaths.map((dataPath) => ({
        kind: "user_data" as const,
        target: dataPath,
        description: dataPath === path.join(this.homeDirectory, "projects")
          ? `永久删除 ${userProjects.length} 个用户项目及 catalog`
          : `永久删除 Molis Work 生成的 ${path.basename(dataPath)}`,
      })),
    ];
    const preservedPaths = purgeUserData
      ? []
      : [path.join(this.homeDirectory, "projects"), path.join(this.homeDirectory, "backups"), path.join(this.homeDirectory, "logs")];
    const status = conflicts.length > 0 ? "conflict" : changes.length > 0 ? "ready" : "no_change";
    const plan: MolisWorkUninstallPlan = {
      plan_id: `uninstall-plan-${randomUUID()}`,
      status,
      home_directory: this.homeDirectory,
      purge_user_data: purgeUserData,
      user_project_count: userProjects.length,
      demo_project_count: demos.length,
      changes,
      preserved_paths: preservedPaths,
      conflicts,
      confirmation: purgeUserData
        ? `永久清除 ${this.homeDirectory} 中的 ${userProjects.length} 个用户项目；必须再次提供完全相同的目录和项目数量`
        : "卸载 Molis Work 程序和自有接入；保留用户项目、catalog、备份与日志",
      message: status === "conflict"
        ? "发现不再符合 Molis Work 所有权收据的配置；没有执行卸载"
        : status === "no_change"
          ? "没有需要卸载的 Molis Work 程序或接入"
          : purgeUserData
            ? "已生成永久清除预览；这与普通卸载是两次不同的确认"
            : "已生成安全卸载预览；用户数据会保留",
    };
    const snapshotPaths = [...assets.snapshotPaths, path.join(this.homeDirectory, "projects", "catalog.db"), ...purgeDataPaths];
    this.plans.set(plan.plan_id, {
      publicPlan: plan,
      snapshotHash: await this.snapshotHash(snapshotPaths),
      runtimePlans,
      webPlan,
      ownedPaths: assets.ownedPaths,
      purgeDataPaths,
      snapshotPaths,
      demoProjectIds: demos.map((project) => project.project_id),
    });
    return plan;
  }

  async confirm(input: {
    plan_id: string;
    decision: "confirmed" | "declined";
    purge_confirmation?: { home_directory: string; user_project_count: number };
  }): Promise<MolisWorkUninstallResult> {
    const prepared = this.plans.get(input.plan_id);
    if (!prepared) throw new MolisWorkUninstallError("uninstall.plan_missing", "卸载预览不存在或已失效，请重新预览");
    this.plans.delete(input.plan_id);
    const plan = prepared.publicPlan;
    if (input.decision === "declined") {
      return { status: "declined", home_directory: this.homeDirectory, removed_paths: [], preserved_paths: plan.preserved_paths, receipt_path: null, message: "已取消，没有修改 Molis Work 安装或数据" };
    }
    if (plan.status === "conflict") throw new MolisWorkUninstallError("uninstall.conflict", plan.message);
    if (await this.snapshotHash(prepared.snapshotPaths) !== prepared.snapshotHash) {
      throw new MolisWorkUninstallError("uninstall.plan_stale", "Molis Work 安装内容在预览后发生变化，请重新预览");
    }
    if (plan.purge_user_data) this.requirePurgeConfirmation(plan, input.purge_confirmation);
    if (plan.status === "no_change") {
      return { status: "unchanged", home_directory: this.homeDirectory, removed_paths: [], preserved_paths: plan.preserved_paths, receipt_path: null, message: plan.message };
    }

    const catalogInspection = await this.options.projects.inspect();
    const receipt: UninstallReceipt = {
      schema_version: 1,
      owner: UNINSTALL_OWNER,
      plan_id: plan.plan_id,
      home_directory: this.homeDirectory,
      purge_user_data: plan.purge_user_data,
      preserved_projects: catalogInspection.projects
        .filter((project) => project.data_class !== "regenerable_demo")
        .map((project) => ({ project_id: project.project_id, display_name: project.display_name, data_class: project.data_class })),
      completed_steps: [],
      removed_paths: [],
      state: "in_progress",
      error: null,
      updated_at: new Date().toISOString(),
    };
    await this.writeReceipt(receipt);
    try {
      for (const runtimePlan of prepared.runtimePlans) {
        if (runtimePlan.status !== "ready") continue;
        const result = await this.runtimeIntegrations.confirm({ runtime_id: runtimePlan.runtime_id, plan_id: runtimePlan.plan_id, decision: "confirmed" });
        if (!['removed', 'already_removed'].includes(result.status)) throw new Error(result.message);
        receipt.completed_steps.push(`runtime:${runtimePlan.runtime_id}`);
        await this.writeReceipt(receipt);
      }
      if (prepared.webPlan.status === "ready") {
        await this.webService.confirm({ plan_id: prepared.webPlan.plan_id, decision: "confirmed" });
        receipt.completed_steps.push("web-service");
        await this.writeReceipt(receipt);
      }
      if (prepared.demoProjectIds.length > 0) {
        await this.options.projects.removeDemos({ project_ids: prepared.demoProjectIds, plan_id: plan.plan_id });
        receipt.completed_steps.push("regenerable-demo-data");
        await this.writeReceipt(receipt);
      }
      for (const ownedPath of prepared.ownedPaths) {
        await fs.rm(ownedPath, { recursive: true, force: true });
        receipt.removed_paths.push(ownedPath);
      }
      receipt.completed_steps.push("owned-program-files");
      if (plan.purge_user_data) {
        for (const dataPath of prepared.purgeDataPaths) {
          await fs.rm(dataPath, { recursive: true, force: true });
          receipt.removed_paths.push(dataPath);
        }
        receipt.completed_steps.push("user-data-purged");
      }
      receipt.state = "complete";
      receipt.updated_at = new Date().toISOString();
      if (!plan.purge_user_data) await this.writeReceipt(receipt);
      else {
        await fs.rm(this.receiptPath, { force: true });
        for (const directory of [
          path.join(this.homeDirectory, "config"),
          path.join(this.homeDirectory, "bin"),
          path.join(this.homeDirectory, "releases"),
          this.homeDirectory,
        ]) {
          if (await removeEmptyDirectory(directory)) receipt.removed_paths.push(directory);
        }
      }
      return {
        status: plan.purge_user_data ? "purged" : "uninstalled",
        home_directory: this.homeDirectory,
        removed_paths: receipt.removed_paths,
        preserved_paths: plan.preserved_paths,
        receipt_path: plan.purge_user_data ? null : this.receiptPath,
        message: plan.purge_user_data
          ? "Molis Work 程序、接入和用户数据已按强确认永久清除"
          : "Molis Work 程序和自有接入已卸载；用户项目、catalog、备份与日志仍保留",
      };
    } catch (error) {
      receipt.state = "failed";
      receipt.error = error instanceof Error ? error.message : String(error);
      receipt.updated_at = new Date().toISOString();
      await this.writeReceipt(receipt).catch(() => undefined);
      throw new MolisWorkUninstallError("uninstall.step_failed", `卸载未完成，进度收据已保留：${receipt.error}`);
    }
  }

  private requirePurgeConfirmation(
    plan: MolisWorkUninstallPlan,
    confirmation: { home_directory: string; user_project_count: number } | undefined,
  ): void {
    if (
      confirmation
      && path.resolve(confirmation.home_directory) === this.homeDirectory
      && confirmation.user_project_count === plan.user_project_count
    ) return;
    throw new MolisWorkUninstallError(
      "uninstall.purge_confirmation_required",
      `永久清除还需要再次确认精确目录 ${this.homeDirectory} 和用户项目数量 ${plan.user_project_count}`,
    );
  }

  private async writeReceipt(receipt: UninstallReceipt): Promise<void> {
    await fs.mkdir(path.dirname(this.receiptPath), { recursive: true });
    const temporary = `${this.receiptPath}.tmp-${randomUUID()}`;
    await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, this.receiptPath);
  }

  private async snapshotHash(paths: string[]): Promise<string> {
    const values = await Promise.all([...new Set(paths)].sort().map(async (target) => ({ target, value: await pathFingerprint(target) })));
    return digest(JSON.stringify(values));
  }
}
