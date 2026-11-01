import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_STYLES,
  FEED_UI_CONTRIBUTION_ID,
  createFeedRouteHandlers,
  createFeedQueryHandlers,
  feedQueryActions,
  feedManifest,
  feedUiContribution,
  buildFeedStageUiModel,
  type FeedPluginRouteHandler,
  type FeedUiModel,
  type PersistedFeedDetailModel,
} from "@molis-ai/molis-work-plugin-feed";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { FEED_SAVE_OPTION_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";

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
}

function sourceMenuRow(html: string, sourceId: string): string {
  const start = html.indexOf(`data-feed-task="${sourceId}"`);
  assert.ok(start >= 0, `missing source menu row ${sourceId}`);
  return html.slice(start, html.indexOf("</button>", start));
}

function taskConfigPanel(html: string, sourceId: string): string {
  const start = html.indexOf(`<section data-feed-task-config="${sourceId}"`);
  assert.ok(start >= 0, `missing task config ${sourceId}`);
  const next = html.indexOf('<section data-feed-task-config="', start + 1);
  return html.slice(start, next >= 0 ? next : html.length);
}

function persistedDetail(overrides: Partial<PersistedFeedDetailModel["item"]> = {}): PersistedFeedDetailModel {
  return {
    route_prefix: "/projects/project-test",
    entry_id: "item-1",
    inbox_entry: null,
    inbox_active: false,
    primitives,
    item: {
      project_id: "project-test",
      item_id: "item-1",
      source_id: "source-a",
      signal_id: null,
      signal_revision: null,
      item_type: "feed",
      kind: "rss",
      title: "Launch notes",
      summary: "Ship the launch notes",
      body: "Body",
      source_kind: "rss",
      source_label: "Design",
      external_id: "item-1",
      url: "https://example.com/launch",
      origin_status: "ok",
      priority: "normal",
      tags: [],
      author: null,
      disposition: "inbox",
      linked_goal_id: null,
      read_at: null,
      revision: 1,
      source_created_at: "2026-08-30T14:18:00+08:00",
      source_updated_at: "2026-08-30T14:18:00+08:00",
      imported_at: "2026-08-30T14:18:00+08:00",
      updated_at: "2026-08-30T14:18:00+08:00",
      materials: [],
      suggested_behavior_ids: [],
      ...overrides,
    },
  };
}

test("Workbench registers the Feed UI Contribution through the generic UI Host", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  assert.deepEqual(host.list().map((item) => item.contribution_id), [FEED_UI_CONTRIBUTION_ID]);
  assert.throws(
    () => host.register(feedUiContribution),
    (error) => error instanceof ActionError && error.code === "ui_host.contribution_conflict",
  );

  const directory = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: model(),
  });
  assert.equal(directory, "");
  assert.doesNotMatch(directory, /data-directory-panel="feed"/);

  const workbench = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model(),
  });
  assert.match(workbench, /data-feed-stage-directory="true"/);
  assert.match(workbench, /data-feed-stage-shell/);
  assert.match(workbench, /plugin-stage-shell/);
  assert.doesNotMatch(workbench, /data-feed-stage-group/);
  assert.match(workbench, /data-feed-empty-title>还没有来源/);
  assert.match(workbench, /data-feed-add-toggle/);
  assert.match(workbench, /data-feed-source-filter hidden/);
  assert.doesNotMatch(workbench, /接入来源后，消息和 Feed 会出现在这里|选择一项查看详情/);
  assert.doesNotMatch(workbench, /data-directory-panel="feed"/);

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
    surface: "workbench",
    model: model(),
  });
  assert.doesNotMatch(overlays, /data-feed-add-out-rule-contains/);
  assert.match(overlays, /data-feed-source-rail/);
  assert.doesNotMatch(overlays, /data-feed-advanced|data-feed-advanced-open/);
  assert.doesNotMatch(overlays, /Relay|data-relay-import|导入已有历史|与迁移/);
  assert.match(overlays, /data-feed-choose-kind="custom_rss"/);
  assert.match(overlays, /RSS \/ Atom/);
  assert.doesNotMatch(overlays, /网站与博客|持续收集新文章|先选择你想关注的来源/);
  assert.doesNotMatch(overlays, /data-feed-choose-kind="rss"/);

  const catalogOverlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
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
      { rule_id: "rule-a", name: "A launch", enabled: true, contains: "launch", source_id: "source-a", source_kind: null, judgment: null },
      { rule_id: "rule-b", name: "B release", enabled: true, contains: "release", source_id: "source-b", source_kind: null, judgment: null },
      { rule_id: "rule-global", name: "Global", enabled: true, contains: "global", source_id: null, source_kind: null, judgment: null },
    ],
  });
  const directory = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: uiModel,
  });
  const workbench = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: uiModel,
  });
  const overlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: uiModel,
  });
  assert.equal(directory, "");
  assert.doesNotMatch(workbench, /data-feed-advanced-open|<dialog[^>]*data-feed-sources-dialog/);
  assert.match(workbench, /data-feed-source-rail/);
  assert.match(workbench, /data-feed-view="rules"/);
  assert.doesNotMatch(workbench, /mw-dir-row--nested/);
  assert.match(workbench, /data-feed-task="all"/);
  assert.ok(
    workbench.indexOf("data-feed-add-toggle") < workbench.indexOf('data-feed-task="source-a"'),
    "Feed add task sits above source rows",
  );
  assert.match(workbench, /data-feed-task="source-a"/);
  assert.match(workbench, /data-icon="check"|data-icon="alert"|href="#icon-check"|href="#icon-alert"/);
  const panelA = taskConfigPanel(overlays, "source-a");
  const panelB = taskConfigPanel(overlays, "source-b");
  assert.match(panelA, /data-feed-out-rules="source-a"/);
  assert.match(panelA, /A launch/);
  assert.match(panelA, /data-feed-out-rule-create/);
  assert.doesNotMatch(panelA, /B release|Global/);
  assert.match(panelB, /B release/);
  assert.doesNotMatch(panelB, /A launch|Global/);
});

