import assert from "node:assert/strict";
import test from "node:test";

import {
  renderCodingReport,
  renderCodingUsage,
  type CodingUiPrimitives,
} from "@molis-ai/molis-work-plugin-coding";

const p: CodingUiPrimitives = {
  L: (text) => text,
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value) => value,
  formatDate: (value) => value.slice(0, 10),
};

test("报告带出处——没有出处的报告只是让人凭信的一段文字", () => {
  const html = renderCodingReport({
    title: "三种失败路径", body_html: "<p>正文</p>", run_id: "run-3", primitives: p,
  });
  assert.match(html, /三种失败路径/);
  assert.match(html, /来自本轮执行 run-3/);
  assert.match(html, /<p>正文<\/p>/, "正文由共享 Markdown 路径渲染，这里只作框");
});

test("报告标题被转义，正文按已渲染内容原样放入", () => {
  const html = renderCodingReport({
    title: '<img src=x onerror="alert(1)">', body_html: "<p>ok</p>", run_id: "r", primitives: p,
  });
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x/);
});

test("运行时没报用量时显示未知，绝不显示 0", () => {
  const html = renderCodingUsage({
    usage: { tokens: { input: 0, output: 0 }, unavailable_reason: "这个运行时不报用量" },
    primitives: p,
  });
  assert.match(html, /用量未知/);
  assert.match(html, /这个运行时不报用量/);
  assert.match(html, /data-coding-usage="unknown"/);
  assert.doesNotMatch(html, /coding-usage-row/, "显示 0 会被读成「这一轮不花钱」");
});

test("报了用量就如实显示，有费用才显示费用", () => {
  const withCost = renderCodingUsage({
    usage: { tokens: { input: 191, output: 30 }, cost_usd: 0.0123 }, primitives: p,
  });
  assert.match(withCost, /191/);
  assert.match(withCost, /30/);
  assert.match(withCost, /\$0\.0123/);

  const noCost = renderCodingUsage({ usage: { tokens: { input: 5, output: 1 } }, primitives: p });
  assert.doesNotMatch(noCost, /\$/, "不知道费用就不显示费用");
});

test("中断后已知字段仍可读，缺失字段不把占位零当消耗", () => {
  const html = renderCodingUsage({ primitives: p, usage: {
    tokens: { input: 1234, output: 0, cached_input: 0, cache_creation: 42 }, cost_usd: 0.019,
    coverage: { input: "partial", output: "unknown", cached_input: "reported", cache_creation: "estimated", cost_usd: "partial" },
    unavailable_reason: "中断，后续用量未保存",
  } });
  assert.match(html, /输入 1234（已知小计）/);
  assert.match(html, /输出未知/);
  assert.doesNotMatch(html, /输出 0/);
  assert.match(html, /缓存读取 0（已记录）/);
  assert.match(html, /缓存写入 42（估算）/);
  assert.match(html, /费用 \$0\.0190（已知小计）/);
  assert.match(html, /中断，后续用量未保存/);
  assert.match(html, /data-coding-usage="partial"/);
});
