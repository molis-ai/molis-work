// Security invariants S-09 .. S-11 (docs/system/SECURITY-INVARIANTS.md): what the host accepts as an address or a path from outside.
//   S-09  "is this the local machine?" is one function; every place that asks it refuses the spellings that are not
//   S-10  an address a plugin or a feed asks the host to fetch is a public one: private, mapped and transition spellings are refused
//   S-11  a path an outside party names stays inside the directory it was given
// Public entries only (tests may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ModelProviderError, ModelProviderStore, createModelProviderTables, readProjectReference, ProjectReferenceError } from "@molis-ai/molis-work-app-local-host";
import { isLoopbackHostname, isLoopbackHttpOrigin, isLoopbackHttpUrl, loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { ConnectorConnectionStore, CONNECTOR_CONNECTIONS_SCHEMA, ConnectorConnectionError } from "@molis-ai/molis-work-service-connector-host";
import { isDisallowedResolvedAddress, normalizeCustomRssFeedUrl } from "@molis-ai/molis-work-integration-rss";
import { isPublicAddress, validateNetworkRequest } from "@molis-ai/molis-work-plugin-sandbox";
import { ADDRESSES_NEVER_PUBLIC, ADDRESSES_PUBLIC } from "./fixtures/public-address-policy.js";

// ---- S-09 ------------------------------------------------------------------------------------------------------

test("S-09 only the loopback spellings count as the local machine; names that merely contain one, other loopback numbers and mapped forms do not", () => {
  for (const name of ["127.0.0.1", "localhost", "LOCALHOST", "[::1]", "::1"]) assert.equal(isLoopbackHostname(name), true, name);
  for (const name of ["127.0.0.1", "[::1]", "::1"]) assert.equal(isLoopbackHostname(name, { numeric: true }), true, `${name} (numeric)`);
  assert.equal(isLoopbackHostname("localhost", { numeric: true }), false, "a process that talks to the host does not trust a resolver");
  for (const name of ["127.0.0.2", "127.1", "0.0.0.0", "[::]", "::", "10.0.0.1", "192.168.1.1", "localhost.", "foo.localhost", "localhost.evil.example", "127.0.0.1.evil.example", "evil.example",
    "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "0:0:0:0:0:0:0:1", " 127.0.0.1", "127.0.0.1 ", "127.0.0.1:4173", "", "2130706433"]) {
    assert.equal(isLoopbackHostname(name), false, JSON.stringify(name));
  }
  // The WHATWG parser turns the numeric spellings of 127.0.0.1 into the dotted form before anything is asked.
  assert.equal(isLoopbackHttpUrl(new URL("http://2130706433/")), true);
  assert.equal(isLoopbackHttpUrl(new URL("http://0x7f.0.0.1/")), true);
  assert.equal(isLoopbackHttpUrl(new URL("http://[0:0:0:0:0:0:0:1]/")), true);
  assert.equal(isLoopbackHttpUrl(new URL("http://[::ffff:127.0.0.1]/")), false);
});

test("S-09 a loopback origin is plain HTTP on a loopback host with no credentials, path, query or fragment", () => {
  for (const value of ["http://127.0.0.1", "http://127.0.0.1:4173", "http://127.0.0.1:4173/", "http://[::1]:4173/", "http://localhost:4173"]) assert.equal(isLoopbackHttpOrigin(new URL(value)), true, value);
  for (const value of ["https://127.0.0.1", "http://127.0.0.1/path", "http://127.0.0.1/?q=1", "http://127.0.0.1/#x", "http://user@127.0.0.1", "http://user:pass@127.0.0.1", "http://127.0.0.1.evil.example",
    "http://evil.example", "http://evil.example@127.0.0.1.evil.example", "http://0.0.0.0", "ws://127.0.0.1"]) assert.equal(isLoopbackHttpOrigin(new URL(value)), false, value);
  assert.equal(isLoopbackHttpOrigin(new URL("http://localhost:4173"), { numeric: true }), false);
  assert.equal(isLoopbackHttpOrigin(new URL("http://127.0.0.1:4173"), { numeric: true }), true);
});

test("S-09 a Host header names this machine or nothing: foreign, malformed, userinfo and prefix tricks all give null", () => {
  assert.equal(loopbackHost("127.0.0.1:4173"), "127.0.0.1:4173");
  assert.equal(loopbackHost("LOCALHOST:4173"), "localhost:4173");
  assert.equal(loopbackHost("[::1]:4173"), "[::1]:4173");
  assert.equal(loopbackHost(" 127.0.0.1:4173 "), "127.0.0.1:4173");
  for (const value of [undefined, null, "", "   ", "evil.example", "evil.example:4173", "127.0.0.1@evil.example", "127.0.0.1.evil.example", "localhost.evil.example:4173", "[::1", "127.0.0.1:99999", "http://127.0.0.1", "0.0.0.0:4173", "[::ffff:127.0.0.1]:4173"]) {
    assert.equal(loopbackHost(value as string | null | undefined), null, JSON.stringify(value));
  }
});

test("S-09 a model provider's address is HTTPS or plain HTTP on the local machine, with no credentials, query or fragment", () => {
  const db = new DatabaseSync(":memory:");
  createModelProviderTables(db);
  const store = new ModelProviderStore({ db, secrets: { get: () => null } });
  const input = (base_url: string) => ({ provider_id: "probe", display_name: "Probe", base_url, api_format: "anthropic-messages" as const, models: [{ model_id: "m", enabled: true }] });
  try {
    for (const base_url of ["https://models.example/v1", "http://localhost:11434/v1", "http://127.0.0.1:11434/v1", "http://[::1]:11434/v1"]) assert.doesNotThrow(() => store.check(input(base_url)), base_url);
    for (const base_url of ["http://models.example/v1", "http://127.0.0.1.evil.example/v1", "http://0.0.0.0:11434/v1", "ftp://127.0.0.1/", "https://user:pass@models.example/v1", "http://user@localhost:11434/v1",
      "https://models.example/v1?key=secret", "https://models.example/v1#fragment", "file:///etc/passwd", "not a url"]) {
      assert.throws(() => store.check(input(base_url)), (error: unknown) => error instanceof ModelProviderError, base_url);
    }
  } finally { db.close(); }
});

test("S-09 a credential is bound to its first destination: plain HTTP elsewhere, embedded credentials and another host are refused", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CONNECTOR_CONNECTIONS_SCHEMA);
  const values = new Map<string, string>();
  const store = new ConnectorConnectionStore(db, { get: ref => values.get(ref) ?? null, put: (ref, value) => { values.set(ref, value); }, delete: ref => { values.delete(ref); } });
  try {
    const connection = store.createToken({ serviceId: "model-api", displayName: "Probe", token: "token-value-that-never-leaves" });
    for (const address of ["http://models.example/v1", "http://127.0.0.1.evil.example/v1", "https://user:pass@models.example/v1", "http://user@localhost:1/", "ftp://models.example/", "not a url"]) {
      assert.throws(() => store.assertTarget(connection.connection_id, "model-api", address), (error: unknown) => error instanceof ConnectorConnectionError, address);
    }
    assert.equal(store.assertTarget(connection.connection_id, "model-api", "http://localhost:11434/v1"), "http://localhost:11434", "the first destination is pinned…");
    assert.throws(() => store.assertTarget(connection.connection_id, "model-api", "http://localhost:11435/v1"), (error: unknown) => error instanceof ConnectorConnectionError, "…with its port");
    assert.throws(() => store.assertTarget(connection.connection_id, "model-api", "https://models.example/v1"), (error: unknown) => error instanceof ConnectorConnectionError, "…and its scheme");
  } finally { db.close(); }
});

