import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionAudience, type ActionCallContext, type WorkflowContentActions, type WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/search-sources";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { datasetContentActions } from "@molis-ai/molis-work-plugin-dataset";
import { FEED_ACTION_PERMISSIONS, feedContentActions } from "@molis-ai/molis-work-plugin-feed";
import { formContentActions } from "@molis-ai/molis-work-plugin-form";
import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { jellyContentActions } from "@molis-ai/molis-work-plugin-jelly";
import { lingguangContentActions } from "@molis-ai/molis-work-plugin-lingguang";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { pptContentActions } from "@molis-ai/molis-work-plugin-ppt";
import { initializeBoard } from "./fixtures/goals-board.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

// W4-6a: the request id of a delivery is the entry point's, the same eight real stations (Dataset, Feed, Form, Inbox, Jelly, 灵光, Pages, PPT)
// make one object per id, and who delivered is read from the call's audience. Nothing here is a stand-in for a station.
const STATIONS: ReadonlyArray<{ plugin: string; actions: WorkflowContentActions; payload: WorkflowPayload }> = [
  { plugin: "dataset", actions: datasetContentActions, payload: { title: "答卷", body: "Name,Answer\nAlice,usable" } },
  { plugin: "feed", actions: feedContentActions, payload: { title: "放进来的消息", body: "一条消息的正文" } },
  { plugin: "form", actions: formContentActions, payload: { title: "放进来的问卷", body: "- 第一题？\n- 第二题？" } },
  { plugin: "inbox", actions: inboxContentActions, payload: { title: "放进来的事项", body: "需要看一眼的内容" } },
  { plugin: "jelly", actions: jellyContentActions, payload: { title: "放进来的笔记", body: "笔记的正文", source: "某处" } },
  { plugin: "lingguang", actions: lingguangContentActions, payload: { title: "放进来的灵感", body: "灵感的正文" } },
  { plugin: "pages", actions: pagesContentActions, payload: { title: "放进来的文档", body: "# 标题\n正文" } },
  { plugin: "ppt", actions: pptContentActions, payload: { title: "放进来的演示稿", body: "# 第一页\n- 要点" } },
];
// The person holds what each station's actions ask, and Feed's ask for more once the Plugin Runtime registers them (the retained bodies the
// capture rules read, the Inbox entry and the 成果 a capture opens), which Inbox's hand-in reaches as the same person.
const PERMISSIONS = [...new Set([...STATIONS.flatMap(station => Object.values(station.actions).flatMap(definition => definition.action.permissions)), ...FEED_ACTION_PERMISSIONS])];

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "content-station-request-id-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  await initializeBoard(host, ref, { actor_id: "owner", idempotency_key: "init" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PERMISSIONS };
  const client = host.actionClient(ref);
  const as = (audience: ActionAudience) => bindActionClient(client, () => ({ ...caller, audience }));
  const feed = <T>(run: (feed: ReturnType<typeof createLocalFeedApplication>) => T) => host.withProject(ref, runtime => run(createLocalFeedApplication(runtime.store.db)));
  return { client, caller, as, feed, project: ref.project_id };
}

test("W4-6-02 every station makes one object per request id, whatever the id looks like", async t => {
  const f = await fixture(t);
  const person = f.as("user");
  // The ids a workflow, placement and any other entry point might give: no station looks at how an id starts.
  const requests = ["workflow:run-1:1", "workflow:run-1:2", "placement:req-9", "an id some entry point chose"];
  for (const { plugin, actions, payload } of STATIONS) {
    await t.test(plugin, async () => {
      const before = new Set((await person.invoke(actions.list, {})).map(item => item.item_id));
      const made = new Map<string, string>();
      for (const request_id of requests) {
        const first = await person.invoke(actions.receive, { ...payload, request_id });
        assert.equal(first.plugin, plugin);
        assert.ok(!before.has(first.item_id), `${request_id} makes a new object`);
        made.set(request_id, first.item_id);
      }
      assert.equal(new Set(made.values()).size, requests.length, "a different request id makes a different object");
      for (const request_id of requests) {
        assert.equal((await person.invoke(actions.receive, { ...payload, request_id })).item_id, made.get(request_id), `a resend of ${request_id} returns the object it made`);
      }
      const listed = new Set((await person.invoke(actions.list, {})).map(item => item.item_id));
      assert.equal(listed.size - before.size, requests.length, "the resends made nothing more");
      for (const id of made.values()) assert.ok(listed.has(id));
    });
  }
});

