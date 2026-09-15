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
    relay_import: { available: false, source_count: 0, item_count: 0, material_count: 0 },
    source_catalog: [],
    connector_auth: { github: { bound: false }, gmail: { bound: false } },
    primitives,
    demo: false,
    active: true,
    ...overrides,
  };
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
  assert.match(directory, /data-feed-empty-title>这里还没有 Item/);
  assert.match(directory, /data-feed-source-filter hidden/);

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
  assert.match(overlays, /data-feed-out-rules/);
  assert.match(overlays, /data-feed-out-rule-create/);
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
    origin: "goalboard",
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
  assert.match(directory, /data-feed-entry-prototype="true"/);
  assert.match(directory, /data-prototype-feed-empty-state/);
  assert.match(detail, /data-prototype-feed-action="inbox"/);
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
    "feed.relay.import",
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
    detectRelayImport: unused,
    importRelay: unused,
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
