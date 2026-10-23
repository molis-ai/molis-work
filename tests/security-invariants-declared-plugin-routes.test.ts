import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { dispatchDeclaredPluginRoutes } from "@molis-ai/molis-work-app-local-host";

// PG094-09: the Host's dispatcher for declared routes it serves itself (Goals' until PG-094 S9, BL-386) knows no plugin. A plugin
// that is not Goals is served the same way: by its Manifest's routes, with the caller's actor and the installation's grants (S-15).

const NOTES: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.fixture-notes", version: "0.1.0", name: "Notes fixture",
  kind: "native", publisher: { publisher_id: "fixture", signature: "fixture" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, actions: [], artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  routes: [
    { route_id: "notes.read", method: "GET", path: "/notes/:noteId" },
    { route_id: "notes.write", method: "POST", path: "/notes", max_body_bytes: 64 },
    { route_id: "notes.erase", method: "POST", path: "/notes/:noteId/erase", permission: "notes:erase" },
    { route_id: "notes.refuse", method: "POST", path: "/notes/:noteId/refuse" },
    { route_id: "notes.fail", method: "POST", path: "/notes/:noteId/fail" },
    { route_id: "notes.orphan", method: "POST", path: "/orphan" },
  ],
};

async function serveNotes(run: (api: {
  call: (path: string, method?: string, body?: unknown) => Promise<{ status: number; body: Record<string, unknown> | null }>;
  calls: PluginRouteRequest[];
  failures: unknown[];
  grant: (permissions: readonly string[]) => void;
}) => Promise<void>): Promise<void> {
  const calls: PluginRouteRequest[] = [];
  const failures: unknown[] = [];
  let granted: readonly string[] = [];
  const echo = (route_id: string): PluginRouteBinding => ({ route_id, handle: async (request) => {
    calls.push(request);
    return { status: 200, body: { route_id, params: request.params, query: request.query, body: request.body, actor_id: request.actor_id } };
  } });
  const bindings: PluginRouteBinding[] = [
    echo("notes.read"), echo("notes.write"), echo("notes.erase"),
    { route_id: "notes.refuse", handle: async () => { throw new ActionError("actions.input_invalid", "便笺不收这个"); } },
    { route_id: "notes.fail", handle: async () => { throw new Error("处理器自己的故障"); } },
  ];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    // The fixture stands in for the Host's own exits: no route is its 404, any other failure its unhandled 500.
    dispatchDeclaredPluginRoutes({ manifest: NOTES, bindings, path: url.pathname.slice("/api".length), actor_id: "person-fixture", granted },
      request, response, url)
      .then((handled) => { if (!handled) response.writeHead(404).end(); })
      .catch((error: unknown) => { failures.push(error); response.writeHead(500).end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(origin + path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : null };
  };
  try {
    await run({ call, calls, failures, grant: (permissions) => { granted = permissions; } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("PG094-09: the declared-route dispatcher serves a plugin that is not Goals by its Manifest, with the caller's actor", async () => {
  await serveNotes(async ({ call, calls }) => {
    const read = await call("/api/notes/a%20b?view=full&view=short");
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, { route_id: "notes.read", params: { noteId: "a b" }, query: { view: "short" }, body: null, actor_id: "person-fixture" });

    const written = await call("/api/notes", "POST", { text: "便笺", actor_id: "someone-else" });
    assert.equal(written.status, 200);
    assert.deepEqual(written.body, { route_id: "notes.write", params: {}, query: {}, body: { text: "便笺", actor_id: "someone-else" }, actor_id: "person-fixture" });

    // Not declared (path or method): not this plugin's, the Host goes on to its next entry.
    assert.equal((await call("/api/elsewhere")).status, 404);
    assert.equal((await call("/api/notes/n-1", "POST", {})).status, 404);
    assert.equal(calls.length, 2);
  });
});

test("PG094-09 S-15: a declared route's permission is the installation's grants, never the caller's; without it the route is refused before its handler", async () => {
  await serveNotes(async ({ call, calls, grant }) => {
    const refused = await call("/api/notes/n-1/erase", "POST", {});
    assert.equal(refused.status, 403);
    assert.equal(refused.body?.code, "actions.forbidden");
    assert.equal(calls.length, 0);

    grant(["notes:erase"]);
    const erased = await call("/api/notes/n-1/erase", "POST", {});
    assert.equal(erased.status, 200);
    assert.equal(calls.length, 1);
  });
});

test("PG094-09: refusals answer by their kind, a bad encoding in a declared route is the caller's 400, and a fault goes on to the Host", async () => {
  await serveNotes(async ({ call, calls, failures }) => {
    const tooLarge = await call("/api/notes", "POST", { text: "x".repeat(100) });
    assert.equal(tooLarge.body?.code, "actions.input_too_large");

    const refused = await call("/api/notes/n-1/refuse", "POST", {});
    assert.deepEqual([refused.status, refused.body?.code], [400, "actions.input_invalid"]);

    const badEncoding = await call("/api/notes/%E0%A4%A");
    assert.deepEqual([badEncoding.status, badEncoding.body?.code], [400, "host.request_path_invalid"]);
    // A bad encoding outside the declared routes is not this plugin's to refuse.
    assert.equal((await call("/api/elsewhere/%E0%A4%A")).status, 404);
    assert.equal(calls.length, 0);

    assert.equal((await call("/api/notes/n-1/fail", "POST", {})).status, 500);
    assert.equal((await call("/api/orphan", "POST", {})).status, 500);
    assert.deepEqual(failures.map((failure) => failure instanceof ActionError), [false, false]);
    assert.match(String(failures[1]), /notes\.orphan/);
  });
});

test("PG094-09: the shared route operations name no plugin", async () => {
  const source = await readFile(new URL("../apps/local-host/src/plugin-route-operations.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /goals|io\.molis\.work\./i);
});
