import assert from "node:assert/strict";
import test from "node:test";
import { codingResultDocument } from "@molis-ai/molis-work-plugin-coding/contract";
import { codingManifest, codingOutputReferences, codingOutputs } from "@molis-ai/molis-work-plugin-coding";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  CHANGESET_REFERENCE, CHANGE_SET_MARKDOWN, CODING_PLUGIN, PROJECT_ID, REPORT_BODY, REPORT_REFERENCE,
  callerFor, changeSetRecord, codingDocumentHandler, fakePlatform, reportOf, reportRecord, startContext,
} from "./fixtures/coding-results.js";

/**
 * Coding turns its own fixed results into text for a plugin that takes a copy (Shelf), and lists its own outputs through the platform
 * (specs/coding-plugin 验收 W5-01-CODING-01..06; the host composes neither any more).
 */

const CODING_TYPES = new Set(["coding.report.v1", "coding.changeset.v1", "coding.plan.v1"]);
const ask = async (platform: ReturnType<typeof fakePlatform>, reference: { artifact_id: string; version: number }) =>
  codingDocumentHandler(platform).handle(callerFor(), { reference });
const refused = (code: string) => (error: unknown) => { assert.equal((error as { code?: string }).code, code); return true; };

test("W5-01-CODING-01 the text action is a plugin-only query that reads artifacts, declared beside the untouched preview", () => {
  const { action } = codingResultDocument;
  assert.deepEqual([codingResultDocument.capability_id, codingResultDocument.version, codingResultDocument.operation], ["coding.results.document", 1, "query"]);
  assert.deepEqual(action.audiences, ["plugin"], "neither the person, an Agent, a workflow nor an MCP client can pick it");
  assert.deepEqual(action.permissions, ["artifact:read"]);
  assert.equal(action.scope, "project");
  assert.equal(action.kind, "query");
  assert.deepEqual(Object.keys((action.output_schema as { properties: object }).properties).sort(), ["markdown", "reference", "saved_at", "title"]);
  assert.ok(codingManifest.actions?.some(row => Object.is(row, codingResultDocument)), "Coding declares the very definition the contract exports, not a copy of it");
  const manifest = parsePluginManifest(JSON.parse(JSON.stringify(codingManifest)));
  const declared = manifest.actions?.filter(row => row.capability_id === "coding.results.document");
  assert.deepEqual(declared?.map(row => row.version), [1]);
  const preview = manifest.artifacts.produces.find(row => row.artifact_type_id === "coding.report.v1")?.preview;
  assert.deepEqual(preview && { capability_id: preview.capability_id, version: preview.version }, { capability_id: "coding.artifacts.preview", version: 1 },
    "the report's preview action keeps its id and version");
  assert.ok(manifest.actions?.some(row => row.capability_id === "coding.artifacts.preview" && row.version === 1));
});

test("W5-01-CODING-02 a fixed report is answered as its own Markdown, byte for byte", async () => {
  const platform = fakePlatform({ artifacts: [reportRecord()] }, CODING_TYPES);
  assert.deepEqual(await ask(platform, REPORT_REFERENCE), { reference: REPORT_REFERENCE, title: "已固定的原报告", saved_at: "2026-10-20T08:30:00.000Z", markdown: REPORT_BODY });
});

test("W5-01-CODING-03 a fixed change set is answered as each file's reviewed text before and after, with what became of the write", async () => {
  const platform = fakePlatform({ processItems: [changeSetRecord()] }, CODING_TYPES);
  assert.deepEqual(await ask(platform, CHANGESET_REFERENCE), { reference: CHANGESET_REFERENCE, title: "这一轮的固定变更", saved_at: "2026-10-20T08:30:00.000Z", markdown: CHANGE_SET_MARKDOWN });
  const empty = changeSetRecord({ payload: { scope: "run-frozen", run_id: "run-1", applied: false, files: [], origin: { session_id: "session-a", runtime_session_id: "r", workspace_id: "w", workspace_name: "n" } } });
  const none = await ask(fakePlatform({ processItems: [empty] }, CODING_TYPES), CHANGESET_REFERENCE) as { markdown: string };
  assert.equal(none.markdown, "这一轮没有可读取的文本审查；命令及外部操作请查看原回执。");
});

