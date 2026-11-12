const connectionLinks = [
  { label: { key: "github.setup.create-a-personal-access-token" }, url: "https://github.com/settings/tokens/new?scopes=notifications,read:user&description=Molis%20Work" },
  { label: { key: "github.setup.register-an-oauth-app" }, url: "https://github.com/settings/applications/new" },
] as const;

export { connectionLinks };
export const connectionGuide = [
  { kind: "oauth", support: "in_app", note: { key: "github.guide.oauth-note" }, links: [{ label: { key: "github.guide.oauth-link" }, url: "https://github.com/settings/applications/new" }] },
  { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "github.guide.cli-link" }, url: "https://cli.github.com/manual/gh_auth_login" }] },
  { kind: "token", support: "paste", note: { key: "github.guide.token-note" }, links: [connectionLinks[0]] },
  { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "github.guide.mcp-link" }, url: "https://github.com/github/github-mcp-server" }] },
] as const;
