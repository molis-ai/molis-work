import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  IntegrationKind,
  PluginConnectionServiceDeclaration,
  PluginIntegrationDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

/** Who holds a service or an integration when the platform itself declared it. */
export const PLATFORM_OWNER = "platform";

export interface RegisteredConnectionService {
  readonly declaration: PluginConnectionServiceDeclaration;
  /** A plugin id, or `platform`. */
  readonly owner: string;
}

export interface RegisteredIntegration {
  readonly declaration: PluginIntegrationDeclaration;
  readonly plugin_id: string;
}

/**
 * What the Home's plugins have declared (PG-046): the services and the integrations, each held by whoever declared it first. It reads
 * Manifests and nothing else, so the registry that starts the plugins and the settings page that lists the services use the same
 * rule. A plugin that declares an id someone holds is refused and the holder is not touched; platform declarations are first.
 */
export class IntegrationDeclarations {
  private readonly services = new Map<string, RegisteredConnectionService>();
  private readonly integrations = new Map<string, RegisteredIntegration>();
  private readonly declared = new Map<string, { services: readonly string[]; integrations: readonly string[] }>();

  constructor(platform: readonly PluginConnectionServiceDeclaration[] = []) {
    for (const declaration of platform) {
      if (this.services.has(declaration.service_id)) throw pluginErrors.integration_declaration_conflict(`平台声明了重复的连接服务 ${declaration.service_id}`);
      this.services.set(declaration.service_id, { declaration, owner: PLATFORM_OWNER });
    }
  }

  /** Refuse when an id this Manifest declares is held by another. Nothing is recorded. */
  assertFree(manifest: PluginManifest): void {
    for (const service of manifest.connection_services ?? []) {
      const holder = this.services.get(service.service_id);
      if (holder && holder.owner !== manifest.plugin_id) throw conflict("连接服务", service.service_id, holder.owner);
    }
    for (const integration of manifest.integrations ?? []) {
      const holder = this.integrations.get(integration.integration_id);
      if (holder && holder.plugin_id !== manifest.plugin_id) throw conflict("集成", integration.integration_id, holder.plugin_id);
    }
  }

  declare(manifest: PluginManifest): void {
    if (this.declared.has(manifest.plugin_id)) return;
    this.assertFree(manifest);
    const services = manifest.connection_services ?? [];
    const integrations = manifest.integrations ?? [];
    for (const declaration of services) this.services.set(declaration.service_id, { declaration, owner: manifest.plugin_id });
    for (const declaration of integrations) this.integrations.set(declaration.integration_id, { declaration, plugin_id: manifest.plugin_id });
    this.declared.set(manifest.plugin_id, { services: services.map(item => item.service_id), integrations: integrations.map(item => item.integration_id) });
  }

  /** The ids this plugin held are free again. */
  release(pluginId: string): void {
    const held = this.declared.get(pluginId);
    if (!held) return;
    this.declared.delete(pluginId);
    for (const id of held.services) this.services.delete(id);
    for (const id of held.integrations) this.integrations.delete(id);
  }

  has(pluginId: string): boolean {
    return this.declared.has(pluginId);
  }

  /** Every registered service: the platform's first, then each plugin's in the order they were declared. */
  connectionServices(): readonly RegisteredConnectionService[] {
    return [...this.services.values()];
  }

  /** Whether a Feed can pull from this service's account. */
  hasSource(serviceId: string): boolean {
    return this.listIntegrations("source").some(entry => entry.declaration.service_id === serviceId);
  }

  integration(integrationId: string): RegisteredIntegration | undefined {
    return this.integrations.get(integrationId);
  }

  listIntegrations(kind?: IntegrationKind): readonly RegisteredIntegration[] {
    return [...this.integrations.values()].filter(entry => kind === undefined || entry.declaration.kind === kind);
  }
}

function conflict(what: string, id: string, holder: string): Error {
  return pluginErrors.integration_declaration_conflict(`${what} ${id} 已由 ${holder} 登记；后来的插件不能取代它，请换一个 id`);
}
