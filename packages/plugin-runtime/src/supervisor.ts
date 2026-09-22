import type {
  PluginContribution,
  PluginDefinition,
  PluginDeployment,
  PluginManifest,
  PluginRuntimeApi,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { buildEventContract, type PluginEventContract } from "./event-contract.js";
import type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";
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
  definition: PluginDefinition;
  deployment?: PluginDeployment;
  /** Defaults to every required permission the Manifest declares. */
  grants?: string[];
  /** Only a trusted Host composition opts into replacing an inactive bundled version. */
  replace_version?: boolean;
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

export class PluginSupervisor implements PluginHostLifecycle {
  readonly #runtime: PluginRuntimeApi;
  readonly #hostCapabilities: readonly PluginCapabilityProvider[];
  readonly #entries = new Map<string, PluginSupervisorEntry>();
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
    options: { hostCapabilities?: readonly PluginCapabilityProvider[] } = {},
  ) {
    this.#runtime = runtime;
    this.#hostCapabilities = options.hostCapabilities ?? [];
  }

  async start(entries: readonly PluginSupervisorEntry[]): Promise<PluginSupervisorReport> {
    const admitted: PluginSupervisorEntry[] = [];
    for (const entry of entries) {
      const pluginId = entry.definition.manifest.plugin_id;
      this.#entries.set(pluginId, entry);
      try {
        this.#contracts.set(pluginId, buildEventContract(entry.definition));
        admitted.push(entry);
      } catch (error) {
        // A Plugin whose event declarations and validators disagree never runs and
        // never matches a subscription; its siblings are unaffected.
        this.#entries.delete(pluginId);
        this.#fail(pluginId, null, safeCode(error), safeMessage(error));
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
  async restart(pluginId: string): Promise<PluginSupervisorState> {
    const pending = this.#inFlight.get(pluginId);
    if (pending) return await pending;
    this.#begin(pluginId);
    const attempt = this.#restart(pluginId);
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
    return this.#entries.get(pluginId)?.definition.manifest;
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

  async #restart(pluginId: string): Promise<PluginSupervisorState> {
    const entry = this.#entries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
    const state = this.#states.get(pluginId);
    if (state?.status === "blocked") return { ...state };
    if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId);

    const epoch = this.#epochs.get(pluginId) ?? 0;
    const installId = state?.install_id ?? null;
    if (installId !== null) {
      const record = this.#runtime.get(installId);
      try {
        if (record.state === "running") await this.#runtime.stop(installId);
        if (this.#revoked.has(pluginId) || (this.#epochs.get(pluginId) ?? 0) !== epoch) {
          return this.#revokedState(pluginId, installId);
        }
        if (record.state === "crashed") {
          const receipt = await this.#runtime.recover(installId);
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

  async #activate(pluginId: string): Promise<PluginSupervisorState> {
    if (this.#revoked.has(pluginId)) return this.#revokedState(pluginId);
    const entry = this.#entries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
    const epoch = this.#epochs.get(pluginId) ?? 0;
    const manifest = entry.definition.manifest;
    let installId: string | null = this.#states.get(pluginId)?.install_id ?? null;
    try {
      if (installId === null) {
        const grants = entry.grants ?? manifest.permissions
          .filter((permission) => permission.required)
          .map((permission) => permission.permission);
        const installed = this.#runtime.install({
          definition: entry.definition,
          deployment: entry.deployment ?? "local",
          grants,
          replace_version: entry.replace_version,
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
    if (this.#revoked.has(pluginId) || !this.#entries.has(pluginId)) return false;
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
