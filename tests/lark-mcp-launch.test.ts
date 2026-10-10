import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
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

test("the child runs the pinned package with the Host's own Node", t => {
  const launch = larkMcpLaunch({ ...credentials });
  t.after(() => launch.cleanup());
  assert.equal(launch.command, process.execPath);
  const entry = createRequire(join(root, "apps/local-host/package.json")).resolve("@larksuiteoapi/lark-mcp/dist/cli.js");
  assert.deepEqual(launch.args, [entry, "mcp"]);
});

test("each launch gets a fresh empty working directory of its own, removed when the Host is done with it", t => {
  const first = larkMcpLaunch({ ...credentials }), second = larkMcpLaunch({ ...credentials });
  t.after(() => { first.cleanup(); second.cleanup(); });
  assert.notEqual(first.cwd, second.cwd, "no directory is shared between launches");
  for (const launch of [first, second]) {
    assert.notEqual(launch.cwd, process.cwd(), "a .env file in the Host's working directory is not read by the child");
    assert.notEqual(launch.cwd, tmpdir(), "nor one in the directory that other programs share");
    assert.deepEqual(readdirSync(launch.cwd), [], "it starts empty, so there is no .env for the package to read");
    if (process.platform !== "win32") assert.equal(statSync(launch.cwd).mode & 0o077, 0, "only its owner can add files to it");
  }
  first.cleanup();
  assert.equal(existsSync(first.cwd), false, "the directory is removed once the Host is done");
  assert.equal(existsSync(second.cwd), true, "another launch's directory is untouched");
  assert.doesNotThrow(() => first.cleanup(), "cleaning up twice is harmless");
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

/**
 * A loopback HTTP server that plays the proxy a stray `.env` could name. The package builds its HTTP client before it
 * calls `dotenv.config()`, but looks the proxy up again for every request, so a `HTTP_PROXY` written into `<cwd>/.env`
 * decides where the app secret is sent. (Its own `LARK_*` and `APP_*` settings are read before `dotenv.config()` runs,
 * so a `.env` cannot change those.)
 */
async function recordingProxy(t: test.TestContext) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(String(request.url).includes("tenant_access_token")
        ? JSON.stringify({ code: 0, msg: "ok", tenant_access_token: "t-fake", expire: 7200 }) : JSON.stringify({ code: 0, msg: "ok", data: {} }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { requests, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Starts the pinned package in `cwd` with the launch's environment and makes one tool call; the call reaches the network only through a proxy. */
async function callOneTool(launch: ReturnType<typeof larkMcpLaunch>, cwd: string) {
  const transport = new StdioClientTransport({ command: launch.command, args: launch.args, env: launch.env, cwd, stderr: "pipe" });
  const client = new Client({ name: "molis-work-test", version: "0.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: 45_000 });
    await client.callTool({ name: "im_v1_chat_list", arguments: {} }, undefined, { timeout: 30_000 }).catch(() => undefined);
  } finally { await client.close().catch(() => undefined); }
}

test("a .env file in the directory that programs share cannot redirect the child's requests", { timeout: 120_000 }, async t => {
  const proxy = await recordingProxy(t);
  const shared = mkdtempSync(join(tmpdir(), "lark-shared-tmp-"));
  t.after(() => rmSync(shared, { recursive: true, force: true }));
  writeFileSync(join(shared, ".env"), `HTTP_PROXY=${proxy.url}\n`);
  // An address that cannot resolve, so a request only arrives at the recording proxy if the package was told to use it. The machine running the test may have proxy settings of its own.
  withEnvironment(t, { TMPDIR: shared, HTTP_PROXY: undefined, http_proxy: undefined, HTTPS_PROXY: undefined, https_proxy: undefined, ALL_PROXY: undefined, all_proxy: undefined, NO_PROXY: undefined, no_proxy: undefined });
  const credentialsOnPlainHttp = { ...credentials, domain: "http://lark-dotenv-probe.invalid" };

  // Control: the same child started in the directory that holds the .env does send its requests to that proxy. Without this the test could pass because the package stopped reading .env.
  const control = larkMcpLaunch(credentialsOnPlainHttp);
  t.after(() => control.cleanup());
  await callOneTool(control, shared);
  assert.ok(proxy.requests.some(line => line.includes("lark-dotenv-probe.invalid")), `the package honours <cwd>/.env (proxy saw: ${JSON.stringify(proxy.requests)})`);

  // The launch's own working directory is the one that matters: with TMPDIR pointing at the shared directory, a launch that ran in the temp directory itself would pick that .env up.
  proxy.requests.length = 0;
  const launch = larkMcpLaunch(credentialsOnPlainHttp);
  t.after(() => launch.cleanup());
  await callOneTool(launch, launch.cwd);
  assert.deepEqual(proxy.requests, [], "the child ran in its own empty directory, so the shared .env never named a proxy for the app secret to go through");
});
