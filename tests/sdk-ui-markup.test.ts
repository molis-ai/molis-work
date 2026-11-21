import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import * as sdkUi from "@molis-ai/molis-work-plugin-sdk/ui";
import * as diffView from "@molis-ai/molis-work-plugin-sdk/diff-view";
import {
  icon,
  renderAlert,
  renderBadge,
  renderButton,
  renderCalendar,
  renderCheckbox,
  renderComposer,
  renderDatePicker,
  renderDirectoryAdd,
  renderDirectoryHeading,
  renderDirectoryPanel,
  renderDirectoryRow,
  renderDirectoryTitle,
  renderEmpty,
  renderField,
  renderInput,
  renderKept,
  renderPluginStageShell,
  renderProgress,
  renderSidebar,
  renderSkeleton,
  renderSpinner,
  renderStateRing,
  renderStatusMark,
  renderStepDot,
  renderSwitch,
  renderToast,
  STATE_RING_FAMILIES,
  type MwButtonVariant,
  type MwTone,
} from "@molis-ai/molis-work-plugin-sdk/ui";
import { listedIconNames, registeredIconNames, renderComposerAddMenu, renderComposerDeliveryMenu, renderComposerPick, renderComposerRestore, renderComposerStrip } from "@molis-ai/molis-work-design-system";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";
import { COMPOSER_AI_LABELS, COMPOSER_PLAIN_LABELS } from "./fixtures/composer-labels.js";

// The parts of the Plugin SDK's `/ui` write class names and `data-*` hooks that the host's style sheets and page scripts define,
// so the markup is a contract with the host page (specs/archive/repository-anti-corruption/slices/pg055-sdk-ui-parts.md §4).

const TONES: readonly MwTone[] = ["neutral", "info", "success", "warning", "danger"];
const VARIANTS: readonly MwButtonVariant[] = ["primary", "secondary", "ghost", "danger", "danger-outline", "link"];

