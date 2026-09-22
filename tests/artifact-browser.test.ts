import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { artifactWorkbench } from "@molis-ai/molis-work-app-workbench";
import { artifactDisplayTitle, readArtifactBrowser } from "@molis-ai/molis-work-plugin-artifacts";
import type { RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

const artifactId = "report/季度 & <draft>";
const encodedId = encodeURIComponent(artifactId);
const exactPath = (version: number) => `/artifacts/${encodedId}/versions/${version}`;

function registration(overrides: Partial<RegisterArtifactVersionInput> = {}): RegisterArtifactVersionInput {
  return {
    board_id: DEMO_BOARD_ID, actor_id: "report-owner", artifact_id: artifactId, version: 1,
    artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example.writer", plugin_version: "1.0.0", binding_signature: "fixture-publisher" },
    content: { kind: "inline", payload: { title: "Original report", custom: ["</pre><script>attack()</script>", 7, null] } },
    metadata: { origin: "plugin-owned-shape", details: { preserved: true } }, ...overrides,
  };
}

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-browser-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory,
    controlToken: "artifact-browser-test-control-token-0123456789" });
  t.after(async () => {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const get = (path: string, lang = "zh") => fetch(origin + path, { headers: { "accept-language": lang } });
  // Allow the normal host's first-request initialization before taking the read-only baseline.
  await (await get("/health")).text();
  return { store, coordinator, get, origin };
}

test("Artifact display title prefers payload title, then name, then text", () => {
  assert.equal(artifactDisplayTitle({
    artifact_id: "feed-capture:item:rule",
    payload: { title: "Product launch checklist", name: "Ignored name", summary: "Ship the launch notes" },
  }), "Product launch checklist");
  assert.equal(artifactDisplayTitle({ artifact_id: "named", payload: { name: "Named result" } }), "Named result");
  assert.equal(artifactDisplayTitle({ artifact_id: "frame-note", payload: { text: "Frame artifact" } }), "Frame artifact");
  assert.equal(artifactDisplayTitle({ artifact_id: "raw-id", payload: { count: 1 } }), "raw-id");
  assert.equal(artifactDisplayTitle({ artifact_id: "raw-id", payload: null }), "raw-id");
  assert.equal(artifactDisplayTitle({ artifact_id: "fixed-id", payload: { run_id: "r" }, metadata: { title: "固定变更标题" } }), "固定变更标题");
  assert.equal(artifactDisplayTitle({ artifact_id: "fixed-id", payload: { title: "正文标题" }, metadata: { title: "元数据标题" } }), "正文标题");
});

test("Artifact HTTP links exact versions, exports opaque records and preserves existing Goal/Evidence state", async (t) => {
  const { store, coordinator, get, origin } = await fixture(t);
  const first = coordinator.artifacts.commands.registerVersion(registration()).artifact;
  const second = coordinator.artifacts.commands.registerVersion(registration({ version: 2,
    content: { kind: "inline", payload: { title: "Later report" } } })).artifact;
  const before = store.snapshot(DEMO_BOARD_ID);
  const versions = coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID);
  const root = await (await get("/")).text();
  assert.match(root, /data-plugin-id="artifacts"/);
  const index = await get("/artifacts");
  assert.equal(index.status, 200);
  const directory = await index.text();
  assert.ok(directory.includes(`href="${exactPath(1)}"`));
  assert.ok(directory.includes(`href="${exactPath(2)}"`));
  assert.match(directory, /data-artifact-type-fold="io.example.report"/);
  assert.match(directory, /<strong>report<\/strong>/);
  assert.match(directory, /feed-stage-entry directory-list-row/);
  assert.match(directory, /artifact-version-list/);
  assert.match(directory, /goal-collection-mark is-ready/);
  assert.match(directory, /<strong>Original report<\/strong>/);
  assert.match(directory, /<strong>Later report<\/strong>/);
  const detail = await get(exactPath(1));
  assert.equal(detail.status, 200);
  assert.match(detail.headers.get("content-security-policy")!, /default-src 'self'/);
  const html = await detail.text();
  assert.match(html, /<title>Original report · /);
  assert.doesNotMatch(html, /<title>[^<]*report\/季度/);
  assert.match(html, /没有兼容插件/);
  assert.match(html, /<h1>Original report<\/h1>/);
  assert.match(html, /<strong>Later report<\/strong>/);
  assert.doesNotMatch(html, /<h1>Later report<\/h1>|<script>attack\(\)<\/script>/);
  assert.match(html, /&lt;\/pre&gt;&lt;script&gt;attack/);
  assert.ok(html.includes(`href="/api${exactPath(1)}/export"`));
  for (const record of [first, second]) {
    const exported = await get(`/api${exactPath(record.version)}/export`);
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-disposition"), `attachment; filename="artifact-v${record.version}.json"`);
    assert.deepEqual(await exported.json(), record);
  }
  const fragment = await fetch(origin + exactPath(1), { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  const fragmentHtml = await fragment.text();
  assert.equal(fragment.status, 200);
  assert.match(fragmentHtml, /data-artifact-directory/);
  assert.match(fragmentHtml, /data-artifact-detail/);
  assert.match(fragmentHtml, /<h1>Original report<\/h1>/);
  assert.match(fragmentHtml, /<strong>Later report<\/strong>/);
  assert.doesNotMatch(fragmentHtml, /<h1>Later report<\/h1>|<!doctype|<script>attack/);
  const english = await (await get(exactPath(1), "en")).text();
  assert.match(english, /lang="en"/);
  assert.match(english, /No compatible plugin/);
  assert.match(english, /Export this version/);
  assert.deepEqual(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID), versions);
  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.evidence, before.evidence);
  assert.deepEqual(after.runs, before.runs);
  assert.deepEqual(after.reviews, before.reviews);
});

