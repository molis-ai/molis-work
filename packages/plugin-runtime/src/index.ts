import { createHash, randomUUID } from "node:crypto";

import { assertContributionMatchesManifest, PluginContributionError } from "./contribution.js";

export { SqlitePluginPrivateStorage, PluginPrivateStorageError } from "./private-storage.js";
export type { PluginPrivateStorageDatabase } from "./private-storage.js";
export { SqlitePluginRuntimeRepository } from "./repository.js";
export type { PluginRuntimeDatabase } from "./repository.js";
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
      | "plugin_quarantined",
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

  constructor(
    private readonly repository: PluginRuntimeRepository = new MemoryPluginRuntimeRepository(),
    private readonly executor: PluginExecutor = new NativePluginExecutor(),
    private readonly options: { now?: () => Date; maxRecoveryAttempts?: number } = {},
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
    /** Host-authorized replacement of an inactive version; identity and private data remain. */
    replace_version?: boolean;
  }): PluginLifecycleReceipt {
    this.register(input.definition);
    const manifest = input.definition.manifest;
    const entrypoint = manifest.entrypoints.find((candidate) => candidate.deployment === input.deployment);
    if (!entrypoint) {
      throw new PluginRuntimeError("plugin_entrypoint_missing", "Plugin 没有当前部署环境的 entrypoint");
    }
    const grants = normalizeGrants(manifest, input.grants ?? []);
    const installId = installIdentity(manifest);
    const current = this.repository.get(installId);
    const digest = manifestDigest(manifest);
    const replacing = Boolean(current && current.version !== manifest.version && input.replace_version === true);
    if (replacing && (this.contexts.has(installId) || this.contributions.has(installId))) {
      throw new PluginRuntimeError("plugin_state_invalid", "请先停止当前 Plugin，再更换版本");
    }
    if (current && current.manifest_digest !== digest && !replacing) {
      throw new PluginRuntimeError(
        "plugin_definition_conflict",
        "同一 Plugin ID、Version 和签名不能对应不同 Manifest；请递增版本",
      );
    }
    if (current && current.state !== "uninstalled" && !replacing) {
      if (
        current.version === manifest.version
        && current.deployment === input.deployment
        && sameStrings(current.grants, grants)
      ) {
        return this.receipt("install", current, true);
      }
      throw new PluginRuntimeError(
        "plugin_state_invalid",
        "已有安装不能通过重复 install 静默改变版本、部署环境或 grant",
      );
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

  async start(installId: string): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    // A persisted running flag is not a live instance in this process. Rebuild
    // its contribution after Host restart; only this process's handle can replay.
    if (current.state === "running" && this.contributions.has(installId)) return this.receipt("start", current, true);
    if (current.state !== "installed" && current.state !== "disabled" && current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${current.state} 不能直接启动`);
    }
    const definition = this.requireDefinition(current);
    assertRequiredGrants(definition.manifest, current.grants);
    try {
      const handle = await this.executor.start(definition, this.activateContext(current));
      await this.redeem(definition, current, handle.contribution);
      this.contributions.set(installId, handle.contribution);
      const updated = {
        ...current,
        state: "running" as const,
        last_error_code: null,
        updated_at: this.now(),
      };
      this.repository.save(updated);
      return this.receipt("start", updated, false);
    } catch (error) {
      this.revokeContext(installId);
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

  /** Deliberate stop. It keeps the install and its grants, and never spends the recovery budget. */
  async stop(installId: string): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state === "disabled") return this.receipt("stop", current, true);
    if (current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${current.state} 不能停止`);
    }
    const definition = this.requireDefinition(current);
    try {
      await this.executor.stop(definition, this.context(current));
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

  async reportCrash(installId: string, errorCode = "plugin_process_crashed"): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state !== "running") {
      throw new PluginRuntimeError("plugin_state_invalid", "只有运行中的 Plugin 能报告 crash");
    }
    const definition = this.requireDefinition(current);
    try {
      await this.executor.stop(definition, this.context(current));
    } catch {
      // A crashed executor may already be unavailable; lifecycle state is still authoritative.
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

  async recover(installId: string): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state !== "crashed") {
      throw new PluginRuntimeError("plugin_state_invalid", "只有 crashed Plugin 可以恢复");
    }
    const maxAttempts = this.options.maxRecoveryAttempts ?? 3;
    if (current.recovery_count >= maxAttempts) {
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
      const handle = await this.executor.start(definition, this.activateContext(current));
      await this.redeem(definition, current, handle.contribution);
      this.contributions.set(installId, handle.contribution);
      const updated = {
        ...current,
        state: "running" as const,
        recovery_count: recoveryCount,
        last_error_code: null,
        updated_at: this.now(),
      };
      this.repository.save(updated);
      return this.receipt("recover", updated, false);
    } catch (error) {
      this.revokeContext(installId);
      const quarantined = recoveryCount >= maxAttempts;
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

  async uninstall(
    installId: string,
    options: { retain_private_data?: boolean } = {},
  ): Promise<PluginLifecycleReceipt> {
    const current = this.requireInstall(installId);
    if (current.state === "uninstalled") return this.receipt("uninstall", current, true);
    const definition = this.requireDefinition(current);
    if (current.state === "running") {
      try {
        await this.executor.stop(definition, this.context(current));
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
    } catch (error) {
      try {
        await this.executor.stop(definition, this.context(record));
      } catch {
        // The Plugin already failed its contract; lifecycle state stays authoritative.
      }
      if (error instanceof PluginContributionError) {
        throw new PluginRuntimeError(error.code, error.message);
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

  private context(record: PluginInstanceRecord): PluginStartContext {
    return this.contexts.get(record.install_id)?.context ?? this.activateContext(record);
  }

  private revokeContext(installId: string): void {
    this.contexts.get(installId)?.revoke();
    this.contexts.delete(installId);
  }

  private activateContext(record: PluginInstanceRecord): PluginStartContext {
    this.revokeContext(record.install_id);
    let active = true;
    const grants = Object.freeze([...record.grants]);
    const context: PluginStartContext = {
      install_id: record.install_id,
      plugin_id: record.plugin_id,
      version: record.version,
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

function manifestDigest(manifest: PluginManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
