import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateMolisWorkMcpLauncher } from "@molis-ai/molis-work-app-mcp";
import { INTEGRATION_OWNER, isOwnedInstallerOwner, isOwnedIntegrationOwner, RuntimeIntegrationError } from "./runtime-integration-contract.js";
import type { RuntimeIntegrationServiceOptions, PreparedPlan, RuntimeIntegrationDetection, SupportedRuntimeId, RuntimeIntegrationAction, RuntimeIntegrationPlan, RuntimeIntegrationConfirmation, RuntimeIntegrationResult, RuntimeAdapter, RuntimeSnapshot, ConfigInspection, InstalledArtifacts, IntegrationReceipt, RuntimeConnectionState, RuntimeIntegrationResultStatus } from "./runtime-integration-contract.js";
import { ADAPTERS, adapterFor } from "./runtime-config-adapters.js";
import { RuntimeIntegrationPlanner } from "./runtime-integration-planner.js";
import { digest } from "./runtime-config-text.js";
import { inspectSkillLink, replaceSkillLink, removeExpectedSkillLink, restoreSkillSnapshot, replaceTextFile, writeAtomic, readTextOrNull, fileModeOrUndefined, pathState, anyPathExists, canExecute, isInside } from "./runtime-installation-files.js";
import { resolveConfiguredHome } from "../product-home.js";

export class RuntimeIntegrationService {
  private readonly planner: RuntimeIntegrationPlanner;

  readonly homeDirectory: string;

  readonly userHomeDirectory: string;

  private readonly options: RuntimeIntegrationServiceOptions;

  private readonly preparedPlans = new Map<string, PreparedPlan>();

