import type { PluginDefinition, PluginIntegrationContribution } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding, IntegrationKind, PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { IntegrationDeclarations, type RegisteredConnectionService, type RegisteredIntegration } from "./integration-declarations.js";
import { HOST_PLUGIN_IDS } from "./host-plugin-ids.js";

/**
 * The Home's integration registry (PG-046): built only from the declarations of the plugins enabled in it, plus the platform's own
 * list of services. It names no service and no integration. The enabled plugins live in one in-memory Runtime, started once each;
 * what differs between the sources of an integration arrives as a binding when one is asked for.
 *
 * An id is held by whoever declared it first (`IntegrationDeclarations`): a plugin enabled later that declares a held id fails to
 * enable and the holder is not touched.
 */
export class IntegrationRegistry {
  private readonly runtime: PluginRuntime;
  private readonly declarations: IntegrationDeclarations;
  private readonly installs = new Map<string, string>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: { platform?: readonly PluginConnectionServiceDeclaration[]; now?: () => Date } = {}) {
    this.runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { now: options.now ?? (() => new Date()), hostIds: HOST_PLUGIN_IDS });
    this.declarations = new IntegrationDeclarations(options.platform);
  }

  /** Install and start one plugin. Enabling goes one at a time, so two plugins cannot both pass the check for the same id. */
  enable(definition: PluginDefinition): Promise<void> {
    const run = this.tail.then(() => this.enableOnce(definition));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Stop and uninstall a plugin; the ids it held are free again. */
  disable(pluginId: string): Promise<void> {
    const run = this.tail.then(() => this.disableOnce(pluginId));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * Enable what is already installed, oldest installation first: when two of them declare the same id the earlier one holds it and
   * the later one is refused. A refusal is reported, never thrown, so one bad plugin does not keep the others from starting.
   */
  async restore(installed: ReadonlyArray<{ definition: PluginDefinition; installed_at: string }>): Promise<Array<{ plugin_id: string; error: unknown }>> {
    const ordered = installed.map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.installed_at < b.installed_at ? -1 : a.installed_at > b.installed_at ? 1 : a.index - b.index);
    const refused: Array<{ plugin_id: string; error: unknown }> = [];
    for (const entry of ordered) {
      try { await this.enable(entry.definition); } catch (error) { refused.push({ plugin_id: entry.definition.manifest.plugin_id, error }); }
    }
    return refused;
  }

  connectionServices(): readonly RegisteredConnectionService[] {
    return this.declarations.connectionServices();
  }

  hasSource(serviceId: string): boolean {
    return this.declarations.hasSource(serviceId);
  }

  integration(integrationId: string): RegisteredIntegration | undefined {
    return this.declarations.integration(integrationId);
  }

  listIntegrations(kind?: IntegrationKind): readonly RegisteredIntegration[] {
    return this.declarations.listIntegrations(kind);
  }

  /** The driver and adapter of one source of an integration. A missing integration, or one of another kind, is unavailable. */
  async bind(integrationId: string, kind: IntegrationKind, binding: IntegrationBinding): Promise<ReturnType<PluginIntegrationContribution["bind"]>> {
    const entry = this.declarations.integration(integrationId);
    if (!entry) throw pluginErrors.integration_unavailable(`集成 ${integrationId} 不可用：没有已启用的插件登记它`);
    if (entry.declaration.kind !== kind) {
      throw pluginErrors.integration_unavailable(`集成 ${integrationId} 是 ${entry.declaration.kind}，不能当 ${kind} 用`);
    }
    const installId = this.installs.get(entry.plugin_id)!;
    if (this.runtime.get(installId).state === "crashed") await this.runtime.recover(installId);
    const contribution = this.runtime.contribution(installId);
    if (!contribution || contribution.kind !== "integration") throw pluginErrors.integration_unavailable(`集成 ${integrationId} 的插件没有在运行`);
    return contribution.bind(binding);
  }

  private async enableOnce(definition: PluginDefinition): Promise<void> {
    const manifest = parsePluginManifest(definition.manifest);
    if (this.declarations.has(manifest.plugin_id)) return;
    this.declarations.assertFree(manifest);
    // Only the Host's own build is enabled here today; an installed plugin's integrations will arrive with the trust it was installed with.
    const installed = this.runtime.install({ definition, deployment: "local", trust: HOST_BUILD_TRUST });
    const installId = installed.install.install_id;
    try {
      this.runtime.grant(installId, manifest.permissions.filter(permission => permission.required).map(permission => permission.permission));
      await this.runtime.start(installId);
    } catch (error) {
      await this.runtime.uninstall(installId).catch(() => undefined);
      throw error;
    }
    this.declarations.declare(manifest);
    this.installs.set(manifest.plugin_id, installId);
  }

  private async disableOnce(pluginId: string): Promise<void> {
    const installId = this.installs.get(pluginId);
    if (!installId) return;
    this.installs.delete(pluginId);
    this.declarations.release(pluginId);
    await this.runtime.uninstall(installId);
  }
}