test("Artifact HTTP keeps unknown and cross-project versions missing and rejects malformed exact references", async (t) => {
  const { coordinator, get } = await fixture(t);
  coordinator.artifacts.commands.registerVersion(registration());
  coordinator.initializeBoard({ board_id: "other-project", title: "Private project", actor_id: "owner", idempotency_key: "other-project" });
  coordinator.artifacts.commands.registerVersion(registration({ board_id: "other-project", artifact_id: "other-only" }));
  for (const path of [exactPath(2), "/artifacts/missing/versions/1", "/artifacts/other-only/versions/1"]) {
    const page = await get(path);
    assert.equal(page.status, 404);
    const html = await page.text();
    assert.match(html, /不会自动替换成最新版本/);
    assert.doesNotMatch(html, /<h1>Original report<\/h1>/);
    const exported = await get(`/api${path}/export`);
    assert.equal(exported.status, 404);
    await exported.text();
  }
  for (const path of ["/artifacts/a/versions/0", "/artifacts/a/versions/-1", "/artifacts/a/versions/1.5",
    "/artifacts/a/versions/9007199254740992", "/artifacts/%ZZ/versions/1"]) {
    const page = await get(path);
    assert.equal(page.status, 400, path);
    await page.text();
  }
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length, 1);
});

test("Artifact empty, unavailable, archived and embedded views reflect Module state without inventing consumers", async (t) => {
  const { coordinator, get } = await fixture(t);
  assert.match(await (await get("/artifacts")).text(), /还没有 Artifact/);
  assert.doesNotMatch(await (await get("/artifacts")).text(), /插件明确发布的结果会出现在这里|查看插件发布的结果、来源和原始内容/);
  coordinator.artifacts.commands.registerVersion(registration());
  const query = coordinator.artifacts.query;
  const reference = { artifact_id: artifactId, version: 1 };
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const view = readArtifactBrowser(query, DEMO_BOARD_ID, reference);
  const embed = artifactWorkbench.embed({ view, routePrefix: "/projects/current", primitives: { escape, text: escape, formatDate: (value) => value } });
  assert.ok(embed.includes(`href="/projects/current${exactPath(1)}"`));
  assert.match(embed, /data-artifact-version="1"/);
  assert.match(embed, /没有兼容插件/);
  assert.match(embed, /<h3><a href="\/projects\/current\/artifacts\/[^"]+\/versions\/1">Original report<\/a><\/h3>/);
  assert.doesNotMatch(embed, /attack\(\)|\/export/);
  assert.equal(readArtifactBrowser(query, DEMO_BOARD_ID, reference, [{ artifact_type_id: "io.example.report", schema_version: 1 }]).compatibility?.consumable, true);
  assert.equal(readArtifactBrowser(query, DEMO_BOARD_ID, reference, [{ artifact_type_id: "io.example.report", schema_version: 2 }]).compatibility?.consumable, false);
  coordinator.artifacts.commands.markUnavailable({ board_id: DEMO_BOARD_ID, ...reference, actor_id: "report-owner", reason: "Source disconnected" });
  const unavailable = await (await get(exactPath(1))).text();
  assert.match(unavailable, /这个版本的内容不可用|Source disconnected/);
  assert.match(unavailable, /<h1>Original report<\/h1>/);
  assert.doesNotMatch(unavailable, /&lt;\/pre&gt;&lt;script&gt;attack|<script>attack\(\)<\/script>/);
  coordinator.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, ...reference, actor_id: "report-owner" });
  assert.match(await (await get("/artifacts")).text(), /已归档/);
  assert.equal(query.getArtifactVersion(DEMO_BOARD_ID, reference)?.lifecycle_state, "archived");
});

