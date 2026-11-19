import assert from "node:assert/strict";
import test from "node:test";
import {
  CODING_STYLES,
  codingRoundTally,
  codingTimelineWords,
  createCodingTimeline,
  renderCodingDirectory as drawCodingDirectory,
  renderCodingWorkbench as drawCodingWorkbench,
  toolAvailability,
  type CodingSessionEntry,
  type CodingUiModel,
  type CodingUiPrimitives,
} from "@molis-ai/molis-work-plugin-coding";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { pageText, withPageText } from "./fixtures/page-text.js";
import { chinesePagePacks, pageTextForPacks, withPagePacks } from "./fixtures/page-text-packs.js";

// Screen polish, first round, P4 first half (specs/screen-polish/p4-coding.md): what the server draws and what an ended
// round's line says. What the page does with it in a browser is in coding-screen-polish.e2e.test.ts.

const renderCodingDirectory: typeof drawCodingDirectory = (...args) => withPageText("zh", ["coding"], () => drawCodingDirectory(...args));
const renderCodingWorkbench: typeof drawCodingWorkbench = (...args) => withPageText("zh", ["coding"], () => drawCodingWorkbench(...args));

const primitives: CodingUiPrimitives = {
  escape: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: pageText("zh", "coding"),
  formatDate: (value) => value.slice(0, 10),
};

function model(overrides: Partial<CodingUiModel> = {}): CodingUiModel {
  return {
    route_prefix: "", face: "sessions", filter: "all", sessions: [],
    tools: toolAvailability({ capabilities: emptyCapabilityMatrix(), embedded_browser: false }),
    workspace_path: "/Users/someone/code/goalboard", primitives, ...overrides,
  };
}

interface FakeNode {
  className: string; innerHTML: string; hidden: boolean; dataset: Record<string, string>; children: FakeNode[];
  readonly lastElementChild: FakeNode | null;
  append(child: FakeNode): void; querySelector(selector: string): FakeNode | null; querySelectorAll(): FakeNode[]; setAttribute(): void;
}

/** The little of a round's block that `renderFooter` touches: it finds or makes the footer and writes its HTML. */
function fakeBlock(): FakeNode {
  const make = (): FakeNode => {
    const children: FakeNode[] = [];
    return {
      className: "", innerHTML: "", hidden: false, dataset: {}, children,
      get lastElementChild() { return children.at(-1) ?? null; },
      append(child) { children.push(child); },
      querySelector(selector) { return selector === ":scope > .coding-run-footer" ? children.find(item => item.className === "coding-run-footer") ?? null : null; },
      querySelectorAll() { return []; },
      setAttribute() {},
    };
  };
  (globalThis as Record<string, unknown>).document ??= { createElement: () => make() };
  return make();
}

type FooterRun = Parameters<ReturnType<typeof createCodingTimeline>["renderFooter"]>[1];
const edited: FooterRun = {
  ref: { run_id: "r-edit" }, phase: "completed", started_at: "2026-11-18T10:00:00.000Z", ended_at: "2026-11-18T10:00:12.000Z",
  activity: [
    { call_id: "e1", name: "edit", target: "src/app.ts", state: "completed" },
    { call_id: "e2", name: "write", target: "src/new.ts", state: "completed" },
    { call_id: "e3", name: "edit", target: "README.md", state: "completed" },
  ],
} as FooterRun;

function footer(run: FooterRun, tally: Parameters<typeof createCodingTimeline>[1] = undefined): string {
  const packs = chinesePagePacks("coding");
  return withPagePacks("zh", packs, () => {
    const block = fakeBlock();
    createCodingTimeline(codingTimelineWords(pageTextForPacks("zh", packs)), tally).renderFooter(block as never, run, 0, true, false);
    return block.lastElementChild!.innerHTML;
  });
}