test("W5-01-CODING-04 archived, other-project, other-kind, forged and unavailable versions are refused in Coding's own code", async () => {
  const code = "coding.shelf_material_invalid";
  const held = (over: Parameters<typeof reportRecord>[0]) => fakePlatform({ artifacts: [reportRecord(over)] }, CODING_TYPES);
  await assert.rejects(ask(held({ lifecycle_state: "archived" }), REPORT_REFERENCE), refused(code));
  await assert.rejects(ask(held({ project_id: "another-project" }), REPORT_REFERENCE), refused(code));
  await assert.rejects(ask(held({ availability: "unavailable", unavailable_reason: "原正文失效" }), REPORT_REFERENCE), refused(code));
  await assert.rejects(ask(held({ artifact_type_id: "coding.plan.v1" }), REPORT_REFERENCE), refused(code), "a Coding version of another kind is not a report");
  await assert.rejects(ask(held({ producer_binding_signature: "unofficial" }), REPORT_REFERENCE), refused(code));
  // The identity inside must agree with the reference the record is held under.
  const forged = reportRecord({ payload: { title: "伪造", run_id: "other-run", source: { session_id: "session-a" }, body_markdown: "x" } });
  await assert.rejects(ask(fakePlatform({ artifacts: [forged] }, CODING_TYPES), REPORT_REFERENCE), refused(code));
  await assert.rejects(ask(fakePlatform({ processItems: [changeSetRecord({ lifecycle_state: "archived" })] }, CODING_TYPES), CHANGESET_REFERENCE), refused(code));
  await assert.rejects(ask(fakePlatform({}, CODING_TYPES), REPORT_REFERENCE), refused(code), "a version the project does not hold");
  await assert.rejects(ask(held({ lifecycle_state: "archived" }), REPORT_REFERENCE), { message: /原成果已归档或不属于当前项目/ }, "the person is told in words");
});

test("W5-01-CODING-05 a version another producer pinned is refused by the platform before Coding looks at it", async () => {
  const other = reportRecord({ producer_plugin_id: "io.molis.work.other" });
  await assert.rejects(ask(fakePlatform({ artifacts: [other] }, CODING_TYPES), REPORT_REFERENCE), refused("artifacts.plugin_denied"));
  await assert.rejects(ask(fakePlatform({ processItems: [changeSetRecord({ producer_plugin_id: "io.molis.work.other" })] }, CODING_TYPES), CHANGESET_REFERENCE), refused("artifacts.plugin_denied"));
});

test("W5-01-CODING-06 Coding lists its own outputs by type through the platform, with no host port", () => {
  const second = reportOf("session-b", "run-2");
  const archived = reportOf("session-c", "run-3", { lifecycle_state: "archived" });
  const foreign = reportOf("session-d", "run-4", { producer_plugin_id: "io.molis.work.other" });
  const other = reportRecord({ artifact_id: "other-report:x", artifact_type_id: "other.report.v1" });
  const plan = changeSetRecord({ artifact_id: "coding-plan:session-a:run-1", artifact_type_id: "coding.plan.v1" });
  const platform = fakePlatform({ artifacts: [reportRecord(), second, archived, foreign, other], processItems: [changeSetRecord(), plan] }, new Set([...CODING_TYPES, "other.report.v1"]));
  // Only the platform's services: this is all Coding's context carries, so there is no port a host could have been asked for the lists.
  const context = startContext(CODING_PLUGIN, { artifacts: platform.artifacts(CODING_PLUGIN), processItems: platform.processItems(CODING_PLUGIN) });
  assert.equal(context.project_id, PROJECT_ID);
  assert.deepEqual(codingOutputReferences(context, "coding.report.v1").map(row => row.artifact_id), [REPORT_REFERENCE.artifact_id, "coding-report:session-b:run-2"],
    "the archived version and another producer's version of the same type are not Coding's current outputs");
  assert.deepEqual(codingOutputReferences(context, "coding.changeset.v1"), [CHANGESET_REFERENCE]);
  assert.deepEqual(codingOutputReferences(context, "coding.plan.v1").map(row => row.artifact_id), ["coding-plan:session-a:run-1"]);
  assert.deepEqual(codingOutputReferences(context, "coding.diagram.v1"), [], "a type nothing was pinned under");
  // One listing and one read per listed version, however many kinds are asked for: the page refreshes these while a session is open.
  const calls = { list: 0, read: 0 }, client = platform.artifacts(CODING_PLUGIN);
  const counted = startContext(CODING_PLUGIN, { processItems: platform.processItems(CODING_PLUGIN), artifacts: { ...client,
    listConsumable: () => { calls.list++; return client.listConsumable(); }, read: reference => { calls.read++; return client.read(reference); } } });
  const outputs = codingOutputs(counted, ["coding.report.v1", "coding.changeset.v1", "coding.plan.v1"]);
  assert.deepEqual(outputs.map(output => output.reference.artifact_id),
    [REPORT_REFERENCE.artifact_id, "coding-report:session-b:run-2", CHANGESET_REFERENCE.artifact_id, "coding-plan:session-a:run-1"]);
  assert.equal(outputs[0]?.record.artifact_id, REPORT_REFERENCE.artifact_id, "the version read for the listing comes with it, so a route does not read it again");
  assert.deepEqual(calls, { list: 1, read: 5 }, "another producer's report is read once to be left out; the archived one is not listed at all");
});