test("Artifact navigation and export retain the selected catalog Project", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-projects-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const alpha = await catalog.createProject({ display_name: "Alpha results", actor_id: "fixture-user" });
  const beta = await catalog.createProject({ display_name: "Beta results", actor_id: "fixture-user" });
  catalog.addProjectPlugin({ project_id: alpha.project_id, plugin_id: "artifacts", actor_id: "fixture-user" });
  catalog.close();
  const store = new LocalProjectDatabase(alpha.database_path);
  const coordinator = new GoalProjectApplication(store);
  const original = coordinator.artifacts.commands.registerVersion(registration({ board_id: alpha.board_id })).artifact;
  store.close();
  const server = createMolisWorkWebServer({ homeDirectory: directory, controlToken: "artifact-project-test-control-token-0123456789" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `/projects/${alpha.project_id}`;
  const page = await (await fetch(origin + prefix + exactPath(1))).text();
  assert.match(page, /Alpha results/);
  assert.ok(page.includes(`href="${prefix}/artifacts"`));
  assert.ok(page.includes(`href="${prefix}/api${exactPath(1)}/export"`));
  assert.ok(page.includes(`href="${prefix}/"`));
  const root = await (await fetch(origin + prefix + "/")).text();
  assert.ok(root.includes(`data-route-prefix="${prefix}"`));
  assert.match(root, /data-plugin-id="artifacts"/);
  const exported = await fetch(origin + prefix + `/api${exactPath(1)}/export`);
  assert.deepEqual(await exported.json(), original);
  const other = await fetch(origin + `/projects/${beta.project_id}` + exactPath(1));
  assert.equal(other.status, 404);
  assert.doesNotMatch(await other.text(), /Original report|Alpha results/);
});

test("Goal context embeds explicit exact Artifact relations and refreshes owner state without mutating facts", async (t) => {
  const { store, coordinator, get } = await fixture(t);
  const documentPath = "/goals/V1";
  const empty = await (await get(documentPath)).text();
  assert.doesNotMatch(empty, /artifact-embed|关联结果/);
  const first = coordinator.artifacts.commands.registerVersion(registration()).artifact;
  coordinator.artifacts.commands.registerVersion(registration({ version: 2,
    content: { kind: "inline", payload: { title: "Later report" } } }));
  const ledger = createContextLedger(store.db, { authorize: () => true });
  const scope = { kind: "personal" as const, id: DEMO_BOARD_ID };
  const access = { actor_id: "fixture-goal-owner", scope };
  for (const [key, type, version] of [["input", "goal.input", 1], ["output", "goal.output", 2], ["missing", "goal.output", 99]] as const) {
    ledger.commands.put(access, { key, type, cause: "Explicit fixture association",
      source: { module: "goals", id: "V1", version: null, scope },
      target: { module: "artifacts", id: artifactId, version, scope } });
  }
  ledger.commands.put(access, { key: "unrelated", type: "goal.output", cause: "Another Goal's result",
    source: { module: "goals", id: "PLATFORM", version: null, scope },
    target: { module: "artifacts", id: "not-for-V1", version: 1, scope } });
  ledger.commands.put(access, { key: "foreign", type: "goal.input", cause: "Explicit foreign namespace",
    source: { module: "goals", id: "V1", version: null, scope },
    target: { module: "artifacts", id: artifactId, version: 1, scope, project_id: "foreign-project" } });
  const before = store.snapshot(DEMO_BOARD_ID);
  const beforeEdges = ledger.query.list(access);
  const beforeArtifacts = coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID);
  const page = await (await get(documentPath)).text();
  assert.match(page, /关联结果/);
  assert.match(page, /v1 · 输入结果/);
  assert.match(page, /v2 · 产出结果/);
  assert.ok(page.includes(`href="${exactPath(1)}"`));
  assert.ok(page.includes(`href="${exactPath(2)}"`));
  assert.match(page, /v99/);
  assert.match(page, /关联的版本不可用或不存在/);
  assert.match(page, /Original report/);
  assert.match(page, /Later report/);
  assert.doesNotMatch(page, /not-for-V1|<script>attack\(\)<\/script>|foreign-project/);
  assert.match(await (await get(documentPath, "en")).text(), /Linked results/);
  const opened = await get(exactPath(1));
  assert.match(await opened.text(), /Original report/);
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, { artifact_id: artifactId, version: 1 }), first);
  assert.deepEqual(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID), beforeArtifacts);
  assert.deepEqual(ledger.query.list(access), beforeEdges);
  const after = store.snapshot(DEMO_BOARD_ID);
  for (const field of ["goals", "evidence", "runs", "reviews"] as const) assert.deepEqual(after[field], before[field]);

  coordinator.artifacts.commands.markUnavailable({ board_id: DEMO_BOARD_ID, artifact_id: artifactId, version: 1,
    actor_id: "report-owner", reason: "Source disconnected" });
  coordinator.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, artifact_id: artifactId, version: 2, actor_id: "report-owner" });
  const changed = await (await get(documentPath)).text();
  assert.match(changed, /这个版本的内容不可用/);
  assert.match(changed, /Source disconnected/);
  assert.match(changed, /这个版本已归档/);
  ledger.commands.remove(access, "input", "Owner removed the input association");
  const removed = await (await get(documentPath)).text();
  assert.doesNotMatch(removed, /v1 · 输入结果|Source disconnected/);
  assert.match(removed, /v2 · 产出结果/);
  const unknown = await get("/goals/missing");
  assert.equal(unknown.status, 404);
  assert.doesNotMatch(await unknown.text(), /artifact-embed|report/);
});


