import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const prototypePath = path.resolve(
  "specs/goal-momentum-hifi-slice/artifacts/prototype.html",
);
const specPath = path.resolve("specs/goal-momentum-hifi-slice/spec.md");

function readPrototype(): string {
  return fs.readFileSync(prototypePath, "utf8");
}

test("Goal momentum prototype is a self-contained, honest interactive slice", () => {
  const html = readPrototype();

  assert.match(html, /<title>Goal 推进态势 · 高保真切片<\/title>/);
  assert.match(html, /高保真演示 · 不写入数据/);
  assert.match(html, /代表性快照，不是生产实时统计/);
  assert.match(html, /历史不足，未计入“停滞”/);
  assert.match(html, /data-period="7" aria-pressed="true"/);
  assert.match(html, /data-period="30" aria-pressed="false"/);
  assert.match(html, /var periods = \{[\s\S]*"7": \{[\s\S]*"30": \{/);
  assert.match(html, /renderPeriod\("7"\)/);
  assert.match(html, /filterQueue\("all"\)/);
  assert.match(html, /selectGoal\("session-runtime-foundation"\)/);
});

test("Goal momentum prototype covers cadence, complete topology, queue, detail, and edge states", () => {
  const html = readPrototype();

  assert.match(html, /推进节奏/);
  assert.match(html, /完整 Goal 依赖拓扑/);
  assert.match(html, /30 个 Goal · 38 条 depends_on/);
  assert.match(html, /现在做什么/);
  assert.match(html, /当前选择/);
  assert.match(html, /depends_on：前置提供者 → 消费者/);
  assert.match(html, /虚线分组带表达 part_of/);
  assert.match(html, /data-map-filter="all" aria-pressed="true"/);
  assert.match(html, /data-map-filter="open" aria-pressed="false"/);
  assert.doesNotMatch(html, /已折叠 \d+ 个低影响或已完成 Goal/);
  assert.match(html, /当前没有需要决定的行动/);
  assert.match(html, /口径与缺口：为什么这些数字和排序可以相信/);
  assert.match(html, /state: "ready"/);
  assert.match(html, /state: "running"/);
  assert.match(html, /state: "blocked"/);
  assert.match(html, /state: "done"/);
  assert.match(html, /@media \(max-width: 760px\)/);
  assert.match(html, /"ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"/);
});

test("Goal topology includes every current Goal and every depends_on relation", () => {
  const html = readPrototype();
  const nodeBlock = html.match(/var topologyNodes = \[([\s\S]*?)\n      \];/)?.[1] ?? "";
  const edgeBlock = html.match(/var topologyEdges = \[([\s\S]*?)\n      \];/)?.[1] ?? "";
  const renderedLeafNodes = (nodeBlock.match(/\{ id:/g) ?? []).length;
  const clickableParentGroups = (html.match(/<button class="goal-group-title"/g) ?? []).length;
  const dependencyEdges = (edgeBlock.match(/\["/g) ?? []).length;

  assert.equal(renderedLeafNodes + clickableParentGroups, 30);
  assert.equal(dependencyEdges, 38);
  assert.match(html, /节点列号只来自依赖深度/);
  assert.doesNotMatch(html, /topologyEdges[\s\S]*part_of/);
});

test("Goal momentum queue order and reasoning stay explicit", () => {
  const html = readPrototype();
  const foundation = html.indexOf(
    '<span class="queue-rank">01</span>',
  );
  const rss = html.indexOf('<span class="queue-rank">02</span>');
  const gmail = html.indexOf('<span class="queue-rank">03</span>');
  const momentum = html.indexOf('<span class="queue-rank">04</span>');

  assert.ok(foundation > 0);
  assert.ok(rss > foundation);
  assert.ok(gmail > rss);
  assert.ok(momentum > gmail);
  assert.match(html, /没有未完成前置；完成后 4 项实现与最终验收会解除前置阻塞/);
  assert.match(html, /已有 active Claim；完成可移除真实集成的两项阻塞之一/);
  assert.match(html, /运行底座已满足、当前无人领取/);
  assert.match(html, /需要人类判断后才能进入真实接入/);
  assert.doesNotMatch(html, /综合得分|score\s*[:=]/i);
});

test("Goal momentum selection links to real Molis Work Goal details without adding write behavior", () => {
  const html = readPrototype();

  assert.match(
    html,
    /http:\/\/127\.0\.0\.1:4173\/projects\/project-aeb51deb-e335-403b-80cc-387e20e0e000\/goals\//,
  );
  for (const goalId of [
    "session-runtime-foundation",
    "goal-infoflow-gmail-connector",
    "goal-infoflow-rss-connector",
    "goal-infoflow-internal-integration",
    "goal-momentum-hifi-slice",
    "goal-momentum-internal-complete",
  ]) {
    assert.match(html, new RegExp('"' + goalId + '"'));
  }
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(html, /fetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(html, /data-drag|draggable=|dropzone=/);
});

test("Goal momentum spec preserves the Level 2 boundary and human decision gate", () => {
  const spec = fs.readFileSync(specPath, "utf8");

  assert.match(spec, /2 · 可交互原型/);
  assert.match(spec, /不会读取生产数据库实时计算，也不会替换现有关系图/);
  assert.match(spec, /覆盖当前全部 Goal、按 `depends_on` 拓扑层级从左到右展开/);
  assert.match(spec, /默认展示当前项目全部 30 个 Goal 与全部 38 条 `depends_on`/);
  assert.ok(spec.includes("goal-momentum-slice-core"));
  assert.ok(spec.includes("human_decision"));
  assert.match(spec, /本轮不修改/);
  assert.ok(spec.includes("src/web/render.ts"));
  assert.match(spec, /不进入真实实现，回到信息结构调整/);
});
