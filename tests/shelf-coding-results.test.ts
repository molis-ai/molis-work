import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { codingResultDocument } from "@molis-ai/molis-work-plugin-coding/contract";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { shelfManifest, shelfRuntimeActions } from "@molis-ai/molis-work-module-shelf/surface";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  CHANGESET_REFERENCE, CHANGE_SET_MARKDOWN, PROJECT_ID, PROJECT_PATH, REPORT_BODY, REPORT_REFERENCE,
  callerFor, changeSetRecord, fakePlatform, handlerOf, reportOf, reportRecord, startShelf,
} from "./fixtures/coding-results.js";

/**
 * What Shelf makes of a Coding result once the host composes nothing: the version is read as Shelf, its text is Coding's own answer to a
 * consumed action, and Shelf adds its heading, source and fingerprint (specs/coding-plugin 验收 W5-01-CODING-07..12).
 */

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONSUMED = new Set(
  [...shelfManifest.artifacts.consumes, ...(shelfManifest.process_items?.consumes ?? [])].map(({ artifact_type_id }) => artifact_type_id),
);
const owner = callerFor({ audience: "user" });
const heading = (title: string, id: string) => `# ${title}\n\n这是 Coding 固定成果的 Shelf 副本，不代表当前工作区状态或目标验收。编辑副本不改变原成果。\n来源：${id} v1\n保存时间：2026-10-20T08:30:00.000Z\n\n`;
const source = (reference: typeof REPORT_REFERENCE, content_hash: string) => ({ project_id: PROJECT_ID, project_path: PROJECT_PATH, reference, producer_plugin_id: "io.molis.work.coding", content_hash });

async function preview(platform: ReturnType<typeof fakePlatform>, reference: typeof REPORT_REFERENCE) {
  const { handlers } = await startShelf(platform);
  return handlerOf(handlers, shelfRuntimeActions.preview).handle(owner, { reference });
}

// The expectations below are fixed values: they were taken from the host's own composition (`codingShelfMaterial`) on these same fixtures
// before it was deleted, and the new path matched it byte for byte, key order included (the fingerprint hashes the source object's text).
test("W5-01-CODING-07 the preview of a fixed report is the very copy the host used to compose: heading, source and fingerprint", async () => {
  const platform = fakePlatform({ artifacts: [reportRecord()] }, CONSUMED);
  const copy = await preview(platform, REPORT_REFERENCE);
  assert.deepEqual(copy, {
    title: "已固定的原报告",
    text: heading("已固定的原报告", "coding-report:session-a:run-1") + REPORT_BODY,
    source: source(REPORT_REFERENCE, "2903e1e56689b2bf03ed6d8543af273f95834aab8604a2eddf1ad9033af7d617"),
    fingerprint: "3e71fc1430d439b648ad4d8ebedcd648a807d6fb9ec2517d386a4ff1689a737c",
  });
  assert.deepEqual(Object.keys((copy as { source: object }).source), ["project_id", "project_path", "reference", "producer_plugin_id", "content_hash"]);
});

test("W5-01-CODING-08 the preview of a fixed change set is the very copy the host used to compose, down to the fence lengths", async () => {
  const platform = fakePlatform({ processItems: [changeSetRecord()] }, CONSUMED);
  assert.deepEqual(await preview(platform, CHANGESET_REFERENCE), {
    title: "这一轮的固定变更",
    text: heading("这一轮的固定变更", "coding-changeset:session-a:run-1") + CHANGE_SET_MARKDOWN,
    source: source(CHANGESET_REFERENCE, "9d6065d0946a3b148e32150f7b5d890d73b69f987debcc627292d0017cfd2f7e"),
    fingerprint: "f01017348b1a2f77d37568ea62dfa0a0164d24bed8b1ea5018a29135b79a5b1e",
  });
});

test("W5-01-CODING-09 Audit #10 Coding declares the artifact-document role and Shelf discovers it through actions:invoke without pinning Coding's action id", () => {
  // The definition lives in Coding (`@molis-ai/molis-work-plugin-coding/contract`, PG-111) and tags the artifact-document role; Shelf discovers it via `actions:invoke` (`services.actions.dependencies`, Audit #10).
  assert.ok(codingManifest.actions?.some(row => Object.is(row, codingResultDocument)), "Coding's Manifest declares the contract's definition");
  const manifest = parsePluginManifest(JSON.parse(JSON.stringify(shelfManifest)));
  assert.deepEqual(manifest.capabilities.consumes, []);
  assert.ok(manifest.permissions.some(row => row.permission === "actions:invoke" && row.required), "Shelf requires actions:invoke for role discovery");
  for (const permission of codingResultDocument.action.permissions) {
    assert.ok(manifest.permissions.some(row => row.permission === permission && row.required), `Shelf's Manifest requires ${permission}`);
  }
  assert.deepEqual(shelfRuntimeActions.preview.action.audiences, ["user", "agent", "workflow", "mcp"], "Shelf's own actions are not changed");
});