test("Artifact type folds use spoken labels for known types", async t => {
  const { coordinator, get } = await fixture(t);
  coordinator.artifacts.commands.registerVersion(registration({
    artifact_id: "goal-delivery",
    artifact_type_id: "io.molis.work.goal.delivery",
  }));
  coordinator.artifacts.commands.registerVersion(registration({
    artifact_id: "feed-capture",
    version: 1,
    artifact_type_id: "io.molis.work.feed.capture",
    content: { kind: "inline", payload: { title: "Captured item" } },
  }));
  const html = await (await get("/artifacts")).text();
  assert.match(html, /<strong>Goal 交付<\/strong>/);
  assert.match(html, /<strong>Feed 捕获<\/strong>/);
  assert.doesNotMatch(html, /<strong>io\.molis\.work\.goal\.delivery<\/strong>/);
  assert.doesNotMatch(html, /<strong>io\.molis\.work\.feed\.capture<\/strong>/);
});

test("Artifact browser distinguishes no results, unselected versions and missing references", async t => {
  const {coordinator,get}=await fixture(t);
  const empty=await (await get("/artifacts")).text();
  assert.match(empty,/还没有项目成果/);
  assert.doesNotMatch(empty,/<h1>选择一个结果版本<\/h1>/);
  coordinator.artifacts.commands.registerVersion(registration());
  const unselected=await (await get("/artifacts")).text();
  assert.match(unselected,/<h1>选择一个结果版本<\/h1>/);
  const missing=await (await get(exactPath(99))).text();
  assert.match(missing,/找不到这个 Artifact 版本/);
  assert.match(missing,/不会自动替换成最新版本/);
});


test("Coding report Artifact reads its fixed body and source, rejects forged ownership and preserves history", async (t) => {
  const { coordinator, get, origin } = await fixture(t);
  const fixedId = "coding-report:session-fixed:run-original";
  const input = registration({ artifact_id: fixedId, artifact_type_id: "coding.report.v1",
    producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.15.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload: { title: "已保存的原报告", run_id: "run-original", source: { session_id: "session-fixed" },
      body_markdown: "## 原任务结果\n固定正文，不能使用后来的会话。\n\n<script>attack()</script>\n\n[危险](javascript:attack())" } } });
  const original = coordinator.artifacts.commands.registerVersion(input).artifact;
  const path = `/artifacts/${encodeURIComponent(fixedId)}/versions/1`;
  for (const headers of [{}, { "x-molis-work-fragment": "artifact-workbench" }]) {
    const response = await fetch(origin + path, { headers });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /data-artifact-business-preview/);
    assert.match(html, /原任务结果/);
    assert.match(html, /在 Coding 打开原报告与会话/);
    assert.ok(html.includes(`openItem=${encodeURIComponent(fixedId)}`));
    assert.doesNotMatch(html, /<script>attack\(\)<\/script>|href="javascript:/);
  }
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, {artifact_id:fixedId,version:1}), original);
  coordinator.artifacts.commands.registerVersion({...input, artifact_id:"coding-report:session-forged:run-original"});
  const forged = await (await get(`/artifacts/${encodeURIComponent("coding-report:session-forged:run-original")}/versions/1`)).text();
  assert.doesNotMatch(forged, /data-artifact-business-preview|在 Coding 打开原报告与会话/);
  coordinator.artifacts.commands.archiveVersion({board_id:DEMO_BOARD_ID,artifact_id:fixedId,version:1,actor_id:"report-owner"});
  const archived = await (await get(path)).text();
  assert.match(archived, /这个版本已归档/);
  assert.match(archived, /data-artifact-business-preview/, "archiving preserves historical reading");
  coordinator.artifacts.commands.markUnavailable({board_id:DEMO_BOARD_ID,artifact_id:fixedId,version:1,actor_id:"report-owner",reason:"正文来源失效"});
  const unavailable = await (await get(path)).text();
  assert.doesNotMatch(unavailable, /data-artifact-business-preview|在 Coding 打开原报告与会话/);
});