  constructor(options: RuntimeIntegrationServiceOptions = {}) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
    this.userHomeDirectory = path.resolve(options.userHomeDirectory ?? os.homedir());
    this.options = options;
    this.planner = new RuntimeIntegrationPlanner({ homeDirectory: this.homeDirectory, userHomeDirectory: this.userHomeDirectory, receiptPath: id => this.receiptPath(id), backupPath: (id, plan) => this.backupPath(id, plan) });
  }

  async detectAll(): Promise<RuntimeIntegrationDetection[]> {
    return Promise.all(ADAPTERS.map((adapter) => this.detect(adapter.id)));
  }

  async detect(runtimeId: SupportedRuntimeId): Promise<RuntimeIntegrationDetection> {
    const snapshot = await this.snapshot(adapterFor(runtimeId));
    const connectionState = connectionStateFor(snapshot);
    return {
      runtime_id: snapshot.adapter.id,
      display_name: snapshot.adapter.displayName,
      executable_path: snapshot.executablePath,
      config_path: snapshot.adapter.configPath(this.userHomeDirectory),
      skill_path: snapshot.adapter.skillPath(this.userHomeDirectory),
      connection_state: connectionState,
      message: detectionMessage(connectionState, snapshot.adapter.displayName),
    };
  }

  async prepare(runtimeId: SupportedRuntimeId, action: RuntimeIntegrationAction): Promise<RuntimeIntegrationPlan> {
    const adapter = adapterFor(runtimeId);
    const snapshot = await this.snapshot(adapter);
    const receipt = await this.readReceipt(adapter.id);
    const prepared = action === "connect"
      ? this.planner.prepareConnect(snapshot, receipt)
      : this.planner.prepareRemove(snapshot, receipt);
    this.preparedPlans.set(prepared.publicPlan.plan_id, prepared);
    return structuredClone(prepared.publicPlan);
  }

  async confirm(confirmation: RuntimeIntegrationConfirmation): Promise<RuntimeIntegrationResult> {
    const prepared = this.preparedPlans.get(confirmation.plan_id);
    if (!prepared) {
      return integrationResult(
        "plan_not_found",
        confirmation.runtime_id,
        confirmation.plan_id,
        null,
        null,
        "找不到这份预览。它可能来自另一个服务进程，请重新生成预览。",
      );
    }
    const plan = prepared.publicPlan;
    if (confirmation.runtime_id !== plan.runtime_id || confirmation.plan_id !== plan.plan_id) {
      return integrationResult(
        "confirmation_mismatch",
        confirmation.runtime_id,
        confirmation.plan_id,
        null,
        null,
        "确认与当前 Runtime 或当前预览不匹配，没有修改配置。",
      );
    }
    if (confirmation.decision === "declined") {
      return integrationResult(
        "declined",
        plan.runtime_id,
        plan.plan_id,
        null,
        null,
        `没有修改 ${plan.display_name}。${plan.alternative}`,
      );
    }
    if (plan.status === "unavailable") {
      return integrationResult("unavailable", plan.runtime_id, plan.plan_id, null, null, plan.message);
    }
    if (plan.status === "conflict") {
      return integrationResult("conflict", plan.runtime_id, plan.plan_id, null, null, plan.message);
    }

    const current = await this.snapshot(prepared.adapter);
    const replay = await this.replayedResult(prepared, current);
    if (replay) return replay;
    if (current.configHash !== prepared.beforeConfigHash || current.skill.signature !== prepared.beforeSkill.signature) {
      return integrationResult(
        "stale",
        plan.runtime_id,
        plan.plan_id,
        null,
        this.receiptPath(plan.runtime_id),
        "Runtime 配置或 Skill 在预览后发生了变化。没有写入，请重新生成预览。",
      );
    }
    if (plan.status === "no_change") {
      const status = plan.action === "connect" ? "already_connected" : "already_removed";
      return integrationResult(status, plan.runtime_id, plan.plan_id, null, this.receiptPath(plan.runtime_id), plan.message);
    }

    const configPath = prepared.adapter.configPath(this.userHomeDirectory);
    const skillPath = prepared.adapter.skillPath(this.userHomeDirectory);
    const backupPath = plan.backup_path;
    let configMutated = false;
    let skillMutated = false;
    try {
      if (prepared.nextConfigText !== prepared.beforeConfigText) {
        if (prepared.beforeConfigText != null && backupPath) {
          await fs.mkdir(path.dirname(backupPath), { recursive: true });
          await writeAtomic(backupPath, prepared.beforeConfigText, await fileModeOrUndefined(configPath));
        }
        await replaceTextFile(configPath, prepared.nextConfigText, await fileModeOrUndefined(configPath));
        configMutated = true;
      }

      if (plan.action === "connect") {
        if (!prepared.artifacts) throw new RuntimeIntegrationError("runtime.installation_invalid", "Molis Work 安装不可用");
        await replaceSkillLink(skillPath, prepared.artifacts.skillSourcePath, this.homeDirectory);
        skillMutated = prepared.beforeSkill.state !== "current";
      } else {
        await removeExpectedSkillLink(skillPath, prepared.receipt?.skill_target ?? "");
        skillMutated = prepared.beforeSkill.state !== "absent";
      }

      const valid = await this.validateAppliedPlan(prepared);
      if (!valid) throw new Error("Runtime 接入验证未通过");

      if (plan.action === "connect") {
        if (!prepared.artifacts) throw new RuntimeIntegrationError("runtime.installation_invalid", "Molis Work 安装不可用");
        const inspection = prepared.adapter.inspectConfig(
          prepared.nextConfigText,
          prepared.adapter.desiredConnection(prepared.artifacts, this.homeDirectory),
        );
        if (!inspection.entryFingerprint) throw new Error("无法生成 Molis Work 配置所有权指纹");
        await this.writeReceipt({
          schema_version: 1,
          owner: INTEGRATION_OWNER,
          runtime_id: plan.runtime_id,
          config_path: configPath,
          config_entry_fingerprint: inspection.entryFingerprint,
          skill_path: skillPath,
          skill_target: prepared.artifacts.skillSourcePath,
          connected_at: new Date().toISOString(),
        });
        return integrationResult(
          "connected",
          plan.runtime_id,
          plan.plan_id,
          backupPath,
          this.receiptPath(plan.runtime_id),
          `${plan.display_name} 已接入 Molis Work。${plan.restart_instructions.join(" ")}`,
        );
      }

      await fs.rm(this.receiptPath(plan.runtime_id), { force: true });
      return integrationResult(
        "removed",
        plan.runtime_id,
        plan.plan_id,
        backupPath,
        null,
        `${plan.display_name} 的 Molis Work 接入已移除，其他 Runtime 配置保持不变。`,
      );
    } catch (error) {
      if (configMutated) await replaceTextFile(configPath, prepared.beforeConfigText, await fileModeOrUndefined(configPath));
      if (skillMutated) await restoreSkillSnapshot(skillPath, prepared.beforeSkill);
      const message = error instanceof Error ? error.message : String(error);
      await this.writeAttempt(plan, "rolled_back", message);
      return integrationResult(
        "rolled_back",
        plan.runtime_id,
        plan.plan_id,
        backupPath,
        null,
        `验证失败，已恢复原配置和 Skill：${message}`,
      );
    }
  }

  private async snapshot(adapter: RuntimeAdapter): Promise<RuntimeSnapshot> {
    const executablePath = await this.findRuntimeExecutable(adapter);
    const runtimeDetected = executablePath != null || await anyPathExists(adapter.detectionPaths(this.userHomeDirectory));
    const artifacts = await this.installedArtifacts();
    const configPath = adapter.configPath(this.userHomeDirectory);
    const configText = await readTextOrNull(configPath);
    const inspectionArtifacts = artifacts ?? {
      launcherPath: path.join(this.homeDirectory, "bin", "molis-work-mcp"),
      skillSourcePath: path.join(this.homeDirectory, "releases", "missing", "skills", "goal-advance"),
    };
    const desired = adapter.desiredConnection(inspectionArtifacts, this.homeDirectory);
    let configInspection: ConfigInspection;
    try {
      configInspection = adapter.inspectConfig(configText, desired);
    } catch (error) {
      configInspection = {
        state: "conflict",
        summary: error instanceof Error ? error.message : String(error),
        entryFingerprint: null,
      };
    }
    const skill = await inspectSkillLink(adapter.skillPath(this.userHomeDirectory), artifacts?.skillSourcePath ?? null, this.homeDirectory);
    return {
      adapter,
      executablePath,
      runtimeDetected,
      artifacts,
      configText,
      configHash: configText == null ? null : digest(configText),
      configInspection,
      skill,
    };
  }

  private async installedArtifacts(): Promise<InstalledArtifacts | null> {
    const manifestPath = path.join(this.homeDirectory, "config", "installation.json");
    const text = await readTextOrNull(manifestPath);
    if (text == null) return null;
    try {
      const manifest = JSON.parse(text) as { installer?: unknown; release_path?: unknown };
      if (!isOwnedInstallerOwner(manifest.installer) || typeof manifest.release_path !== "string") return null;
      const releasePath = path.resolve(this.homeDirectory, manifest.release_path);
      if (!isInside(this.homeDirectory, releasePath)) return null;
      const nextLauncher = path.join(this.homeDirectory, "bin", "molis-work-mcp");
      const legacyLauncher = path.join(this.homeDirectory, "bin", "goalboard-mcp");
      const skillSourcePath = path.join(releasePath, "skills", "goal-advance");
      const [nextState, legacyState, skill] = await Promise.all([
        pathState(nextLauncher),
        pathState(legacyLauncher),
        pathState(skillSourcePath),
      ]);
      const launcherPath = nextState?.isFile() ? nextLauncher : legacyState?.isFile() ? legacyLauncher : nextLauncher;
      const launcher = nextState?.isFile() ? nextState : legacyState;
      if (!launcher?.isFile() || !skill?.isDirectory()) return null;
      return { launcherPath, skillSourcePath };
    } catch {
      return null;
    }
  }

  private async findRuntimeExecutable(adapter: RuntimeAdapter): Promise<string | null> {
    if (Object.prototype.hasOwnProperty.call(this.options.runtimeExecutables ?? {}, adapter.id)) {
      const configured = this.options.runtimeExecutables?.[adapter.id];
      if (!configured) return null;
      return await canExecute(configured) ? path.resolve(configured) : null;
    }
    const pathEnvironment = this.options.pathEnvironment ?? process.env.PATH ?? "";
    for (const directory of pathEnvironment.split(path.delimiter).filter(Boolean)) {
      for (const executable of adapter.executableNames) {
        const candidate = path.resolve(directory, executable);
        if (await canExecute(candidate)) return candidate;
      }
    }
    return null;
  }

  private async validateAppliedPlan(prepared: PreparedPlan): Promise<boolean> {
    const plan = prepared.publicPlan;
    const current = await this.snapshot(prepared.adapter);
    if (plan.action === "remove") {
      return current.configInspection.state === "absent" && current.skill.state === "absent";
    }
    if (!prepared.artifacts || current.configInspection.state !== "current" || current.skill.state !== "current") {
      return false;
    }
    const validate = this.options.validateConnection ?? validateMolisWorkMcpLauncher;
    return Boolean(await validate({
      runtime_id: plan.runtime_id,
      launcher_path: prepared.artifacts.launcherPath,
      home_directory: this.homeDirectory,
      plan_id: plan.plan_id,
    }));
  }

  private async replayedResult(prepared: PreparedPlan, current: RuntimeSnapshot): Promise<RuntimeIntegrationResult | null> {
    const plan = prepared.publicPlan;
    const receipt = await this.readReceipt(plan.runtime_id);
    if (plan.action === "connect") {
      if (current.configInspection.state === "current" && current.skill.state === "current" && receipt) {
        return integrationResult(
          "already_connected",
          plan.runtime_id,
          plan.plan_id,
          null,
          this.receiptPath(plan.runtime_id),
          `${plan.display_name} 已经接入，无重复写入。`,
        );
      }
      return null;
    }
    if (current.configInspection.state === "absent" && current.skill.state === "absent" && !receipt) {
      return integrationResult("already_removed", plan.runtime_id, plan.plan_id, null, null, `${plan.display_name} 接入已经移除。`);
    }
    return null;
  }

  private receiptPath(runtimeId: SupportedRuntimeId): string {
    return path.join(this.homeDirectory, "runtime-integrations", `${runtimeId}.json`);
  }

  private backupPath(runtimeId: SupportedRuntimeId, planId: string): string {
    return path.join(this.homeDirectory, "runtime-config-backups", runtimeId, `${planId}.bak`);
  }

  private async readReceipt(runtimeId: SupportedRuntimeId): Promise<IntegrationReceipt | null> {
    const filePath = this.receiptPath(runtimeId);
    const text = await readTextOrNull(filePath);
    if (text == null) return null;
    try {
      const receipt = JSON.parse(text) as IntegrationReceipt;
      if (!isOwnedIntegrationOwner(receipt.owner) || receipt.schema_version !== 1 || receipt.runtime_id !== runtimeId) {
        throw new Error("owner mismatch");
      }
      return receipt;
    } catch {
      throw new RuntimeIntegrationError("runtime.receipt_invalid", `Molis Work 接入收据无法解析: ${filePath}`);
    }
  }

  private async writeReceipt(receipt: IntegrationReceipt): Promise<void> {
    await writeAtomic(this.receiptPath(receipt.runtime_id), `${JSON.stringify(receipt, null, 2)}\n`);
  }

  private async writeAttempt(plan: RuntimeIntegrationPlan, status: "rolled_back", message: string): Promise<void> {
    const filePath = path.join(this.homeDirectory, "runtime-integration-attempts", `${plan.plan_id}-${randomUUID()}.json`);
    await writeAtomic(filePath, `${JSON.stringify({
      schema_version: 1,
      owner: INTEGRATION_OWNER,
      plan_id: plan.plan_id,
      runtime_id: plan.runtime_id,
      action: plan.action,
      status,
      message,
      recorded_at: new Date().toISOString(),
    }, null, 2)}\n`);
  }
}