// ---- S-10 ------------------------------------------------------------------------------------------------------

test("S-10 the sandbox proxy and the custom RSS fetch refuse every address of the shared table that is not public, and keep the public ones", () => {
  for (const address of ADDRESSES_NEVER_PUBLIC) {
    assert.equal(isPublicAddress(address), false, `sandbox proxy: ${address}`);
    assert.equal(isDisallowedResolvedAddress(address), true, `custom RSS: ${address}`);
  }
  for (const address of ADDRESSES_PUBLIC) {
    assert.equal(isPublicAddress(address), true, `sandbox proxy: ${address}`);
    assert.equal(isDisallowedResolvedAddress(address), false, `custom RSS: ${address}`);
  }
});

test("S-10 a request a plugin makes through the sandbox proxy is HTTPS to an approved name: addresses, credentials, ports and look-alike names are refused", () => {
  const approved = ["example.com"];
  assert.equal(validateNetworkRequest({ url: "https://example.com/a" }, approved, 1024).hostname, "example.com");
  for (const url of ["http://example.com/", "https://127.0.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://10.0.0.1/", "https://2130706433/", "https://example.com.evil.test/", "https://evil-example.com/",
    "https://example.com:8443/", "https://user:pass@example.com/", "https://example.com./", "https://example.com/#fragment", "https://sub.example.com/", "file:///etc/passwd", "gopher://example.com/"]) {
    assert.throws(() => validateNetworkRequest({ url }, approved, 1024), url);
  }
});

