import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHostObservation, directoryForHome, installHostUiText, removeMcpActionGrants, writeMcpActionGrant } from "@molis-ai/molis-work-app-local-host";
import { readRecords, snapshotText } from "@molis-ai/molis-work-service-observation";

installHostUiText();

// OCL-01, OCL-03 (specs/observation-collection/spec.md; design §4「授权与撤权」): a folder grant goes by deleting its row and an MCP grant
// is written over, so each grant given, changed or taken back is a work record: when, whose, and who changed it — the person at their
// call, or the Host tidying up after an uninstall or a folder that is no longer the one chosen.

const person = (project_id: string | null): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id, audience: "user", permissions: [] });

function homeWithRecords(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "observation-grants-"))), observation = createHostObservation(home);
  t.after(() => { observation.close(); rmSync(home, { recursive: true, force: true }); });
  const records = (fact: string) => { observation.layer.flush(); return readRecords(observation.layer.writer.database()!.db, { fact }); };
  return { home, observation, records };
}

test("OCL-01 OCL-03: each MCP grant turned on, changed, turned off or taken away is one record of who changed it; a write that changes nothing is none", async t => {
  const f = homeWithRecords(t);
  const grant = { client_id: "runtime:editor", project_id: "p1", capability_id: "notes.list", version: 1, provider_id: "notes", permissions: ["notes:read"], enabled: true };
  await writeMcpActionGrant(f.home, grant, person("p1"));
  await writeMcpActionGrant(f.home, grant, person("p1"));
  await writeMcpActionGrant(f.home, { ...grant, permissions: ["notes:read", "notes:write"] }, person("p1"));
  await writeMcpActionGrant(f.home, { ...grant, enabled: false }, person("p1"));
  await removeMcpActionGrants(f.home, row => row.client_id === "runtime:editor", { host_reason: "uninstalled" });
  const records = f.records("grants.mcp");
  assert.deepEqual(records.map(record => [record.stage, record.detail.enabled, record.detail.permissions, record.actor.actor_id, record.entry, record.detail.reason]), [
    ["granted", true, "notes:read", LOCAL_PERSON_ACTOR_ID, "workbench", undefined],
    ["changed", true, "notes:read,notes:write", LOCAL_PERSON_ACTOR_ID, "workbench", undefined],
    ["revoked", false, "notes:read", LOCAL_PERSON_ACTOR_ID, "workbench", undefined],
    ["revoked", false, "notes:read", "host", "host", "uninstalled"],
  ]);
  for (const record of records) {
    assert.deepEqual([record.owner, record.project_id, record.outcome], [{ kind: "service", id: "grants" }, "p1", "succeeded"]);
    assert.deepEqual(record.subjects, [{ kind: "action_client", id: "runtime:editor" }, { kind: "action", id: "notes.list", version: 1 }], "whose grant, for what");
  }
});

test("OCL-01 OCL-03: a folder grant given, taken back by the person, or taken by an uninstall is recorded one by one, with the folder chosen", async t => {
  const f = homeWithRecords(t), service = directoryForHome(f.home);
  const folders = ["first", "second", "third"].map(name => { const path = join(f.home, name); mkdirSync(path); return path; });
  const binding = { plugin_id: "io.molis.work.test.reader", project_id: null, actor_id: LOCAL_PERSON_ACTOR_ID, install_id: "reader-install",
    installation_generation: "g1", name: "Reader", assertCurrent() {} };
  const connected = service.connect(binding); t.after(() => connected.dispose());
  const choose = async (path: string) => (await service.select({ plugin_id: binding.plugin_id, project_id: null, actor_id: LOCAL_PERSON_ACTOR_ID },
    async () => ({ status: "picked", path })))!;
  const first = await choose(folders[0]!);
  assert.equal(service.revoke({ grant_id: first.grant_id }, person(null)), 1);
  const second = await choose(folders[1]!), third = await choose(folders[2]!);
  service.forgetInstallation(binding.install_id, null);
  const records = f.records("grants.directory");
  assert.deepEqual(records.map(record => [record.stage, record.subjects[0]?.id, record.actor.actor_id, record.detail.reason]), [
    ["granted", first.grant_id, LOCAL_PERSON_ACTOR_ID, undefined],
    ["revoked", first.grant_id, LOCAL_PERSON_ACTOR_ID, undefined],
    ["granted", second.grant_id, LOCAL_PERSON_ACTOR_ID, undefined],
    ["granted", third.grant_id, LOCAL_PERSON_ACTOR_ID, undefined],
    ["revoked", second.grant_id, "host", "uninstalled"],
    ["revoked", third.grant_id, "host", "uninstalled"],
  ], "each grant that went is its own record: its row is deleted");
  for (const record of records) {
    assert.deepEqual([record.owner, record.project_id, record.subjects[1], record.detail.install_id],
      [{ kind: "service", id: "grants" }, null, { kind: "plugin", id: binding.plugin_id }, "reader-install"]);
  }
  const folder = records[3]!.evidence.find(item => item.role === "folder")?.ref;
  assert.equal(folder?.kind, "snapshot");
  const store = f.observation.layer.writer.database()!;
  assert.equal(snapshotText(store.db, store.keys, folder.kind === "snapshot" ? folder.digest : ""), folders[2],
    "the folder chosen, kept after its grant's row is gone");
});
