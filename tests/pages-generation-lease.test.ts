import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { generatePagesFromMaterials, ownPagesStores } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore, openPartitionLibraryDatabase } from "./fixtures/plugin-home-stores.js";

const record = { request_id: "lease-1", project_id: "a", request_hash: "hash", status: "running" as const, document_id: null, inputs: [], instructions: "Keep", title: "Lease", error: null, updated_at: new Date().toISOString() };

test("a running generation from another process keeps its lease; an ended attempt of this process is taken over at once", t => {
  const home = mkdtempSync(join(tmpdir(), "pages-generation-lease-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = openPagesStore(home, record.project_id);
  try {
    const mine = store.beginGeneration(record);
    // Still in progress here: a second call is told it is still generating.
    assert.throws(() => store.beginGeneration(record), /仍在生成/);
    // This call ended without writing (cancelled or refused): the next call takes the request over.
    store.releaseGenerationAttempt(mine);
    const next = store.beginGeneration(record);
    assert.notEqual(next.updated_at, mine.updated_at);
    // An attempt this process never started (another process, or a restart) keeps the lease until it ages out.
    const foreign = new Date(Date.now() + 1000).toISOString();
    const db = openPartitionLibraryDatabase(home, record.project_id, "pages");
    try { db.prepare("UPDATE page_generations SET updated_at = ?, record_json = json_set(record_json, '$.updated_at', ?) WHERE request_id = ?").run(foreign, foreign, "lease-1"); }
    finally { db.close(); }
    assert.throws(() => store.beginGeneration(record), /仍在生成/);
    const aged = new Date(Date.now() - 181_000).toISOString();
    const again = openPartitionLibraryDatabase(home, record.project_id, "pages");
    try { again.prepare("UPDATE page_generations SET updated_at = ?, record_json = json_set(record_json, '$.updated_at', ?) WHERE request_id = ?").run(aged, aged, "lease-1"); }
    finally { again.close(); }
    assert.equal(store.beginGeneration(record).status, "running");
  } finally { store.close(); }
});

test("releasing a reopened Home attempt cannot release the same request in another Home", t => {
  const homeA = mkdtempSync(join(tmpdir(), "pages-home-a-")), homeB = mkdtempSync(join(tmpdir(), "pages-home-b-"));
  t.after(() => { rmSync(homeA, { recursive: true, force: true }); rmSync(homeB, { recursive: true, force: true }); });
  t.mock.method(Date, "now", () => Date.parse("2026-09-28T12:00:00.000Z"));
  const first = openPagesStore(homeA, record.project_id), second = openPagesStore(homeB, record.project_id);
  const a = first.beginGeneration(record), b = second.beginGeneration(record);
  assert.equal(a.updated_at, b.updated_at);
  first.close();
  const reopened = openPagesStore(homeA, record.project_id);
  try {
    reopened.releaseGenerationAttempt(a);
    assert.throws(() => second.beginGeneration(record), /仍在生成/);
    assert.notEqual(reopened.beginGeneration(record).updated_at, a.updated_at);
    assert.equal(second.generation(record.request_id)?.updated_at, b.updated_at);
  } finally { reopened.close(); second.close(); }
});

test("RAC-1858: a failed generation's note keeps 500 whole characters, never half of one", t => {
  // failGeneration cuts the message it records at 500. One 🟢 is one character but two UTF-16 units.
  const home = mkdtempSync(join(tmpdir(), "pages-generation-fail-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = openPagesStore(home, record.project_id);
  try {
    const wide = (count: number) => "🟢".repeat(count);
    const failed = (request_id: string, message: string) => {
      store.failGeneration(store.beginGeneration({ ...record, request_id }), message);
      return store.generation(request_id);
    };
    const whole = failed("fail-whole", wide(500));
    assert.equal(whole?.status, "failed");
    assert.equal(whole?.error, wide(500), "a note of exactly 500 characters is kept whole");
    assert.equal(failed("fail-cut", "错" + wide(500))?.error, "错" + wide(499), "a longer one is cut to its first 500 whole characters");
  } finally { store.close(); }
});

test("F-pm3-14: actions.configuration_changed writes no failed status (S-18) and releases the attempt lease for immediate retry", async t => {
  const home = mkdtempSync(join(tmpdir(), "pages-generation-config-changed-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = openPagesStore(home, record.project_id);
  const stores = ownPagesStores(run => run(store));
  const caller = { beforeEffect: async () => {} };
  try {
    const req1 = { ...record, request_id: "cfg-changed-during-model" };
    await assert.rejects(
      generatePagesFromMaterials(stores, caller, req1, async () => {
        throw new ActionError("actions.configuration_changed", "生成期间模型已切换");
      }),
      { code: "actions.configuration_changed" },
    );
    assert.equal(store.generation(req1.request_id)?.status, "running");
    assert.equal(store.list().length, 0);
    const recovered1 = await generatePagesFromMaterials(stores, caller, req1, async () => ({
      text: "Recovered after model switch",
      validateResult() {},
    }));
    assert.equal(recovered1.replayed, false);
    assert.equal(store.generation(req1.request_id)?.status, "completed");

    const req2 = { ...record, request_id: "cfg-changed-during-validate" };
    await assert.rejects(
      generatePagesFromMaterials(stores, caller, req2, async () => ({
        text: "Stale draft",
        validateResult() { throw new ActionError("actions.configuration_changed", "提交前模型已切换"); },
      })),
      { code: "actions.configuration_changed" },
    );
    assert.equal(store.generation(req2.request_id)?.status, "running");
    assert.equal(store.list().length, 1);
    const recovered2 = await generatePagesFromMaterials(stores, caller, req2, async () => ({
      text: "Recovered after commit validation refusal",
      validateResult() {},
    }));
    assert.equal(recovered2.replayed, false);
    assert.equal(store.generation(req2.request_id)?.status, "completed");
  } finally { store.close(); }
});

test("F-pm3-14: a refused write inside fail() still releases the attempt lease instead of locking retries for 180s", async t => {
  const home = mkdtempSync(join(tmpdir(), "pages-generation-fail-write-refused-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = openPagesStore(home, record.project_id);
  const stores = ownPagesStores(run => run(store));
  let checks = 0;
  const revokingCaller = {
    beforeEffect: async () => {
      checks += 1;
      // Call 1: beginGeneration write, Call 2: refusedEnds() inside fail(), Call 3: failGeneration write.
      if (checks === 3) throw new ActionError("actions.revoked", "Revoked");
    },
  };
  try {
    const req = { ...record, request_id: "fail-write-revoked" };
    await assert.rejects(
      generatePagesFromMaterials(stores, revokingCaller, req, async () => { throw new Error("model timeout"); }),
      { code: "actions.revoked" },
    );
    assert.equal(store.generation(req.request_id)?.status, "running");
    const recovered = await generatePagesFromMaterials(stores, { beforeEffect: async () => {} }, req, async () => ({
      text: "Recovered immediately after revoked failure write",
      validateResult() {},
    }));
    assert.equal(recovered.replayed, false);
    assert.equal(store.generation(req.request_id)?.status, "completed");
  } finally { store.close(); }
});
