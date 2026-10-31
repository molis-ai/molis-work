import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createCatalogConnector, createGithubConnector, createGmailConnector, homeIntegrationRegistry, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { catalogConnectorIds } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { connectorControl } from "./fixtures/connector-control.js";
import { withIntegrationHome } from "./fixtures/integration-home.js";

// T-120 (BL-740 group; specs/repository-anti-corruption/slices/pg046-integrations-from-manifest.md): which connector reads a source's
// credential is decided where the built-in integrations are listed, one per kind, and not by a function that guesses the kind from the
// integration id. The cases that say "unchanged" were run on the tree before the move and passed there.

const root = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "dummy-fixture-token";
const BUILTIN_IDS = ["github", "gmail", ...catalogConnectorIds()];

/** The ids the Host's registry serves: a catalog connector with no feed has no integration plugin. */
const served = (registry: { integration(id: string): unknown }) => BUILTIN_IDS.filter(id => registry.integration(id));

const binding = (extra: Partial<IntegrationBinding> = {}): IntegrationBinding => ({ source_id: "source-1", connection_id: null, credential_ref: null, config: {}, ...extra });

/** Runs `run` with `fetch` replaced, so a connector that reaches for the network never gets out; a stub that records says what it was asked. */
async function withFetch<T>(fetchImpl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

const headerOf = (init: RequestInit | undefined, name: string): string | undefined => {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const found = Object.entries(headers as Record<string, string>).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
};

test("RAC-2660 integration-providers.ts imports no connector and names no integration: the kinds are wired where the built-in integrations are listed", () => {
  const file = "apps/local-host/src/integration-providers.ts";
  const source = ts.createSourceFile(file, readFileSync(`${root}${file}`, "utf8"), ts.ScriptTarget.Latest, true);
  const imported: string[] = [], literals: string[] = [], comparisons: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imported.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imported.push(node.arguments[0].text);
    if (ts.isStringLiteral(node) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) literals.push(node.text);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) comparisons.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(imported.filter(specifier => specifier.startsWith("./")), [], "it imports no Host file, so no connector");
  assert.deepEqual(literals.filter(text => BUILTIN_IDS.includes(text)), [], "it names no integration");
  assert.deepEqual(comparisons, [], "it chooses nothing by comparison");
});

test("RAC-2661 every built-in integration reads through the connector of its own kind (unchanged)", async () => {
  await withIntegrationHome(async home => {
    // Without a connection none of the three reads asks the network anything: a wiring that does is seen in `calls`, not hidden in a health answer.
    const calls: string[] = [];
    const offline = (async (input: RequestInfo | URL) => { calls.push(String(input)); throw new Error("offline"); }) as typeof fetch;
    await withFetch(offline, async () => {
      const registry = await homeIntegrationRegistry(home.directory);
      const direct = (id: string): IntegrationProviderPort => id === "github" ? createGithubConnector({ allowFixture: false })
        : id === "gmail" ? createGmailConnector({ allowFixture: false }) : createCatalogConnector({ connectorId: id });
      assert.ok(served(registry).length > 3, "the Host serves github, gmail and several catalog connectors");
      for (const id of served(registry)) {
        const bound = await registry.bind(id, "source", binding({ source_id: `source-${id}` }));
        const driver = await bound.connector_driver.health(connectorControl());
        const expected = await direct(id).health(connectorControl());
        assert.equal(driver.ok, expected.ok, `${id}: the same answer as its own connector`);
        assert.equal(driver.message, expected.message, `${id}: and in its own words`);
      }
    });
    assert.deepEqual(calls, [], "no request left for the network");
  });
});

test("RAC-2662 a Host that brings its own provider factory is asked once for each built-in integration, by its id, with its binding, and gets a registry of its own (unchanged)", async () => {
  const asked: Array<{ id: string; source_id: string }> = [];
  const stand: IntegrationProviderPort = {
    type: "stand-in",
    async health() { return { ok: true, status: "connected", message: "stand-in" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  };
  const factory = (id: string, seen: IntegrationBinding): IntegrationProviderPort => { asked.push({ id, source_id: seen.source_id }); return stand; };
  const registry = await homeIntegrationRegistry("unused-home", factory);
  const ids = served(registry);
  assert.ok(ids.length > 3);
  for (const id of ids) await registry.bind(id, "source", binding({ source_id: `source-${id}` }));
  assert.deepEqual(asked, ids.map(id => ({ id, source_id: `source-${id}` })));
  assert.notEqual(await homeIntegrationRegistry("unused-home", factory), registry, "a caller's own factory shares nothing");
});

test("RAC-2663 a source reads with the credential of its own connection and with none when it has none (unchanged)", async () => {
  await withIntegrationHome(async home => {
    const seen: Array<{ url: string; authorization: string | undefined }> = [];
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), authorization: headerOf(init, "authorization") });
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const registry = await homeIntegrationRegistry(home.directory);
    const carrying = () => seen.filter(call => call.authorization?.includes(FIXTURE));

    // A catalog source: the token of the connection the source names.
    const connection = withConnectorConnections(home.directory, store => store.createToken({ serviceId: "linear", displayName: "Fixture", token: FIXTURE }));
    await withFetch(spy, async () => {
      await (await registry.bind("linear", "source", binding({ connection_id: connection.connection_id }))).connector_driver.health(connectorControl());
    });
    assert.ok(carrying().length > 0, "linear: the request carries its connection's token");
    assert.ok(carrying().every(call => call.url.includes("linear")), "linear: and goes to its own service");
    seen.length = 0;
    await withFetch(spy, async () => {
      const bound = await registry.bind("linear", "source", binding());
      assert.equal((await bound.connector_driver.health(connectorControl())).ok, false, "linear: no connection, no account");
    });
    assert.deepEqual(carrying(), [], "linear: without a connection nothing is sent with a token");

    // GitHub and Gmail: the secret the source's connection stores, and only when the source has both the connection and the reference.
    for (const { id, host } of [{ id: "github", host: "github" }, { id: "gmail", host: "google" }]) {
      const reference = `secret:${id}-fixture`;
      createFileSecretStore().put(reference, FIXTURE);
      seen.length = 0;
      await withFetch(spy, async () => {
        await (await registry.bind(id, "source", binding({ connection_id: "connection-1", credential_ref: reference }))).connector_driver.health(connectorControl());
      });
      assert.ok(carrying().length > 0, `${id}: the request carries the stored secret`);
      assert.ok(carrying().every(call => call.url.includes(host)), `${id}: and goes to its own service`);
      for (const partial of [{ connection_id: null, credential_ref: reference }, { connection_id: "connection-1", credential_ref: null }]) {
        seen.length = 0;
        await withFetch(spy, async () => {
          await (await registry.bind(id, "source", binding(partial))).connector_driver.health(connectorControl());
        });
        assert.deepEqual(carrying(), [], `${id}: a source with only ${partial.connection_id ? "the connection" : "the reference"} sends no secret`);
      }
    }
  });
});
