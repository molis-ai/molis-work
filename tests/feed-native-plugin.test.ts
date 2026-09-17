import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_UI_CONTRIBUTION_ID,
  FeedPluginRouteTable,
  createFeedRouteHandlers,
  feedUiContribution,
  type FeedPluginRouteHandler,
  type FeedUiModel,
} from "@molis-ai/molis-work-plugin-feed";
import { UiContributionError, UiHost } from "@molis-ai/molis-work-ui-host";

const primitives: FeedUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value, variables) => Object.entries(variables ?? {}).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  ),
  formatDate: (value) => value,
  richText: (value) => `<p>${value ?? ""}</p>`,
  plainText: (value) => value ?? "",
  safeExternalHref: (value) => value,
};

function model(overrides: Partial<FeedUiModel> = {}): FeedUiModel {
  return {
    route_prefix: "/projects/project-test",
    preset: "feed",
    entries: [],
    sources: [],
    out_rules: [],
    source_catalog: [],
    connector_auth: { github: { bound: false }, gmail: { bound: false } },
    primitives,
    demo: false,
    active: true,
    ...overrides,
  };
}

function source(overrides: Partial<FeedUiModel["sources"][number]> = {}): FeedUiModel["sources"][number] {
  return {
    project_id: "project-test",
    source_id: "source-a",
    kind: "rss",
    definition_id: null,
    sync_kind: "public_source",
    name: "Design",
    description: "Design feed",
    status: "active",
    enabled: true,
    origin: "molis_work",
    config: {},
    schedule: { mode: "manual" },
    connection_ref: null,
    account_label: null,
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    prototype: false,
    item_count: 0,
    ui_kind: "rss",
    type_label: "RSS / Atom",
    status_kind: "active",
    status_label: "运行正常",
    last_fetch_label: "尚未拉取",
    next_fetch_label: "手动",
    schedule_label: "手动拉取",
    scope_label: "全部",
    scope_options: [],
    configured_endpoint: "https://example.com/feed.xml",
    protocol_status: null,
    home_url: null,
    editable_endpoint: true,
    messages: [],
    runs: [],
    ...overrides,
  };
}

function itemEntry(overrides: {
  entry_id: string;
  source_id: string | null;
  title: string;
  provider?: FeedUiModel["entries"][number]["provider"];
  source_label?: string;
}): FeedUiModel["entries"][number] {
  const provider = overrides.provider ?? "rss";
  const sourceLabel = overrides.source_label ?? "Design";
  return {
    entry_id: overrides.entry_id,
    item_id: overrides.entry_id,
    inbox_entry: null,
    preset: "feed",
    provider,
    kind_label: "Feed",
    source_label: sourceLabel,
    disposition: "feed",
    title: overrides.title,
    summary: "",
    updated_at: "2026-08-30T14:18:00+08:00",
    read: false,
    attention_rank: 0,
    item: {
      project_id: "project-test",
      item_id: overrides.entry_id,
      source_id: overrides.source_id,
      signal_id: null,
      signal_revision: null,
      item_type: "feed",
      kind: provider,
      title: overrides.title,
      summary: "",
      body: "",
      source_kind: provider,
      source_label: sourceLabel,
      external_id: overrides.entry_id,
      url: null,
      origin_status: "ok",
      priority: "normal",
      tags: [],
      author: null,
      disposition: "feed",
      linked_goal_id: null,
      read_at: null,
      revision: 1,
      source_created_at: "2026-08-30T14:18:00+08:00",
      source_updated_at: "2026-08-30T14:18:00+08:00",
      imported_at: "2026-08-30T14:18:00+08:00",
      updated_at: "2026-08-30T14:18:00+08:00",
      materials: [],
    },
  };
}

function stageGroup(html: string, sourceId: string): string {
  const start = html.indexOf(`data-feed-stage-group="${sourceId}"`);
  assert.ok(start >= 0, `missing stage group ${sourceId}`);
  const next = html.indexOf("data-feed-stage-group=", start + 1);
  return html.slice(start, next >= 0 ? next : html.length);
}

