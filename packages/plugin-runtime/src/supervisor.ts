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
 */

export interface PluginSupervisorEntry {
  definition: PluginDefinition;
  deployment?: PluginDeployment;
  /** Defaults to every required permission the Manifest declares. */
  grants?: string[];
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
      await this.#activate(pluginId);
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
    const attempt = this.#restart(pluginId).finally(() => {
      this.#inFlight.delete(pluginId);
    });
    this.#inFlight.set(pluginId, attempt);
    return await attempt;
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
   * restart so work already queued for an enabled Plugin survives one, and only
   * `revoke` invalidates it. Defined for any enabled Plugin, running or not,
   * because delivery activates it lazily.
   */
  generation(pluginId: string): number | undefined {
    if (!this.#entries.has(pluginId)) return undefined;
    if (this.#states.get(pluginId)?.status === "blocked") return undefined;
    const current = this.#generations.get(pluginId);
    if (current !== undefined) return current;
    this.#generation += 1;
    this.#generations.set(pluginId, this.#generation);
    return this.#generation;
  }

  /**
   * Withdraw a Plugin's current enablement. Anything still queued for the old
   * epoch is dropped rather than delivered to a Plugin the user turned off.
   */
  revoke(pluginId: string): void {
    this.#generations.delete(pluginId);
    this.#generation += 1;
  }

  enabledPluginIds(): readonly string[] {
    return [...this.#entries.keys()]
      .filter((pluginId) => this.#states.get(pluginId)?.status !== "blocked")
      .sort();
  }

  manifest(pluginId: string): PluginManifest | undefined {
    return this.#entries.get(pluginId)?.definition.manifest;
  }

  async ensureStarted(pluginId: string): Promise<PluginActiveInstance | undefined> {
    const state = this.#states.get(pluginId)?.status === "running"
      ? this.#states.get(pluginId)!
      : await this.restart(pluginId);
    if (state.status !== "running" || state.install_id === null) return undefined;
    const contribution = this.#runtime.contribution(state.install_id);
    if (!contribution || contribution.kind !== "app") return undefined;
    return {
      install_id: state.install_id,
      active: () => this.#states.get(pluginId)?.status === "running",
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

    const installId = state?.install_id ?? null;
    if (installId !== null) {
      const record = this.#runtime.get(installId);
      try {
        if (record.state === "running") await this.#runtime.stop(installId);
        if (record.state === "crashed") {
          const receipt = await this.#runtime.recover(installId);
          return this.#running(pluginId, receipt.install.install_id);
        }
      } catch (error) {
        return this.#fail(pluginId, installId, safeCode(error), safeMessage(error));
      }
    }
    return await this.#activate(pluginId);
  }

  async #activate(pluginId: string): Promise<PluginSupervisorState> {
    const entry = this.#entries.get(pluginId);
    if (!entry) {
      return this.#fail(pluginId, null, "plugin_unknown", `没有登记过插件 ${pluginId}`);
    }
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
        });
        installId = installed.install.install_id;
      }
      const receipt = await this.#runtime.start(installId);
      return this.#running(pluginId, receipt.install.install_id);
    } catch (error) {
      return this.#fail(pluginId, installId, safeCode(error), safeMessage(error));
    }
  }

  #running(pluginId: string, installId: string): PluginSupervisorState {
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
