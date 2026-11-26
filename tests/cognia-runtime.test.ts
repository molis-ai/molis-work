import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { COGNIA_PLUGIN_ID, COGNIA_ACTION_PERMISSIONS, cogniaActions as actions } from "@molis-ai/molis-work-plugin-cognia";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { deferred, partitionInstallation, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const root = "/api/plugins/io.molis.work.cognia/library";

// Since batch 108 each partition keeps its own Cognia library (specs/unified-partition-plugins §4.2): what one project imports, another does not reach.
test("RAC-37 RAC-40 RAC-41: a 32 MB batch previews, cancels and commits through one partition's library; another project does not reach it", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), one = await f.project("Knowledge one", ["cognia"]), two = await f.project("Knowledge two", ["cognia"]);
  const first = `/projects/${one.project_id}${root}`, second = `/projects/${two.project_id}${root}`;
  const post = (path: string, body: object) => f.request(path, { method: "POST", body });
  const binary = Buffer.alloc(8_000_000, 71);
  const input = { kind: "markdown", name: "32 MB", files: [0, 1, 2, 3].map(index => ({ path: `attachment-${index}.pdf`, data: binary.toString("base64") })) };
  const previewResponse = await post(first + "/import/preview", input);
  assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
  const cancelled = (await previewResponse.json()).preview;
  assert.equal(cancelled.entries.length, 4); assert.ok(cancelled.entries.every((entry: { status: string }) => entry.status === "new"));
  assert.equal((await post(second + "/import/cancel", { preview_id: cancelled.id })).status, 200, "cancelling what another project's library does not have changes nothing");
  assert.equal((await post(first + "/import/cancel", { preview_id: cancelled.id })).status, 200);
  assert.equal((await post(first + "/import/commit", { preview_id: cancelled.id })).status, 404);
  assert.deepEqual((await (await f.request(first)).json()).materials, []);
  const preview = (await (await post(first + "/import/preview", input)).json()).preview;
  assert.equal((await post(second + "/import/commit", { preview_id: preview.id })).status, 404);
  const response = await post(first + "/import/commit", { preview_id: preview.id });
  assert.equal(response.status, 200, await response.clone().text()); const receipt = await response.json(); assert.equal(receipt.receipt.added, 4);
  assert.deepEqual(await (await post(first + "/import/commit", { preview_id: preview.id })).json(), receipt);
  const view = await (await f.request(first)).json();
  assert.equal(view.materials.length, 4); assert.deepEqual((await (await f.request(second)).json()).materials, []);
  const downloaded = await f.request(first + `/materials/${view.materials[0].id}/download`);
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), binary);
  const reopened = openCogniaStore(f.home, one.project_id), other = openCogniaStore(f.home, two.project_id);
  try { assert.equal(reopened.materials().length, 4); assert.deepEqual(reopened.commit(preview.id), receipt.receipt); assert.equal(other.materials().length, 0); }
  finally { reopened.close(); other.close(); }
});