const headerOf = (html: string) => /<header>([\s\S]*?)<\/header>/.exec(html)?.[1] ?? "";
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("POLISH-24 回合结束卡是一行：怎么结束、改了什么和「看改动」都在卡头里", () => {
  const html = footer(edited, runId => runId === "r-edit" ? { added: 24, removed: 6 } : null), head = headerOf(html);
  assert.match(plain(head), /^本轮结束 第 1 轮 用时 12 秒 · 修改 3 个文件 \+24 −6/, "卡头一行说完结束、用时、改了几个文件和增减行");
  assert.match(head, /<span class="coding-change-counts"><ins>\+24<\/ins><del>−6<\/del><\/span>/, "增减行用变更列表同一种写法");
  assert.match(head, /class="mw-btn mw-btn--primary"[^>]*data-coding-change-open="r-edit"[^>]*>.*看改动<\/button>/s, "改了文件时主操作是「看改动」，就在这一行");
  assert.match(head, /data-coding-report-open="r-edit"/, "「执行报告」也在这一行");
  assert.equal((html.match(/mw-btn--primary/g) ?? []).length, 1, "一张卡只有一个实心主键");
  assert.match(head, /data-coding-run-more aria-expanded="false" aria-controls="coding-run-more-r-edit" aria-label="明细"/, "卡头末尾的小箭头打开明细，并指明它开的是哪一块");
  assert.match(html, /<div class="coding-run-more" id="coding-run-more-r-edit" hidden>/, "干净结束的一轮，文件清单和核对明细收在卡头下面，默认不占行");
  assert.doesNotMatch(head, /coding-run-files/, "文件清单不在卡头里");
});

test("POLISH-24 增减行还没读到时只写改了几个文件；没改文件的一轮不给「看改动」", () => {
  const unread = headerOf(footer(edited));
  assert.match(plain(unread), /修改 3 个文件/);
  assert.doesNotMatch(unread, /coding-change-counts/, "没读到增减行就不写，不写 +0 −0");
  const bare = footer({ ref: { run_id: "r-bare" }, phase: "completed", started_at: "2026-11-18T10:00:00.000Z", ended_at: "2026-11-18T10:00:01.000Z", activity: [] } as FooterRun);
  assert.match(plain(headerOf(bare)), /^本轮结束 第 1 轮 用时 1 秒 · 没有修改文件/);
  assert.doesNotMatch(bare, /data-coding-change-open/);
  assert.match(headerOf(bare), /data-coding-report-open="r-bare"/, "没改文件也能看执行报告");
  assert.doesNotMatch(bare, /mw-btn--primary/, "没有下一步要做的事，就没有实心主键");
});

test("POLISH-26 「开始前已红」是普通说明，用灰色徽标；要重跑的核对摊开不折叠", () => {
  const baseline = { call_id: "c0", name: "run-command", target: "pnpm test:baseline", state: "completed", output: "exit 1\nbaseline red" };
  const unit = { call_id: "c1", name: "run-command", target: "pnpm test:unit", state: "completed", output: "exit 0\npass" };
  const wrote = { call_id: "c2", name: "edit", target: "src/app.ts", state: "completed" };
  const round = (id: string, activity: unknown[]) => footer({
    ...edited, ref: { run_id: id }, code_revision: "e8b410c", activity,
    turn_changes: [{ turn: 1, sequence: 1, files: [{ path: "src/app.ts", byte_length: 42, digest: "d1", checkpoint_id: "cp-1" }] }],
  } as FooterRun);
  // Red before the round touched anything, green after its edit: a fact about where it started, not something to handle.
  const checked = round("r-checked", [baseline, wrote, unit]);
  const badge = /<span class="mw-badge[^"]*"[^>]*>开始前已红<\/span>/.exec(checked)?.[0] ?? "";
  assert.match(badge, /mw-badge--neutral/, "灰色徽标");
  assert.doesNotMatch(badge, /warning|attention/, "不用琥珀");
  // The checks ran before the edit and not after: that asks for a rerun, so the digest is laid open.
  const stale = round("r-stale", [baseline, unit, wrote]);
  assert.match(stale, /data-coding-rerun-checks="r-stale"/);
  assert.match(stale, /<div class="coding-run-more" id="coding-run-more-r-stale">/, "有东西要核对的一轮不折叠");
  assert.doesNotMatch(stale, /data-coding-run-more/, "摊开的明细不需要开关");
});