/** One sample of every part a plugin is likely to draw with, over the options that change its classes. */
function samples(): readonly string[] {
  return [
    ...VARIANTS.flatMap((variant) => ["sm", "md", "lg", "icon"].map((size) => renderButton({ label: "保存", variant, size: size as "sm", icon: "check", key: "↵" }))),
    renderButton({ label: "保存", loading: true }),
    renderButton({ label: "打开", iconOnly: true, icon: "plus" }),
    renderButton({ label: "进入", href: "/projects" }),
    renderPluginStageShell({ surface: "demo", label: "Demo", dataset: "demo", body: "<p>x</p>" }),
    ...TONES.map((tone) => renderBadge({ label: "新", tone })),
    ...TONES.map((tone) => renderAlert({ title: "提示", body: "正文", tone })),
    renderAlert({ title: "已载入", body: "正文", tone: "success", state: "done", rise: true, actions: [{ label: "收起" }, { label: "载入最新版", variant: "primary" }] }),
    renderKept({ who: "你写的", text: "", blankText: "你清空了这一栏", swapped: true, rise: true, index: 1, action: { label: "换回" }, more: { label: "收起", open: true } }),
    renderStepDot({ label: "这一步有改动要看" }),
    ...TONES.map((tone) => renderToast({ message: "完成", tone, action: { label: "撤销" } })),
    renderEmpty({ icon: "file", title: "空", body: "还没有内容", action: "" }),
    renderStatusMark({ label: "进行中", state: "running", tone: "progress" }),
    renderStatusMark({ label: "完成", icon: "check", tone: "done", plain: true }),
    ...STATE_RING_FAMILIES.flatMap((family) => family.states.map((state) => renderStateRing({ state }))),
    renderSpinner({ label: "加载" }),
    renderSkeleton(),
    renderProgress({ value: 3, max: 10, label: "进度" }),
    renderSidebar({ body: "<p>目录</p>", header: "<b>头</b>", footer: "<i>尾</i>" }),
    renderSidebar({ body: "", variant: "rail" }),
    renderDirectoryHeading("最近"),
    renderDirectoryTitle("notes.md", true),
    renderDirectoryAdd({ label: "新建", icon: "plus" }),
    renderDirectoryRow({ title: "a.md", caption: "今天", icon: "file", count: 3, status: "待办", statusTone: "attention", selected: true, density: "meta", fileName: true, yield: true, trailing: "<button>x</button>" }),
    renderDirectoryRow({ title: "b", current: true, disabled: true, hidden: true, href: "/x", draggable: true }),
    renderDirectoryPanel({ pluginId: "demo", listLabel: "列表", body: "", empty: "没有", add: { label: "新建" }, footer: "尾", tools: "<span>t</span>", label: "标题" }),
    renderInput({ name: "n", placeholder: "p" }),
    renderField({ label: "名称", control: renderInput({ name: "n" }), hint: "提示", error: "出错了" }),
    renderCheckbox({ label: "同意", name: "c" }),
    renderSwitch({ label: "开", name: "s" }),
    renderCalendar({ year: 2026, month: 9, selected: "2026-10-25", today: "2026-10-24", title: "2026 年 10 月" }),
    renderCalendar({ year: 2026, month: 9, compact: true }),
    renderDatePicker({ name: "d", value: "2026-10-25", calendar: { year: 2026, month: 9 } }),
    icon("folder", "extra"),
    // UIC-13 (K2): the unified input's shell and the parts its client puts in, in every state, are served like every other part.
    ...composerSamples(),
    sdkUi.renderFileKind(".env.local"),
    sdkUi.renderFileKind("README"),
    sdkUi.renderEnvChecklist({ title: "准备", statusLabel: "就绪", statusTone: "done", rows: [{ state: "done", label: "依赖", value: "ok", status: { label: "已齐", tone: "done" } }, { state: "blocked", label: "端口", value: "3000", recovery: { title: "冲突", body: "换端口", actions: [{ label: "改用 3001" }] } }], footer: { title: "收拾", detail: "已清理" } }),
    sdkUi.renderTaskAttemptBudget({ headerText: "第 2 次", budgetPercent: 90, retryReasonLabel: "验证没过", summaryText: "修空值", pastSummaryLabel: "前 1 次", pastAttempts: [{ state: "blocked", text: "退出码 1" }], actions: [{ label: "再给 3 次" }] }),
    sdkUi.renderRoundReportCard({ statusLabel: "完成", statusTone: "done", accepted: true, finishedAtLabel: "14:32", headings: { delivered: "交付", verified: "验证", remaining: "未完", cleanup: "收拾" }, delivered: [{ state: "done", text: "a.ts" }], verified: [{ state: "done", text: "pnpm test", codeRevision: "a1b2c3d" }], remaining: [{ state: "idle", text: "无", quiet: true }], cleanup: [{ state: "done", text: "已清" }], actions: [{ label: "重跑" }] }),
    sdkUi.renderMaterialsFunnel([{ label: "发现", value: 3 }], "五步"),
    sdkUi.renderMaterialsTrack({ step: 2, stopAt: 3, error: true, label: "未读", tone: "blocked", ariaLabel: "2/5" }),
    sdkUi.renderMaterialIssueRow({ reason: "疑似密钥", error: true, actions: [{ label: "只发变量名" }] }),
    sdkUi.renderScopeDeltaCard({ title: "这次只做这些", subtitle: "复用", items: [{ kind: "add", glyph: "plus", title: "新加", detail: "a.md" }, { kind: "rem", glyph: "x", title: "移出" }, { kind: "keep", glyph: "check", title: "保留" }, { kind: "redo", glyph: "refresh", title: "重写" }] }),
    sdkUi.renderCodingRoundMaterials({ title: "材料", summaryLabel: "全文", summaryTone: "done", items: [{ state: "done", name: "a.md", how: "#r1", statusLabel: "全文", statusTone: "done" }], recovery: { title: "读不到", body: "已删", actions: [{ label: "去掉" }] }, footer: { title: "其余", detail: "按需读" } }),
    sdkUi.renderHelpButton({ label: "帮助", topic: "page", expanded: true }),
    sdkUi.renderHelpButton({ label: "了解此项", topic: "page", focus: "who", variant: "link" }),
    sdkUi.renderPreActionFacts({ heading: "每次运行会", rows: [{ icon: "file", text: "读取材料", detail: "只读一份" }, { tone: "ok", icon: "sparkles", text: "使用模型", detail: "按服务商计费" }, { tone: "warn", icon: "alert", text: "还没连模型", action: { label: "连接模型" } }, { tone: "out", icon: "mail", text: "发给 3 人", detail: "发出后收不回" }] }),
    sdkUi.renderHelpContent({ focusId: "who", sections: [{ id: "who", heading: "权限", body: "用你的授权", items: ["仅限本任务"] }, { id: "adv", heading: "高级", collapsible: true, summary: "更多", body: "按本机时区" }], nextStep: { title: "还差一步", fact: "看帮助不改设置", action: { label: "连接模型" } } }),
    sdkUi.renderHelpContent({ sections: [], error: { title: "没读出来", body: "照常能用", retryLabel: "再试一次" } }),
    sdkUi.renderHelpFirstVisitTip({ storageKey: "demo", text: "第一次用？", actionLabel: "看帮助", skipLabel: "跳过" }),
  ];
}

