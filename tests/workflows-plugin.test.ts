import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PERSONAL_PLUGIN_IDS, railEntries } from "@molis-ai/molis-work-app-workbench";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DEMO_BOARD_ID, LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, workflowsHostPorts } from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { EN } from "../apps/workbench/src/i18n/en.js";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { buildInboxUiEntries } from "@molis-ai/molis-work-plugin-inbox";
import {
  WORKFLOWS_CLIENT_FACTORY_SCRIPT,
  WORKFLOWS_EN,
  WORKFLOWS_PROJECT_PLUGIN_ID,
  WorkflowsPluginRouteTable,
  applyFunctionRule,
  createWorkflowsRouteHandlers,
  insertStation,
  linkReadiness,
  manualLink,
  moveStation,
  newStation,
  openWorkflowsStore,
  parseAiHandoff,
  parseChain,
  removeStation,
  setLink,
  workflowsManifest,
  workflowsRouteErrorResponse,
  type WorkflowChain,
  type WorkflowInstance,
  type WorkflowLink,
} from "@molis-ai/molis-work-plugin-workflows";

const PROJECT = "project-workflows";
const fn = (body: string, title = ""): WorkflowLink => ({ kind: "function", title_template: title, body_template: body, instructions: "" });
const ai = (instructions: string): WorkflowLink => ({ kind: "ai", title_template: "", body_template: "", instructions });
const plugins = (chain: WorkflowChain) => chain.stations.map((station) => station.plugin);
const kinds = (chain: WorkflowChain) => chain.links.map((link) => link.kind);

test("链的编辑：加站、拿掉、调顺序时，每段衔接跟着它连接的两站走", () => {
  let chain: WorkflowChain = { stations: [], links: [] };
  chain = insertStation(chain, 0, newStation("feed"));
  chain = insertStation(chain, 1, newStation("pages"));
  assert.deepEqual(plugins(chain), ["feed", "pages"]);
  chain = setLink(chain, 0, fn("{正文}"));
  // Dropped between the two: the old handoff now reaches the new station, the new station hands on by hand.
  chain = insertStation(chain, 1, newStation("inbox"));
  assert.deepEqual(plugins(chain), ["feed", "inbox", "pages"]);
  assert.deepEqual(kinds(chain), ["function", "manual"]);
  chain = setLink(chain, 1, ai("整理成一页"));
  chain = insertStation(chain, 0, newStation("lingguang"));
  assert.deepEqual(kinds(chain), ["manual", "function", "ai"]);
  // Removing the first station drops its outgoing handoff; removing a middle one keeps its incoming handoff.
  assert.deepEqual(kinds(removeStation(chain, 0)), ["function", "ai"]);
  assert.deepEqual(plugins(removeStation(chain, 2)), ["lingguang", "feed", "pages"]);
  assert.deepEqual(kinds(removeStation(chain, 2)), ["manual", "function"]);
  assert.deepEqual(kinds(removeStation(chain, 3)), ["manual", "function"]);
  const moved = moveStation(chain, 0, 4);
  assert.deepEqual(plugins(moved), ["feed", "inbox", "pages", "lingguang"]);
  assert.equal(moved.links.length, 3);
  assert.equal(moveStation(chain, 1, 1), chain);
  assert.throws(() => parseChain({ stations: Array.from({ length: 13 }, () => ({ plugin: "feed" })) }), /最多 12 站/);
  assert.throws(() => parseChain({ stations: [{ plugin: "../feed" }] }), /站点插件无效/);
  assert.deepEqual(kinds(parseChain({ stations: [{ plugin: "feed" }, { plugin: "inbox" }], links: [{ kind: "bogus" }] })), ["manual"]);
});

test("没配好的衔接不算接上：Function 要有规则，AI 要有要求且有模型", () => {
  assert.deepEqual(linkReadiness(manualLink(), false), { ready: true, reason: "" });
  assert.equal(linkReadiness(fn(" "), true).ready, false);
  assert.equal(linkReadiness(fn("{正文}"), false).ready, true);
  assert.equal(linkReadiness(ai(""), true).reason, "还没写 AI 要整理成什么");
  assert.equal(linkReadiness(ai("整理"), false).reason, "还没有可用的文字模型");
  assert.equal(linkReadiness(ai("整理"), true).ready, true);
});

