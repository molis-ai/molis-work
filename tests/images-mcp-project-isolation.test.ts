import assert from "node:assert/strict";
import test from "node:test";
import { callImageTool as call, openImagesMcp } from "./fixtures/images-mcp.js";

test("Images standard MCP hides another project's jobs", { timeout: 45_000 }, async t => {
  const { connect, saveConnection, generate } = await openImagesMcp(t);
  const connection = await saveConnection();
  const owner = await connect("a");
  const { jobId } = await generate(owner, connection.id);
  await owner.close();

  const other = await connect("b");
  assert.deepEqual((await call<{ jobs: unknown[] }>(other, "jobs.list")).jobs, []);
  assert.equal((await other.callTool({ name: "images.jobs.get__v1", arguments: { id: jobId } })).isError, true);
});