function composerSamples(): readonly string[] {
  const ai = COMPOSER_AI_LABELS, plain = COMPOSER_PLAIN_LABELS;
  const controls = [{ kind: "select" as const, id: "mode", label: "方式", value: "a", options: [{ value: "a", label: "甲" }] }, { kind: "toggle" as const, id: "web", label: "联网", on: true }];
  const yes = { available: true } as const;
  return [
    renderComposer({ kind: "ai", labels: ai, receiver: { label: "Coding", resetLabel: "改回发给助理" }, state: "running", text: "补一句", controls, voice: "语音", status: { caption: "运行中", text: "正在做这一轮", action: "查看" } }),
    renderComposer({ kind: "plain", labels: plain, placeholder: "写评论", disabled: { caption: "不可用", reason: "这条已关闭" } }),
    renderComposer({ kind: "plain", labels: plain, state: "sending", text: "好的", status: { caption: "发送中", text: "正在发送…" } }),
    renderComposerDeliveryMenu("c1", ai, { "next-boundary": yes, interrupt: { available: false, reason: "不收" }, "after-run": yes }, true),
    renderComposerAddMenu(plain, { files: true, sources: [{ provider: "Todo", title: "待办" }], commands: [{ slash: "plan", label: "计划", hint: "先列步骤" }] }),
    renderComposerAddMenu(plain, { files: false, commands: [] }),
    renderComposerPick(plain, { provider: "Todo", title: "待办" }, "", "Todo 现在用不了"),
    renderComposerStrip(plain, [{ key: "f1", title: "a.png", state: "reading" }, { key: "f2", title: "b.pdf", state: "failed", reason: "太大" }, { key: "f3", title: "待办一", state: "attached", from: "Todo · 待办" },
      { key: "f4", title: "c.png", state: "failed", reason: "服务暂时读不了", retry: true }, { key: "f5", title: "d.png", state: "attached", thumb: "blob:d" }], (text) => text),
    renderComposerRestore(plain, "刚才", (text) => text),
  ];
}

function classesOf(html: string): Set<string> {
  const found = new Set<string>();
  for (const match of html.matchAll(/\bclass="([^"]*)"/gu)) for (const token of match[1]!.split(/\s+/u)) if (token) found.add(token);
  return found;
}

// RAC-551
test("every class a /ui part writes has a rule in the host's style sheets and in the workbench stylesheet alone", () => {
  const workbenchSheet = renderMolisWorkWorkbenchStylesheet();
  const sheets = [workbenchSheet, renderMolisWorkArrivalStylesheet(), renderMolisWorkSettingsStylesheet()].join("\n");
  const rulePattern = (token: string): RegExp => new RegExp(`\\.${token.replace(/[\\^$*+?.()|[\]{}]/gu, "\\$&")}(?![\\w-])`, "u");
  const defined = (token: string): boolean => rulePattern(token).test(sheets);
  const definedInWorkbench = (token: string): boolean => rulePattern(token).test(workbenchSheet);
  const written = new Set<string>();
  for (const html of samples()) for (const token of classesOf(html)) written.add(token);
  assert.ok(written.size > 40, `expected the samples to exercise the parts, saw ${written.size} classes`);
  // `extra` is the sample caller's own class name, not the part's. An alert's `info` and `neutral` tones are the base look, so
  // the host has no rule that adds to it; every other class is the part's and the workbench sheet (where plugins mount) defines each.
  const BASE_LOOK = new Set(["extra", "mw-alert--info", "mw-alert--neutral"]);
  const missing = [...written].filter((token) => !BASE_LOOK.has(token) && !defined(token)).sort();
  assert.deepEqual(missing, []);
  const missingInWorkbench = [...written].filter((token) => !BASE_LOOK.has(token) && !definedInWorkbench(token)).sort();
  assert.deepEqual(missingInWorkbench, []);
});