function taskConfigPanel(html: string, sourceId: string): string {
  const match = html.match(new RegExp(`<section data-feed-task-config="${sourceId}"[\\s\\S]*?</section>`));
  assert.ok(match, `missing task config ${sourceId}`);
  return match[0];
}

test("Workbench registers the Feed UI Contribution through the generic UI Host", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  assert.deepEqual(host.list().map((item) => item.contribution_id), [FEED_UI_CONTRIBUTION_ID]);
  assert.throws(
    () => host.register(feedUiContribution),
    (error) => error instanceof UiContributionError && error.code === "ui_contribution_conflict",
  );

  const directory = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: model(),
  });
  assert.match(directory, /data-directory-panel="feed"/);
  assert.doesNotMatch(directory, /data-feed-collection-fold/);
  assert.doesNotMatch(directory, /data-feed-task-toggle="all"|data-feed-task="all"/);
  assert.match(directory, /goal-collection-empty/);
  assert.match(directory, /还没有拉取任务/);
  assert.doesNotMatch(directory, /mw-dir-row--compact/);
  assert.match(directory, /data-feed-add-toggle/);
  assert.doesNotMatch(directory, /mw-dir-row--meta/);
  assert.doesNotMatch(directory, /mw-dir-row__icon/);
  assert.doesNotMatch(directory, /data-slot="directory-heading"/);
  assert.doesNotMatch(directory, /所有来源的流水/);
  assert.doesNotMatch(directory, /feed-source-task/);
  assert.doesNotMatch(directory, /data-feed-advanced-open|捕捉规则/);
  assert.doesNotMatch(directory, /Relay|data-relay-import|导入已有历史|与迁移/);

  const workbench = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model(),
  });
  assert.match(workbench, /data-feed-stage-directory="true"/);
  assert.doesNotMatch(directory, /data-feed-task="all"/);
  assert.doesNotMatch(workbench, /data-feed-stage-group/);
  assert.match(workbench, /data-feed-empty-title>这里还没有 Item/);
  assert.match(workbench, /data-feed-add-toggle/);
  assert.match(workbench, /data-feed-source-filter hidden/);
  assert.doesNotMatch(workbench, /接入来源后，消息和 Feed 会出现在这里|选择一项查看详情/);

  const failed = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench-fragment",
    model: model({ error: "temporary failure" }),
  });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /temporary failure/);
  assert.match(failed, /data-retry-feed-detail/);

  const overlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "overlays",
    model: model(),
  });
  assert.match(overlays, /data-feed-add-out-rule-contains/);
  assert.match(overlays, /捕捉规则（可选）/);
  assert.doesNotMatch(overlays, /data-feed-advanced|data-feed-advanced-open/);
  assert.doesNotMatch(overlays, /Relay|data-relay-import|导入已有历史|与迁移/);
  assert.match(overlays, /data-feed-choose-kind="custom_rss"/);
  assert.match(overlays, /RSS \/ Atom/);
  assert.doesNotMatch(overlays, /网站与博客|持续收集新文章|先选择你想关注的来源|chevron-right/);
  assert.doesNotMatch(overlays, /data-feed-choose-kind="rss"/);

  const catalogOverlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "overlays",
    model: model({
      source_catalog: [{ id: "catalog-1", name: "Latent Space", category_label: "AI" }],
    }),
  });
  assert.match(catalogOverlays, /data-feed-choose-kind="rss"/);
});

