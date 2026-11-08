import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

// ASC-57: a model key nothing uses any more after a key change or a provider removal (spec assistant-service-connections §13.2).

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
};

test("ASC-57 换密钥或移除供应商后，没人在用的旧密钥留着并被指出；还有别的供应商在用就不提；移除走连接的修订号", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-released-key-"));
  const controlToken = "released-key-control-token-0123456789abcdef";
  const web = createMolisWorkWebServer({ homeDirectory: path.join(root, "home"), controlToken });
  const [first, second] = [`released-first-${randomUUID()}`, `released-second-${randomUUID()}`];
  try {
    // No check runs (check_connection off): the key's fate, not the service, is what is looked at here.
    const base = "http://127.0.0.1:9/v1", origin = await listen(web);
    const headers = () => ({ origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": controlToken });
    const save = async (id: string, extra: Record<string, unknown>) => {
      const response = await fetch(`${origin}/api/settings/models/${id}`, { method: "POST", headers: headers(), body: JSON.stringify({
        display_name: id, base_url: base, api_format: "anthropic-messages", enabled: true, prompt_cache: "off",
        models: [{ model_id: "model-a", enabled: true }], check_connection: false, ...extra,
      }) });
      const body = await response.json() as { released_key?: { connection_id: string; revision: string }; error?: string };
      assert.equal(response.status, 200, body.error);
      return body;
    };
    const connections = async () => (await (await fetch(`${origin}/api/settings/connectors/connections`)).json() as { connections: Array<{ connection_id: string; revision: string }> }).connections;

    // A first key: nothing was let go of.
    assert.equal((await save("alpha", { api_key: first })).released_key, undefined);
    const [held] = await connections();
    assert.ok(held);
    // Saving again with the same key lets go of nothing either.
    assert.equal((await save("alpha", {})).released_key, undefined);

    // A second provider picks the same connection: the key is shared.
    assert.equal((await save("beta", { connection_id: held.connection_id })).released_key, undefined);
    // alpha changes its key: the old one is still used by beta, so it is not named.
    assert.equal((await save("alpha", { api_key: second })).released_key, undefined);
    assert.equal((await connections()).length, 2);

    // beta is removed: the first key now has no model using it. It is pointed out, and still there.
    const removed = await fetch(`${origin}/api/settings/models/beta`, { method: "DELETE", headers: headers() });
    const removal = await removed.json() as { removed: boolean; released_key?: { connection_id: string; revision: string } };
    assert.equal(removal.removed, true);
    assert.equal(removal.released_key?.connection_id, held.connection_id);
    assert.equal((await connections()).length, 2);

    // alpha goes back to the first key, then changes key again: the second key is the one let go of.
    const back = await save("alpha", { connection_id: held.connection_id });
    const secondConnection = (await connections()).find((row) => row.connection_id !== held.connection_id)!;
    assert.equal(back.released_key?.connection_id, secondConnection.connection_id);
    assert.equal(back.released_key?.revision, secondConnection.revision);

    // Removing it goes through the connection's own removal, with the revision the save named.
    const stale = await fetch(`${origin}/api/settings/connectors/connections/${encodeURIComponent(secondConnection.connection_id)}/manage`, {
      method: "POST", headers: headers(), body: JSON.stringify({ action: "remove", expected_revision: "not-the-revision" }) });
    assert.notEqual(stale.status, 200);
    const gone = await fetch(`${origin}/api/settings/connectors/connections/${encodeURIComponent(secondConnection.connection_id)}/manage`, {
      method: "POST", headers: headers(), body: JSON.stringify({ action: "remove", expected_revision: back.released_key?.revision }) });
    assert.equal(gone.status, 200);
    assert.deepEqual((await connections()).map((row) => row.connection_id), [held.connection_id]);
    // alpha still runs on the key it uses.
    assert.equal((await save("alpha", {})).released_key, undefined);
  } finally {
    if (web.listening) await new Promise<void>((resolve) => web.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
