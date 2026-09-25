import type {
  PluginContribution,
  PluginDefinition,
  PluginDeployment,
  PluginManifest,
  PluginRuntimeApi,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-contracts/platform/plugin";

import { buildEventContract, type PluginEventContract } from "./event-contract.js";
import { pluginManifestDigest } from "./identity.js";
import type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";
import {
  createPluginRuntimeReleaseArtifact,
  type PluginRuntimeReleaseArtifactRepository,
} from "./release-artifacts.js";
import {
  resolvePluginActivation,
  type PluginCapabilityProvider,
  type PluginResolutionDiagnostic,
} from "./resolution.js";

/**
 * Starts a set of Plugins with per-Plugin isolation.
 *
 * One Plugin's failure never stops its siblings, never aborts the run, and
 * never leaves the product without a reason to show. Restart is explicit and
 * idempotent under concurrency: two callers racing produce one new instance.
 * `revoke` drops enablement until `enable`. A start already in flight cannot
 * publish that Plugin as a running instance afterwards.
 */

export interface PluginSupervisorEntry {
  /** Latest Host-provided definition; kept as the manual upgrade candidate. */
  definition: PluginDefinition;
  deployment?: PluginDeployment;
  /** Defaults to every required permission the Manifest declares. */
  grants?: string[];
  /** Trusted Host adapter for retaining and restoring this Native factory. */
  releaseArtifact?: {
    capture(): string | Promise<string>;
    restore(moduleSource: string): PluginDefinition | Promise<PluginDefinition>;
  };
}

export interface PluginUpgradeCandidate {
  plugin_id: string;
  install_id: string;
  installed_version: string;
  target_version: string;
  mode: "compatible" | "migratable" | "unsupported";
  can_upgrade: boolean;
}

export type PluginSupervisorStatus = "running" | "failed" | "blocked";

export interface PluginSupervisorState {
  plugin_id: string;
  status: PluginSupervisorStatus;
  install_id: string | null;
  /** Stable code for a failed or blocked Plugin. Null while it is healthy. */
  code: string | null;
  /** User-safe reason. Never a raw stack or provider diagnostic. */
  message: string | null;
}

export interface PluginSupervisorReport {
  running: string[];
  failed: PluginSupervisorState[];
  blocked: PluginSupervisorState[];
  diagnostics: PluginResolutionDiagnostic[];
}

function safeCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[a-z][a-z0-9_.]{1,63}$/u.test(code)) return code;
  }
  return "plugin_start_failed";
}

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "Plugin 启动失败";
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export class PluginSupervisor implements PluginHostLifecycle {
  readonly #runtime: PluginRuntimeApi;
  readonly #hostCapabilities: readonly PluginCapabilityProvider[];
  readonly #releaseArtifacts?: PluginRuntimeReleaseArtifactRepository;
  /** Candidate definitions remain available for manual upgrade. */
  readonly #entries = new Map<string, PluginSupervisorEntry>();
  /** Implementation selected for the currently installed Runtime record. */
  readonly #activeEntries = new Map<string, PluginSupervisorEntry>();
  readonly #states = new Map<string, PluginSupervisorState>();
  readonly #inFlight = new Map<string, Promise<PluginSupervisorState>>();
  readonly #contracts = new Map<string, PluginEventContract>();
  readonly #generations = new Map<string, number>();
  readonly #revoked = new Set<string>();
  /** Identity of the instance `ensureStarted` last handed out. `revoke` drops it. */
  readonly #tokens = new Map<string, symbol>();
  /** Bumped on revoke so an in-flight start can see that it must not commit. */
  readonly #epochs = new Map<string, number>();
  readonly #pending = new Map<string, number>();
  readonly #gates = new Map<string, Promise<void>>();
  readonly #activationListeners = new Set<(pluginId: string) => void>();
  #generation = 0;

  constructor(
    runtime: PluginRuntimeApi,
    options: {
      hostCapabilities?: readonly PluginCapabilityProvider[];
      releaseArtifacts?: PluginRuntimeReleaseArtifactRepository;
    } = {},
  ) {
    this.#runtime = runtime;
    this.#hostCapabilities = options.hostCapabilities ?? [];
    this.#releaseArtifacts = options.releaseArtifacts;
  }

  async start(entries: readonly PluginSupervisorEntry[]): Promise<PluginSupervisorReport> {
    const admitted: PluginSupervisorEntry[] = [];
    for (const entry of entries) {
      const pluginId = entry.definition.manifest.plugin_id;
      this.#entries.set(pluginId, entry);
      let active: PluginSupervisorEntry;
      try {
        active = await this.#resolveInstalledEntry(entry);
      } catch (error) {
        // Keep the candidate registered for the market even when its old
        // installed implementation cannot be restored in this process.
        this.#activeEntries.delete(pluginId);
        this.#fail(pluginId, this.#runtime.list().find(record => record.plugin_id === pluginId
          && record.publisher_signature === entry.definition.manifest.publisher.signature
          && record.state !== "uninstalled")?.install_id ?? null, safeCode(error), safeMessage(error));
        continue;
      }
      this.#activeEntries.set(pluginId, active);
      try {
        this.#contracts.set(pluginId, buildEventContract(active.definition));
        admitted.push(active);
      } catch (error) {
        // A Plugin whose event declarations and validators disagree never runs and
        // never matches a subscription; its siblings are unaffected.
        this.#entries.delete(pluginId);
        this.#activeEntries.delete(pluginId);
        this.#fail(pluginId, this.#runtime.list().find(record => record.plugin_id === pluginId
          && record.publisher_signature === entry.definition.manifest.publisher.signature
          && record.state !== "uninstalled")?.install_id ?? null, safeCode(error), safeMessage(error));
      }
    }
    const resolution = resolvePluginActivation({
      manifests: admitted.map((entry) => entry.definition.manifest),
      hostCapabilities: this.#hostCapabilities,
    });

    for (const pluginId of resolution.blocked) {
      const diagnostic = resolution.diagnostics.find((item) => item.plugin_id === pluginId);
      this.#states.set(pluginId, {
        plugin_id: pluginId,
        status: "blocked",
        install_id: null,
        code: diagnostic?.code ?? "dependency_unsatisfied",
        message: diagnostic?.message ?? "依赖未满足",
      });
    }

    for (const pluginId of resolution.order) {
      this.#begin(pluginId);
      const activation = this.#activate(pluginId);
      this.#finish(pluginId, activation);
      await activation;
    }

    return this.#report(resolution.diagnostics);
  }

  /**
   * Restart exactly one Plugin. Siblings keep running and keep their state.
   * Concurrent calls for the same Plugin share one attempt.
   */
  async restart(pluginId: string, options: { release_quarantine?: boolean } = {}): Promise<PluginSupervisorState> {
    const pending = this.#inFlight.get(pluginId);
    if (pending) return await pending;
    this.#begin(pluginId);
    const attempt = this.#restart(pluginId, options.release_quarantine === true);
    this.#finish(pluginId, attempt);
    this.#inFlight.set(pluginId, attempt);
    try {
      return await attempt;
    } finally {
      if (this.#inFlight.get(pluginId) === attempt) this.#inFlight.delete(pluginId);
    }
  }

  state(pluginId: string): PluginSupervisorState | null {
    const state = this.#states.get(pluginId);
    return state ? { ...state } : null;
  }

  states(): PluginSupervisorState[] {
    return [...this.#states.values()]
      .map((state) => ({ ...state }))
      .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id));
  }

  contribution(pluginId: string): PluginContribution | null {
    if (!this.#isEnabled(pluginId)) return null;
    const state = this.#states.get(pluginId);
    if (!state || state.status !== "running" || state.install_id === null) return null;
    return this.#runtime.contribution(state.install_id);
  }

  /** Notified after a Plugin becomes running, so a durable queue can resume for it. */
  observeActivation(listener: (pluginId: string) => void): () => void {
    this.#activationListeners.add(listener);
    return () => {
      this.#activationListeners.delete(listener);
    };
  }

  contract(pluginId: string): PluginEventContract | undefined {
    return this.#contracts.get(pluginId);
  }

  /**
   * The Plugin's enablement epoch, not its start count. It stays stable across a
   * restart so work already queued for an enabled Plugin survives one. `revoke`
   * drops it, and later reads stay `undefined` until `enable` assigns a new one.
   * Defined for any enabled Plugin, running or not, because delivery activates it lazily.
   */
  generation(pluginId: string): number | undefined {
    if (!this.#isEnabled(pluginId)) return undefined;
    const current = this.#generations.get(pluginId);
    if (current !== undefined) return current;
    this.#generation += 1;
    this.#generations.set(pluginId, this.#generation);
    return this.#generation;
  }

  /**
   * Withdraw a Plugin's current enablement. Queued work for the old epoch is
   * dropped. Repeated reads do not enable it again, and the instance that was
   * already handed out is no longer active. `start` does not undo this.
   */
  revoke(pluginId: string): void {
    if (!this.#entries.has(pluginId)) return;
    const busy = (this.#pending.get(pluginId) ?? 0) > 0;
    this.#revoked.add(pluginId);
    this.#generations.delete(pluginId);
    this.#generation += 1;
    this.#tokens.delete(pluginId);
    this.#epochs.set(pluginId, (this.#epochs.get(pluginId) ?? 0) + 1);
    const existing = this.#states.get(pluginId);
    if (existing && existing.status !== "blocked") {
      this.#states.set(pluginId, {
        ...existing,
        status: "failed",
        code: "plugin_revoked",
        message: "插件已撤销启用",
      });
    }
    const installId = existing?.install_id ?? null;
    if (busy || installId === null || existing?.status === "blocked") return;
    let runtimeState: string | null = null;
    try {
      runtimeState = this.#runtime.get(installId).state;
    } catch {
      runtimeState = null;
    }
    if (runtimeState !== "running") return;
    this.#begin(pluginId);
    const stopping = this.#runtime.stop(installId).then(() => undefined, () => undefined);
    this.#finish(pluginId, stopping);
  }

  /**
   * Enable a Plugin again after `revoke`. Already-enabled Plugins keep their
   * generation and are not restarted. Blocked Plugins stay blocked.
   */
  async enable(pluginId: string): Promise<PluginSupervisorState> {
    for (;;) {
      const gate = this.#gates.get(pluginId);
      if (!gate) break;
      await gate;
      if (this.#gates.get(pluginId) === gate) break;
    }
    const entry = this.#entries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
    const state = this.#states.get(pluginId);
    if (state?.status === "blocked") return { ...state };
    this.#revoked.delete(pluginId);
    if (!this.#generations.has(pluginId)) {
      this.#generation += 1;
      this.#generations.set(pluginId, this.#generation);
    }
    const current = this.#states.get(pluginId);
    if (current?.status === "running") return { ...current };
    return await this.restart(pluginId);
  }

  enabledPluginIds(): readonly string[] {
    return [...this.#entries.keys()]
      .filter((pluginId) => this.#isEnabled(pluginId))
      .sort();
  }

  manifest(pluginId: string): PluginManifest | undefined {
    return this.#activeEntries.get(pluginId)?.definition.manifest;
  }

  upgradeCandidates(): PluginUpgradeCandidate[] {
    const records = this.#runtime.list();
    const candidates: PluginUpgradeCandidate[] = [];
    for (const [pluginId, entry] of this.#entries) {
      const target = entry.definition.manifest;
      const current = records.find(record => record.plugin_id === pluginId
        && record.publisher_signature === target.publisher.signature
        && record.state !== "uninstalled");
      if (!current || current.version === target.version || comparePluginVersions(target.version, current.version) <= 0) continue;
      const compatibility = target.upgrade_compatibility;
      const compatible = (compatibility?.compatible_from_versions ?? []).includes(current.version);
      const migratable = (compatibility?.migratable_from_versions ?? []).includes(current.version);
      candidates.push({
        plugin_id: pluginId,
        install_id: current.install_id,
        installed_version: current.version,
        target_version: target.version,
        mode: compatible ? "compatible" : migratable ? "migratable" : "unsupported",
        can_upgrade: compatible || (migratable && typeof entry.definition.validateUpgrade === "function"),
      });
    }
    return candidates.sort((left, right) => left.plugin_id.localeCompare(right.plugin_id));
  }

  async upgrade(pluginId: string, definition?: PluginDefinition): Promise<PluginSupervisorState> {
    const priorEntry = this.#entries.get(pluginId);
    if (!priorEntry) return this.#fail(pluginId, null, "plugin_unknown", "没有登记过这个插件");
    const entry = definition ? { ...priorEntry, definition } : priorEntry;
    if (entry.definition.manifest.plugin_id !== pluginId) {
      return this.#fail(pluginId, null, "plugin_definition_conflict", "升级目标的 Plugin ID 不匹配");
    }
    let candidateContract: PluginEventContract;
    try {
      candidateContract = buildEventContract(entry.definition);
    } catch (error) {
      return this.#fail(pluginId, this.#states.get(pluginId)?.install_id ?? null, safeCode(error), safeMessage(error));
    }
    const current = this.#runtime.list().find(record => record.plugin_id === pluginId
      && record.publisher_signature === entry.definition.manifest.publisher.signature
      && record.state !== "uninstalled");
    if (!current) return this.#fail(pluginId, null, "plugin_definition_missing", "找不到当前安装版本");
    const activeContract = this.#contracts.get(pluginId);
    // Keep the candidate registered after a failed attempt so the same update
    // can be retried. The active contract is switched for startup validation,
    // then restored below if Runtime resumes the old implementation.
    this.#entries.set(pluginId, entry);
    this.#contracts.set(pluginId, candidateContract);
    try {
      await this.#persistReleaseArtifact(entry);
      const receipt = await this.#runtime.upgrade({
        install_id: current.install_id,
        definition: entry.definition,
        deployment: entry.deployment ?? "local",
      });
      this.#activeEntries.set(pluginId, entry);
      return this.#running(pluginId, receipt.install.install_id);
    } catch (error) {
      const failure = {
        plugin_id: pluginId,
        status: "failed" as const,
        install_id: current.install_id,
        code: safeCode(error),
        message: safeMessage(error),
      };
      const recovered = this.#runtime.get(current.install_id);
      const active = this.#states.get(pluginId);
      if (!this.#revoked.has(pluginId)
        && recovered.state === "running"
        && active?.status === "running"
        && active.install_id === current.install_id) {
        if (activeContract) this.#contracts.set(pluginId, activeContract);
        else this.#contracts.delete(pluginId);
        // Return the failed upgrade operation to its caller without marking the
        // restored old implementation unhealthy. Host routes and views continue
        // to use it, and the unchanged candidate remains available for retry.
        return failure;
      }
      return this.#fail(pluginId, current.install_id, failure.code, failure.message);
    }
  }

  async ensureStarted(pluginId: string): Promise<PluginActiveInstance | undefined> {
    if (!this.#isEnabled(pluginId)) return undefined;
    const epoch = this.#epochs.get(pluginId) ?? 0;
    const current = this.#states.get(pluginId);
    const state = current?.status === "running"
      ? current
      : await this.restart(pluginId);
    if (!this.#isEnabled(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) return undefined;
    if (state.status !== "running" || state.install_id === null) return undefined;
    const contribution = this.#runtime.contribution(state.install_id);
    if (!contribution || contribution.kind !== "app") return undefined;
    const token = this.#liveToken(pluginId);
    return {
      install_id: state.install_id,
      active: () => this.#tokens.get(pluginId) === token
        && this.#isEnabled(pluginId)
        && this.#states.get(pluginId)?.status === "running",
      contribution,
    };
  }

  async #restart(pluginId: string, releaseQuarantine = false): Promise<PluginSupervisorState> {
    const entry = this.#activeEntries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
    const state = this.#states.get(pluginId);
    if (state?.status === "blocked") return { ...state };
    if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId);

    const epoch = this.#epochs.get(pluginId) ?? 0;
    const installId = state?.install_id ?? null;
    if (releaseQuarantine && installId === null) {
      return { plugin_id: pluginId, install_id: null, status: "failed", code: "plugin_state_invalid", message: "没有可解除隔离的插件安装" };
    }
    if (installId !== null) {
      const record = this.#runtime.get(installId);
      try {
        if (releaseQuarantine && record.state !== "quarantined") {
          return { plugin_id: pluginId, install_id: installId, code: "plugin_state_invalid", message: "只有 quarantined Plugin 可以显式解除隔离", status: "failed" };
        }
        if (record.state === "running") await this.#runtime.stop(installId);
        if (this.#revoked.has(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) {
          return this.#revokedState(pluginId, installId);
        }
        if (record.state === "crashed" || releaseQuarantine && record.state === "quarantined") {
          const receipt = await this.#runtime.recover(installId, { release_quarantine: releaseQuarantine });
          if (this.#revoked.has(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) {
            await this.#rollback(receipt.install.install_id);
            return this.#revokedState(pluginId, receipt.install.install_id);
          }
          return this.#running(pluginId, receipt.install.install_id);
        }
      } catch (error) {
        if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId, installId);
        return this.#fail(pluginId, installId, safeCode(error), safeMessage(error));
      }
    }
    return await this.#activate(pluginId);
  }

  async #resolveInstalledEntry(candidate: PluginSupervisorEntry): Promise<PluginSupervisorEntry> {
    const manifest = candidate.definition.manifest;
    const installed = this.#runtime.list().find(record => record.plugin_id === manifest.plugin_id
      && record.publisher_signature === manifest.publisher.signature
      && record.state !== "uninstalled");
    if (!installed || !candidate.releaseArtifact) return candidate;

    const directlyUsable = installed.version === manifest.version
      ? installed.manifest_digest === pluginManifestDigest(manifest)
        || (manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version)
      : comparePluginVersions(manifest.version, installed.version) > 0
        && (manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version);
    if (directlyUsable) {
      await this.#persistReleaseArtifact(candidate);
      return candidate;
    }

    const repository = this.#releaseArtifacts;
    if (!repository) {
      throw codedError("plugin_release_store_unavailable", "Native 插件需要恢复已安装版本，但 Runtime 发行物存储未装配");
    }
    const artifacts = repository.list(manifest.plugin_id, manifest.publisher.signature);
    const exact = artifacts.filter(artifact => artifact.version === installed.version
      && artifact.manifest_digest === installed.manifest_digest);
    const compatible = artifacts.filter(artifact => artifact.version !== installed.version
      && comparePluginVersions(artifact.version, installed.version) >= 0
      && (artifact.manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version))
      .sort((left, right) => comparePluginVersions(right.version, left.version));

    for (const artifact of [...exact, ...compatible]) {
      try {
        if (artifact.plugin_id !== manifest.plugin_id
          || artifact.publisher_signature !== manifest.publisher.signature
          || artifact.manifest.version !== artifact.version
          || artifact.manifest_digest !== pluginManifestDigest(artifact.manifest)
          || !artifact.module_source.trim()) continue;
        const definition = await candidate.releaseArtifact.restore(artifact.module_source);
        if (definition.manifest.plugin_id !== artifact.plugin_id
          || definition.manifest.publisher.signature !== artifact.publisher_signature
          || definition.manifest.version !== artifact.version
          || pluginManifestDigest(definition.manifest) !== artifact.manifest_digest) continue;
        const host = { ...candidate, definition };
        delete host.releaseArtifact;
        return host;
      } catch {
        // An unreadable older artifact must not prevent trying another exact
        // compatible release. If none can be loaded, the installed version stays blocked.
      }
    }
    throw codedError("plugin_release_artifact_missing", `找不到 ${installed.version} 的可运行 Native 发行物；未启动不兼容的新版本`);
  }

  async #persistReleaseArtifact(entry: PluginSupervisorEntry): Promise<void> {
    if (!entry.releaseArtifact) return;
    const repository = this.#releaseArtifacts;
    if (!repository) {
      throw codedError("plugin_release_store_unavailable", "Native 插件 Runtime 发行物存储未装配");
    }
    const manifest = entry.definition.manifest;
    const digest = pluginManifestDigest(manifest);
    if (repository.get(manifest.plugin_id, manifest.publisher.signature, manifest.version, digest)) return;
    const source = await entry.releaseArtifact.capture();
    repository.save(createPluginRuntimeReleaseArtifact(manifest, source));
  }

  async #activate(pluginId: string): Promise<PluginSupervisorState> {
    if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId);
    const entry = this.#activeEntries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
    const epoch = this.#epochs.get(pluginId) ?? 0;
    const manifest = entry.definition.manifest;
    let installId: string | null = this.#states.get(pluginId)?.install_id ?? null;
    try {
      if (installId === null) {
        await this.#persistReleaseArtifact(entry);
        const grants = entry.grants ?? manifest.permissions
          .filter((permission) => permission.required)
          .map((permission) => permission.permission);
        const installed = this.#runtime.install({
          definition: entry.definition,
          deployment: entry.deployment ?? "local",
          grants,
        });
        installId = installed.install.install_id;
        if (this.#revoked.has(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) {
          return this.#revokedState(pluginId, installId);
        }
      }
      const receipt = await this.#runtime.start(installId);
      if (this.#revoked.has(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) {
        await this.#rollback(receipt.install.install_id);
        return this.#revokedState(pluginId, receipt.install.install_id);
      }
      return this.#running(pluginId, receipt.install.install_id);
    } catch (error) {
      if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId, installId);
      return this.#fail(pluginId, installId, safeCode(error), safeMessage(error));
    }
  }

  #isEnabled(pluginId: string): boolean {
    if (this.#revoked.has(pluginId) || !this.#activeEntries.has(pluginId)) return false;
    return this.#states.get(pluginId)?.status !== "blocked";
  }

  #liveToken(pluginId: string): symbol {
    const existing = this.#tokens.get(pluginId);
    if (existing !== undefined) return existing;
    const created = Symbol(pluginId);
    this.#tokens.set(pluginId, created);
    return created;
  }

  #begin(pluginId: string): void {
    this.#pending.set(pluginId, (this.#pending.get(pluginId) ?? 0) + 1);
  }

  #finish(pluginId: string, operation: Promise<unknown>): void {
    const settled = operation.finally(() => {
      const left = (this.#pending.get(pluginId) ?? 1) - 1;
      if (left <= 0) this.#pending.delete(pluginId);
      else this.#pending.set(pluginId, left);
    });
    const previous = this.#gates.get(pluginId) ?? Promise.resolve();
    this.#gates.set(pluginId, previous.then(() => settled.then(() => undefined, () => undefined)));
  }

  async #rollback(installId: string): Promise<void> {
    try {
      if (this.#runtime.get(installId).state === "running") await this.#runtime.stop(installId);
    } catch {
      // A failed stop revokes grants and records crashed. Either way it is not active.
    }
  }

  #revokedState(pluginId: string, installId?: string | null): PluginSupervisorState {
    const existing = this.#states.get(pluginId);
    if (existing?.status === "blocked") return { ...existing };
    const resolvedId = installId === undefined ? existing?.install_id ?? null : installId;
    if (!this.#revoked.has(pluginId)) {
      if (existing) return { ...existing };
      return {
        plugin_id: pluginId,
        status: "failed",
        install_id: resolvedId,
        code: "plugin_revoked",
        message: "插件已撤销启用",
      };
    }
    const state: PluginSupervisorState = {
      plugin_id: pluginId,
      status: "failed",
      install_id: resolvedId,
      code: "plugin_revoked",
      message: "插件已撤销启用",
    };
    this.#states.set(pluginId, state);
    this.#tokens.delete(pluginId);
    return { ...state };
  }

  #running(pluginId: string, installId: string): PluginSupervisorState {
    if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId, installId);
    const state: PluginSupervisorState = {
      plugin_id: pluginId,
      status: "running",
      install_id: installId,
      code: null,
      message: null,
    };
    this.#states.set(pluginId, state);
    for (const listener of this.#activationListeners) listener(pluginId);
    return { ...state };
  }

  #fail(
    pluginId: string,
    installId: string | null,
    code: string,
    message: string,
  ): PluginSupervisorState {
    const state: PluginSupervisorState = {
      plugin_id: pluginId,
      status: "failed",
      install_id: installId,
      code,
      message,
    };
    this.#states.set(pluginId, state);
    return { ...state };
  }

  #report(diagnostics: PluginResolutionDiagnostic[]): PluginSupervisorReport {
    const states = this.states();
    return {
      running: states.filter((state) => state.status === "running").map((state) => state.plugin_id),
      failed: states.filter((state) => state.status === "failed"),
      blocked: states.filter((state) => state.status === "blocked"),
      diagnostics,
    };
  }
}
