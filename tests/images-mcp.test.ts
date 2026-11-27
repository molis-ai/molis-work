import assert from "node:assert/strict";
import test from "node:test";
import { callImageTool as call, openImagesMcp } from "./fixtures/images-mcp.js";

test("Images standard MCP generates and retrieves real bytes, then preserves them across process restart", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate, providerCalls } = await openImagesMcp(t);
  let client = await connect("a");
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

  await client.close();
  const connection = await saveConnection();
  client = await connect("a");
  const configured = (await client.listTools()).tools.map(tool => tool.name).filter(name => name.startsWith("images."));
  assert.equal(configured.length, 12, "the saved service makes generating available");
  assert.ok(configured.includes("images.jobs.start__v1"));
  assert.ok(!configured.includes("images.jobs.start__v2"));
  assert.ok(!configured.includes("images.jobs.start__v3"));
  assert.equal((await client.callTool({ name: "images.jobs.start__v3", arguments: {} })).isError, true, "the superseded generation contract cannot be invoked");
  // UPP-15 (batch 108): the image services are the person's settings. An MCP client generates with one, but neither reads nor changes them
  // (what an image configuration uses is reported to the person: ASC-10 in connector-consumer-usages).
  for (const [name, args] of [["connection.usages", { connection_id: connection.id }], ["connections.list", {}]] as const) {
    assert.equal((await client.callTool({ name: `images.${name}__v1`, arguments: args })).isError, true, `${name} is the person's`);
  }

  const { jobId, input, query, image } = await generate(client, connection.id);
  await client.close();
  const restarted = await connect("a");
  assert.equal((await call<{ job: { id: string } }>(restarted, "jobs.start", input)).job.id, jobId);
  assert.deepEqual(await call(restarted, "images.read", query), image);
  assert.equal(providerCalls(), 1);
  await call(restarted, "jobs.delete", { id: jobId });
  assert.equal((await restarted.callTool({ name: "images.connections.delete__v1", arguments: { id: connection.id } })).isError, true, "an MCP client does not delete the person's service");
  assert.deepEqual((await call<{ jobs: unknown[] }>(restarted, "jobs.list")).jobs, []);
});
