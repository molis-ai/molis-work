import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginMcpMethodDeclaration, PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { isDeclaredOAuth } from "@molis-ai/molis-work-plugin-sdk/oauth";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { oauthMethodOption } from "./connector-oauth-declarations.js";
import { OAUTH_CALLBACK, defaultOAuthCallbackHost, defaultOAuthCallbackPath } from "./connector-oauth-callback-paths.js";
import { declaredMcpMethod, mcpServerFor } from "./connector-mcp-endpoint.js";
import type { McpServerConfiguration } from "./connector-mcp.js";
import { builtinIntegrationDeclarations } from "./builtin-integrations.js";
import type { McpServiceOwner } from "./integration-registry.js";
import { PLATFORM_OWNER, type RegisteredConnectionService } from "./integration-declarations.js";
import { connectorLinks } from "./connector-words.js";
import { installHostUiText } from "./ui-text-provider.js";
import { productMcpClientEligible } from "./connector-mcp-configuration.js";
import { CONNECTOR_CLIS, cliAvailability } from "./connector-cli.js";
import { connectorProductAuth, productApiLoginReady, productDeviceLoginReady } from "./connector-product-auth.js";

function link(label: string, url: string): ConnectorSetupLink {
  if (!url.startsWith("https://")) throw new Error(`connector_method_link_must_be_https:${url}`);
  return { label, url };
}

function platformMethods(id: string): readonly ConnectorMethodOption[] {
  switch (id) {
    case "model-api": return [{ kind: "token", support: "paste", note: t.text("workbench.connector-methods.model-api"),
      links: [link("OpenAI API Keys", "https://platform.openai.com/api-keys"), link("Anthropic API Keys", "https://console.anthropic.com/settings/keys")] }];
    case "typesafe": return [{ kind: "token", support: "paste", note: t.text("workbench.connector-methods.typesafe"),
      links: [link("TypeSafe Console · API Keys", "https://console.typesafe.ai/keys")] }];
    case "image-api": return [{ kind: "token", support: "paste", note: t.text("workbench.connector-methods.image-api"),
      links: [link("OpenAI API Keys", "https://platform.openai.com/api-keys"), link("Google AI Studio · API Keys", "https://aistudio.google.com/apikey")] }];
    case "mcp-bearer": return [
      { kind: "token", support: "paste", note: t.text("workbench.connector-methods.mcp-bearer"),
        links: [link(t.text("workbench.connector-methods.mcp-auth-link"), "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization")] },
      { kind: "mcp", support: "in_app", note: t.text("workbench.connector-methods.remote-mcp"),
        mcp: { endpoint: "", client_registration: "dynamic" },
        links: [link(t.text("workbench.connector-methods.mcp-clients-link"), "https://modelcontextprotocol.io/docs/learn/client-concepts")] },
    ];
    default: return [];
  }
}

/** Methods come from this service's registration, not another service of the same id or an older installation. */
export function connectorMethodsOf(service: RegisteredConnectionService, owner?: McpServiceOwner): readonly ConnectorMethodOption[] {
  const { declaration } = service;
  const oauth = (grant: PluginOAuthMethodDeclaration["grant"]) => declaration.auth.methods.find((method): method is PluginOAuthMethodDeclaration => isDeclaredOAuth(method) && method.grant === grant);
  return projectMethods(service, oauth("authorization_code"), oauth("device"), declaration.auth.methods.find(declaredMcpMethod), owner);
}

export function connectorMethodsFor(connectorId: string, oauth?: PluginOAuthMethodDeclaration, device?: PluginOAuthMethodDeclaration,
  declaredMcp?: PluginMcpMethodDeclaration | null, owner?: McpServiceOwner): readonly ConnectorMethodOption[] {
  installHostUiText();
  const service = builtinIntegrationDeclarations().connectionServices().find(entry => entry.declaration.service_id === connectorId);
  if (!service) return [];
  const mcp = declaredMcp === undefined ? service.declaration.auth.methods.find(declaredMcpMethod) : declaredMcp ?? undefined;
  return projectMethods(service, oauth, device, mcp, owner);
}

function projectMethods({ declaration, owner: declarer, word, guides }: RegisteredConnectionService,
  oauth: PluginOAuthMethodDeclaration | undefined, device: PluginOAuthMethodDeclaration | undefined, declaredMcp: PluginMcpMethodDeclaration | undefined,
  owner?: McpServiceOwner): readonly ConnectorMethodOption[] {
  const id = declaration.service_id;
  if (declarer === PLATFORM_OWNER) return platformMethods(id);
  const mcp = mcpServerFor(id, declaredMcp);
  if (guides.length) return guides.map(guide => {
    const { kind, support } = guide;
    const links = connectorLinks(guide.links, word);
    if (kind === "oauth" && oauth) return { kind, support: "in_app", links, login_ready: productApiLoginReady(id, oauth),
      note: t.text("workbench.connector-methods.oauth-official"),
      oauth: { ...oauthMethodOption(oauth, word), ...(defaultOAuthCallbackPath(id) === OAUTH_CALLBACK ? {} : { callback_path: defaultOAuthCallbackPath(id) }),
        ...(defaultOAuthCallbackHost(id) ? { callback_host: defaultOAuthCallbackHost(id) } : {}),
        ...(device ? { device: { login_ready: productDeviceLoginReady(id) } } : {}) } };
    if (kind === "cli" && CONNECTOR_CLIS[id]) return { kind, support: "in_app", links, note: t.text("workbench.connector-methods.cli-sign-in"), cli: cliAvailability(id) };
    if (kind === "mcp" && mcp) return mcpOption(id, links, guide.connected_note !== undefined ? word(guide.connected_note)
      : support === "in_app" ? word(guide.note) : "", mcp, owner);
    return { kind, support, links, note: word(guide.note) };
  });
  const note = declaration.auth_help === undefined ? "" : word(declaration.auth_help);
  const links = connectorLinks(declaration.setup_links ?? [], word);
  const methods: ConnectorMethodOption[] = declaration.auth.methods.some(method => method.kind === "token") ? [{ kind: "token", support: "paste", note, links }] : [];
  if (mcp && declaredMcp) methods.push(mcpOption(id, links, note, mcp, owner));
  return methods;
}

function mcpOption(connectorId: string, links: readonly ConnectorSetupLink[], note: string, mcp: McpServerConfiguration, owner?: McpServiceOwner): ConnectorMethodOption {
  const auth = mcp.auth === "none" ? t.text("workbench.connector-methods.mcp-no-auth")
    : mcp.auth === "oauth" ? "OAuth" : mcp.auth === "bearer" ? "Bearer" : t.text("workbench.connector-methods.mcp-either");
  return { kind: "mcp", support: "in_app", links,
    login_ready: !mcp.stdio && mcp.auth !== "none" && !mcp.endpoint.includes("{") &&
      (mcp.registration !== "manual" || productMcpClientEligible(connectorId, owner) && Boolean(connectorProductAuth(connectorId, "mcp"))),
    mcp: { endpoint: mcp.endpoint, client_registration: mcp.registration ?? "dynamic", note: t.text("workbench.connector-methods.mcp-auth", { auth }) },
    note: note ? t.text("workbench.connector-methods.mcp-connected-with-note", { note }) : t.text("workbench.connector-methods.mcp-connected") };
}
