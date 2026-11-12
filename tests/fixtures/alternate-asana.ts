import assert from "node:assert/strict";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";

export function alternateAsanaIntegration(): PluginDefinition {
  const { connectionText: _connectionText, ...definition } = createCatalogIntegrationPlugin({
    connectorId: "asana",
    providerFor: () => { throw new Error("the test reads no integration records"); },
  });
  const { ui: { locales: _locales, ...ui }, connection_services, ...manifest } = definition.manifest;
  const service = connection_services?.[0];
  assert.ok(service);
  // The replacement owns its display text. The service's authentication fields and endpoints stay the same.
  return { ...definition, manifest: {
    ...manifest, plugin_id: "io.molis.work.integration.asana.lookalike", ui,
    connection_services: [{
      ...service,
      summary: "Asana fixture account",
      auth_help: "Connect an Asana fixture account",
      auth: { methods: service.auth.methods.map(method => {
        if (method.kind === "token") return { ...method, label: "Asana access token", placeholder: "Paste the access token" };
        if (method.kind === "oauth") return { ...method, note: "Authorize the Asana account" };
        return method;
      }) },
      capabilities: service.capabilities.map((capability, index) => ({ ...capability, label: index === 0 ? "Read Asana updates" : "Check the current account" })),
      setup_links: service.setup_links?.map(link => ({ ...link, label: "Asana settings" })),
    }],
  } };
}
