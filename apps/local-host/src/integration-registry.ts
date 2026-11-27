import { hostLog } from "./host-log.js";
import { randomUUID } from "node:crypto";
import type { IntegrationDriverDefinition } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import type { PluginContribution, PluginDefinition, PluginIntegrationContribution, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding, IntegrationKind, OAuthGrant, PluginAuthMethodDeclaration, PluginConnectionServiceDeclaration, PluginMcpMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { HOST_BUILD_TRUST, assertContributionMatchesManifest, assertTrustFitsDefinition, installIdentity, resolveActionProviderId, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { checkedSourcePresentation, checkedSourcePresentationInput, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { SourcePresentation, SourcePresentationInput } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { ConnectorConnectionDeclarer } from "@molis-ai/molis-work-service-connector-host";
import { IntegrationDeclarations, type RegisteredConnectionService, type RegisteredIntegration } from "./integration-declarations.js";
import { assertConnectorText, builtinConnectorText, type ConnectorWordReader } from "./connector-words.js";

export interface OAuthServiceOwner {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly publisher_id: string;
  readonly method: PluginAuthMethodDeclaration | null;
  readonly word?: ConnectorWordReader;
}

/** The actual running Host instance that contributes a remote MCP method. */
export interface McpServiceOwner {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly installation_generation: string;
  readonly publisher_id: string;
  readonly publisher_signature: string;
  readonly state: "running";
  readonly method: PluginMcpMethodDeclaration;
}

/** A connector driver of the Host's own build while it is enabled: the identity its declarations are pinned to, and what it handed over. */
interface BuiltinDriver {
  readonly install_id: string;
  readonly installation_generation: string;
  readonly publisher: PluginManifest["publisher"];
  readonly contribution: PluginIntegrationContribution;
  end(): Promise<void>;
}

/** What answers for an integration now: the same contribution, whether the Host's build or a signed package in the sandbox handed it over. */
interface IntegrationDriver {
  /** Set for a package: the installation its connections are pinned to. */
  readonly declarer?: ConnectorConnectionDeclarer;
  readonly builtin?: BuiltinDriver;
  contribution(): PluginContribution | null;
}

/**
 * The Home's integration registry (PG-046): built only from the declarations of the integrations enabled in it, plus the platform's own
 * list of services. It names no service and no integration, and runs no plugin: a built-in integration is a connector driver of the
 * platform (D3 A), handed over once in this process, and a signed sandbox integration package (BL-530) runs in the Home's one plugin
 * runtime, which hands the registry its declarations and the Host's proxy (`attach`) while that instance is enabled and takes them back
 * (`detach`) when it is switched off or removed. Both hand over the same contribution, held and bound the same way; what differs between
 * the sources of an integration arrives as a binding when one is asked for.
 *
 * An id is held by whoever declared it first (`IntegrationDeclarations`): an integration enabled later that declares a held id fails to
 * enable and the holder is not touched.
 */
export class IntegrationRegistry {
  private readonly declarations: IntegrationDeclarations;
  private readonly drivers = new Map<string, IntegrationDriver>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: { platform?: readonly PluginConnectionServiceDeclaration[] } = {}) {
    this.declarations = new IntegrationDeclarations(options.platform);
  }

  /** Take in one driver of the Host's build. Enabling goes one at a time, so two cannot both pass the check for the same id. */
  enable(definition: IntegrationDriverDefinition): Promise<void> {
    const run = this.tail.then(() => this.enableOnce(definition));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Let one go; the ids it held are free again. */
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
  attach(manifest: PluginManifest, installId: string, contribution: () => PluginContribution | null, live: () => boolean, reader: PluginLocaleReader | null = null): Promise<boolean> {
    const run = this.tail.then(() => {
      const parsed = parsePluginManifest(manifest);
      this.assertFree(parsed);
      const source = { reader, current: live };
      assertConnectorText(parsed, source);
      if (!live()) return false;
      // Validate the replacement before releasing anything the current installation holds. The queue keeps this change atomic.
      const driver: IntegrationDriver = { declarer: { plugin_id: parsed.plugin_id, install_id: installId, plugin_title: parsed.name }, contribution: () => live() ? contribution() : null };
      if (this.drivers.has(parsed.plugin_id)) this.declarations.release(parsed.plugin_id);
      this.declarations.declare(parsed, source);
      this.drivers.set(parsed.plugin_id, driver);
      return true;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Lets an attached package's ids go: its sources are unavailable from now on, and its services leave the settings page. */
  detach(pluginId: string): Promise<void> {
    const run = this.tail.then(() => {
      if (!this.drivers.get(pluginId)?.declarer) return;
      this.drivers.delete(pluginId);
      this.declarations.release(pluginId);
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
    if (this.drivers.get(parsed.plugin_id)?.builtin) throw pluginErrors.integration_declaration_conflict(`插件 ${parsed.plugin_id} 已由宿主自带的集成占用；请给这个包换一个插件 ID`);
    // Until installs are trusted by signature (T1), an `oauth` method with its flow as data is the Host's build's alone (W5-11 §2.8):
    // a package's would send the product client, the person's secret and refresh tokens to endpoints it chose.
    const carried = parsed.connection_services?.find(service => service.auth.methods.some(method => (method.kind === "oauth" || method.kind === "mcp") && Object.keys(method).length > 1));
    if (carried) throw pluginErrors.declaration_invalid(`签名安装包不能写带数据的 OAuth 或 MCP 方法：${carried.service_id} 的授权流程只由宿主构建的插件声明`);
    this.declarations.assertFree(parsed);
  }

  /**
   * The Host-built plugin that declares a service now, the installation it runs as, its publisher and its `oauth` method if it
   * declares one (W5-11 §3.2). An authorization is pinned to this when it starts and refused at its callback once any of it changed.
   * A package's or the platform's service has none: the OAuth flow is the Host's build's only (§2.8).
   */
  oauthOwner(serviceId: string, grant: OAuthGrant = "authorization_code"): OAuthServiceOwner | undefined {
    const service = this.declaredService(serviceId), builtin = service && this.drivers.get(service.owner)?.builtin;
    if (!service || !builtin) return undefined;
    const method = service.declaration.auth.methods.find(entry => entry.kind === "oauth" && entry.grant === grant) ?? null;
    return { plugin_id: service.owner, install_id: builtin.install_id, publisher_id: builtin.publisher.publisher_id, method, word: service.word };
  }

  mcpOwner(serviceId: string): McpServiceOwner | undefined {
    const service = this.declaredService(serviceId), builtin = service && this.drivers.get(service.owner)?.builtin;
    const method = service?.declaration.auth.methods.find((entry): entry is PluginMcpMethodDeclaration => entry.kind === "mcp" && "endpoint" in entry);
    if (!service || !builtin || !method) return undefined;
    return { plugin_id: service.owner, install_id: builtin.install_id, installation_generation: builtin.installation_generation,
      publisher_id: builtin.publisher.publisher_id, publisher_signature: builtin.publisher.signature, state: "running", method };
  }

  /**
   * The attached package that declares a service now, which a connection made for it is pinned to (T-134). A service the Host's build or
   * the platform declares has none: its connections are pinned to nothing and stay usable as they are.
   */
  connectionDeclarer(serviceId: string): ConnectorConnectionDeclarer | undefined {
    const service = this.declaredService(serviceId);
    return service && this.drivers.get(service.owner)?.declarer;
  }

  private declaredService(serviceId: string): RegisteredConnectionService | undefined {
    return this.declarations.connectionServices().find(entry => entry.declaration.service_id === serviceId);
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

  /** No source binding, account, credential or transport enters this pure presentation call. */
  async presentSource(id: string, input: SourcePresentationInput): Promise<SourcePresentation> {
    const checked = checkedSourcePresentationInput(input), entry = this.declarations.presentation(id);
    if (!entry) throw pluginErrors.integration_unavailable(`来源展示 ${id} 没有已启用的提供方`);
    const driver = this.drivers.get(entry.plugin_id), contribution = driver?.contribution();
    const current = () => {
      if (this.declarations.presentation(id) !== entry || this.drivers.get(entry.plugin_id) !== driver || !contribution || driver?.contribution() !== contribution) {
        throw pluginErrors.integration_unavailable(`来源展示 ${id} 的原提供实例已变化`);
      }
    };
    current();
    if (contribution?.kind !== "integration" || !contribution.presentSource) throw pluginErrors.integration_unavailable(`来源展示 ${id} 没有运行中的实现`);
    const answer = await contribution.presentSource(id, checked);
    current();
    return checkedSourcePresentation(answer);
  }

  /** The driver and adapter of one source of an integration. A missing integration, or one of another kind, is unavailable. */
  async bind(integrationId: string, kind: IntegrationKind, binding: IntegrationBinding,
    retain?: (validate: () => void) => void): Promise<ReturnType<PluginIntegrationContribution["bind"]>> {
    const entry = this.declarations.integration(integrationId);
    if (!entry) throw pluginErrors.integration_unavailable(`集成 ${integrationId} 不可用：没有已启用的插件登记它`);
    if (entry.declaration.kind !== kind) {
      throw pluginErrors.integration_unavailable(`集成 ${integrationId} 是 ${entry.declaration.kind}，不能当 ${kind} 用`);
    }
    const driver = this.drivers.get(entry.plugin_id), contribution = driver?.contribution();
    const current = () => {
      if (this.declarations.integration(integrationId) !== entry || this.drivers.get(entry.plugin_id) !== driver
        || !contribution || driver?.contribution() !== contribution) throw pluginErrors.integration_unavailable(`集成 ${integrationId} 的原提供实例已变化`);
    };
    // Captured before binding can wait: even its failure belongs to this producer instance.
    retain?.(current);
    current();
    if (contribution?.kind !== "integration") throw pluginErrors.integration_unavailable(`集成 ${integrationId} 的插件没有在运行`);
    const bound = contribution.bind(binding);
    // Handed over a turn later and checked again (RAC-2615): a producer stopped before the caller holds the binding wins.
    await Promise.resolve();
    current();
    return bound;
  }

  private async enableOnce(definition: IntegrationDriverDefinition): Promise<void> {
    const manifest = parsePluginManifest(definition.manifest);
    if (this.declarations.has(manifest.plugin_id)) return;
    this.declarations.assertFree(manifest);
    const source = builtinConnectorText(manifest, definition.connectionText);
    assertConnectorText(manifest, source);
    // A service the Host builds reaches only the platform's table (S-69): origins are a signed sandbox package's own (S-95).
    const declared = manifest.connection_services?.find(service => service.origins !== undefined);
    if (declared) throw pluginErrors.declaration_invalid(`宿主构建的插件不写服务的来源：${declared.service_id} 的地址只在平台的请求表里`);
    const builtin = await startBuiltinDriver(definition, manifest);
    this.declarations.declare(manifest, source);
    this.drivers.set(manifest.plugin_id, { builtin, contribution: () => builtin.contribution });
  }

  private async disableOnce(pluginId: string): Promise<void> {
    const builtin = this.drivers.get(pluginId)?.builtin;
    if (!builtin) return;
    this.drivers.delete(pluginId);
    this.declarations.release(pluginId);
    await builtin.end();
  }
}

/**
 * A driver of the Host's build, handed over in this process: the identity is the one the Host's build gives its plugins, its grants are the
 * permissions its Manifest requires, and they end with it.
 */
async function startBuiltinDriver(definition: PluginDefinition, manifest: PluginManifest): Promise<BuiltinDriver> {
  assertTrustFitsDefinition(definition, HOST_BUILD_TRUST);
  const install_id = installIdentity(manifest), installation_generation = randomUUID();
  const grants = Object.freeze(manifest.permissions.filter(permission => permission.required).map(permission => permission.permission));
  let live = true;
  const context: PluginStartContext = Object.freeze({
    install_id, installation_generation, plugin_id: manifest.plugin_id, version: manifest.version, deployment: "local", grants,
    provider_id: resolveActionProviderId({ plugin_id: manifest.plugin_id, install_id, publisher_trust: HOST_BUILD_TRUST.level, execution: "host" }),
    requireGrant(permission: string) {
      if (!live || !grants.includes(permission)) throw pluginErrors.grant_denied(`Plugin 没有 ${permission} grant`);
    },
  });
  const end = async () => {
    live = false;
    await definition.stop?.(context);
  };
  try {
    const contribution = await definition.start(context);
    assertContributionMatchesManifest(manifest, contribution);
    if (contribution.kind !== "integration") throw pluginErrors.contribution_kind_invalid("Integration Plugin 必须返回 Integration contribution");
    return { install_id, installation_generation, publisher: manifest.publisher, contribution, end };
  } catch (error) {
    await end().catch(cleanup => hostLog.warn("connections", "builtin_driver_stop_failed", cleanup, { plugin_id: manifest.plugin_id }));
    throw error;
  }
}