test("POLISH-23 目录行：常态的状态词只留给读屏，等你和失败才出字；列头一个 ＋，「已归档」在列底", () => {
  const sessions: CodingSessionEntry[] = [
    { session_id: "s1", title: "把导出改成按周汇总并补上回归用例", state: "running", updated_at: "2026-11-18T08:00:00Z" },
    { session_id: "s2", title: "等回答的", state: "waiting-answer", updated_at: "2026-11-18T07:00:00Z" },
    { session_id: "s3", title: "失败的", state: "failed", updated_at: "2026-11-18T06:00:00Z" },
    { session_id: "s4", title: "结束的", state: "done", updated_at: "2026-11-18T05:00:00Z" },
  ];
  const html = renderCodingDirectory(model({ sessions }));
  const chip = (id: string) => new RegExp(`data-coding-session="${id}"[\\s\\S]*?(<small class="coding-session-state"[\\s\\S]*?</small>)`).exec(html)?.[1] ?? "";
  for (const id of ["s1", "s4"]) {
    assert.match(chip(id), /data-quiet="true"/, `${id} 常态只留状态点`);
    assert.doesNotMatch(chip(id), /data-word/, `${id} 不显示状态词`);
    assert.match(chip(id), /<span class="mw-sr-only">[^<]+<\/span>/, `${id} 的状态词仍读给读屏`);
  }
  assert.match(chip("s2"), /title="等你回答" data-word="等你"><span class="mw-sr-only">等你回答<\/span>/, "等你的状态出一个短词，全称在提示里、读给读屏");
  assert.match(chip("s3"), /title="失败待处理" data-word="失败"><span class="mw-sr-only">失败待处理<\/span>/);
  assert.match(CODING_STYLES, /\.coding-session-state\[data-word\]::after \{ content:attr\(data-word\); content:attr\(data-word\) \/ ""; \}/, "短词由样式画出来，替代文字为空：读屏只读全称，不把短词再读一遍");
  assert.doesNotMatch(chip("s2") + chip("s3"), /data-quiet="true"/);
  assert.equal((html.match(/data-coding-new/g) ?? []).length, 1, "目录列只有一个新建入口");
  assert.doesNotMatch(html, /mw-dir__add/, "不再有虚线的「＋ 新建编码会话」");
  assert.match(html, /<div class="mw-dir__tools"[^>]*>[\s\S]*?<button[^>]*mw-btn--icon-only[^>]*aria-label="新建编码会话"[^>]*data-coding-new=""[^>]*title="新建编码会话"/, "新建是列头的图标键，名字给读屏和提示");
  assert.ok(html.indexOf("data-coding-archived ") > html.indexOf("data-coding-sessions"), "「已归档」排在会话列表后面，是列底的筛选");
  assert.match(html, /class="coding-archived-row"[^>]*data-coding-archived aria-pressed="false"/);
});

