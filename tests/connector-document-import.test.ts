import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { ArtifactsModule, createArtifactsSchema, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { importLocalArtifactDocument } from "../apps/local-host/src/artifact-document-import.ts";

test("document import reads only the selected account, preserves provenance and blocks revoked reads", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-document-account-"));
  const db = new Database(":memory:");
  db.exec("CREATE TABLE boards(board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES('board');");
  createArtifactsSchema(db as unknown as ArtifactsSqliteDatabase);
  const artifacts = new ArtifactsModule({ db: db as unknown as ArtifactsSqliteDatabase, appendEvent: () => 1 });
  const ports = { boardId: "board", actorId: "fixture", routePrefix: "", artifacts };
  const calls: string[] = [];
  let revoke: (() => void) | undefined;
  let revokeAtMetadata = false;
  let beforeSave: (() => void | Promise<void>) | undefined;
  const guardedPorts = { ...ports, beforeSave: () => beforeSave?.() };
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization")!; calls.push(auth);
    if (!String(url).endsWith("/markdown")) {
      if (revokeAtMetadata) revoke?.();
      return Response.json({ object: "page", properties: {} });
    }
    revoke?.();
    return Response.json({ object: "page_markdown", markdown: `Read via ${auth}`, truncated: false, unknown_block_ids: [] });
  });
  try {
    await runWithMolisWorkHome(home, async () => {
      const [a, b] = withConnectorConnections(home, store => [
        store.createToken({ serviceId: "notion", displayName: "A", token: "fixture-account-a" }),
        store.createToken({ serviceId: "notion", displayName: "B", token: "fixture-account-b" }),
      ]);
      const input = { source: "notion", url: "https://notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
      await assert.rejects(importLocalArtifactDocument(input, ports), /多个账号/u);
      assert.equal(calls.length, 0);
      const imported = await importLocalArtifactDocument({ ...input, connection_id: b!.connection_id }, ports);
      assert.deepEqual(calls, ["Bearer fixture-account-b", "Bearer fixture-account-b"]);
      const saved = artifacts.query.getArtifactVersion("board", imported)!;
      assert.equal(saved.metadata.connection_id, b!.connection_id);
      const before = artifacts.query.listArtifacts("board");
      revoke = () => withConnectorConnections(home, store => { store.disconnect(b!.connection_id); });
      await assert.rejects(importLocalArtifactDocument({ ...input, connection_id: b!.connection_id }, ports), /读取期间连接/u);
      assert.deepEqual(artifacts.query.listArtifacts("board"), before);
      revoke = undefined;
      await assert.rejects(importLocalArtifactDocument({ ...input, connection_id: b!.connection_id }, ports), /所选连接不可用/u);
      assert.equal(withConnectorConnections(home, store => store.state(store.require(a!.connection_id))), "connected");
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      beforeSave = async () => { entered.resolve(); await release.promise; };
      const pending = importLocalArtifactDocument({ ...input, connection_id: a!.connection_id }, guardedPorts);
      const rejected = assert.rejects(pending, { code: "document.connection_revoked" });
      try {
        await entered.promise;
        withConnectorConnections(home, store => store.disconnect(a!.connection_id));
      } finally { release.resolve(); }
      await rejected;
      assert.deepEqual(artifacts.query.listArtifacts("board"), before, "connection changes during the final asynchronous guard must not commit");
      beforeSave = undefined;
      const c = withConnectorConnections(home, store => store.createToken({ serviceId: "notion", displayName: "C", token: "fixture-account-c" }));
      revokeAtMetadata = true;
      revoke = () => withConnectorConnections(home, store => store.disconnect(c.connection_id));
      const count = calls.length;
      await assert.rejects(importLocalArtifactDocument({ ...input, connection_id: c.connection_id }, guardedPorts), { code: "document.connection_revoked" });
      assert.equal(calls.length, count + 1, "disconnect after metadata prevents the following body request");
      assert.deepEqual(artifacts.query.listArtifacts("board"), before);
    });
  } finally { db.close(); rmSync(home, { recursive: true, force: true }); }
});