test("Function 按规则填占位，AI 的第一行当标题", () => {
  const input = { title: "原标题", body: "正文内容", url: "https://example.com/a", source: "Gmail", feed_item_id: "item-1" };
  const out = applyFunctionRule(fn("来源：{来源}\n{正文}\n{未知}", "{日期} {标题}"), input, new Date("2026-09-24T08:00:00Z"));
  assert.equal(out.title, "2026-09-24 原标题");
  assert.equal(out.body, "来源：Gmail\n正文内容\n{未知}");
  assert.equal(out.feed_item_id, null, "transformed content is new content, not the original Feed item");
  assert.equal(applyFunctionRule(fn("{正文}"), input).title, "原标题");
  const bare = applyFunctionRule(fn("来源：{来源}\n链接：{链接}\n\n{正文}"), { ...input, url: null });
  assert.equal(bare.body, "来源：Gmail\n\n正文内容", "a line whose placeholders are all empty is left out");
  const parsed = parseAiHandoff("# 一页说明\n\n- 要点一\n- 要点二", input);
  assert.equal(parsed.title, "一页说明");
  assert.equal(parsed.body, "- 要点一\n- 要点二");
  assert.equal(parsed.url, input.url);
});

test("工作流程是个人插件，排在左边栏，客户端脚本能解析，英文词条齐", () => {
  parsePluginManifest(workflowsManifest);
  assert.equal(PERSONAL_PLUGIN_IDS.includes(WORKFLOWS_PROJECT_PLUGIN_ID), true);
  const entry = railEntries([...PERSONAL_PLUGIN_IDS]).find((item) => item.id === "workflows");
  assert.equal(entry?.label, "工作流程");
  assert.equal(entry?.glyph, "workflow");
  assert.doesNotThrow(() => new Function("return " + WORKFLOWS_CLIENT_FACTORY_SCRIPT));
  assert.doesNotMatch(WORKFLOWS_CLIENT_FACTORY_SCRIPT, /window\.confirm/);
  const used = new Set<string>();
  // The client quotes its copy with single quotes: L('…') and tx('…').
  for (const match of WORKFLOWS_CLIENT_FACTORY_SCRIPT.matchAll(/\b(?:L|tx)\('((?:[^'\\]|\\.)*)'/g)) used.add(match[1]!.replace(/\\n/g, "\n"));
  assert.ok(used.size > 80, `found only ${used.size} strings; the pattern no longer matches the client`);
  // Workflow copy lives in WORKFLOWS_EN, which the Workbench merges into its dictionary.
  const missing = [...used].filter((key) => !(key in WORKFLOWS_EN) && !(key in EN));
  assert.deepEqual(missing, []);
  // Every station a run can reach opens the item handed to it, not just its list.
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /molis-work:select-item/);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /panePlugin/);
  assert.doesNotThrow(() => new Function("return " + LINGGUANG_CLIENT_FACTORY_SCRIPT));
});