test("POLISH-23 图标页签：每个都有名字，样式只让当前项显示出来", () => {
  const html = renderCodingDirectory(model({ face: "taskboard" }));
  const faces = [...html.matchAll(/<button type="button" class="mw-toggle coding-face"[^>]*aria-pressed="(true|false)"[^>]*>[\s\S]*?<span class="coding-face-name">([^<]+)<\/span><\/button>/g)].map(match => [match[2], match[1]]);
  assert.equal(faces.length, 5);
  assert.deepEqual(faces.filter(([, pressed]) => pressed === "true").map(([name]) => name), ["任务板"]);
  assert.match(CODING_STYLES, /\.coding-face-name \{ display:none;/);
  assert.match(CODING_STYLES, /\.coding-face\[aria-pressed=true\] \.coding-face-name \{ display:block; \}/);
});

test("6.4、POLISH-27 头部：路径只写目录名，「标为优先」在 ⋯ 里（平台的菜单，带勾）；任务图没有重复的「回到对话」", () => {
  const html = renderCodingWorkbench(model());
  const chip = /<p class="coding-workspace-chip"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
  assert.equal(plain(chip), "goalboard", "头部只写目录名");
  assert.match(chip, /title="\/Users\/someone\/code\/goalboard"/, "完整路径在提示里");
  const more = /<details class="coding-head-more"[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
  assert.match(more, /aria-label="更多"/);
  assert.match(more, /role="menuitemcheckbox"[^>]*data-coding-priority/, "「标为优先」是 ⋯ 菜单里的一项");
  assert.doesNotMatch(html.replace(more, ""), /data-coding-priority[ =>]/, "头部不再单独摆一个「标为优先」");
  assert.match(html, /class="mw-toggle-group coding-view-switch"[^>]*data-slot="toggle-group"/, "「对话 / 任务图」是设计系统的分段控件");
  assert.doesNotMatch(html, /data-coding-board-close/, "分段控件已经能回到对话");
  assert.doesNotMatch(html, /TaskBoard/, "任务图的标题走词条");
});

test("POLISH-27 结果与审查：先是改了什么，再是命令、成果、检查点，运行详情在最后", () => {
  const html = renderCodingWorkbench(model());
  const aside = html.slice(html.indexOf("data-coding-tools>"));
  const order = ["data-coding-changed ", "data-coding-commands", "data-coding-outcomes", "data-coding-checkpoints ", "data-coding-result "].map(mark => aside.indexOf(mark));
  assert.ok(order.every(at => at > 0), "五个分区都在");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "顺序：改了什么 → 检查 → 成果 → 检查点 → 运行详情");
  assert.match(aside, /<h3 id="coding-changed-title">改了什么<\/h3>/);
  assert.match(aside, /data-coding-result aria-label="运行详情"/);
  assert.match(aside, /class="coding-results-index mw-toggle-group"/, "分区页签是设计系统的分段控件");
});

test("POLISH-26 样式里琥珀只跟着「等你处理」：准备信息的那一行只有带待处理标记时才上色", () => {
  const prep = CODING_STYLES.split("\n").filter(line => line.includes(".coding-prep"));
  assert.ok(prep.length > 0);
  assert.deepEqual(prep.filter(line => line.includes("--amber")).map(line => line.slice(0, line.indexOf("{")).trim()), [".coding-prep[data-attention=true] > .coding-prep-line"]);
  assert.match(CODING_STYLES, /\.coding-starter small \{ font-size:11px; color:var\(--faint\); \}/, "建议卡的模式标签是灰色");
});

test("POLISH-24 增减行只算真正落盘的：被拒的不算，同一文件多次写入用净增减，说不准就不写", () => {
  const write = (path: string, added: number, removed: number, execution = "applied") => ({ path, added_lines: added, removed_lines: removed, review: { execution } });
  assert.deepEqual(codingRoundTally([write("a.ts", 20, 6), write("b.ts", 4, 0)], []), { added: 24, removed: 6, files: [{ path: "a.ts", added: 20, removed: 6 }, { path: "b.ts", added: 4, removed: 0 }] });
  assert.deepEqual(codingRoundTally([write("a.ts", 20, 6), write("b.ts", 90, 90, "not-applied")], []), { added: 20, removed: 6, files: [{ path: "a.ts", added: 20, removed: 6 }] }, "被拒的写入没有落盘，不算进增减行");
  assert.deepEqual(codingRoundTally([write("a.ts", 9, 9, "not-applied"), write("a.ts", 3, 1)], []), { added: 3, removed: 1, files: [{ path: "a.ts", added: 3, removed: 1 }] }, "同一文件一次被拒、一次落盘，只算落盘的那一次");
  // Two applied writes to one file: 10 lines added, then 4 of them rewritten. The net change is what the file gained, not 14.
  const twice = [write("a.ts", 10, 0), write("a.ts", 4, 4)];
  assert.deepEqual(codingRoundTally(twice, [{ path: "a.ts", available: true, added_lines: 10, removed_lines: 0 }]), { added: 10, removed: 0, files: [{ path: "a.ts", added: 10, removed: 0 }] }, "多次写入用服务给的净增减，不把每次相加");
  assert.equal(codingRoundTally(twice, [{ path: "a.ts", available: false }]), null, "两次写入之间文件被改过，净增减说不准，整行不写增减");
  assert.equal(codingRoundTally(twice, []), null);
  assert.equal(codingRoundTally([write("a.ts", 20, 6), write("b.ts", 1, 1, "unknown")], []), null, "有一次写入结果不明，整行不写增减");
  assert.equal(codingRoundTally([write("a.ts", 20, 6), write("b.ts", 1, 1, "failed")], []), null);
  assert.equal(codingRoundTally([write("a.ts", 2, 2, "not-applied")], []), null, "什么都没落盘就没有增减行");
});
