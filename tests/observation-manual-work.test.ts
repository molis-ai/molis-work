import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { observationKeys, readRecords, snapshotText } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

// EC-01 (specs/observation-collection/eval-cases.md; OCL-01, OCL-03, OCL-05): pure manual work, no Assistant. The person writes a document,
// comes back to change it and reads it; each save is its own record with the words that save sent, so the later change never overwrites
// the earlier one's evidence. Reading back by version is batch 29's; this proves what is kept.

test("EC-01 OCL-05: each manual save of a document keeps that save's own words, joined to the document; a later save does not overwrite the earlier evidence", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Manual work", ["pages"]);
  const person = await home.host.localPersonContext(project.reference);
  const actions = bindActionClient(home.host.actionClient(project.reference), () => person);
  const { document } = await actions.invoke(pagesActions.create, { title: "周报", markdown: "第一节：周一写的初稿" });
  const read = await actions.invoke(pagesActions.get, { id: document.id });
  await actions.invoke(pagesActions.update, { id: document.id, expected_version: read.document.version, markdown: "第一节：周三改过的稿" });

  const layer = home.host.observation!.layer; layer.flush();
  // The Home's own evidence key, as the Host opens it: the bodies are sealed at rest.
  const keys = observationKeys(createLazyFileSecretStore(home.home), () => true);
  const calls = readRecords(layer.writer.database()!.db, { limit: 5000 }).filter(record => record.fact === "action.call" && record.detail.action?.toString().startsWith("pages."));
  assert.deepEqual(calls.map(record => [record.detail.action, record.outcome, record.entry, record.source_class]),
    [["pages.create@1", "succeeded", "workbench", "real"], ["pages.get@1", "succeeded", "workbench", "real"], ["pages.update@1", "succeeded", "workbench", "real"]]);
  assert.ok(calls.every(record => record.actor.actor_id === person.actor_id && record.project_id === project.project_id));
  const input = (record: (typeof calls)[number]) => {
    const ref = record.evidence.find(item => item.role === "input")?.ref;
    assert.equal(ref?.kind, "snapshot", String(record.detail.action));
    return snapshotText(layer.writer.database()!.db, keys, ref.kind === "snapshot" ? ref.digest : "");
  };
  assert.match(input(calls[0]!), /周一写的初稿/u, "Monday's words, as that save sent them");
  assert.match(input(calls[2]!), /周三改过的稿/u, "Wednesday's change is its own evidence");
  assert.doesNotMatch(input(calls[0]!), /周三/u, "the later save did not overwrite the earlier one's evidence");
  assert.ok(calls.every(record => record.work.call_id) && new Set(calls.map(record => record.work.call_id)).size === 3, "three operations, each its own call");
});