test("S-10 a custom RSS address is HTTPS to a public DNS name: addresses, local names, credentials and odd ports are refused", () => {
  assert.doesNotThrow(() => normalizeCustomRssFeedUrl("https://example.com/feed.xml"));
  for (const url of ["http://example.com/feed.xml", "https://127.0.0.1/feed.xml", "https://[::1]/feed.xml", "https://10.0.0.5/feed", "https://localhost/feed", "https://printer.local/feed", "https://intranet/feed",
    "https://user:pass@example.com/feed", "https://metadata.google.internal/computeMetadata", "file:///etc/passwd", "https://169.254.169.254/latest/meta-data"]) {
    assert.throws(() => normalizeCustomRssFeedUrl(url), url);
  }
});

// ---- S-11 ------------------------------------------------------------------------------------------------------

test("S-11 a project reference stays inside the project: parents, absolute paths, schemes, NUL, links out and directories are refused", async t => {
  const base = await mkdtemp(join(os.tmpdir(), "security-invariants-paths-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "project"), outside = join(base, "outside");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "docs", "plan.md"), "# plan\n");
  await writeFile(join(outside, "secret.txt"), "outside the project");
  await symlink(join(outside, "secret.txt"), join(root, "docs", "link.txt"));
  await symlink(outside, join(root, "linked-directory"));
  const read = (locator: string) => readProjectReference(root, locator);
  assert.equal(read("project://docs/plan.md").content.toString("utf8"), "# plan\n", "the control: a file inside is read");
  const refused = (locator: string, status: number) => assert.throws(() => read(locator), (error: unknown) => error instanceof ProjectReferenceError && error.status === status, locator);
  for (const locator of ["project://../outside/secret.txt", "project://docs/../../outside/secret.txt", "project://docs\\..\\..\\outside\\secret.txt", "../outside/secret.txt", "project://..", "project://docs/.."]) refused(locator, 400);
  for (const locator of ["project:///etc/passwd", "project://\\etc\\passwd", "/etc/passwd", "file:///etc/passwd", "https://example.com/x", "C:\\Windows\\win.ini", "project://docs/plan.md\0.png", ""]) refused(locator, 400);
  refused("project://docs/link.txt", 400);
  refused("project://linked-directory/secret.txt", 400);
  refused("project://docs", 400);
  refused("project://docs/missing.md", 404);
  assert.throws(() => readProjectReference(join(base, "no-such-root"), "project://docs/plan.md"), (error: unknown) => error instanceof ProjectReferenceError && error.status === 404, "a root that is not there reads nothing");
});