// RAC-766
test("every class the SDK's diff view writes has a rule in the host's style sheets", () => {
  const sheets = [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkArrivalStylesheet(), renderMolisWorkSettingsStylesheet()].join("\n");
  const defined = (token: string): boolean => new RegExp(`\\.${token.replace(/[\\^$*+?.()|[\]{}]/gu, "\\$&")}(?![\\w-])`, "u").test(sheets);
  const roles = ["before", "after", "pinned", "mismatch", "partial", "coarse", "created", "removed", "identical", "comment_before", "comment_after", "insert", "delete", "same", "reveal"] as const;
  const labels = Object.fromEntries(roles.map((role) => [role, `K.${role}`])) as diffView.DiffViewLabels;
  const primitives = { escape: (value: unknown) => String(value), text: (key: string) => key, icon: (name: string) => name };
  const side = { workspace_id: "w", workspace_name: "W", path: "a.ts", source_plugin_id: "p", content_version: 1 };
  const view = diffView.compareChange("g", { before: side, after: side }, { before: "a\n", after: "c\n", created: true });
  const html = diffView.renderDiff({ view, line_feedback: true, labels, primitives });
  const written = classesOf(html);
  assert.ok(written.size > 8, `expected the diff view to write its classes, saw ${[...written].join(", ")}`);
  // These name hooks other pages select on (Coding's split columns, a file row's own layout), not rules of the view itself.
  const HOOKS = new Set(["mw-diff-files", "mw-diff-counts", "mw-diff-path", "mw-diff-left", "mw-diff-right"]);
  const missing = [...written].filter((token) => !HOOKS.has(token) && !defined(token)).sort();
  assert.deepEqual(missing, []);
});

// RAC-552
test("icon() writes a reference into the page sprite, and the design system draws every name the SDK lists", () => {
  assert.equal(icon("folder"), icon("folder", ""));
  assert.match(icon("folder", "x"), /class="[^"]*\bx\b[^"]*"/u);
  assert.match(icon("folder"), /<use href="#icon-folder"><\/use>/u);
  // The names are one list, the `PluginIconName` type in the SDK (`ui/icon-names`, which `ui/icon` re-exports); the design system's
  // drawing table is typed `Record<PluginIconName, IconNode>`, so a name without a drawing, or a drawing without a name, does not
  // compile. This holds the built declaration of that list against what the page sprite actually carries.
  const declaration = readFileSync(new URL("../packages/plugin-sdk/dist/ui/icon-names.d.ts", import.meta.url), "utf8");
  const listed = [...new Set([...declaration.matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]!))].sort();
  assert.ok(listed.length > 100, `read ${listed.length} names from the declaration`);
  assert.deepEqual([...registeredIconNames()].sort(), listed);
  assert.ok(listedIconNames().every((name) => listed.includes(name)));
});

const ROOT = new URL("../", import.meta.url).pathname;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (entry === "node_modules" || entry === "dist") return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.m?ts$/u.test(entry) ? [path] : [];
  });
}

