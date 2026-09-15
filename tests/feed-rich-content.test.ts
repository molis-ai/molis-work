import assert from "node:assert/strict";
import test from "node:test";

import type { FeedItemRecord } from "@molis-ai/molis-work-plugin-feed";
import { feedPlainText, renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { renderPersistedFeedItemDetail } from "./workbench-renderer-fixture.js";

const MIXED_BODY = `Bumps [eslint](https://github.com/eslint/eslint) from 9.39.5 to 10.8.1.

<details open><summary>Release notes</summary><p><em>Sourced from <a href="https://github.com/eslint/eslint/releases">eslint releases</a>.</em></p>
<blockquote><h2>v10.8.1</h2><h3>Bug Fixes</h3><ul><li><a href="https://github.com/eslint/eslint/commit/18eb0a7"><code>18eb0a7</code></a> fix ASI hazard</li></ul></blockquote></details>

| Package | Version |
| --- | --- |
| eslint | 10.8.1 |
`;

function feedItem(overrides: Partial<FeedItemRecord> = {}): FeedItemRecord {
  return {
    board_id: "board-test",
    item_id: "feed-rich-item",
    source_id: "github-source",
    item_type: "feed",
    kind: "github_notification",
    title: "PR #11: build(deps-dev): bump eslint",
    summary: "Bumps [eslint](https://github.com/eslint/eslint) from 9.39.5 to 10.8.1. <details><summary>Release notes</summary></details>",
    body: MIXED_BODY,
    source_kind: "github",
    source_label: "GitHub",
    external_id: "11",
    url: "https://github.com/molis-ai/molis-work/pull/11",
    origin_status: "source",
    priority: "normal",
    tags: ["dependency"],
    author: "dependabot[bot]",
    disposition: "inbox",
    linked_goal_id: null,
    read_at: null,
    revision: 1,
    source_created_at: "2026-08-30T06:06:00.000Z",
    source_updated_at: "2026-08-30T06:06:00.000Z",
    imported_at: "2026-08-30T06:06:00.000Z",
    updated_at: "2026-08-30T06:06:00.000Z",
    materials: [],
    ...overrides,
  };
}

test("Feed rich content renders mixed GFM Markdown and allowlisted HTML", () => {
  const html = renderFeedRichText(MIXED_BODY);
  assert.match(html, /<a href="https:\/\/github\.com\/eslint\/eslint" target="_blank" rel="noopener noreferrer">eslint<\/a>/);
  assert.match(html, /<details open><summary>Release notes<\/summary>/);
  assert.match(html, /<h2>v10\.8\.1<\/h2>/);
  assert.match(html, /<ul>[\s\S]*<code>18eb0a7<\/code>[\s\S]*<\/ul>/);
  assert.match(html, /<table>[\s\S]*<th>Package<\/th>[\s\S]*<td>10\.8\.1<\/td>[\s\S]*<\/table>/);
});

test("Feed rich content removes active content, styling, media, and unsafe links", () => {
  const html = renderFeedRichText(`
<script>globalThis.pwned = true</script>
<style>body { display: none }</style>
<iframe src="https://example.com"></iframe>
<svg><script>alert(1)</script><a href="javascript:alert(2)">svg link</a></svg>
<img src="https://example.com/tracker.png" onerror="alert(3)">
<p class="remote" style="position:fixed" onclick="alert(4)">Visible text</p>
<a href="javascript:alert(5)" onmouseover="alert(6)">unsafe</a>
<a href="data:text/html,unsafe">data</a>
<a href="//example.com/path">protocol relative</a>
<a href="/relative/path">relative</a>

[safe](https://example.com/path)
`);
  assert.doesNotMatch(html, /globalThis\.pwned|display:\s*none|alert\(/);
  assert.doesNotMatch(html, /<(?:script|style|iframe|svg|img)\b/);
  assert.doesNotMatch(html, /(?:class|style|onclick|onmouseover)=/);
  assert.doesNotMatch(html, /href="(?:javascript:|data:|\/\/|\/relative)/);
  assert.match(html, /<p>Visible text<\/p>/);
  assert.match(html, /<a>unsafe<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer">safe<\/a>/);
});

test("Feed plain text removes markup, decodes entities, and truncates by Unicode character", () => {
  assert.equal(
    feedPlainText("Bumps [eslint](https://example.com) &amp; **TypeScript** <em>today</em>"),
    "Bumps eslint & TypeScript today",
  );
  assert.equal(feedPlainText("😀😀😀😀", 4), "😀😀😀😀");
  assert.equal(feedPlainText("😀😀😀😀😀", 4), "😀😀😀…");
  assert.equal(feedPlainText("<script>hidden</script>"), "");
});

test("persisted Feed detail uses clean summary and safe rich body", () => {
  const html = renderPersistedFeedItemDetail(feedItem());
  const header = html.slice(0, html.indexOf('<section class="feed-detail-body">'));
  assert.match(header, /<p>Bumps eslint from 9\.39\.5 to 10\.8\.1\. Release notes<\/p>/);
  assert.doesNotMatch(header, /\[eslint\]|<details>/);
  assert.match(html, /<div class="feed-rich-content"><p>Bumps <a href="https:\/\/github\.com\/eslint\/eslint"/);
  assert.match(html, /<details open><summary>Release notes<\/summary>/);
});

test("persisted Feed detail keeps an explicit empty-body fallback", () => {
  const html = renderPersistedFeedItemDetail(feedItem({ body: null, summary: "" }));
  assert.match(html, /<div class="feed-rich-content"><p>这条消息没有可显示的正文。<\/p>\s*<\/div>/);
});
