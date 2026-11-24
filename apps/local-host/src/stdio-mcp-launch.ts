import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalMcpLaunch, LocalMcpLaunchInput, LocalMcpStdioDeclaration } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

/**
 * Network settings that make the child able to reach its service from this machine (a required proxy, a company CA). They are the
 * user's own configuration, passed through unchanged. Everything else in the Host's environment (model keys, `GITHUB_TOKEN`, the
 * encryption key, `NODE_OPTIONS`, ...) stays with the Host.
 */
const NETWORK_VARIABLES = [
  "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

/**
 * How a declared local stdio MCP server starts (D3 A): the package its driver names, pinned in apps/local-host/package.json and
 * pnpm-lock.yaml (only a package the Host depends on resolves), run by the Host's own Node (no `npx`, so nothing is fetched or
 * updated at run time). The transport adds the MCP SDK's small safe default set (HOME, PATH, USER, ...); this adds the variables the
 * driver builds from the connection's credentials and the network settings above, nothing else. A package may load
 * `<working directory>/.env` (the Feishu/Lark one calls `dotenv.config()`), and one that looks the proxy up again for each request
 * would let a `HTTP_PROXY` written there decide where the app secret goes. So the working directory is a new empty directory for each
 * launch (readable and writable by this user only), never one that other programs share such as the temp directory itself
 * (`tests/lark-mcp-launch.test.ts` shows both halves: the package honours a `.env` in its directory, and this one has none).
 */
export function stdioMcpLaunch(declaration: LocalMcpStdioDeclaration, input: LocalMcpLaunchInput): LocalMcpLaunch {
  const entry = createRequire(import.meta.url).resolve(`${declaration.package}/${declaration.entry}`);
  const env: Record<string, string> = {};
  for (const name of NETWORK_VARIABLES) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  Object.assign(env, declaration.environment(input));
  const cwd = mkdtempSync(join(tmpdir(), "molis-stdio-mcp-"));
  return { command: process.execPath, args: [entry, ...declaration.args], env, cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}