test("W4-6-01 every station refuses the old input shape, a missing or out-of-range request id, and any field that would name who delivered", async t => {
  const f = await fixture(t);
  const workflow = f.as("workflow");
  for (const { plugin, actions, payload } of STATIONS) {
    await t.test(plugin, async () => {
      assert.equal(actions.receive.version, 2);
      assert.equal(actions.receive.action.input_type, "molis.workflow.content.receive.input.v2");
      for (const version of [actions.list.version, actions.read.version, actions.create?.version ?? 1]) assert.equal(version, 1, "only receive moved");
      const invalid = { code: "actions.input_invalid" };
      await assert.rejects(workflow.invoke(actions.receive, { payload, context: { instance_id: "run", step: 1 } } as never), invalid);
      await assert.rejects(workflow.invoke(actions.receive, { ...payload } as never), invalid, "no request id");
      await assert.rejects(workflow.invoke(actions.receive, { ...payload, request_id: "" }), invalid);
      await assert.rejects(workflow.invoke(actions.receive, { ...payload, request_id: "r".repeat(161) }), invalid);
      await assert.rejects(workflow.invoke(actions.receive, { ...payload, request_id: "workflow:run:1", added_by: "workflow" } as never), invalid);
      await assert.rejects(workflow.invoke(actions.receive, { ...payload, request_id: "workflow:run:1", audience: "workflow" } as never), invalid);
      const longest = await workflow.invoke(actions.receive, { ...payload, request_id: "r".repeat(160) });
      assert.equal(longest.plugin, plugin);
    });
  }
});

test("W4-6-05 Feed files a delivery by the call's audience, and the input cannot choose", async t => {
  const f = await fixture(t);
  const filed = async (audience: ActionAudience, request_id: string) => {
    const bound = f.as(audience);
    // The input's own `source` is only a label of where the text came from; it does not decide where Feed files it.
    const ref = await bound.invoke(feedContentActions.receive, { title: "一条交来的消息", body: "正文", source: audience === "workflow" ? "放进来的内容" : "工作流程", request_id });
    return (await bound.invoke(feedContentActions.read, { item_id: ref.item_id })).source;
  };
  assert.equal(await filed("workflow", "workflow:run-1:1"), "工作流程");
  assert.equal(await filed("user", "placement:req-1"), "放进来的内容");
  assert.equal(await filed("mcp", "mcp-call-1"), "放进来的内容");
  assert.equal(await filed("agent", "agent-call-1"), "放进来的内容");
  // A workflow audience with an id that does not start `workflow:` is still a workflow's delivery; a person with one that does is still a person's.
  assert.equal(await filed("workflow", "not-prefixed"), "工作流程");
  assert.equal(await filed("user", "workflow:run-1:9"), "放进来的内容");
});

test("W4-6-05 Inbox records who handed a delivery in from the call's audience, and its nested Feed call keeps the audience", async t => {
  const f = await fixture(t);
  const expected: ReadonlyArray<readonly [ActionAudience, string, string]> = [
    ["workflow", "workflow", "工作流程"], ["user", "web_user", "放进来的内容"], ["mcp", "mcp", "放进来的内容"], ["agent", "agent", "放进来的内容"],
  ];
  for (const [audience, addedBy, source] of expected) {
    const entry = await f.as(audience).invoke(inboxContentActions.receive, { title: `${audience} 交来的事项`, body: "正文", source: "工作流程", request_id: `${audience}:call-1` });
    const recorded = await f.feed(feed => {
      const stored = feed.getInboxEntry(f.project, entry.item_id);
      return { added_by: stored.detail?.added_by, source: feed.getFeedItem(f.project, stored.subject_id).source_label };
    });
    assert.deepEqual(recorded, { added_by: addedBy, source }, `${audience}`);
  }
});

test("W4-6-05 the two hand-in sources are not offered to system search", async t => {
  const f = await fixture(t);
  await f.as("workflow").invoke(feedContentActions.receive, { title: "工作流交来的", body: "正文", request_id: "workflow:run-1:1" });
  await f.as("user").invoke(feedContentActions.receive, { title: "人放进来的", body: "正文", request_id: "placement:req-1" });
  const sources = await f.feed(feed => feed.snapshot(f.project).sources.map(source => source.name));
  assert.ok(sources.includes("工作流程") && sources.includes("放进来的内容"), "both sources exist once something was delivered");
  const view = (await f.client.discover(f.caller)).find(row => row.capability_id === "feed.search.entries")!;
  const page = await f.client.invoke(f.caller, { ...view, provider_id: view.provider.provider_id }, { cursor: null, limit: 200 }) as SearchEntriesPage;
  const titles = page.entries.filter(entry => entry.subject.kind === "source").map(entry => entry.title);
  assert.ok(!titles.includes("工作流程") && !titles.includes("放进来的内容"), JSON.stringify(titles));
  assert.ok(page.entries.some(entry => entry.title === "人放进来的"), "the delivered material itself is searchable");
});
