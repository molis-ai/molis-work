import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createProjectGuidance, projectGuidanceReplica, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

// The project guidance's own sync collection (contract-design §9, batch 44 item 2): until batch 44 it travelled inside Goals'
// `project_goals`; now the platform carries it, so a second device has it whichever plugins either device's project enables.

const at = "2026-11-18T09:00:00.000Z";
const write = { reason: "项目边界", confirmation_summary: "用户确认", user_confirmed: true };

function library(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "guidance-sync-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.db"));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  writeProjectRoot(store.db, "p1", at);
  const guidance = createProjectGuidance({ db: store.db, journal: new LocalSqliteJournal(store.db), now: () => new Date(at),
    requestHash: value => createHash("sha256").update(canonicalJsonText(value)!).digest("hex") });
  return { db: store.db, guidance };
}

test("PEQ-01 the guidance collection carries entries and revisions, refuses a revoked selection, and keeps a changed revision as a conflict", t => {
  const from = library(t), to = library(t);
  const sender = projectGuidanceReplica(from.db, "p1", "same-space", () => undefined);
  let revoke = false;
  const receiver = projectGuidanceReplica(to.db, "p1", "same-space", () => {
    if (revoke) throw new ActionError("actions.forbidden", "sync selection revoked");
  });

  const added = from.guidance.add("p1", "person", { ...write, kind: "constraint", content: "保留源文件。", source_refs: [], idempotency_key: "add" });
  const first = sender.next()!;
  assert.ok(first, "a write marks the collection");
  receiver.receive({ ...first, revision: 1 });
  receiver.receive({ ...first, revision: 1 }, { retry: true });
  sender.acknowledge(first.key, first.operationId, 1);
  assert.deepEqual(to.guidance.read("p1").entries.map(entry => [entry.guidance_id, entry.revision, entry.content]), [[added.entry.guidance_id, 1, "保留源文件。"]]);
  assert.match(to.guidance.read("p1").runtime_prompt_prefix, /保留源文件/, "the second device starts its Runs with it");

  from.guidance.update("p1", "person", { ...write, guidance_id: added.entry.guidance_id, action: "edit", kind: "constraint", content: "保留源文件和备份。",
    idempotency_key: "edit" });
  const second = sender.next()!;
  revoke = true;
  assert.throws(() => receiver.receive({ ...second, revision: 2 }), { code: "actions.forbidden" });
  assert.equal(receiver.cursor(), 1);
  revoke = false;
  receiver.receive({ ...second, revision: 2 });
  const copied = to.guidance.read("p1");
  assert.deepEqual(copied.entries.map(entry => [entry.revision, entry.content]), [[2, "保留源文件和备份。"]]);
  assert.deepEqual(copied.revisions.map(revision => revision.revision).sort(), [1, 2], "every revision travels");

  // A revision is history: the same revision with other words is not applied, and the copy keeps what it had.
  const altered = structuredClone(second.value) as { revisions: Array<{ revision: number; content: string; content_hash: string }> };
  const changed = altered.revisions.find(revision => revision.revision === 2)!;
  changed.content = "另一段话。"; changed.content_hash = createHash("sha256").update(changed.content).digest("hex");
  receiver.receive({ ...second, base: 2, revision: 3, operationId: "changed", value: altered });
  assert.equal(receiver.conflicts().length, 1);
  assert.deepEqual(to.guidance.read("p1").revisions.find(revision => revision.revision === 2)?.content, "保留源文件和备份。");
});