test("Feed capture rule selector loads the shared directory instead of embedding a function list", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const overlays = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
      sources: [source()],
    }),
  });
  const panel = taskConfigPanel(overlays, "source-a");
  assert.match(panel, /data-feed-out-rule-function-key/);
  assert.match(panel, /请选择判断能力/);
  assert.doesNotMatch(panel, /value="system_admit_inbox"/);
  assert.doesNotMatch(panel, /placeholder="system_admit_inbox"/);
  assert.match(panel, /data-feed-rule-instructions/);
  assert.match(panel, /data-feed-rule-preview-run/);
});

test("the reader has no promotion button where promotion cannot run, and the other entries stay", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const render = (model: PersistedFeedDetailModel) => host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "persisted-detail", model });
  assert.match(render({ ...persistedDetail(), promote_available: true }), /data-feed-action="promote"/);
  assert.match(render(persistedDetail()), /data-feed-action="promote"/, "a model that says nothing keeps the button");
  const hidden = render({ ...persistedDetail(), promote_available: false });
  assert.doesNotMatch(hidden, /data-feed-action="promote"/);
  for (const action of ["inbox", "save", "archive"]) assert.match(hidden, new RegExp(`data-feed-action="${action}"`));
  // A rule suggesting promotion does not bring the button back.
  const suggested = render({ ...persistedDetail({ suggested_behavior_ids: ["feed.promote"] }), promote_available: false });
  assert.doesNotMatch(suggested, /data-feed-action="promote"/);
  assert.match(suggested, /data-feed-action="inbox"[^>]*>手动加入 Inbox/);
});

test("Feed suggestions retain an explicit manual Inbox override", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const defaults = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "persisted-detail",
    model: persistedDetail(),
  });
  assert.match(defaults, /data-feed-action="inbox"/);
  assert.match(defaults, /data-feed-action="save"/);
  assert.match(defaults, /data-feed-action="promote"/);
  assert.match(defaults, /data-feed-action="archive"/);
  assert.match(defaults, /打开原文/);

  const stay = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "persisted-detail",
    model: persistedDetail({ suggested_behavior_ids: ["feed.open"] }),
  });
  assert.match(stay, /data-feed-action="inbox"[^>]*>手动加入 Inbox/);
  assert.match(stay, /data-feed-action="save"/);
  assert.match(stay, /data-feed-action="promote"/);
  assert.match(stay, /data-feed-action="archive"/);
  assert.match(stay, /打开原文/);

  const illegal = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "persisted-detail",
    model: persistedDetail({ suggested_behavior_ids: ["invented.behavior", "invented.other"] }),
  });
  assert.match(illegal, /data-feed-action="inbox"/);

  const promote = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "persisted-detail",
    model: persistedDetail({ suggested_behavior_ids: ["feed.promote"] }),
  });
  assert.match(promote, /data-feed-action="promote"/);
  assert.match(promote, /data-feed-action="inbox"[^>]*>手动加入 Inbox/);
  assert.doesNotMatch(promote, /data-feed-action="save"/);
  assert.doesNotMatch(promote, /data-feed-action="archive"/);
  assert.match(promote, /打开原文/);
});

