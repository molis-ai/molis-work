import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Network settings that make the child able to reach Feishu/Lark from this machine (a required proxy, a company CA).
 * They are the user's own configuration, passed through unchanged. Everything else in the Host's environment (model
 * keys, `GITHUB_TOKEN`, the encryption key, `NODE_OPTIONS`, ...) stays with the Host.
 */
const NETWORK_VARIABLES = [
  "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

export interface LarkMcpLaunchInput {
  appId: string;
  appSecret: string;
  /** The Feishu or Lark open-platform origin. */
  domain: string;
  /** A user access token, when the connection has one; otherwise the app's tenant token is used. */
  userAccessToken?: string | null;
}

export interface LarkMcpLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** A fresh, empty directory made for this launch alone. */
  cwd: string;
  /** Removes `cwd`; call it once the child has been closed. Calling it again does nothing. */
  cleanup(): void;
}

/**
 * How the Feishu/Lark MCP connector starts its server: the `@larksuiteoapi/lark-mcp` package pinned in
 * apps/local-host/package.json and pnpm-lock.yaml, run by the Host's own Node (no `npx`, so nothing is fetched or
 * updated at run time). The transport adds the MCP SDK's small safe default set (HOME, PATH, USER, ...); this adds the
 * app credentials and the network settings above, nothing else. The package calls `dotenv.config()`, which loads
 * `<working directory>/.env` and adds any variable it names to the child (`LARK_TOOLS`, a proxy, a TLS switch, ...), so
 * the working directory is a new empty directory for each launch (readable and writable by this user only), never a
 * directory that other programs share such as the temp directory itself.
 */
export function larkMcpLaunch(input: LarkMcpLaunchInput): LarkMcpLaunch {
  const entry = createRequire(import.meta.url).resolve("@larksuiteoapi/lark-mcp/dist/cli.js");
  const env: Record<string, string> = {};
  for (const name of NETWORK_VARIABLES) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  Object.assign(env, {
    APP_ID: input.appId, APP_SECRET: input.appSecret, LARK_DOMAIN: input.domain,
    LARK_TOKEN_MODE: input.userAccessToken ? "user_access_token" : "tenant_access_token",
    ...(input.userAccessToken ? { USER_ACCESS_TOKEN: input.userAccessToken } : {}),
  });
  const cwd = mkdtempSync(join(tmpdir(), "molis-lark-mcp-"));
  return { command: process.execPath, args: [entry, "mcp"], env, cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}
