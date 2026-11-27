import assert from "node:assert/strict";
import test from "node:test";
import { callImageTool as call, openImagesMcp } from "./fixtures/images-mcp.js";

test("Images standard MCP lets a reader retrieve the bytes and refuses generation", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate } = await openImagesMcp(t);
  const connection = await saveConnection();
  const owner = await connect("a");
  const { input, query, image } = await generate(owner, connection.id);
  await owner.close();

  const reader = await connect("a", "read");
  assert.equal((await reader.callTool({ name: "images.jobs.start__v1", arguments: input })).isError, true);
  assert.deepEqual(await call(reader, "images.read", query), image);
});