test("Gmail source detail opens Connectors with the current project", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const gmail = source({
    source_id: "gmail-account",
    kind: "gmail",
    sync_kind: "gmail",
    ui_kind: "gmail",
    name: "Gmail · owner@example.com",
    account_label: "owner@example.com",
    status: "error",
    status_kind: "attention",
    last_error_code: "connector.needs_auth",
  });
  const html = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "source-workbench",
    model: model({ sources: [gmail] }),
  });
  assert.match(html, /href="\/settings\/connectors\?connector=gmail&amp;project=project-test"/);
  assert.match(html, /管理账号连接/);
});

test("RING-05 Feed pull history separates running, interrupted, failed and completed receipts", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const receipt = { outcome: null, error_code: null, created_count: 2, deduped_count: 1, started_at: "2026-10-13T00:00:00Z", completed_at: null };
  const html = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "source-workbench", model: model({ sources: [source({ runs: [
    { ...receipt, phase: "running" },
    { ...receipt, phase: "interrupted" },
    { ...receipt, phase: "terminal", error_code: "connector_rate_limited" },
    { ...receipt, phase: "terminal", completed_at: "2026-10-13T00:00:01Z" },
  ] })] }) });
  const rows = [...html.matchAll(/<li data-run-state="([^"]+)">([\s\S]*?)<\/li>/g)];
  assert.equal(rows.length, 4);
  const expected = [
    ["running", "syncing", "正在拉取", "已开始，等待来源返回"],
    ["error", "interrupted", "拉取已中断", "新增 2 · 去重 1"],
    ["error", "failed", "拉取失败", "错误：connector_rate_limited · 可安全重试"],
    ["complete", "done", "拉取完成", "新增 2 · 去重 1"],
  ];
  for (const [index, row] of rows.entries()) {
    const [phase, ring, title, summary] = expected[index]!;
    assert.equal(row[1], phase);
    assert.ok(row[2]!.includes(`data-mw-state="${ring}"`));
    assert.ok(row[2]!.includes(`<strong>${title}</strong><p>${summary}</p>`));
  }
  assert.ok(rows[3]![2]!.includes("2026-10-13T00:00:01Z"));
});

// Soft Workbench (specs/archive/soft-workbench-rollout): the Feed column is one timeline, as in the approved prototype; the
// per-source folds became a source menu. Attribution, counts, empty sources and source state are still checked here.
test("Feed stage list is one timeline and the source menu keeps each source's count and state", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const sourceA = source({ source_id: "source-a", name: "GitHub · adeptify", ui_kind: "github" });
  const sourceB = source({ source_id: "source-b", name: "Gmail · product", ui_kind: "gmail" });
  const emptySource = source({ source_id: "source-empty", name: "空任务", ui_kind: "rss" });
  const pausedSource = source({ source_id: "source-paused", name: "暂停任务", ui_kind: "rss", status_kind: "paused" });
  const workbench = host.render({
    contribution_id: FEED_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
      sources: [sourceA, sourceB, emptySource, pausedSource],
      entries: [
        itemEntry({ entry_id: "entry-b", source_id: "source-b", title: "Gmail item", provider: "gmail", source_label: "Gmail · product" }),
        itemEntry({ entry_id: "entry-a", source_id: "source-a", title: "GitHub item", provider: "github", source_label: "GitHub · adeptify" }),
        itemEntry({ entry_id: "entry-orphan", source_id: "missing-source", title: "Orphan item", provider: "other", source_label: "Unknown" }),
      ],
    }),
  });
  assert.doesNotMatch(workbench, /data-feed-stage-group|goal-collection-fold/);
  assert.match(workbench, /data-feed-rows/);
  // Every row names the source it came from, and the menu scope it belongs to.
  assert.match(workbench, /data-feed-entry-id="entry-a"[^>]*data-feed-entry-source-id="source-a" data-feed-entry-task="source-a"/);
  assert.match(workbench, /data-feed-entry-id="entry-b"[^>]*data-feed-entry-source-id="source-b" data-feed-entry-task="source-b"/);
  assert.match(workbench, /data-feed-entry-id="entry-orphan"[^>]*data-feed-entry-task="other"/);
  assert.match(workbench, /class="feed-entry-source">GitHub · adeptify</);
  // The source menu keeps configured order, counts, empty sources and a state mark that is not colour alone.
  const github = sourceMenuRow(workbench, "source-a");
  assert.match(github, /<strong>GitHub · adeptify<\/strong>/);
  assert.match(github, /<em>1<\/em>/);
  assert.match(github, /class="is-ready"/);
  // RING-05: the menu keeps each source's distinct state in the shared presentation.
  assert.match(github, /<svg[^>]*data-mw-state="connected"/);
  assert.match(sourceMenuRow(workbench, "source-empty"), /<em>0<\/em>/);
  const paused = sourceMenuRow(workbench, "source-paused");
  assert.match(paused, /class="is-attention"/);
  assert.match(paused, /<svg[^>]*data-mw-state="paused"/);
  assert.match(sourceMenuRow(workbench, "other"), /<strong>其他<\/strong>/);
  assert.ok(
    workbench.indexOf('data-feed-task="source-a"') < workbench.indexOf('data-feed-task="source-b"'),
    "the menu follows source order",
  );
  assert.ok(
    workbench.indexOf('data-feed-task="source-b"') < workbench.indexOf('data-feed-task="other"'),
    "unmatched items sit after configured sources",
  );
  assert.match(workbench, /data-feed-entry-detail="entry-a"/);
  // The column offers the prototype's three-way switch; the full filter menu stays beside search.
  assert.match(workbench, /data-feed-quick="all"[^>]*aria-pressed="true"/);
  assert.match(workbench, /data-feed-quick="unread"/);
  assert.match(workbench, /data-feed-quick="saved"/);
  assert.match(workbench, /data-feed-filter-trigger/);
});

