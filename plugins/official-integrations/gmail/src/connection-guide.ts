const connectionLinks = [
  { label: { key: "gmail.setup.enable-the-gmail-api" }, url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" },
  { label: { key: "gmail.setup.create-oauth-client" }, url: "https://console.cloud.google.com/apis/credentials" },
  { label: { key: "gmail.setup.get-a-token-in-oauth-playground" }, url: "https://developers.google.com/oauthplayground" },
] as const;

export { connectionLinks };
export const connectionGuide = [
  { kind: "oauth", support: "in_app", note: { key: "gmail.guide.oauth-note" }, links: [{ label: { key: "gmail.guide.oauth-link" }, url: "https://console.cloud.google.com/apis/credentials" }] },
  { kind: "token", support: "paste", note: { key: "gmail.guide.token-note" }, links: [connectionLinks[2]] },
  { kind: "mcp", support: "external", note: { key: "gmail.guide.mcp-note" }, connected_note: { key: "gmail.guide.mcp-connected-note" }, links: [{ label: { key: "gmail.guide.mcp-link" }, url: "https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server" }] },
] as const;