for (const mode of ["stop", "revoke", "restart", "caller-revoke", "cancel", "delete-domain"] as const) {
  test(`RAC-42: Cognia ${mode} refuses the late draft; recovery and reopened library retain fixed evidence`, { timeout: 60_000 }, async t => {
    const entered = deferred(), release = deferred(); let calls = 0, allowed = true;
    const f = await serveHomeRuntime(t, { completeText: async (_prompt, options) => {
      assert.equal(options?.timeoutMs, 180_000);
      if (++calls === 1) { entered.resolve(); await release.promise; }
      return "# Knowledge\nFixed evidence [S1]";
    } });
    const space = await f.personal(["cognia"]);
    assert.equal((await f.request(`/projects/${space.project_id}${root}`)).status, 200, "the personal space's Cognia is running");
    const caller = person(COGNIA_ACTION_PERMISSIONS, space.project_id), client = f.host.actionClient(space.reference), bound = bindActionClient(client, () => caller);
    const { domain } = await bound.invoke(actions.createDomain, { name: "Sources" });
    const { material } = await bound.invoke(actions.createMaterial, { title: "Source", body: "Fixed evidence", domain_id: domain.id });
    const abort = new AbortController();
    const pending = client.invoke({ ...caller, signal: abort.signal, assert_authority_current: () => { if (!allowed) throw new Error("caller revoked"); } }, actions.synthesize, { material_ids: [material.id] });
    const refused = assert.rejects(pending);
    try {
      await entered.promise;
      const { platform, install: installation } = await partitionInstallation(f.host, space, COGNIA_PLUGIN_ID);
      if (mode === "stop") await platform.runtime.stop(installation.install_id);
      else if (mode === "revoke") platform.supervisor.revoke(COGNIA_PLUGIN_ID);
      else if (mode === "restart") assert.equal((await platform.supervisor.restart(COGNIA_PLUGIN_ID)).status, "running");
      else if (mode === "caller-revoke") allowed = false;
      else if (mode === "cancel") abort.abort();
      else await bound.invoke(actions.deleteDomain, { id: domain.id });
      release.resolve(); await refused;
      const reopened = openCogniaStore(f.home, space.project_id);
      try { assert.deepEqual(reopened.drafts(), []); assert.equal(reopened.read(material.id, 1).body, "Fixed evidence"); }
      finally { reopened.close(); }
      if (mode === "stop") assert.equal((await platform.supervisor.restart(COGNIA_PLUGIN_ID)).status, "running");
      if (mode === "revoke") assert.equal((await platform.supervisor.enable(COGNIA_PLUGIN_ID)).status, "running");
      allowed = true;
      const { draft } = await bound.invoke(actions.synthesize, { material_ids: [material.id] });
      assert.equal(draft.references[0]!.body, "Fixed evidence");
      assert.equal((await bound.invoke(actions.workspace, {})).materials.length, 1, "generation leaves a draft until explicit adoption");
      const saved = await bound.invoke(actions.saveDraft, { id: draft.id });
      assert.deepEqual(await bound.invoke(actions.saveDraft, { id: draft.id }), saved);
      assert.equal((await bound.invoke(actions.workspace, {})).materials.length, 2);
    } finally { release.resolve(); await refused; }
  });
}

test("RAC-42: closing a Cognia HTTP generation cancels its model request and keeps the draft library unchanged", { timeout: 60_000 }, async t => {
  const entered = deferred(), release = deferred(), cancelled = deferred(); let calls = 0;
  const f = await serveHomeRuntime(t, { completeText: async (_prompt, options) => {
    if (++calls === 1) {
      assert.ok(options?.signal); options.signal.addEventListener("abort", cancelled.resolve, { once: true });
      entered.resolve(); await release.promise;
    }
    return "# Recovered\nThe source remains [S1]";
  } });
  const space = await f.personal(["cognia"]), path = `/projects/${space.project_id}${root}`;
  assert.equal((await f.request(path)).status, 200, "the personal space's Cognia is running");
  const caller = person(COGNIA_ACTION_PERMISSIONS, space.project_id), bound = bindActionClient(f.host.actionClient(space.reference), () => caller);
  const { material } = await bound.invoke(actions.createMaterial, { title: "Source", body: "Original source" });
  const abort = new AbortController();
  const pending = f.request(path + "/ai", { method: "POST", body: { mode: "synthesize", material_ids: [material.id] }, signal: abort.signal });
  const refused = assert.rejects(pending, { name: "AbortError" });
  try {
    await entered.promise; abort.abort(); await refused; await cancelled.promise;
    release.resolve();
    const recovered = await bound.invoke(actions.synthesize, { material_ids: [material.id] });
    const reopened = openCogniaStore(f.home, space.project_id);
    try { assert.deepEqual(reopened.drafts().map(row => row.id), [recovered.draft.id]); assert.equal(reopened.materials().length, 1); }
    finally { reopened.close(); }
  } finally { release.resolve(); abort.abort(); await refused; }
});
