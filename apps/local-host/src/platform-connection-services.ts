import type { PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

const live = (key: string) => ({ label: { key }, fulfillment: "live" as const });

/**
 * The connection services the platform itself consumes, declared in the same shape a plugin declares its own and registered in the
 * same registry (PG-046). When the plugins that use them (Functions, Images, Coding) run on the Runtime they declare them and these
 * leave (BL-525); what the platform keeps for itself, such as the model API keys, stays here.
 */
export const PLATFORM_CONNECTION_SERVICES: readonly PluginConnectionServiceDeclaration[] = [
  {
    service_id: "model-api", title: { key: "workbench.connection-service.model-api.title" }, group_id: "work", auth_kind: "token",
    summary: { key: "workbench.connection-service.model-api.summary" },
    auth: { methods: [{ kind: "token", label: { key: "workbench.connection-service.model-api.token" }, placeholder: "sk-…" }] },
    capabilities: [live("workbench.connection-service.model-api.inference"), live("workbench.connection-service.model-api.jelly")],
  },
  {
    service_id: "typesafe", title: "TypeSafe", group_id: "work", auth_kind: "token",
    summary: { key: "workbench.connection-service.typesafe.summary" },
    auth: { methods: [{ kind: "token", label: "TypeSafe API Key" }] },
    capabilities: [live("workbench.connection-service.typesafe.invoke"), live("workbench.connection-service.typesafe.choose")],
  },
  {
    service_id: "image-api", title: { key: "workbench.connection-service.image-api.title" }, group_id: "design", auth_kind: "token",
    summary: { key: "workbench.connection-service.image-api.summary" },
    auth: { methods: [{ kind: "token", label: { key: "workbench.connection-service.image-api.token" } }] },
    capabilities: [live("workbench.connection-service.image-api.generate"), live("workbench.connection-service.image-api.tasks")],
  },
  {
    service_id: "mcp-bearer", title: { key: "workbench.connection-service.mcp-bearer.title" }, group_id: "code", auth_kind: "token",
    summary: { key: "workbench.connection-service.mcp-bearer.summary" },
    auth: { methods: [{ kind: "token", label: "Bearer Token" }] },
    capabilities: [live("workbench.connection-service.mcp-bearer.tools"), { label: "Coding Agent", fulfillment: "live" }],
  },
];