test("Feed draws only what its model holds: an inbox-bound entry keeps the stage's row anatomy, and nothing of the old demo is left", () => {
  const entry = { ...itemEntry({ entry_id: "entry-inbox", source_id: "source-a", title: "Review request", provider: "github", source_label: "GitHub · design" }), disposition: "inbox" };
  const host = new UiHost();
  host.register(feedUiContribution);
  const real = model({ entries: [entry], sources: [source({ source_id: "source-a", name: "GitHub · design", ui_kind: "github" })] });
  const detail = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "workbench", model: real });
  const sourceStage = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "source-workbench", model: real });
  assert.match(detail, /data-feed-entry-task="source-a"/);
  assert.match(detail, /data-feed-entry-persisted="true"/);
  assert.match(detail, /class="feed-stage-entry directory-list-row"/);
  assert.match(detail, /class="feed-stage-leading"/);
  assert.match(detail, /mw-status mw-status--attention mw-status--plain feed-entry-status/);
  assert.match(detail, /已加入 Inbox/);
  assert.doesNotMatch(detail, /feed-entry-chevron|feed-entry-origin|feed-stage-entry-copy/);
  assert.doesNotMatch(detail, /class="feed-list-item/);
  assert.match(detail, /data-feed-task="source-a"/);
  assert.match(detail, /data-feed-task="all"/);
  assert.doesNotMatch(detail, /mw-dir-row--nested/);
  // The old page-local demo (fake GitHub, Gmail and RSS sources and messages whose buttons only changed the page) is gone.
  assert.doesNotMatch(detail + sourceStage, /data-prototype|data-feed-entry-prototype|feed-detail--prototype|prototype-honesty-note|演示|模拟/);
  assert.match(sourceStage, /data-real-source-id="source-a"/);
});

test("A demo project whose Feed holds nothing is given no invented sources or messages (E-3)", () => {
  const built = buildFeedStageUiModel({ route_prefix: "/projects/demo", shown_plugins: ["feed"], primitives,
    context: { project: { project_id: "demo", display_name: "Demo" }, demo: true, cli_availability: {} },
    data: { snapshot: { feed_items: [], sources: [], runs: [], out_rules: [] }, inbox_entries: [], source_catalog: [], source_presentations: {},
      connector_auth: { github: { bound: false }, gmail: { bound: false } } } });
  assert.deepEqual(built.entries, []);
  assert.deepEqual(built.sources, []);
  assert.equal("demo" in built, false, "the model has no demo flag for the plugin to draw a prototype from");
});

