import type { PluginContribution, PluginDefinition, PluginIntegrationContribution, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding, IntegrationKind, PluginAuthMethodDeclaration, PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { ConnectorConnectionDeclarer } from "@molis-ai/molis-work-service-connector-host";
import { IntegrationDeclarations, type RegisteredConnectionService, type RegisteredIntegration } from "./integration-declarations.js";
import { HOST_PLUGIN_IDS } from "./host-plugin-ids.js";

export interface OAuthServiceOwner {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly publisher_id: string;
  readonly method: PluginAuthMethodDeclaration | null;
}

/**
 * The Home's integration registry (PG-046): built only from the declarations of the plugins enabled in it, plus the platform's own
 * list of services. It names no service and no integration. The enabled plugins live in one in-memory Runtime, started once each;
 * what differs between the sources of an integration arrives as a binding when one is asked for.
 *
 * An id is held by whoever declared it first (`IntegrationDeclarations`): a plugin enabled later that declares a held id fails to
 * enable and the holder is not touched.
 *
 * A signed sandbox integration package (BL-530) is not started here: its code runs in the Home's sandbox instance, and the Home hands
 * the registry its declarations and the Host's proxy (`attach`) while that instance is enabled, and takes them back (`detach`) when it
 * is switched off or removed. Its ids are checked like a built-in's; only where the code runs differs.
 */
export class IntegrationRegistry {
  private readonly runtime: PluginRuntime;
  private readonly declarations: IntegrationDeclarations;
  private readonly installs = new Map<string, string>();
  /** The packages the Home attached: the installation each runs as, and what its running instance contributes now (null while it is not running). */
  private readonly attached = new Map<string, { declarer: ConnectorConnectionDeclarer; contribution: () => PluginContribution | null }>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: { platform?: readonly PluginConnectionServiceDeclaration[]; now?: () => Date } = {}) {
    this.runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { now: options.now ?? (() => new Date()), hostIds: HOST_PLUGIN_IDS, inProcess: { admit: new Set() } });
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

  /**
   * Holds the ids of a package running in the Home's sandbox instance and binds its sources to what that instance contributes. Goes in
   * turn with enabling, so a package and a plugin cannot both pass the check for the same id; `live` is asked in that turn, and a package
   * switched off meanwhile is not attached. A crash does not let its ids go: its sources are unavailable until it runs again.
   * `installId` is the Home's install record for it, never anything the package says.
   */
  attach(manifest: PluginManifest, installId: string, contribution: () => PluginContribution | null, live: () => boolean): Promise<boolean> {
    const run = this.tail.then(() => {
      const parsed = parsePluginManifest(manifest);
      if (!live()) return false;
      // Validate the replacement before releasing anything the current installation holds. The queue keeps this change atomic.
      const entry = { declarer: { plugin_id: parsed.plugin_id, install_id: installId, plugin_title: parsed.name }, contribution: () => live() ? contribution() : null };
      this.assertFree(parsed);
      if (this.attached.has(parsed.plugin_id)) this.declarations.release(parsed.plugin_id);
      this.declarations.declare(parsed);
      this.attached.set(parsed.plugin_id, entry);
      return true;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Lets an attached package's ids go: its sources are unavailable from now on, and its services leave the settings page. */
  detach(pluginId: string): Promise<void> {
    const run = this.tail.then(() => {
      if (this.attached.delete(pluginId)) this.declarations.release(pluginId);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * Refuses a package whose plugin id, services or integrations are another's, or that carries an OAuth flow as data: asked before
   * anything of its install is written.
   */
  assertFree(manifest: PluginManifest): void {
    const parsed = parsePluginManifest(manifest);
    if (this.installs.has(parsed.plugin_id)) throw pluginErrors.integration_declaration_conflict(`插件 ${parsed.plugin_id} 已由宿主自带的集成占用；请给这个包换一个插件 ID`);
    // Until installs are trusted by signature (T1), an `oauth` method with its flow as data is the Host's build's alone (W5-11 §2.8):
    // a package's would send the product client, the person's secret and refresh tokens to endpoints it chose.
    const carried = parsed.connection_services?.find(service => service.auth.methods.some(method => method.kind === "oauth" && Object.keys(method).length > 1));
    if (carried) throw pluginErrors.declaration_invalid(`签名安装包不能写带数据的 OAuth 方法：${carried.service_id} 的授权流程只由宿主构建的插件声明`);
    this.declarations.assertFree(parsed);
  }

  /**
   * The Host-built plugin that declares a service now, the installation it runs as, its publisher and its `oauth` method if it
   * declares one (W5-11 §3.2). An authorization is pinned to this when it starts and refused at its callback once any of it changed.
   * A package's or the platform's service has none: the OAuth flow is the Host's build's only (§2.8).
   */
  oauthOwner(serviceId: string): OAuthServiceOwner | undefined {
    const service = this.declarations.connectionServices().find(entry => entry.declaration.service_id === serviceId);
    const installId = service ? this.installs.get(service.owner) : undefined;
    if (!service || !installId) return undefined;
    const method = service.declaration.auth.methods.find(entry => entry.kind === "oauth") ?? null;
    return { plugin_id: service.owner, install_id: installId, publisher_id: this.runtime.get(installId).publisher_id, method };
  }

  /**
   * The attached package that declares a service now, which a connection made for it is pinned to (T-134). A service the Host's build or
   * the platform declares has none: its connections are pinned to nothing and stay usable as they are.
   */
  connectionDeclarer(serviceId: string): ConnectorConnectionDeclarer | undefined {
    const service = this.declarations.connectionServices().find(entry => entry.declaration.service_id === serviceId);
    return service ? this.attached.get(service.owner)?.declarer : undefined;
  }

  connectionServices(): readonly RegisteredConnectionService[] {
    return this.declarations.connectionServices();
  }

  /** The name a declaring plugin's Manifest gives it, for the cards that say where a service comes from. */
  pluginName(pluginId: string): string | undefined {
    return this.declarations.pluginName(pluginId);
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
  async bind(integrationId: string, kind: IntegrationKind, binding: IntegrationBinding,
    retain?: (validate: () => void) => void): Promise<ReturnType<PluginIntegrationContribution["bind"]>> {
    const entry = this.declarations.integration(integrationId);
    if (!entry) throw pluginErrors.integration_unavailable(`集成 ${integrationId} 不可用：没有已启用的插件登记它`);
    if (entry.declaration.kind !== kind) {
      throw pluginErrors.integration_unavailable(`集成 ${integrationId} 是 ${entry.declaration.kind}，不能当 ${kind} 用`);
    }
    const attached = this.attached.get(entry.plugin_id), installId = this.installs.get(entry.plugin_id);
    let contribution: PluginContribution | null | undefined;
    const current = () => {
      const active = attached ? attached.contribution() : this.installs.get(entry.plugin_id) === installId && installId ? this.runtime.contribution(installId) : null;
      if (this.declarations.integration(integrationId) !== entry || this.attached.get(entry.plugin_id) !== attached
        || !active || (contribution !== undefined && active !== contribution)) throw pluginErrors.integration_unavailable(`集成 ${integrationId} 的原提供实例已变化`);
    };
    // Capture before provider recovery or binding can wait: even its failure belongs to this producer instance.
    retain?.(current);
    contribution = await this.contributionOf(entry.plugin_id);
    current();
    if (!contribution || contribution.kind !== "integration") throw pluginErrors.integration_unavailable(`集成 ${integrationId} 的插件没有在运行`);
    return contribution.bind(binding);
  }

  private async contributionOf(pluginId: string): Promise<PluginContribution | null> {
    const attached = this.attached.get(pluginId);
    if (attached) return attached.contribution();
    const installId = this.installs.get(pluginId)!;
    if (this.runtime.get(installId).state === "crashed") await this.runtime.recover(installId);
    return this.runtime.contribution(installId);
  }

  private async enableOnce(definition: PluginDefinition): Promise<void> {
    const manifest = parsePluginManifest(definition.manifest);
    if (this.declarations.has(manifest.plugin_id)) return;
    this.declarations.assertFree(manifest);
    // A service the Host builds reaches only the platform's table (S-69): origins are a signed sandbox package's own (S-95).
    const declared = manifest.connection_services?.find(service => service.origins !== undefined);
    if (declared) throw pluginErrors.declaration_invalid(`宿主构建的插件不写服务的来源：${declared.service_id} 的地址只在平台的请求表里`);
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
