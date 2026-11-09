// The Assistant's computer records and the MCP action version books are the person's data, and a Home that had them used to be refused by the
// offline snapshot as unknown (specs/upgrade-continuity/upgrade-chain-design.md §15.2). The owners' own classes write them where they can.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { changeMcpClientCredential, mcpClientCredentialPath, ComputerRecords, ComputerSettings, createHomeSnapshot, homeStores, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";

test("a Home with computer records and MCP action versions can be snapshotted, and the snapshot carries their bytes", async t => {
  const f = await smallSnapshotHome(t);
  const settings = new ComputerSettings(f.home), records = new ComputerRecords(f.home);
  settings.setEnabled(true);
  const record = records.start({ session_id: "session", run_id: null, project_id: null, goal: "the person's goal" });
  records.step(record.id, { kind: "look", app: null, summary: "looked" }, Buffer.from("screenshot bytes"));
  const external = await f.file("config/external-mcp-actions.json", '{"server":1}\n'), connector = await f.file("config/connector-mcp-actions.json", '{"tool":2}\n');

  const result = await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  assert.equal(result.status, "created");

  const manifest: HomeSnapshotManifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
  const files = new Map(manifest.stores.flatMap(store => store.entries).flatMap(entry => entry.kind === "file" ? [[entry.path, entry.payload_path] as const] : []));
  const sources = ["computer/settings.json", `computer/records/${record.id}/record.json`, `computer/records/${record.id}/001.png`];
  for (const path of sources) assert.deepEqual(await readFile(join(f.snapshot, files.get(path)!)), await readFile(join(f.home, path)), path);
  assert.deepEqual(await readFile(join(f.snapshot, files.get("config/external-mcp-actions.json")!)), await readFile(external));
  assert.deepEqual(await readFile(join(f.snapshot, files.get("config/connector-mcp-actions.json")!)), await readFile(connector));
  for (const path of ["computer", "config/external-mcp-actions.json", "config/connector-mcp-actions.json"]) assert.equal(homeStores().get(path)?.owner, "apps/local-host", path);
});

test("a top-level entry nobody registered is still refused as unknown", async t => {
  const f = await smallSnapshotHome(t);
  await f.file("nobody-registered-this/file.json");
  await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.unknown_data" });
});

test("D0071-05 a Home snapshot excludes independent MCP credentials and keeps the source registration intact", async t => {
  const f = await smallSnapshotHome(t);
  changeMcpClientCredential(f.home, "runtime:codex", "connect");
  const file = mcpClientCredentialPath(f.home, "runtime:codex"), before = await readFile(file, "utf8");
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  const manifest: HomeSnapshotManifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
  assert.equal(manifest.stores.flatMap(store => store.entries).some(entry => entry.path.startsWith("config/mcp-client-credentials")), false);
  assert.equal(await readFile(file, "utf8"), before);
});