/** Top-level rules of a stylesheet, descending into conditional at-rules; keyframes and font faces are kept whole. */
function cssRules(css: string): Array<{ prelude: string; body: string }> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Array<{ prelude: string; body: string }> = [];
  let start = 0;
  for (let at = 0; at < source.length; at += 1) {
    if (source[at] === ";") { start = at + 1; continue; }
    if (source[at] !== "{") continue;
    let depth = 1;
    let end = at + 1;
    for (; end < source.length && depth > 0; end += 1) depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0;
    const prelude = source.slice(start, at).trim();
    const body = source.slice(at + 1, end - 1);
    rules.push({ prelude, body });
    if (/^@(media|container|supports|layer)\b/.test(prelude)) rules.push(...cssRules(body));
    at = end - 1;
    start = end;
  }
  return rules;
}

test("The Feed stylesheet keeps every rule whole: no selector list runs into the next rule, and the reader keeps its own block", () => {
  const rules = cssRules(FEED_STYLES);
  for (const { prelude } of rules) {
    assert.doesNotMatch(prelude, /,\s*$/, `a selector list ends in a comma and swallowed the next rule: ${prelude.slice(-80)}`);
    if (!prelude.startsWith("@")) assert.doesNotMatch(prelude, /@\w/, `a selector swallowed an at-rule: ${prelude.slice(-80)}`);
  }
  const reading = rules.filter(({ prelude }) => /\.feed-stage-item-detail \.feed-detail$/.test(prelude));
  assert.equal(reading.length, 1, "the reader's own .feed-detail block");
  assert.match(reading[0].body, /max-width:\s*700px/);
  // The reader rises once with the product's shared arrival (DESIGN「Motion」); the Workbench does not animate its frame too.
  assert.match(reading[0].body, /animation:\s*craft-rise var\(--dur-arrive\)/);
  assert.ok(!rules.some(({ prelude }) => prelude.startsWith("@keyframes")), "Feed writes no keyframes of its own");
});

test("Feed with nothing to show says so: no sources, or a source with no messages, never fabricated rows", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const none = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "workbench", model: model() });
  assert.match(none, /<strong data-feed-empty-title>还没有来源<\/strong>/);
  assert.equal(none.match(/data-feed-entry-id=/g)?.length ?? 0, 0);
  assert.equal(none.match(/data-feed-task="/g)?.length ?? 0, 1, "only the “all” row, no invented sources");
  const quiet = host.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "workbench", model: model({ sources: [source()] }) });
  assert.match(quiet, /<strong data-feed-empty-title>还没有消息，拉取后会出现在这里<\/strong>/);
  assert.equal(quiet.match(/data-feed-entry-id=/g)?.length ?? 0, 0);
  assert.doesNotMatch(none + quiet, /data-prototype|adeptify|Latent Space/);
});

test("Feed's Manifest declares exactly the routes Feed answers, matched under its plugin prefix", async () => {
  let observed: { itemId: string; action: string } | null = null;
  const unused = () => {
    throw new Error("unused Feed route port");
  };
  const handlers = createFeedRouteHandlers({ actions: { invoke: unused } });
  // The page's HTML is the shell's stage (`/api/stage/feed`); Feed declares only JSON routes, each with a handler of its own.
  assert.deepEqual(Object.keys(handlers).sort(), (feedManifest.routes ?? []).map(({ route_id }) => route_id).sort());
  assert.ok(!Object.keys(handlers).some((routeId) => routeId === "feed.workbench" || routeId === "feed.item.detail"));
  const match = pluginRouteMatcher(feedManifest);
  const routed = match("POST", "/api/plugins/io.molis.work.feed/items/item%2Fone/archive");
  assert.equal(routed?.route_id, "feed.item.action");
  assert.deepEqual(routed?.params, { item_id: "item/one", action: "archive" });
  const echo: FeedPluginRouteHandler = ({ params }) => {
    observed = { itemId: params.item_id!, action: params.action! };
    return { status: 200, body: observed };
  };
  assert.equal((await echo({ params: routed!.params, request: { method: "POST", pathname: "", query: new URLSearchParams(), body: {} } })).status, 200);
  assert.deepEqual(observed, { itemId: "item/one", action: "archive" });
  assert.equal(match("GET", "/api/not-feed"), null);
  assert.equal(match("GET", "/api/feed/out-rules"), null, "the Host's retired edge is not Feed's");
  assert.equal(match("GET", "/api/plugins/io.molis.work.feed/out-rules")?.route_id, "feed.out-rules.list");
  assert.equal(match("GET", "/api/plugins/io.molis.work.feed/workbench"), null);
});