async function withProject(run: (ctx: {
  call: (method: "GET" | "POST", pathname: string, body?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;
  db: LocalProjectDatabase;
  home: string;
  prompts: string[];
}) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "molis-workflows-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const db = new LocalProjectDatabase(dbPath);
  const feed = createLocalFeedApplication(db.db);
  const source = createLocalFeedSourceService(db.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  for (const [id, title] of [["m1", "第一条消息"], ["m2", "第二条消息"]] as const) {
    feed.ingestItem({ source, externalId: id, title, summary: `${title}的摘要`, body: `${title}的正文。`, url: `https://example.com/${id}`, occurredAt: new Date().toISOString(), attention: false });
  }
  const prompts: string[] = [];
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const ports = workflowsHostPorts({
    projectId: PROJECT, homeDirectory: home,
    actions: bindActionClient(host.actionClient(reference), () => ({ actor_id: "test-user", project_id: PROJECT, audience: "workflow", permissions: NATIVE_CONTENT_PERMISSIONS })),
    completeText: async (prompt) => { prompts.push(prompt); return "给 Pages 的一页\n\n结论：可以推进。\n\n- 背景\n- 要点"; },
  });
  const call = async (method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) => {
    const store = openWorkflowsStore(home);
    try {
      const table = new WorkflowsPluginRouteTable(createWorkflowsRouteHandlers(store, ports));
      const response = await table.handle({ method, pathname, query: new URLSearchParams(), body });
      assert.ok(response, `no route for ${method} ${pathname}`);
      return response as { status: number; body: Record<string, unknown> };
    } catch (error) {
      return workflowsRouteErrorResponse(error) as { status: number; body: Record<string, unknown> };
    } finally {
      store.close();
    }
  };
  try {
    await run({ call, db, home, prompts });
  } finally {
    await host.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

test("一次实例按每段衔接走完 Feed → Inbox → Pages → 灵光，各次内容不串，历史能回看", async () => {
  await withProject(async ({ call, db, home, prompts }) => {
    const refused = await call("POST", "/api/workflows", { title: "x", chain: { stations: [{ plugin: "feed" }, { plugin: "goals" }] } });
    assert.equal(refused.status, 400);

    const created = await call("POST", "/api/workflows", {
      title: "消息写成一页",
      chain: {
        stations: [{ plugin: "feed" }, { plugin: "inbox" }, { plugin: "pages" }, { plugin: "lingguang" }],
        links: [manualLink(), ai("整理成一页说明"), fn("")],
      },
    });
    assert.equal(created.status, 200);
    const workflow = created.body.workflow as { workflow_id: string; revision: number };

    const items = (await call("GET", "/api/workflows/stations/feed/items")).body.items as Array<{ item_id: string; title: string }>;
    assert.ok(items.length >= 2, "demo board has Feed items to start from");
    assert.equal((await call("POST", `/api/workflows/${workflow.workflow_id}/instances`, {})).status, 400, "Feed cannot start blank");

    const start = async (itemId: string) => (await call("POST", `/api/workflows/${workflow.workflow_id}/instances`, { item_id: itemId })).body.instance as WorkflowInstance;
    const first = await start(items[0]!.item_id);
    const second = await start(items[1]!.item_id);
    assert.equal(first.steps[0]!.status, "current");
    assert.equal(first.steps[0]!.item?.title, items[0]!.title);

    // Manual: the person decides what goes over. Unchanged content keeps pointing at the same Feed item.
    const continueFrom = (instance: WorkflowInstance, body: Record<string, unknown>) =>
      call("POST", `/api/workflows/instances/${instance.instance_id}/continue`, { from: instance.current, updated_at: instance.updated_at, ...body });
    assert.equal((await continueFrom(first, { title: "", body: "" })).status, 400);
    const preview = (await call("POST", `/api/workflows/instances/${first.instance_id}/preview`, { from: 0 })).body as { input: { title: string; body: string } };
    const manual = await continueFrom(first, { title: preview.input.title, body: preview.input.body });
    assert.equal(manual.status, 200, JSON.stringify(manual.body));
    const afterManual = manual.body.instance as WorkflowInstance;
    assert.equal(afterManual.current, 1);
    assert.equal(afterManual.steps[0]!.handoff?.actor, "person");
    assert.equal(afterManual.steps[1]!.plugin, "inbox");
    assert.equal((await continueFrom(first, { title: "again", body: "again" })).status, 409, "a stale view cannot hand over twice");

    const feed = createLocalFeedApplication(db.db);
    const entry = feed.getInboxEntry(DEMO_BOARD_ID, afterManual.steps[1]!.item!.item_id);
    assert.equal(entry.subject_id, items[0]!.item_id);
    assert.equal(entry.detail.added_by, "workflow");
    const [ui] = buildInboxUiEntries([entry], () => ({ title: items[0]!.title, source_label: "Feed", available: true, open: null }) as never, (value, values) => value.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")));
    assert.equal(ui!.kind_label, "Inbox · 工作流程");
    assert.equal(ui!.reason_label, "工作流程交过来");

    // AI: reads the step, organises it; what it produced stays in the record.
    const afterAi = (await continueFrom(afterManual, {})).body.instance as WorkflowInstance;
    assert.equal(afterAi.current, 2);
    assert.match(prompts[0]!, /整理成一页说明/);
    assert.match(prompts[0]!, new RegExp(items[0]!.title));
    assert.equal(afterAi.steps[1]!.handoff?.actor, "ai");
    assert.equal(afterAi.steps[1]!.handoff?.output.title, "给 Pages 的一页");
    const page = openPagesStore(home);
    try {
      const doc = page.get(afterAi.steps[2]!.item!.item_id, PROJECT);
      assert.equal(doc.title, "给 Pages 的一页");
      assert.match(JSON.stringify(doc.body), /结论：可以推进/);
    } finally { page.close(); }

    // A Function link without a rule is not connected, and says so instead of handing over.
    const blocked = await continueFrom(afterAi, {});
    assert.equal(blocked.status, 400);
    assert.match(String(blocked.body.error), /这一段还没接上：还没写交接规则/);

    // Configuring the link lets the waiting run go on; handoffs it already crossed keep their record.
    const saved = (await call("GET", `/api/workflows/${workflow.workflow_id}`)).body.workflow as { revision: number; stations: unknown[]; links: WorkflowLink[] };
    const updated = await call("POST", `/api/workflows/${workflow.workflow_id}`, {
      revision: saved.revision,
      chain: { stations: saved.stations, links: [fn("{正文}"), saved.links[1], fn("{正文}", "{标题} · 灵光")] },
    });
    assert.equal(updated.status, 200);
    assert.equal((await call("POST", `/api/workflows/${workflow.workflow_id}`, { revision: saved.revision, title: "stale" })).status, 409);
    const done = (await continueFrom(afterAi, {})).body.instance as WorkflowInstance;
    assert.equal(done.status, "done");
    assert.equal(done.chain.links[0]!.kind, "manual", "a crossed handoff is history");
    assert.equal(done.steps[2]!.handoff?.actor, "function");
    const spark = openLingguangStore(home);
    try {
      assert.equal(spark.get(done.steps[3]!.item!.item_id, PROJECT).title, "给 Pages 的一页 · 灵光");
    } finally { spark.close(); }
    assert.equal((await continueFrom(done, {})).status, 400, "a finished run does not continue");

    // A new run starts from the workflow as it is now.
    const third = await start(items[0]!.item_id);
    assert.equal(third.chain.links[0]!.kind, "function");
    const t1 = (await continueFrom(third, {})).body.instance as WorkflowInstance;
    assert.equal(t1.steps[0]!.handoff?.output.feed_item_id, null, "transformed content becomes its own Feed message");

    // Runs keep their own content; history lists every run and reopens each one where it stopped.
    const history = (await call("GET", `/api/workflows/${workflow.workflow_id}`)).body.instances as WorkflowInstance[];
    assert.equal(history.length, 3);
    assert.equal(history.filter((run) => run.status === "active").length, 2);
    const reopenedSecond = (await call("GET", `/api/workflows/instances/${second.instance_id}`)).body.instance as WorkflowInstance;
    assert.equal(reopenedSecond.current, 0);
    assert.equal(reopenedSecond.steps[0]!.item?.title, items[1]!.title);
    assert.equal(reopenedSecond.steps[1]!.item, null);
    const reopenedFirst = (await call("GET", `/api/workflows/instances/${first.instance_id}`)).body.instance as WorkflowInstance;
    assert.equal(reopenedFirst.current, 3);
    assert.equal(reopenedFirst.steps[1]!.handoff?.output.body.includes("结论：可以推进"), true);

    const stopped = (await call("POST", `/api/workflows/instances/${second.instance_id}/stop`)).body.instance as WorkflowInstance;
    assert.equal(stopped.status, "stopped");
    assert.equal((await call("POST", `/api/workflows/${workflow.workflow_id}/delete`)).status, 200);
    assert.equal(((await call("GET", "/api/workflows")).body.workflows as unknown[]).length, 0);
    assert.equal((await call("GET", `/api/workflows/instances/${first.instance_id}`)).body.workflow_title, "已删除的流程");
  });
});

test("内容站选择完整列出当前项目的文稿，不截断前 60 条或混入其他项目", async () => {
  await withProject(async ({ call, home }) => {
    const pages = openPagesStore(home);
    let first = "";
    try {
      for (let index = 0; index < 65; index++) {
        const page = pages.create({ title: `完整选择 ${index}`, project_id: PROJECT });
        if (!index) first = page.id;
      }
      pages.create({ title: "另一个项目的私有文稿", project_id: "other-project" });
    } finally { pages.close(); }
    const result = await call("GET", "/api/workflows/stations/pages/items");
    assert.equal(result.status, 200);
    const items = result.body.items as Array<{ item_id: string; title: string }>;
    assert.equal(items.filter(item => item.title.startsWith("完整选择")).length, 65);
    assert.ok(items.some(item => item.item_id === first));
    assert.ok(items.every(item => item.title !== "另一个项目的私有文稿"));
  });
});