// RAC-554
test("the design system has no second copy of a part the SDK's /ui publishes", () => {
  const published = Object.entries(sdkUi).filter(([, value]) => typeof value === "function").map(([name]) => name);
  assert.ok(published.length > 40, `read ${published.length} published functions`);
  const copies: string[] = [];
  for (const file of sourceFiles(join(ROOT, "packages/design-system/src"))) {
    const text = readFileSync(file, "utf8");
    for (const name of published) if (new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]`, "u").test(text)) copies.push(`${file.slice(ROOT.length)}: ${name}`);
  }
  assert.deepEqual(copies, []);
});

// RAC-555
test("no plugin but Plugin Studio imports the design system, in source or in its package.json", () => {
  const offenders: string[] = [];
  for (const group of readdirSync(join(ROOT, "plugins"))) {
    const groupDirectory = join(ROOT, "plugins", group);
    if (!statSync(groupDirectory).isDirectory()) continue;
    for (const name of readdirSync(groupDirectory)) {
      const directory = join(groupDirectory, name);
      if (!statSync(directory).isDirectory() || `plugins/${group}/${name}` === "plugins/native/plugin-builder") continue;
      if (!existsSync(join(directory, "package.json"))) continue;
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
      if (manifest.dependencies?.["@molis-ai/molis-work-design-system"]) offenders.push(`plugins/${group}/${name}/package.json`);
      for (const file of existsSync(join(directory, "src")) ? sourceFiles(join(directory, "src")) : []) {
        if (/molis-work-design-system|packages\/design-system/u.test(readFileSync(file, "utf8"))) offenders.push(file.slice(ROOT.length));
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the resume prompt's buttons are renderButton's secondary text buttons, and the return bar puts its one button under the words", () => {
  // resume-prompt.ts writes its two buttons out (a page that uses only the prompt takes no icon set); they stay what renderButton draws.
  const prompt = sdkUi.renderResumePrompt({ title: "The model is ready", body: "Kept", resume: "Send <it>", dismiss: "Not now" });
  assert.ok(prompt.includes(renderButton({ label: "Send <it>", variant: "secondary", attrs: { "data-resume-prompt": "resume" } })), prompt);
  assert.ok(prompt.includes(renderButton({ label: "Not now", variant: "secondary", attrs: { "data-resume-prompt": "dismiss" } })), prompt);
  assert.match(prompt, /class="mw-alert mw-alert--info"/u, "an info alert, as the connections page's 接着改／放弃改动");
  const bar = sdkUi.renderReturnBar({ title: "From Coding", body: "Goes back", back: "Go back now", label: "Where you came from" });
  assert.match(bar, /<p data-return-bar-body aria-live="polite">Goes back<\/p><div class="mw-return-bar__actions"><button [^>]*mw-btn--secondary[^>]*data-return-bar-back/u);
  assert.match(bar, /data-return-bar-back[^>]*><svg aria-hidden="true"><use href="#icon-back">/u, "going back has the back arrow");
  const gone = sdkUi.renderReturnBar({ title: "From Images", body: "The page is closed", back: "Close settings", label: "Where you came from", state: "gone" });
  assert.match(gone, /data-return-bar-back[^>]*><span data-slot="button-label">Close settings<\/span><\/button>/u, "closing the settings has no back arrow");
});

// SKL-11: the line a round's page draws and the panel the shell opens from it are the SDK's markup, for the Assistant and any plugin.
test("SKL-11: the Skill line says each Skill once with who chose it and carries what the panel opens with; the panel's actions are menu items", () => {
  const words = { used: "用了", auto: "自动选的", named: "你点名的", none: "这一轮没用技能", choose: "选一个" };
  const picks = [{ ref: { skill_id: "a" }, name: "会议<纪要>", picked: "named" as const }, { ref: { skill_id: "b" }, name: "周报", picked: "auto" as const }];
  const line = sdkUi.renderSkillLine({ picks, round: 'r"1', words });
  const buttons = [...line.matchAll(/<button[^>]*data-skill-pick="(\d*)"[^>]*>([\s\S]*?)<\/button>/g)].map(found => [found[1], found[2]!.replace(/<[^>]*>/g, "").trim()]);
  assert.deepEqual(buttons, [["0", "会议&lt;纪要&gt; · 你点名的"], ["1", "周报 · 自动选的"]]);
  assert.match(line, /class="mw-skill-line"[^>]*data-skill-round="r&quot;1"/, "the round's mark is escaped");
  assert.equal(line.match(/data-skill-picks="([^"]*)"/)![1], JSON.stringify(picks).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "the exact picks ride on the line");
  assert.ok([...line.matchAll(/<button[^>]*>/g)].every(found => /aria-haspopup="dialog"/.test(found[0]) && /aria-expanded="false"/.test(found[0])), "each button says it opens a panel");
  const none = sdkUi.renderSkillLine({ picks: [], round: "r2", words });
  assert.match(none, /这一轮没用技能/); assert.match(none, /data-skill-pick=""/, "「选一个」 names no Skill");

  const why = sdkUi.renderSkillWhy({ title: "周报", reason: "任务提到 <周报>", facts: [["来自", "写作包 1.0.0"]],
    groups: [{ label: "这一轮", actions: [{ id: "redo", label: "换一个重做", detail: "同一句话再来一轮" }, { id: "plain", label: "这次不用技能" }] }, { label: "换成", actions: [], empty: "没有别的可用技能" }] });
  assert.match(why, /<h4>周报<\/h4>/); assert.match(why, /任务提到 &lt;周报&gt;/); assert.match(why, /<dt>来自<\/dt><dd>写作包 1\.0\.0<\/dd>/);
  assert.deepEqual([...why.matchAll(/data-skill-why-action="([^"]*)"/g)].map(found => found[1]), ["redo", "plain"]);
  assert.equal((why.match(/role="menuitem"/g) ?? []).length, 2, "each action is a menu item");
  assert.match(why, /role="menu" aria-label="换成">[\s\S]*没有别的可用技能/, "a group with nothing to offer says so");
});

test("RISK-01 the severity grid lights one place, reads without colour, and carries only the caller's words", async () => {
  const { renderSeverityGrid } = await import("@molis-ai/molis-work-plugin-sdk/ui");
  const lit = (html: string) => [...html.matchAll(/<i( class="is-lit")?><\/i>/g)].map((cell) => Boolean(cell[1]));
  const html = renderSeverityGrid({ row: 3, column: 2, tone: "danger", label: "影响高，可能性中" });
  assert.deepEqual(lit(html), [false, true, false, false, false, false, false, false, false], "top row is row 3, left column is column 1");
  assert.match(html, /role="img" aria-label="影响高，可能性中"/);
  assert.match(html, /mw-severity-grid--small mw-severity-grid--danger/);
  assert.doesNotMatch(html, /mw-severity-grid__axes/, "the small size has no axis titles");
  assert.deepEqual(lit(renderSeverityGrid({ row: 1, column: 3, label: "x" })), [false, false, false, false, false, false, false, false, true]);
  assert.deepEqual(lit(renderSeverityGrid({ row: 9, column: Number.NaN, label: "x" })), [true, false, false, false, false, false, false, false, false], "out of range is pulled in");
  const large = renderSeverityGrid({ row: 2, column: 2, size: "large", label: "<b>", rowLabel: "Impact <medium>", columnLabel: "Likelihood" });
  assert.match(large, /aria-label="&lt;b&gt;"/);
  assert.match(large, /<span class="mw-severity-grid__row-label">Impact &lt;medium&gt;<\/span>/);
  assert.match(large, /mw-severity-grid--neutral/);
});

test("VUX-55: ui.help and sandbox help declarations validate structure, owner keys, and default_topic", () => {
  const validManifest = {
    plugin_id: "io.molis.work.native.schedule",
    ui: {
      help: {
        default_topic: "page",
        topics: [{
          id: "page",
          title: { key: "schedule.help.title" },
          sections: [
            { id: "what", heading: { key: "schedule.help.what" }, body: { key: "schedule.help.what-body" } },
            { id: "adv", heading: { key: "schedule.help.adv" }, items: [{ key: "schedule.help.adv-1" }], collapsible: true },
          ],
        }],
      },
    },
  };
  assert.deepEqual(sdkUi.uiHelpDeclarationProblems(validManifest), []);
  assert.ok(sdkUi.uiHelpDeclarationProblems({
    plugin_id: "io.molis.work.native.schedule",
    ui: { help: { default_topic: "missing", topics: [{ id: "page", title: { key: "other.help.title" }, sections: [{ id: "s1", heading: { key: "schedule.help.h" } }] }] } },
  }).length >= 3, "rejects foreign key prefix, section without body/items, and unknown default_topic");
  assert.deepEqual(sdkUi.sandboxHelpDeclarationProblems({
    pluginId: "io.molis.generated.tracker",
    help: { topics: [{ id: "page", title: "进度表", sections: [{ id: "what", heading: "这是什么", body: "记录每周进展" }] }] },
  }), []);
});