test("Feed capture rules belong to a task, not the directory", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const sourceA = source({ source_id: "source-a", name: "Design" });
  const sourceB = source({ source_id: "source-b", name: "Release" });
  const uiModel = model({
    sources: [sourceA, sourceB],
    out_rules: [
      { rule_id: "rule-a", name: "A launch", enabled: true, contains: "launch", source_id: "source-a", source_kind: null },
      { rule_id: "rule-b", name: "B release", enabled: true, contains: "release", source_id: "source-b", source_kind: null },
      { rule_id: "rule-global", name: "Global", enabled: true, contains: "global", source_id: null, source_kind: null },
    ],
  });
  const directory = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: uiModel,
  });
  const overlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "overlays",
    model: uiModel,
  });
  assert.doesNotMatch(directory, /data-feed-advanced-open|捕捉规则/);
  assert.doesNotMatch(directory, /mw-dir-row--nested/);
  assert.match(directory, /mw-dir-row--compact/);
  assert.match(directory, /mw-dir-row__icon/);
  assert.match(directory, /href="#icon-rss"/);
  assert.doesNotMatch(directory, /goal-collection-empty/);
  assert.doesNotMatch(directory, /data-feed-task-toggle="all"|data-feed-collection-fold/);
  assert.ok(
    directory.indexOf("data-feed-add-toggle") < directory.indexOf('data-feed-task="source-a"'),
    "Feed add task sits above source rows",
  );
  assert.match(directory, /data-feed-task-config-open="source-a"/);
  const panelA = taskConfigPanel(overlays, "source-a");
  const panelB = taskConfigPanel(overlays, "source-b");
  assert.match(panelA, /data-feed-out-rules="source-a"/);
  assert.match(panelA, /A launch/);
  assert.match(panelA, /data-feed-out-rule-create/);
  assert.doesNotMatch(panelA, /B release|Global/);
  assert.match(panelB, /B release/);
  assert.doesNotMatch(panelB, /A launch|Global/);
});

test("Feed stage list groups items by source task", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const sourceA = source({ source_id: "source-a", name: "GitHub · adeptify", ui_kind: "github" });
  const sourceB = source({ source_id: "source-b", name: "Gmail · product", ui_kind: "gmail" });
  const emptySource = source({ source_id: "source-empty", name: "空任务", ui_kind: "rss" });
  const workbench = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
      sources: [sourceA, sourceB, emptySource],
      entries: [
        itemEntry({ entry_id: "entry-b", source_id: "source-b", title: "Gmail item", provider: "gmail", source_label: "Gmail · product" }),
        itemEntry({ entry_id: "entry-a", source_id: "source-a", title: "GitHub item", provider: "github", source_label: "GitHub · adeptify" }),
        itemEntry({ entry_id: "entry-orphan", source_id: "missing-source", title: "Orphan item", provider: "other", source_label: "Unknown" }),
      ],
    }),
  });
  const github = stageGroup(workbench, "source-a");
  const gmail = stageGroup(workbench, "source-b");
  const other = stageGroup(workbench, "other");
  assert.match(workbench, /data-feed-stage-group="source-a"[^>]*open/);
  assert.match(github, /goal-collection-fold/);
  assert.match(github, /goal-collection-caret/);
  assert.match(github, /goal-collection-mark/);
  assert.match(github, /<strong>GitHub · adeptify<\/strong>/);
  assert.match(github, /data-feed-stage-group-count>1</);
  assert.match(github, /data-feed-entry-id="entry-a"/);
  assert.doesNotMatch(github, /data-feed-entry-id="entry-b"|data-feed-entry-id="entry-orphan"/);
  assert.match(gmail, /data-feed-entry-id="entry-b"/);
  assert.doesNotMatch(gmail, /data-feed-entry-id="entry-a"/);
  assert.match(other, /<strong>其他<\/strong>/);
  assert.match(other, /data-feed-entry-id="entry-orphan"/);
  assert.doesNotMatch(workbench, /data-feed-stage-group="source-empty"/);
  assert.ok(
    workbench.indexOf('data-feed-stage-group="source-a"') < workbench.indexOf('data-feed-stage-group="source-b"'),
    "stage groups follow source task order",
  );
  assert.ok(
    workbench.indexOf('data-feed-stage-group="source-b"') < workbench.indexOf('data-feed-stage-group="other"'),
    "unmatched items sit after configured source tasks",
  );
});