test("SCC-03 W5-01-CODING-10 Shelf uses the platform's consumable list for the caller's project, and skips candidates with no usable text", async () => {
  const second = reportOf("session-b", "run-2");
  const foreign = reportOf("session-d", "run-4", { producer_plugin_id: "io.molis.work.other" });
  const archived = reportOf("session-c", "run-3", { lifecycle_state: "archived" });
  const plan = changeSetRecord({ artifact_id: "coding-plan:session-a:run-1", artifact_type_id: "coding.plan.v1" });
  const platform = fakePlatform({ artifacts: [reportRecord(), second, foreign, archived], processItems: [changeSetRecord(), plan] }, CONSUMED);
  assert.equal(shelfManifest.ports, undefined, "Shelf wires no ports: it lists what the caller's project holds");
  const { handlers, asked } = await startShelf(platform);
  const listed = await handlerOf(handlers, shelfRuntimeActions.results).handle(owner, {});
  // The project's 成果库 versions first, then its process items, each in the order the platform lists them.
  assert.deepEqual(listed, { results: [
    { reference: REPORT_REFERENCE, title: "已固定的原报告" },
    { reference: { artifact_id: second.artifact_id, version: second.version }, title: "报告 run-2" },
    { reference: CHANGESET_REFERENCE, title: "这一轮的固定变更" },
  ] });
  // A candidate is asked about once; the plan type is not one Shelf consumes, an archived version is not listed, and a foreign producer with no registered role provider is skipped without asking Coding.
  assert.deepEqual(asked, Array(3).fill("coding.results.document@1"), "report, the second report, and change set, each once");
});

test("W5-01-CODING-11 a refusal of the platform or of Coding reaches the person in its own code, and a missing version is Shelf's own", async () => {
  const code = (platform: ReturnType<typeof fakePlatform>, reference: typeof REPORT_REFERENCE) => preview(platform, reference).then(() => "none", (error: { code?: string }) => error.code);
  assert.equal(await code(fakePlatform({ artifacts: [reportRecord({ lifecycle_state: "archived" })] }, CONSUMED), REPORT_REFERENCE), "artifacts.plugin_incompatible", "archived");
  assert.equal(await code(fakePlatform({ artifacts: [reportRecord({ availability: "unavailable", unavailable_reason: "原正文失效" })] }, CONSUMED), REPORT_REFERENCE), "artifacts.plugin_incompatible", "unavailable");
  assert.equal(await code(fakePlatform({}, CONSUMED), REPORT_REFERENCE), "shelf.unavailable", "another project's version is not in this project's store");
  assert.equal(await code(fakePlatform({ artifacts: [reportRecord({ producer_plugin_id: "io.molis.work.other" })] }, CONSUMED), REPORT_REFERENCE), "shelf.unavailable", "another producer without a document/preview role");
  const forged = reportRecord({ payload: { title: "伪造", run_id: "other-run", source: { session_id: "session-a" }, body_markdown: "x" } });
  assert.equal(await code(fakePlatform({ artifacts: [forged] }, CONSUMED), REPORT_REFERENCE), "coding.shelf_material_invalid", "not a Coding report of that session and round");
  const other = changeSetRecord({ artifact_id: "coding-changeset:session-a:other-run" });
  assert.equal(await code(fakePlatform({ processItems: [other] }, CONSUMED), { artifact_id: other.artifact_id, version: 1 }), "coding.shelf_material_invalid", "a change set whose round is not the one its identity names");
});

test("W5-01-CODING-12 the host no longer composes the boundary: no file, no Shelf port, no Coding list port", () => {
  assert.equal(existsSync(join(REPOSITORY, "apps/local-host/src/coding-shelf-material.ts")), false);
  const assembly = readFileSync(join(REPOSITORY, "apps/local-host/src/project-plugins.ts"), "utf8");
  for (const name of ["codingShelfMaterial", "coding-shelf-material", "reportReferences", "changeSetReferences", "planReferences"]) {
    assert.ok(!assembly.includes(name), `project-plugins.ts still mentions ${name}`);
  }
  const ports = readFileSync(join(REPOSITORY, "modules/shelf/src/surface/runtime-actions.ts"), "utf8");
  assert.doesNotMatch(ports, /ShelfResultPorts|projectPath\(/, "the plugin needs no host-composed ports");
  assert.match(ports, /services\?\.actions\?\.dependencies;[\s\S]*dependencies\.invoke\(/, "the Home instance delivers through the public action service");
});
