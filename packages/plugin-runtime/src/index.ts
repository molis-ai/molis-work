import { createHash, randomUUID } from "node:crypto";
import { comparePluginVersions, parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, type ActionAvailability, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

import { assertContributionMatchesManifest, PluginContributionError } from "./contribution.js";
import { pluginManifestDigest } from "./identity.js";

export { SqlitePluginPrivateStorage, PluginPrivateStorageError } from "./private-storage.js";
export type { PluginPrivateStorageDatabase } from "./private-storage.js";
export { SqlitePluginRuntimeRepository } from "./repository.js";
export type { PluginRuntimeDatabase } from "./repository.js";
export {
  createPluginRuntimeReleaseArtifact,
  MemoryPluginRuntimeReleaseArtifactRepository,
  SqlitePluginRuntimeReleaseArtifactRepository,
} from "./release-artifacts.js";
export type {
  PluginRuntimeReleaseArtifact,
  PluginRuntimeReleaseArtifactDatabase,
  PluginRuntimeReleaseArtifactRepository,
} from "./release-artifacts.js";
export { pluginManifestDigest } from "./identity.js";
export { loadDevelopmentPlugin } from "./development-loader.js";
export { assertContributionMatchesManifest, PluginContributionError, viewContributionId } from "./contribution.js";
export { resolvePluginActivation } from "./resolution.js";
export { PluginEventBus } from "./events.js";
export type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";
export { buildEventContract, PluginEventContractError } from "./event-contract.js";
export type { PluginEventContract, PluginEventSubscription } from "./event-contract.js";
export { MemoryPluginEventsRepository, SqlitePluginEventsRepository } from "./event-repository.js";
export type { PluginEventsDatabase } from "./event-repository.js";
export { PLUGIN_ROUTE_PREFIX, PluginRouteRouter } from "./routes.js";
export type { PluginRouteDispatchInput, PluginRouteMatch } from "./routes.js";
export {
  createPluginCapabilityClient,
  createPluginInputsClient,
  createPluginOutputsClient,
  pluginRequiredPorts,
  portArtifactId,
  PluginCapabilityAccessError,
} from "./services.js";
export type { PluginCapabilityPort, PluginWiringServicesInput } from "./services.js";
export { PluginInputGraph } from "./wiring.js";
export type { PluginArtifactReaderPort, PluginInputFailure } from "./wiring.js";
export { MemoryPluginWiringRepository, SqlitePluginWiringRepository } from "./wiring-repository.js";
export type { PluginWiringDatabase } from "./wiring-repository.js";
export { PluginSupervisor } from "./supervisor.js";
export type {
  PluginSupervisorEntry,
  PluginUpgradeCandidate,
  PluginSupervisorReport,
  PluginSupervisorState,
  PluginSupervisorStatus,
} from "./supervisor.js";
export type {
  PluginCapabilityProvider,
  PluginResolution,
  PluginResolutionDiagnostic,
  PluginResolutionDiagnosticCode,
  PluginResolutionInput,
} from "./resolution.js";
export { PluginPackageError, pluginPublisherIdentity, assertPluginPackagePath, parsePluginPackage,
  pluginPackageSigningBytes, signPluginPackage, verifyPluginPackage } from "./package-verification.js";

import type {
  PluginContribution,
  PluginDefinition,
  PluginDeployment,
  PluginExecutor,
  PluginInstanceRecord,
  PluginLifecycleReceipt,
  PluginManifest,
  PluginRuntimeApi,
  PluginRuntimeRepository,
  PluginStartContext,
  PluginUpgradeContext,
  ActionRegistryPort,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-runtime",
  packagePath: "packages/plugin-runtime",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3", "goal-reorg-dv3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["plugin.lifecycle.v1", "plugin.grants.v1", "plugin.recovery.v1"],
} as const;

export class PluginRuntimeError extends Error {
  constructor(
    readonly code:
      | "plugin_manifest_invalid"
      | "plugin_definition_missing"
      | "plugin_definition_conflict"
      | "plugin_entrypoint_missing"
      | "plugin_grant_denied"
      | "plugin_state_invalid"
      | "plugin_executor_failed"
      | "plugin_contribution_kind_invalid"
      | "plugin_contribution_unredeemed"
      | "plugin_quarantined"
      | "plugin_upgrade_required"
      | "plugin_upgrade_validation_missing"
      | "plugin_upgrade_validation_failed"
      | "plugin_upgrade_rollback_failed",
    message: string,
  ) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}

export class MemoryPluginRuntimeRepository implements PluginRuntimeRepository {
  private readonly records = new Map<string, PluginInstanceRecord>();

  get(installId: string): PluginInstanceRecord | null {
    const record = this.records.get(installId);
    return record ? cloneRecord(record) : null;
  }

  list(): PluginInstanceRecord[] {
    return [...this.records.values()]
      .map(cloneRecord)
      .sort((left, right) => left.installed_at.localeCompare(right.installed_at)
        || left.install_id.localeCompare(right.install_id));
  }

  save(record: PluginInstanceRecord): void {
    this.records.set(record.install_id, cloneRecord(record));
  }
}

export class NativePluginExecutor implements PluginExecutor {
  async start(definition: PluginDefinition, context: PluginStartContext) {
    return { contribution: await definition.start(context) };
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    await definition.stop?.(context);
  }
}

export class PluginRuntime implements PluginRuntimeApi {
  private readonly definitions = new Map<string, PluginDefinition>();
  private readonly contributions = new Map<string, PluginContribution>();
  private readonly contexts = new Map<string, { context: PluginStartContext; revoke(): void }>();
  /** Serializes lifecycle mutations for one install so start cannot overlap stop. */
  private readonly operations = new Map<string, Promise<void>>();
  /** Concurrent `start` calls share one attempt and therefore one registration. */
  private readonly starting = new Map<string, Promise<PluginLifecycleReceipt>>();
  private readonly actionDisposers = new Map<string, () => void>();

  constructor(
    private readonly repository: PluginRuntimeRepository = new MemoryPluginRuntimeRepository(),
    private readonly executor: PluginExecutor = new NativePluginExecutor(),
    private readonly options: { now?: () => Date; maxRecoveryAttempts?: number;
      actions?: { registry: ActionRegistryPort; project_id?: string } } = {},
  ) {}

  register(definition: PluginDefinition): void {
    validateManifest(definition.manifest);
    const key = definitionKey(definition.manifest);
    const current = this.definitions.get(key);
    if (current && current !== definition) {
      throw new PluginRuntimeError("plugin_definition_conflict", "同一 Plugin ID、Version 和签名不能注册两个实现");
    }
    this.definitions.set(key, definition);
  }

  install(input: {
    definition: PluginDefinition;
    deployment: PluginDeployment;
    grants?: string[];
    retain_private_data?: boolean;
  }): PluginLifecycleReceipt {
    const manifest = input.definition.manifest;
    validateManifest(manifest);
    const entrypoint = manifest.entrypoints.find((candidate) => candidate.deployment === input.deployment);
    if (!entrypoint) {
      throw new PluginRuntimeError("plugin_entrypoint_missing", "Plugin 没有当前部署环境的 entrypoint");
    }
    const installId = installIdentity(manifest);
    const current = this.repository.get(installId);
    if (input.definition.execution === "sandbox" && input.grants === undefined) throw new PluginRuntimeError("plugin_grant_denied", "生成插件安装需要明确授权清单");
    if (current && (current.execution ?? "host") !== (input.definition.execution ?? "host")) throw new PluginRuntimeError("plugin_definition_conflict", "不能改变已安装插件的执行信任边界");
    const digest = pluginManifestDigest(manifest);
    if (current && current.version === manifest.version && current.manifest_digest !== digest) {
      const compatibleSameVersion = current.state !== "uninstalled"
        && (manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(current.version);
      if (compatibleSameVersion) {
        if (current.deployment !== input.deployment) {
          throw new PluginRuntimeError("plugin_state_invalid", "已有安装不能通过启动改变部署环境");
        }
        const grants = normalizeGrants(manifest, input.grants ?? current.grants);
        if (!sameStrings(current.grants, grants)) {
          throw new PluginRuntimeError("plugin_state_invalid", "兼容启动会保留现有 grant；权限变更必须通过单独授权操作");
        }
        assertRequiredGrants(manifest, current.grants);
        // The changed Manifest may supply the running code only when its exact
        // same-version compatibility declaration allows the existing install.
        // Keep the stored digest untouched; this is not a version upgrade.
        this.definitions.set(definitionKey(current), input.definition);
        return this.receipt("install", current, true);
      }
      throw new PluginRuntimeError(
        "plugin_definition_conflict",
        "同一 Plugin ID、Version 和签名不能对应不同 Manifest；请递增版本",
      );
    }
    this.register(input.definition);
    if (current && current.version !== manifest.version && current.state !== "uninstalled") {
      if (!(manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(current.version)) {
        throw new PluginRuntimeError("plugin_upgrade_required", "有新版本可用；请在插件市场确认升级后再启用");
      }
      const grants = normalizeGrants(manifest, input.grants ?? current.grants);
      if (!sameStrings(current.grants, grants)) {
        throw new PluginRuntimeError("plugin_state_invalid", "兼容启动会保留现有 grant；权限变更必须通过单独授权操作");
      }
      assertRequiredGrants(manifest, current.grants);
      // A process that still has the exact old definition can keep using it. A
      // fresh process can bind the newer implementation only because the target
      // Manifest explicitly promises compatibility with this installed version.
      const oldKey = definitionKey(current);
      if (!this.definitions.has(oldKey)) this.definitions.set(oldKey, input.definition);
      if (current.deployment !== input.deployment) {
        throw new PluginRuntimeError("plugin_state_invalid", "已有安装不能通过启动改变部署环境");
      }
      return this.receipt("install", current, true);
    }
    const grants = normalizeGrants(manifest, input.grants ?? []);
    if (current && current.state !== "uninstalled") {
      if (
        current.version === manifest.version
        && current.deployment === input.deployment
        && sameStrings(current.grants, grants)
      ) {
        return this.receipt("install", current, true);
      }
      throw new PluginRuntimeError(
        "plugin_state_invalid",
        "已有安装不能通过重复 install 静默改变部署环境或 grant",
      );
    }
    if (current && current.manifest_digest !== digest) {
      throw new PluginRuntimeError("plugin_upgrade_required", "已有安装需要在插件市场明确升级");
    }
    const now = this.now();
    const record: PluginInstanceRecord = {
      install_id: installId,
      plugin_id: manifest.plugin_id,
      version: manifest.version,
      publisher_id: manifest.publisher.publisher_id,
      publisher_signature: manifest.publisher.signature,
      manifest_digest: digest,
      deployment: input.deployment,
      selected_entrypoint: entrypoint.entrypoint,
      grants,
      execution: input.definition.execution ?? "host",
      state: "installed",
      recovery_count: 0,
      last_error_code: null,
      installed_at: current?.installed_at ?? now,
      updated_at: now,
      uninstalled_at: null,
      retain_private_data: input.retain_private_data ?? current?.retain_private_data ?? true,
    };
    this.repository.save(record);
    return this.receipt("install", record, false);
  }

  /** Replace one installed version after an explicit Host action and preflight. */
  async upgrade(input: {
    install_id: string;
    definition: PluginDefinition;
    deployment?: PluginDeployment;
    grants?: string[];
  }): Promise<PluginLifecycleReceipt> {
    return this.changeVersion(input, false);
  }

  async rollback(input: { install_id: string; definition: PluginDefinition }): Promise<PluginLifecycleReceipt> {
    return this.changeVersion(input, true);
  }

  private async changeVersion(input: { install_id: string; definition: PluginDefinition; deployment?: PluginDeployment; grants?: string[] }, rollbackCode: boolean): Promise<PluginLifecycleReceipt> {
    return this.runLocked(input.install_id, async () => {
      const target = input.definition.manifest;
      validateManifest(target);
      const current = this.requireInstall(input.install_id);
      if ((current.execution ?? "host") !== (input.definition.execution ?? "host")) throw new PluginRuntimeError("plugin_definition_conflict", "不能在升级时改变执行信任边界");
      if (rollbackCode && current.execution !== "sandbox") throw new PluginRuntimeError("plugin_state_invalid", "代码回滚只适用于隔离的生成插件");
      if (current.state === "uninstalled" || current.state === "quarantined") {
        throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${current.state} 不允许升级`);
      }
      if (current.plugin_id !== target.plugin_id || current.publisher_signature !== target.publisher.signature) {
        throw new PluginRuntimeError("plugin_definition_conflict", "升级目标必须属于同一插件和发布者签名");
      }
      if (current.version === target.version && current.manifest_digest !== pluginManifestDigest(target)) {
        throw new PluginRuntimeError("plugin_definition_conflict", "同一版本的 Manifest 指纹不同，不能升级");
      }
      if (rollbackCode ? comparePluginVersions(target.version, current.version) >= 0 : comparePluginVersions(target.version, current.version) <= 0) {
        throw new PluginRuntimeError("plugin_upgrade_required", "升级目标必须高于当前安装版本");
      }
      const compatibility = target.upgrade_compatibility;
      const compatible = (compatibility?.compatible_from_versions ?? []).includes(current.version);
      const migratable = (compatibility?.migratable_from_versions ?? []).includes(current.version);
      if (!rollbackCode && !compatible && !migratable) {
        throw new PluginRuntimeError("plugin_upgrade_required", "目标 Manifest 未声明支持从当前安装版本升级");
      }
      const declaredPermissions = new Set(target.permissions.map(permission => permission.permission));
      if (input.grants === undefined && !rollbackCode && current.grants.some(permission => !declaredPermissions.has(permission))) {
        throw new PluginRuntimeError("plugin_grant_denied", "升级会丢失已有授权，目标 Manifest 未保留全部 grant");
      }
      const targetGrants = normalizeGrants(target, input.grants ?? (rollbackCode ? current.grants.filter(permission => declaredPermissions.has(permission)) : current.grants));
      assertRequiredGrants(target, targetGrants);
      const deployment = input.deployment ?? current.deployment;
      const entrypoint = target.entrypoints.find(candidate => candidate.deployment === deployment);
      if (!entrypoint) throw new PluginRuntimeError("plugin_entrypoint_missing", "Plugin 没有当前部署环境的 entrypoint");
      if (migratable && !input.definition.validateUpgrade) {
        throw new PluginRuntimeError("plugin_upgrade_validation_missing", "此升级需要插件提供旧私有数据校验");
      }

      if (current.state === "running") await this.stopOnce(input.install_id);
      const stopped = this.requireInstall(input.install_id);
      const oldDefinition = this.definitions.get(definitionKey(stopped));
      let privateDataSnapshot: unknown;
      let hasPrivateDataSnapshot = false;
      try {
        if (current.execution !== "sandbox" && this.executor.capturePrivateData && this.executor.restorePrivateData) {
          privateDataSnapshot = await this.executor.capturePrivateData(input.install_id);
          hasPrivateDataSnapshot = privateDataSnapshot !== undefined;
        }
        if (input.definition.validateUpgrade) {
          const grants = Object.freeze([...targetGrants]);
          const context: PluginUpgradeContext = Object.freeze({
            install_id: stopped.install_id,
            plugin_id: stopped.plugin_id,
            version: target.version,
            deployment,
            grants,
            requireGrant(permission) {
              if (!grants.includes(permission)) throw new PluginRuntimeError("plugin_grant_denied", `Plugin 没有 ${permission} grant`);
            },
          });
          try {
            if (this.executor.validateUpgrade) await this.executor.validateUpgrade(input.definition, context, stopped);
            else await input.definition.validateUpgrade({ from: cloneRecord(stopped), context });
          } catch (error) {
            throw new PluginRuntimeError("plugin_upgrade_validation_failed", `旧私有数据校验失败：${safeErrorMessage(error)}`);
          }
        }

        this.register(input.definition);

        const upgraded: PluginInstanceRecord = {
          ...stopped,
          version: target.version,
          publisher_id: target.publisher.publisher_id,
          publisher_signature: target.publisher.signature,
          manifest_digest: pluginManifestDigest(target),
          deployment,
          selected_entrypoint: entrypoint.entrypoint,
          grants: targetGrants,
          state: "installed",
          recovery_count: 0,
          last_error_code: null,
          updated_at: this.now(),
          uninstalled_at: null,
        };
        this.repository.save(upgraded);
        const receipt = await this.startOnce(input.install_id);
        return { ...receipt, operation: rollbackCode ? "rollback" : "upgrade", replayed: false };
      } catch (error) {
        const failed = this.repository.get(input.install_id);
        let dataRollbackError: unknown;
        if (hasPrivateDataSnapshot) {
          try { await this.executor.restorePrivateData!(input.install_id, privateDataSnapshot); }
          catch (restoreError) { dataRollbackError = restoreError; }
        }
        const rollback: PluginInstanceRecord = {
          ...stopped,
          state: dataRollbackError ? "disabled" : stopped.state,
          last_error_code: dataRollbackError ? "plugin_upgrade_rollback_failed" : safeErrorCode(error),
          updated_at: this.now(),
        };
        this.repository.save(rollback);
        if (oldDefinition && !dataRollbackError) {
          // Restore the pre-upgrade implementation after a failed candidate
          // start. Its stable install id keeps access to the same private data.
          try { await this.startOnce(input.install_id); } catch { /* the original upgrade error remains authoritative */ }
        }
        if (failed?.version === target.version && oldDefinition !== input.definition) {
          this.definitions.delete(definitionKey(target));
        }
        if (dataRollbackError) {
          throw new PluginRuntimeError("plugin_upgrade_rollback_failed", `升级失败且私有数据回滚失败，旧插件已停止：${safeErrorMessage(dataRollbackError)}`);
        }
        throw error;
      }
    });
  }

  grant(installId: string, permissions: string[]): PluginLifecycleReceipt {
    const current = this.requireInstall(installId);
    this.assertMutable(current);
    const definition = this.requireDefinition(current);
    const grants = normalizeGrants(definition.manifest, permissions);
    if (sameStrings(current.grants, grants)) return this.receipt("grant", current, true);
    if (current.state === "running") {
      throw new PluginRuntimeError("plugin_state_invalid", "运行中的 Plugin 必须先停止，不能静默改变 grant");
    }
    const updated = { ...current, grants, updated_at: this.now() };
    this.repository.save(updated);
    return this.receipt("grant", updated, false);
  }

  start(installId: string): Promise<PluginLifecycleReceipt> {
    const pending = this.starting.get(installId);
    if (pending) return pending;
    const attempt = this.runLocked(installId, () => this.startOnce(installId));
    this.starting.set(installId, attempt);
    // Drop the shared attempt before callers resume, so a start that follows
    // `await start()` is a new call and can report an honest replay.
    const clear = () => {
      if (this.starting.get(installId) === attempt) this.starting.delete(installId);
    };
    void attempt.then(clear, clear);
    return attempt;
  }

  /** Deliberate stop. It keeps the install and its grants, and never spends the recovery budget. */
  stop(installId: string): Promise<PluginLifecycleReceipt> {
    return this.runLocked(installId, () => this.stopOnce(installId));
  }

  reportCrash(installId: string, errorCode = "plugin_process_crashed"): Promise<PluginLifecycleReceipt> {
    return this.runLocked(installId, () => this.reportCrashOnce(installId, errorCode));
  }

  recover(installId: string, options: { release_quarantine?: boolean } = {}): Promise<PluginLifecycleReceipt> {
    return this.runLocked(installId, () => this.recoverOnce(installId, options.release_quarantine === true));
  }

  /**
   * Replay only when this process still holds the contribution and grant context
   * that match the persisted `running` row. A previous process's `running` row
   * is activated again. `crashed` and `quarantined` are never turned back into
   * `running` here; recovery stays on `recover`.
   */
  private async startOnce(installId: string): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state === "running" && this.hasLiveInstance(installId)) {
      return this.receipt("start", current, true);
    }
    if (current.state !== "installed" && current.state !== "disabled" && current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${current.state} 不能直接启动`);
    }
    const definition = this.requireDefinition(current);
    assertRequiredGrants(definition.manifest, current.grants);
    try {
      const handle = await this.executor.start(definition, this.activateContext(current, definition));
      await this.redeem(definition, current, handle.contribution);
      const updated = {
        ...current,
        state: "running" as const,
        last_error_code: null,
        updated_at: this.now(),
      };
      this.repository.save(updated);
      this.contributions.set(installId, handle.contribution);
      return this.receipt("start", updated, false);
    } catch (error) {
      this.revokeContext(installId);
      this.contributions.delete(installId);
      const updated = {
        ...current,
        state: "crashed" as const,
        last_error_code: safeErrorCode(error),
        updated_at: this.now(),
      };
      this.repository.save(updated);
      // A structured contract failure already says what the author must fix; only an
      // opaque entrypoint error is reduced to a safe generic message.
      if (error instanceof PluginRuntimeError) throw error;
      throw new PluginRuntimeError("plugin_executor_failed", "Plugin entrypoint 启动失败，已记录为 crashed");
    }
  }

  private async stopOnce(installId: string): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state === "disabled") return this.receipt("stop", current, true);
    if (current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${current.state} 不能停止`);
    }
    // Nothing in this process was activated. Do not grant a context just to stop it.
    if (!this.hasLiveInstance(installId)) {
      this.revokeContext(installId);
      this.contributions.delete(installId);
      const updated = {
        ...current,
        state: "disabled" as const,
        last_error_code: null,
        updated_at: this.now(),
      };
      this.repository.save(updated);
      return this.receipt("stop", updated, false);
    }
    const definition = this.requireDefinition(current);
    const live = this.liveContext(installId);
    try {
      if (live) await this.executor.stop(definition, live);
    } catch (error) {
      this.revokeContext(installId);
      this.contributions.delete(installId);
      const crashed = {
        ...current,
        state: "crashed" as const,
        last_error_code: safeErrorCode(error),
        updated_at: this.now(),
      };
      this.repository.save(crashed);
      throw new PluginRuntimeError("plugin_executor_failed", "Plugin 停止失败，已记录为 crashed");
    }
    this.revokeContext(installId);
    this.contributions.delete(installId);
    const updated = {
      ...current,
      state: "disabled" as const,
      last_error_code: null,
      updated_at: this.now(),
    };
    this.repository.save(updated);
    return this.receipt("stop", updated, false);
  }

  private async reportCrashOnce(
    installId: string,
    errorCode: string,
  ): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", "只有运行中的 Plugin 能报告 crash");
    }
    if (this.hasLiveInstance(installId)) {
      const definition = this.requireDefinition(current);
      const live = this.liveContext(installId);
      try {
        if (live) await this.executor.stop(definition, live);
      } catch {
        // A crashed executor may already be unavailable; lifecycle state is still authoritative.
      }
    }
    this.revokeContext(installId);
    this.contributions.delete(installId);
    const updated = {
      ...current,
      state: "crashed" as const,
      last_error_code: normalizeErrorCode(errorCode),
      updated_at: this.now(),
    };
    this.repository.save(updated);
    return this.receipt("crash", updated, false);
  }

  private async recoverOnce(installId: string, releaseQuarantine = false): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state !== (releaseQuarantine ? "quarantined" : "crashed")) {
      throw new PluginRuntimeError("plugin_state_invalid", releaseQuarantine ? "只有 quarantined Plugin 可以显式解除隔离" : "只有 crashed Plugin 可以恢复");
    }
    const maxAttempts = this.options.maxRecoveryAttempts ?? 3;
    if (!releaseQuarantine && current.recovery_count >= maxAttempts) {
      const quarantined = {
        ...current,
        state: "quarantined" as const,
        updated_at: this.now(),
      };
      this.repository.save(quarantined);
      throw new PluginRuntimeError("plugin_quarantined", "Plugin 多次恢复失败，已隔离");
    }
    const definition = this.requireDefinition(current);
    assertRequiredGrants(definition.manifest, current.grants);
    const recoveryCount = current.recovery_count + 1;
    try {
      const handle = await this.executor.start(definition, this.activateContext(current, definition));
      await this.redeem(definition, current, handle.contribution);
      const updated = {
        ...current,
        state: "running" as const,
        recovery_count: releaseQuarantine ? 0 : recoveryCount,
        last_error_code: null,
        updated_at: this.now(),
      };
      this.repository.save(updated);
      this.contributions.set(installId, handle.contribution);
      return this.receipt("recover", updated, false);
    } catch (error) {
      this.revokeContext(installId);
      this.contributions.delete(installId);
      const quarantined = releaseQuarantine || recoveryCount >= maxAttempts;
      const updated = {
        ...current,
        state: quarantined ? "quarantined" as const : "crashed" as const,
        recovery_count: recoveryCount,
        last_error_code: safeErrorCode(error),
        updated_at: this.now(),
      };
      this.repository.save(updated);
      throw new PluginRuntimeError(
        quarantined ? "plugin_quarantined" : "plugin_executor_failed",
        quarantined ? "Plugin 多次恢复失败，已隔离" : "Plugin 恢复失败，可以在策略上限内重试",
      );
    }
  }

  uninstall(
    installId: string,
    options: { retain_private_data?: boolean } = {},
  ): Promise<PluginLifecycleReceipt> {
    return this.runLocked(installId, () => this.uninstallOnce(installId, options));
  }

  private async uninstallOnce(
    installId: string,
    options: { retain_private_data?: boolean },
  ): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state === "uninstalled") return this.receipt("uninstall", current, true);
    const definition = this.requireDefinition(current);
    if (current.state === "running" && this.hasLiveInstance(installId)) {
      const live = this.liveContext(installId);
      try {
        if (live) await this.executor.stop(definition, live);
      } catch (error) {
        this.revokeContext(installId);
        this.contributions.delete(installId);
        this.repository.save({ ...current, state: "crashed", last_error_code: safeErrorCode(error), updated_at: this.now() });
        throw new PluginRuntimeError("plugin_executor_failed", "Plugin 停止失败，已撤销权限并记录为 crashed，可重试卸载");
      }
    }
    this.revokeContext(installId);
    this.contributions.delete(installId);
    const at = this.now();
    const updated = {
      ...current,
      state: "uninstalled" as const,
      retain_private_data: options.retain_private_data ?? current.retain_private_data,
      last_error_code: null,
      updated_at: at,
      uninstalled_at: at,
    };
    this.repository.save(updated);
    return this.receipt("uninstall", updated, false);
  }

  get(installId: string): PluginInstanceRecord {
    return this.requireInstall(installId);
  }

  list(): PluginInstanceRecord[] {
    return this.repository.list();
  }

  contribution(installId: string): PluginContribution | null {
    return this.contributions.get(installId) ?? null;
  }

  /** A started Plugin must deliver exactly what its Manifest declared, or it does not run. */
  private async redeem(
    definition: PluginDefinition,
    record: PluginInstanceRecord,
    contribution: PluginContribution,
  ): Promise<void> {
    try {
      assertContributionMatchesManifest(definition.manifest, contribution);
      const manifest = definition.manifest;
      if ((manifest.actions?.length ?? 0) > 0 || (manifest.action_scenes?.length ?? 0) > 0) {
        const actions = this.options.actions;
        if (!actions) throw new PluginContributionError("plugin_contribution_unredeemed", "宿主未提供系统动作注册服务");
        const grantAvailability = (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) =>
          (context: ActionCallContext): ActionAvailability => {
            const grants = this.repository.get(record.install_id)?.grants ?? [];
            if (permissions.some(p => !grants.includes(p))) return { available: false, code: "actions.plugin_permission", reason: "插件缺少能力所需授权" };
            return own?.(context) ?? { available: true };
          };
        this.actionDisposers.set(record.install_id, actions.registry.registerProvider({
          provider: { provider_id: record.install_id, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin",
            ...(actions.project_id ? { project_id: actions.project_id } : {}) },
          definitions: manifest.actions ?? [], handlers: (contribution.actions ?? []).map(h => ({ ...h,
            availability: grantAvailability(manifest.actions!.find(d => d.capability_id === h.capability_id && d.version === h.version)!.action.permissions, h.availability) })),
          scenes: manifest.action_scenes ?? [], scene_handlers: (contribution.action_scenes ?? []).map(h => {
            const declaration = manifest.action_scenes!.find(d => d.scene_id === h.scene_id && d.version === h.version)!;
            const configuration = grantAvailability(declaration.configuration_permissions ?? []);
            return { ...h, availability: grantAvailability(declaration.permissions, h.availability),
              configuration_availability: grantAvailability(declaration.configuration_permissions ?? [], h.configuration_availability),
              ...(h.targets ? { targets: async (caller: ActionCallContext) => {
                const targets = await h.targets!(caller);
                const state = configuration(caller);
                return targets.map(target => {
                  const activation = grantAvailability(target.activation_permissions ?? [])(caller);
                  return { ...target, ...(!state.available ? { availability: state } : {}),
                    ...(!activation.available ? { activation_availability: activation } : {}) };
                });
              } } : {}),
              bind: (caller, binding, options) => {
                const state = grantAvailability(options?.required_permissions ?? declaration.configuration_permissions ?? [])(caller);
                if (!state.available) throw new ActionError(state.code, state.reason);
                return h.bind(caller, binding, options);
              },
            };
          }),
          availability: () => {
            const current = this.repository.get(record.install_id);
            if (!current || current.state !== "running" || !this.contexts.has(record.install_id)) {
              return { available: false, code: "actions.plugin_unavailable", reason: "插件未运行或已停用" };
            }
            if (manifest.permissions.some(p => p.required && !current.grants.includes(p.permission))) {
              return { available: false, code: "actions.plugin_permission", reason: "插件所需授权已撤销" };
            }
            return { available: true };
          },
        }));
      }
    } catch (error) {
      const live = this.liveContext(record.install_id);
      try {
        if (live) await this.executor.stop(definition, live);
      } catch {
        // The Plugin already failed its contract; lifecycle state stays authoritative.
      }
      if (error instanceof PluginContributionError || error instanceof ActionError) {
        throw new PluginRuntimeError("plugin_contribution_unredeemed", error.message);
      }
      throw error;
    }
  }

  private requireInstall(installId: string): PluginInstanceRecord {
    const record = this.repository.get(installId);
    if (!record) throw new PluginRuntimeError("plugin_definition_missing", "Plugin installation 不存在");
    return record;
  }

  private requireDefinition(record: PluginInstanceRecord): PluginDefinition {
    const definition = this.definitions.get(definitionKey(record));
    if (!definition) {
      throw new PluginRuntimeError("plugin_definition_missing", "找不到当前安装版本与签名绑定的 Plugin 代码");
    }
    return definition;
  }

  private assertMutable(record: PluginInstanceRecord): void {
    if (record.state === "uninstalled" || record.state === "quarantined") {
      throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${record.state} 不允许修改`);
    }
  }

  private runLocked<T>(installId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(installId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(() => undefined, () => undefined);
    this.operations.set(installId, tail);
    void tail.finally(() => {
      if (this.operations.get(installId) === tail) this.operations.delete(installId);
    });
    return run;
  }

  private hasLiveInstance(installId: string): boolean {
    return this.contributions.has(installId) && this.contexts.has(installId);
  }

  private liveContext(installId: string): PluginStartContext | null {
    return this.contexts.get(installId)?.context ?? null;
  }

  private revokeContext(installId: string): void {
    this.actionDisposers.get(installId)?.();
    this.actionDisposers.delete(installId);
    this.contexts.get(installId)?.revoke();
    this.contexts.delete(installId);
  }

  private activateContext(record: PluginInstanceRecord, definition: PluginDefinition): PluginStartContext {
    this.revokeContext(record.install_id);
    let active = true;
    const grants = Object.freeze([...record.grants]);
    const context: PluginStartContext = {
      install_id: record.install_id,
      plugin_id: record.plugin_id,
      // Services authenticate the executing implementation; the persisted
      // install version stays unchanged until an explicit upgrade.
      version: definition.manifest.version,
      deployment: record.deployment,
      grants,
      requireGrant(permission) {
        if (!active || !grants.includes(permission)) {
          throw new PluginRuntimeError("plugin_grant_denied", `Plugin 没有 ${permission} grant`);
        }
      },
    };
    Object.freeze(context);
    this.contexts.set(record.install_id, { context, revoke() { active = false; } });
    return context;
  }

  private receipt(
    operation: PluginLifecycleReceipt["operation"],
    install: PluginInstanceRecord,
    replayed: boolean,
  ): PluginLifecycleReceipt {
    return {
      receipt_id: `plugin-receipt-${randomUUID()}`,
      operation,
      install: cloneRecord(install),
      at: this.now(),
      replayed,
    };
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function validateManifest(manifest: PluginManifest): void {
  if (
    (manifest.schema_version !== 1 && manifest.schema_version !== 2)
    || manifest.host_api_version !== manifest.schema_version
    || !manifest.plugin_id.trim()
    || !manifest.version.trim()
    || !manifest.publisher.publisher_id.trim()
    || !manifest.publisher.signature.trim()
  ) {
    throw new PluginRuntimeError("plugin_manifest_invalid", "Plugin Manifest 身份、签名或 Host API 不合法");
  }
  try {
    parsePluginManifest(manifest);
  } catch (error) {
    throw new PluginRuntimeError("plugin_manifest_invalid", error instanceof Error ? error.message : "Plugin Manifest 不合法");
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "数据无法读取";
}

function normalizeGrants(manifest: PluginManifest, requested: string[]): string[] {
  const ceiling = new Set(manifest.permissions.map((permission) => permission.permission));
  const grants = [...new Set(requested.map((permission) => permission.trim()).filter(Boolean))].sort();
  if (grants.some((permission) => !ceiling.has(permission))) {
    throw new PluginRuntimeError("plugin_grant_denied", "实际 grant 不能超过 Manifest 声明上限");
  }
  return grants;
}

function assertRequiredGrants(manifest: PluginManifest, grants: readonly string[]): void {
  const missing = manifest.permissions
    .filter((permission) => permission.required && !grants.includes(permission.permission))
    .map((permission) => permission.permission);
  if (missing.length > 0) {
    throw new PluginRuntimeError("plugin_grant_denied", `Plugin 缺少必需 grant：${missing.join(", ")}`);
  }
}

function installIdentity(manifest: PluginManifest): string {
  return `plugin-install-${createHash("sha256")
    .update(`${manifest.plugin_id}\u0000${manifest.publisher.signature}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function definitionKey(manifest: PluginManifest | PluginInstanceRecord): string {
  const signature = "publisher" in manifest
    ? manifest.publisher.signature
    : manifest.publisher_signature;
  return `${manifest.plugin_id}\u0000${manifest.version}\u0000${signature}`;
}

function normalizeErrorCode(value: string): string {
  return /^[a-z][a-z0-9_]{1,63}$/u.test(value) ? value : "plugin_process_crashed";
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return normalizeErrorCode(code);
  }
  return "plugin_executor_failed";
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneRecord(record: PluginInstanceRecord): PluginInstanceRecord {
  return { ...record, grants: [...record.grants] };
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