test("Feed demo data keeps page-local actions and never calls real Source APIs", () => {
  const demoItem: FeedUiModel["entries"][number] = {
    entry_id: "prototype-feed-one",
    item_id: "prototype-feed-one",
    inbox_entry: null,
    preset: "feed",
    provider: "github",
    kind_label: "Feed Item · 演示",
    source_label: "GitHub · demo",
    disposition: "inbox",
    title: "Demo review request",
    summary: "Demo only",
    updated_at: "2026-08-30T14:18:00+08:00",
    read: false,
    attention_rank: 0,
    prototype: { reason: "Demo reason", next_action: "Demo action", relation: "Source → Feed" },
    item: {
      project_id: "project-test",
      item_id: "prototype-feed-one",
      source_id: "prototype-source-github",
      signal_id: null,
      signal_revision: null,
      item_type: "feed",
      kind: "github_notification",
      title: "Demo review request",
      summary: "Demo only",
      body: "Demo body",
      source_kind: "github",
      source_label: "GitHub · demo",
      external_id: "prototype-feed-one",
      url: null,
      origin_status: "prototype",
      priority: "normal",
      tags: ["演示数据"],
      author: "demo",
      disposition: "inbox",
      linked_goal_id: null,
      read_at: null,
      revision: 1,
      source_created_at: "2026-08-30T14:18:00+08:00",
      source_updated_at: "2026-08-30T14:18:00+08:00",
      imported_at: "2026-08-30T14:18:00+08:00",
      updated_at: "2026-08-30T14:18:00+08:00",
      materials: [],
    },
  };
  const demoSource: FeedUiModel["sources"][number] = {
    project_id: "project-test",
    source_id: "prototype-source-github",
    kind: "github",
    definition_id: null,
    sync_kind: "manual",
    name: "GitHub · demo",
    description: "Demo source",
    status: "active",
    enabled: true,
    origin: "molis_work",
    config: { scope: "review requests" },
    schedule: { mode: "interval", enabled: true, interval_minutes: 30, next_pull_at: null },
    connection_ref: null,
    account_label: "demo",
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: "2026-08-30T14:18:00+08:00",
    updated_at: "2026-08-30T14:18:00+08:00",
    prototype: true,
    item_count: 1,
    ui_kind: "github",
    type_label: "GitHub",
    status_kind: "active",
    status_label: "运行正常",
    last_fetch_label: "演示记录",
    next_fetch_label: "演示计划",
    schedule_label: "每 30 分钟",
    scope_label: "review requests",
    scope_options: [],
    configured_endpoint: "github.com/demo",
    protocol_status: null,
    home_url: null,
    editable_endpoint: false,
    messages: ["Demo review request"],
    runs: [],
  };
  const host = new UiHost();
  host.register(feedUiContribution);
  const demoModel = model({ entries: [demoItem], sources: [demoSource], demo: true });
  const directory = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "directory", model: demoModel });
  const detail = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "workbench", model: demoModel });
  const source = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "source-workbench", model: demoModel });
  assert.doesNotMatch(directory, /data-feed-entry-prototype="true"|data-prototype-feed-empty-state/);
  assert.match(detail, /data-feed-entry-prototype="true"/);
  assert.match(detail, /data-feed-stage-group="prototype-source-github"/);
  assert.match(detail, /class="feed-stage-entry directory-list-row"/);
  assert.match(detail, /class="feed-stage-leading"/);
  assert.match(detail, /mw-status mw-status--attention mw-status--plain feed-entry-status/);
  assert.match(detail, /已加入 Inbox/);
  assert.doesNotMatch(detail, /feed-entry-chevron|feed-entry-origin|feed-stage-entry-copy/);
  assert.doesNotMatch(detail, /class="feed-list-item/);
  assert.doesNotMatch(detail, /data-prototype-feed-empty-state/);
  assert.match(detail, /data-prototype-feed-action="inbox"/);
  assert.match(directory, /data-feed-task="prototype-source-github"/);
  assert.match(directory, /mw-dir-row__icon/);
  assert.match(directory, /href="#icon-tree"/);
  assert.doesNotMatch(directory, /data-feed-task="all"|mw-dir-row--nested/);
  assert.match(directory, /mw-status mw-status--done mw-status--plain mw-dir-row__status/);
  assert.match(directory, /运行正常/);
  assert.match(source, /data-prototype-source-sync="prototype-source-github"/);
  assert.match(source, /data-prototype-config-save/);
  assert.match(source, /data-prototype-schedule-save/);
  assert.doesNotMatch(source, /data-source-runtime-action/);
  assert.doesNotMatch(source, /data-real-source-id/);
});