export function connectionStateFor(snapshot: RuntimeSnapshot): RuntimeConnectionState {
  if (!snapshot.runtimeDetected) return "not_detected";
  if (!snapshot.artifacts) return "molis_work_unavailable";
  if (snapshot.configInspection.state === "conflict" || snapshot.skill.state === "conflict") return "conflict";
  if (snapshot.configInspection.state === "current" && snapshot.skill.state === "current") return "connected";
  if (snapshot.configInspection.state === "absent" && snapshot.skill.state === "absent") return "not_connected";
  return "needs_repair";
}

export function detectionMessage(state: RuntimeConnectionState, displayName: string): string {
  if (state === "not_detected") return `未检测到 ${displayName}`;
  if (state === "molis_work_unavailable") return "Molis Work 本体安装不完整";
  if (state === "not_connected") return `${displayName} 未接入`;
  if (state === "needs_repair") return `${displayName} 接入需要修复`;
  if (state === "connected") return `${displayName} 已接入`;
  return `${displayName} 存在同名配置冲突`;
}

export function integrationResult(
  status: RuntimeIntegrationResultStatus,
  runtimeId: SupportedRuntimeId,
  planId: string,
  backupPath: string | null,
  receiptPath: string | null,
  message: string,
): RuntimeIntegrationResult {
  return { status, runtime_id: runtimeId, plan_id: planId, backup_path: backupPath, receipt_path: receiptPath, message };
}

