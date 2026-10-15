import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

// A-04 (code audit 2026-10-15): a call whose provider preparation fails is turned away before dispatch, and is settled like any other refusal.
test("A-04: a call refused while its providers are prepared leaves its call record, marked as not run", async t => {
  const home = await mkdtemp(join(tmpdir(), "prepare-refusal-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(() => rm(home, { recursive: true, force: true }));
  await host.close();
  const reference = { capability_id: "fixture.prepare_refused", version: 1 };
  await assert.rejects(host.homeActionClient().invoke({ actor_id: "web-user", audience: "user", permissions: [] }, reference, {}), { code: "host.closed" });
  const rows = host.callLog?.list(null).filter(row => row.capability_id === reference.capability_id) ?? [];
  assert.equal(rows.length, 1, "the refusal reaches the shared settlement, once");
  assert.deepEqual({ ok: rows[0]!.ok, code: rows[0]!.code, refused: rows[0]!.refused, actor: rows[0]!.actor_id }, { ok: false, code: "host.closed", refused: true, actor: "web-user" });
});