test("Feed Plugin route table owns matching while the Host supplies handlers", async () => {
  let observed: { itemId: string; action: string } | null = null;
  const fallback: FeedPluginRouteHandler = () => ({ status: 204 });
  const handlers = Object.fromEntries([
    "feed.snapshot",
    "feed.workbench",
    "feed.out-rules.list",
    "feed.out-rules.create",
    "feed.out-rules.update",
    "feed.out-rules.delete",
    "feed.sources.create",
    "feed.sources.update",
    "feed.sources.delete",
    "feed.sources.schedule",
    "feed.sources.action",
    "feed.connector.token.set",
    "feed.connector.token.delete",
    "feed.connector.github.client",
    "feed.connector.github.device.start",
    "feed.connector.github.device.poll",
    "feed.connector.gmail.client",
    "feed.connector.gmail.oauth.start",
    "feed.connector.gmail.oauth.callback",
    "feed.item.detail",
    "feed.item.action",
  ].map((routeId) => [routeId, routeId === "feed.item.action"
    ? (({ params }) => {
        observed = { itemId: params.item_id!, action: params.action! };
        return { status: 200, body: observed };
      }) satisfies FeedPluginRouteHandler
    : fallback]));
  const routes = new FeedPluginRouteTable(handlers);
  const result = await routes.handle({
    method: "POST",
    pathname: "/api/feed/items/item%2Fone/archive",
    query: new URLSearchParams(),
    body: { revision: 2 },
  });
  assert.equal(result?.status, 200);
  assert.deepEqual(observed, { itemId: "item/one", action: "archive" });
  assert.equal(await routes.handle({
    method: "GET",
    pathname: "/api/not-feed",
    query: new URLSearchParams(),
    body: {},
  }), null);
  assert.equal((await routes.handle({
    method: "GET",
    pathname: "/api/feed/out-rules",
    query: new URLSearchParams(),
    body: {},
  }))?.status, 204);
});

test("Feed workbench HTTP rejects inbox_message and serves the Feed surface", async () => {
  const unused = () => {
    throw new Error("unused Feed workbench port");
  };
  const routes = new FeedPluginRouteTable(createFeedRouteHandlers({
    boardId: "board",
    routePrefix: "",
    feed: unused,
    sources: unused,
    connectors: unused,
    changed: unused,
    hydrateItem: unused,
    hydrateSnapshot: unused,
    sourceCatalog: () => [],
    renderWorkbench: () => "<div data-feed-workbench></div>",
    renderDetail: unused,
    promote: unused,
  }));
  const rejected = await routes.handle({
    method: "GET",
    pathname: "/api/feed/workbench",
    query: new URLSearchParams("preset=inbox_message"),
    body: {},
  });
  assert.equal(rejected?.status, 400);
  const served = await routes.handle({
    method: "GET",
    pathname: "/api/feed/workbench",
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(served?.status, 200);
  assert.equal(served?.html, "<div data-feed-workbench></div>");
});
