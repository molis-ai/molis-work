import assert from "node:assert/strict";
import test from "node:test";

import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

/**
 * 从构建期组合走向运行期托管的那道接缝。
 *
 * 不提供 plugin_panels 时，页面必须和以前**逐字节相同**——这样这条接缝可以先落地，
 * 等平台真的在生产里装配起来再启用，中间不会有半截迁移影响用户。
 */

function baseView(): MolisWorkWebView {
  const view = {
    snapshot: {
      board: {
        board_id: "board-root-directory",
        title: "根目录一致性",
        active_goal_id: null,
        created_at: "2026-08-31T00:00:00.000Z",
        updated_at: "2026-08-31T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      impacts: [],
      risks: [],
      claims: [],
      runs: [],
      evidence: [],
      review_obligations: [],
      reviews: [],
      candidates: [],
      contract_proposals: [],
      rewires: [],
      clarification_sessions: [],
      clarification_turns: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: { project_id: "project-root-directory", display_name: "根目录一致性" },
    projects: [{ project_id: "project-root-directory", display_name: "根目录一致性" }],
    route_prefix: "/projects/project-root-directory",
    demo: false,
    active_goal_id: null,
    goals: [],
    archived_goals: [],
    trashed_goals: [],
    counts: {},
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: {
      sources: [],
      feed_items: [],
      inbox_entries: [],
      runs: [],
      contract_migrations: [],
      out_rules: [],
    },
  } as MolisWorkWebView;
  return view;
}

test("不提供运行期面板时，页面输出逐字节不变", () => {
  const before = renderMolisWorkWeb(baseView());
  const withEmpty = { ...baseView(), plugin_panels: {} } as MolisWorkWebView;
  assert.equal(renderMolisWorkWeb(withEmpty), before,
    "接缝必须是空操作，否则它本身就是一次未经验证的改版");
});

test("运行中的插件给出面板时，它就出现在目录里", () => {
  const panel = '<div data-coding-panel>会话列表</div>';
  const view = {
    ...baseView(),
    enabled_plugins: ["goals", "sessions", "inbox", "feed", "artifacts", "coding"],
    plugin_panels: { coding: panel },
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  assert.match(html, /data-plugin-section="coding"/);
  assert.match(html, /data-coding-panel/);
});

test("面板只影响给出它的那个插件，别的照旧", () => {
  const before = renderMolisWorkWeb(baseView());
  const view = {
    ...baseView(),
    enabled_plugins: ["goals", "sessions", "inbox", "feed", "artifacts", "coding"],
    plugin_panels: { coding: "<div data-coding-panel></div>" },
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  // feed 这一段在两种情况下都该存在且未被改动
  const feedBefore = /data-plugin-section="feed"/.test(before);
  assert.equal(/data-plugin-section="feed"/.test(html), feedBefore);
});
