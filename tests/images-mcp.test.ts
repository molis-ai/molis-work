import assert from "node:assert/strict";
import test from "node:test";
import { callImageTool as call, openImagesMcp } from "./fixtures/images-mcp.js";

test("Images standard MCP generates and retrieves real bytes, then preserves them across process restart", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate, providerCalls } = await openImagesMcp(t);
  const client = await connect("a");
  const names = (await client.listTools()).tools.map(tool => tool.name).filter(name => name.startsWith("images."));
  // Generating is unavailable until a service exists.
  assert.equal(names.length, 11);
  for (const version of ["v1", "v2", "v3", "v4"]) assert.ok(!names.includes(`images.jobs.start__${version}`));
  assert.equal(providerCalls(), 0);
  for (const name of ["get", "list", "cancel"]) {
    assert.ok(names.includes(`images.jobs.${name}__v1`));
    assert.ok(!names.includes(`images.jobs.${name}__v2`));
    assert.equal((await client.callTool({ name: `images.jobs.${name}__v2`, arguments: {} })).isError, true);
  }
  assert.ok(names.includes("images.connection.usages__v1"));
  assert.ok(names.includes("images.connections.list__v1"));
  assert.equal((await client.callTool({ name: "images.connections.list__v2", arguments: {} })).isError, true, "the superseded connection contract cannot be invoked");

  const connection = await saveConnection(client);
  const configured = (await client.listTools()).tools.map(tool => tool.name).filter(name => name.startsWith("images."));
  assert.equal(configured.length, 12, "the saved service makes generating available");
  assert.ok(configured.includes("images.jobs.start__v1"));
  assert.ok(!configured.includes("images.jobs.start__v2"));
  assert.ok(!configured.includes("images.jobs.start__v3"));
  assert.equal((await client.callTool({ name: "images.jobs.start__v3", arguments: {} })).isError, true, "the superseded generation contract cannot be invoked");
  // ASC-10: an unauthenticated image configuration is not itself an account connection.
  assert.deepEqual(await call(client, "connection.usages", { connection_id: connection.id }), { usages: [] });
  assert.equal((await call<{ connections: Array<{ id: string }> }>(client, "connections.list")).connections[0]!.id, connection.id);

  const { jobId, input, query, image } = await generate(client, connection.id);
  await client.close();
  const restarted = await connect("a");
  assert.equal((await call<{ job: { id: string } }>(restarted, "jobs.start", input)).job.id, jobId);
  assert.deepEqual(await call(restarted, "images.read", query), image);
  assert.equal(providerCalls(), 1);
  await call(restarted, "jobs.delete", { id: jobId });
  await call(restarted, "connections.delete", { id: connection.id });
  assert.deepEqual((await call<{ jobs: unknown[] }>(restarted, "jobs.list")).jobs, []);
});

test("Images standard MCP hides another project's jobs", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate } = await openImagesMcp(t);
  const owner = await connect("a");
  const connection = await saveConnection(owner);
  const { jobId } = await generate(owner, connection.id);
  await owner.close();

  const other = await connect("b");
  assert.deepEqual((await call<{ jobs: unknown[] }>(other, "jobs.list")).jobs, []);
  assert.equal((await other.callTool({ name: "images.jobs.get__v1", arguments: { id: jobId } })).isError, true);
});

test("Images standard MCP lets a reader retrieve the bytes and refuses generation", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate } = await openImagesMcp(t);
  const owner = await connect("a");
  const connection = await saveConnection(owner);
  const { input, query, image } = await generate(owner, connection.id);
  await owner.close();

  const reader = await connect("a", "read");
  assert.equal((await reader.callTool({ name: "images.jobs.start__v1", arguments: input })).isError, true);
  assert.deepEqual(await call(reader, "images.read", query), image);
});