test("RAC-2507 RAC-2512 Feed stage and reader keep instance data, current suggestions and independent action availability", async t => {
  const directory = mkdtempSync(join(tmpdir(), "feed-owner-stage-")), databasePath = join(directory, "project.db"), projectId = "feed-stage-project";
  seedDemoBoard(databasePath, projectId);
  const database = new LocalProjectDatabase(databasePath);
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const feed = createLocalFeedApplication(database.db);
  const source = createLocalFeedSourceService(database.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "owner-stage" }).source;
  const item = feed.ingestItem({ source, externalId: "reader", title: "Owner stage item", summary: "Owner summary", body: "Exact owner body", occurredAt: "2026-11-01T00:00:00Z", attention: false }).item;
  feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual");
  let entries = feed.listInboxEntries(projectId), promote = true, catalogReads = 0;
  let recommendationsFailure: Error | undefined;
  let waitForInbox: (() => Promise<typeof entries>) | undefined;
  const catalog = [{ id: "instance-only", name: "This instance's vocabulary", kind: "rss" as const, feed_url: "https://example.com/feed.xml", category: "technology", category_label: "技术", limitations: [] }];
  const definitions = Object.values(feedQueryActions);
  const service = new ActionService();
  const dispose = service.registerProvider({ provider: { provider_id: feedManifest.plugin_id, plugin_id: feedManifest.plugin_id, kind: "plugin", title: "Feed", project_id: projectId }, definitions,
    handlers: createFeedQueryHandlers(feed, projectId, { hydrate: async value => value, authStatus: () => ({ github: { bound: true }, gmail: { bound: false } }), linkedContext: async () => null,
      stage: { sourceCatalog: () => { catalogReads++; return catalog; }, recommendations: async () => {
        if (recommendationsFailure) throw recommendationsFailure;
        return { recommendations: [{ item_id: item.item_id, suggested_behavior_ids: [FEED_SAVE_OPTION_ID] }] };
      }, inboxEntries: async () => waitForInbox ? waitForInbox() : entries, promoteAvailable: async () => promote } }) });
  t.after(dispose);
  const caller: ActionCallContext = { actor_id: "stage-reader", audience: "user", project_id: projectId, permissions: [...new Set(definitions.flatMap(definition => definition.action.permissions))] };
  const stage = await service.invoke(caller, feedQueryActions.stage, {});
  assert.deepEqual(stage.source_catalog, catalog); assert.equal(catalogReads, 1);
  assert.equal(stage.connector_auth.github.bound, true);
  const row = stage.snapshot.feed_items.find(row => row.item_id === item.item_id);
  assert.equal(row?.body, null); assert.deepEqual(row?.suggested_behavior_ids, [FEED_SAVE_OPTION_ID]);
  assert.equal(stage.inbox_entries.some(entry => entry.subject_id === item.item_id), true);
  const reader = await service.invoke(caller, feedQueryActions.reader, { object_id: item.item_id });
  assert.equal(reader.item.body, "Exact owner body"); assert.deepEqual(reader.item.suggested_behavior_ids, [FEED_SAVE_OPTION_ID]);
  assert.equal(reader.inbox_active, true); assert.equal(reader.promote_available, true);
  entries = entries.map(entry => ({ ...entry, status: "done" })); promote = false;
  const closed = await service.invoke(caller, feedQueryActions.reader, { object_id: item.item_id });
  assert.equal(closed.inbox_active, false); assert.equal(closed.promote_available, false);
  const before = feed.getFeedItem(projectId, item.item_id);
  recommendationsFailure = new Error("the real recommendation service failed");
  await assert.rejects(service.invoke(caller, feedQueryActions.stage, {}), error => error === recommendationsFailure);
  recommendationsFailure = undefined;
  const entered = Promise.withResolvers<void>(), resumed = Promise.withResolvers<typeof entries>();
  waitForInbox = () => { entered.resolve(); return resumed.promise; };
  let current = true;
  const pending = service.invoke({ ...caller, validate_authority: async () => { if (!current) throw new ActionError("actions.forbidden", "The original authority was withdrawn"); } }, feedQueryActions.reader, { object_id: item.item_id });
  await entered.promise; current = false; resumed.resolve(entries);
  await assert.rejects(pending, { code: "actions.forbidden" });
  assert.deepEqual(feed.getFeedItem(projectId, item.item_id), before, "owner queries and a refused late read do not alter the item");
});
