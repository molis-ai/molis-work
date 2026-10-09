import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { larkMcpLaunch } from "@molis-ai/molis-work-app-local-host";

// W2-18 decision 11: the Feishu/Lark MCP connector runs a pinned package that pnpm-lock.yaml manages, not `npx -y`, and
// its child process gets only the environment variables it needs.

const root = join(import.meta.dirname, "..");
const credentials = { appId: "cli_test_app", appSecret: "test-secret-value", domain: "https://open.feishu.cn" };

function withEnvironment(t: test.TestContext, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}

test("the Lark MCP package is an exact dependency of the Host that the lockfile pins, and nothing starts it with npx", () => {
  const manifest = JSON.parse(readFileSync(join(root, "apps/local-host/package.json"), "utf8")) as { dependencies: Record<string, string> };
  const range = manifest.dependencies["@larksuiteoapi/lark-mcp"];
  assert.match(range ?? "", /^\d+\.\d+\.\d+$/u, "an exact version, not a range, a tag or a URL");
  const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  assert.match(lockfile, new RegExp(`'@larksuiteoapi/lark-mcp@${range!.replaceAll(".", "\\.")}[('][^\\n]*:`, "u"), "pnpm-lock.yaml resolves exactly that version");
  const installed = createRequire(join(root, "apps/local-host/package.json"))("@larksuiteoapi/lark-mcp/package.json") as { version: string };
  assert.equal(installed.version, range, "the installed package is the pinned one");
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : /\.(ts|mts)$/u.test(entry.name) ? [join(directory, entry.name)] : []);
  const launchers = walk(join(root, "apps/local-host/src")).filter(file => /["']npx["']/u.test(readFileSync(file, "utf8")));
  assert.deepEqual(launchers, [], "no Host source starts a package with npx (it would fetch the latest release at run time)");
});

test("the child runs the pinned package with the Host's own Node, from a neutral directory", () => {
  const launch = larkMcpLaunch({ ...credentials });
  assert.equal(launch.command, process.execPath);
  const entry = createRequire(join(root, "apps/local-host/package.json")).resolve("@larksuiteoapi/lark-mcp/dist/cli.js");
  assert.deepEqual(launch.args, [entry, "mcp"]);
  assert.notEqual(launch.cwd, process.cwd(), "a .env file in the Host's working directory is not read by the child");
});

test("the child gets the app credentials and network settings, and none of the Host's other variables", t => {
  withEnvironment(t, {
    MINIMAX_API_KEY: "minimax-secret", GITHUB_TOKEN: "github-secret", MOLIS_WORK_ENCRYPTION_KEY: "encryption-secret",
    MOLIS_WORK_TEXT_API_KEY: "text-secret", NODE_OPTIONS: "--import tsx", LARK_TOOLS: "everything", APP_SECRET: "inherited-app-secret",
    HTTPS_PROXY: "http://proxy.test:7890", https_proxy: "http://proxy.test:7890", NO_PROXY: "localhost", NODE_EXTRA_CA_CERTS: "/etc/corporate-ca.pem",
    // The machine running this test may have its own proxy settings.
    HTTP_PROXY: undefined, http_proxy: undefined, ALL_PROXY: undefined, all_proxy: undefined, no_proxy: undefined, SSL_CERT_FILE: undefined, SSL_CERT_DIR: undefined,
  });
  const tenant = larkMcpLaunch({ ...credentials });
  assert.deepEqual(Object.keys(tenant.env).sort(), ["APP_ID", "APP_SECRET", "HTTPS_PROXY", "LARK_DOMAIN", "LARK_TOKEN_MODE", "NODE_EXTRA_CA_CERTS", "NO_PROXY", "https_proxy"]);
  assert.equal(tenant.env.APP_ID, "cli_test_app");
  assert.equal(tenant.env.APP_SECRET, "test-secret-value", "the Host's own APP_SECRET variable does not leak in or override the saved one");
  assert.equal(tenant.env.LARK_DOMAIN, "https://open.feishu.cn");
  assert.equal(tenant.env.LARK_TOKEN_MODE, "tenant_access_token");
  assert.equal(tenant.env.HTTPS_PROXY, "http://proxy.test:7890", "a proxy the machine needs to reach Feishu is kept");
  assert.equal(tenant.env.NODE_EXTRA_CA_CERTS, "/etc/corporate-ca.pem");
  const user = larkMcpLaunch({ ...credentials, userAccessToken: "u-user-token" });
  assert.equal(user.env.LARK_TOKEN_MODE, "user_access_token");
  assert.equal(user.env.USER_ACCESS_TOKEN, "u-user-token");
  for (const secret of ["MINIMAX_API_KEY", "GITHUB_TOKEN", "MOLIS_WORK_ENCRYPTION_KEY", "MOLIS_WORK_TEXT_API_KEY", "NODE_OPTIONS", "LARK_TOOLS"]) {
    assert.equal(secret in user.env, false, `${secret} stays in the Host`);
  }
});

test("the pinned package starts and lists its tools with only that environment", { timeout: 60_000 }, async t => {
  withEnvironment(t, { MINIMAX_API_KEY: "minimax-secret", GITHUB_TOKEN: "github-secret" });
  const launch = larkMcpLaunch({ ...credentials });
  const transport = new StdioClientTransport({ command: launch.command, args: launch.args, env: launch.env, cwd: launch.cwd, stderr: "pipe" });
  const client = new Client({ name: "molis-work-test", version: "0.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: 45_000 });
    const { tools } = await client.listTools();
    assert.ok(tools.length > 10, "the server lists its Feishu tools without any network call");
  } finally { await client.close().catch(() => undefined); }
});
