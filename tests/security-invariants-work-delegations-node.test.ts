import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentDelegationSubject } from "@molis-ai/molis-work-contracts/services/agent-host";

test("APR-11/ASC-51: real encrypted Node storage restores the current choice and an interrupted work ending", async t => {
  const storageRoot = await mkdtemp(join(tmpdir(), "delegation-node-"));
  const options = { app: { appId: "molis.delegation.test", appVersion: "1.0.0" }, storageRoot, modelConfiguration: async () => null };
  let adapter = await createPrologueNodeAdapter(options);
  t.after(async () => { await adapter.close(); await rm(storageRoot, { recursive: true, force: true }); });
  const subject: AgentDelegationSubject = { kind: "work", actor_id: "test-person", project_id: "project",
    executor: { plugin_id: "coding", install_id: "original-install", installation_generation: "original-generation", role_id: "coding" }, work: { owner_id: "coding", id: "original-session" } };
  const control = { beforeEffect: () => {}, assertCurrent: () => {} };
  const original = await adapter.delegations.grant(subject, { expected_version: 0, mode: "automatic", expires_at: null,
    scopes: [{ kind: "command-exact", workspace_id: "workspace", workspace_path: "/private/test-workspace", input_json: '{"args":["--check"],"command":"work-secret-command"}' }] }, control);
  await adapter.close(); adapter = await createPrologueNodeAdapter(options);
  const restored = await adapter.delegations.permission(subject);
  assert.equal(restored.mode, "automatic"); assert.equal(restored.automatic?.selection.id, original.selection_id);
  assert.equal(restored.automatic?.state.epoch, original.epoch);
  const rows = await adapter.delegations.list(); assert.equal(rows.length, 1);
  const kind = (await readdir(join(storageRoot, "records"))).find(name => name.startsWith("molis-work-delegation-"));
  assert.ok(kind);
  for (const name of await readdir(join(storageRoot, "records", kind))) {
    const bytes: Buffer = await readFile(join(storageRoot, "records", kind, name));
    assert.equal(bytes.includes(Buffer.from("work-secret-command")), false);
    assert.equal(bytes.includes(Buffer.from("test-person")), false);
  }
  await adapter.delegations.beginEnd(subject, original.epoch, "archived", control);
  await adapter.close(); adapter = await createPrologueNodeAdapter(options);
  const interrupted = await adapter.delegations.read(subject);
  assert.equal(interrupted?.lifecycle, "ending");
  await assert.rejects(adapter.delegations.permission(subject), /结束/);
  await assert.rejects(adapter.delegations.grant(subject, { expected_version: interrupted!.storage_version, mode: "automatic", scopes: [], expires_at: null }, control), /结束/);
  const ended = await adapter.delegations.finishEnd(subject, original.epoch, control);
  assert.equal(ended.lifecycle, "ended");
  await adapter.close(); adapter = await createPrologueNodeAdapter(options);
  await assert.rejects(adapter.delegations.ensureWork(subject, control), /结束/);
});