test("Coding changeset Artifact renders exact original proposals and states, with a validated return to its task", async (t) => {
  const { coordinator, get, origin } = await fixture(t);
  const fixedId = "coding-changeset:session-fixed:run-original";
  const payload = { scope: "run-frozen", run_id: "run-original", applied: false, coverage: "text-reviews",
    origin: { session_id: "session-fixed", runtime_session_id: "sdk", workspace_id: "w", workspace_name: "授权工作区" },
    files: [false, true].map((applied, i) => ({ path: "cart.mjs", kind: "modified", added_lines: 1, removed_lines: 1, diff: "",
      review: { review_id: `review-${i}`, before_text: `before-${i}\n`, after_text: `after-${i} <script>attack()</script>\n`,
        decision: applied ? "approved" : "rejected", execution: applied ? "applied" : "not-applied" } })) };
  const input = registration({ artifact_id: fixedId, artifact_type_id: "coding.changeset.v1",
    producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.20.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload }, metadata: { title: "购物车的固定变更" } });
  const original = coordinator.artifacts.commands.registerVersion(input).artifact;
  const path = `/artifacts/${encodeURIComponent(fixedId)}/versions/1`;
  for (const headers of [{}, { "x-molis-work-fragment": "artifact-workbench" }]) {
    const response = await fetch(origin + path, { headers }); assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /data-artifact-business-preview/);
    assert.match(html, /<h1>购物车的固定变更<\/h1>/);
    assert.match(html, /cart.mjs · 修改 1 · 已拒绝 \/ 未执行/);
    assert.match(html, /cart.mjs · 修改 2 · 已批准 \/ 已执行/);
    assert.match(html, /after-0 &lt;script&gt;/); assert.match(html, /after-1 &lt;script&gt;/);
    assert.match(html, /在 Coding 查看固定变更并返回原任务/);
    assert.ok(html.includes(`openItem=${encodeURIComponent(fixedId)}`));
    assert.doesNotMatch(html, /<script>attack\(\)<\/script>|data-coding-line=|data-action="diff.show-file"/);
  }
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, { artifact_id: fixedId, version: 1 }), original);
  const forgeries = [
    { ...input, artifact_id: "coding-changeset:session-forged:run-original" },
    { ...input, version: 2 },
    { ...input, artifact_id: "coding-changeset:session-fixed:wrong-owner", producer: { ...input.producer, plugin_id: "untrusted" }, content: { kind: "inline" as const, payload: { ...payload, run_id: "wrong-owner" } } },
    { ...input, artifact_id: "coding-changeset:session-fixed:live", content: { kind: "inline" as const, payload: { ...payload, run_id: "live", scope: "current" } } },
  ];
  for (const forged of forgeries) {
    coordinator.artifacts.commands.registerVersion(forged);
    const html = await (await get(`/artifacts/${encodeURIComponent(forged.artifact_id)}/versions/${forged.version}`)).text();
    assert.doesNotMatch(html, /data-artifact-business-preview|在 Coding 查看固定变更并返回原任务/);
  }
  coordinator.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, artifact_id: fixedId, version: 1, actor_id: "report-owner" });
  const archived = await (await get(path)).text(); assert.match(archived, /这个版本已归档/); assert.match(archived, /data-artifact-business-preview/);
  coordinator.artifacts.commands.markUnavailable({ board_id: DEMO_BOARD_ID, artifact_id: fixedId, version: 1, actor_id: "report-owner", reason: "正文不可用" });
  const unavailable = await (await get(path)).text(); assert.doesNotMatch(unavailable, /data-artifact-business-preview|在 Coding 查看固定变更并返回原任务/);
});
