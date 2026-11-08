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
import { listedIconNames, registeredIconNames } from "@molis-ai/molis-work-design-system";
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
  ];
}

function classesOf(html: string): Set<string> {
  const found = new Set<string>();
  for (const match of html.matchAll(/\bclass="([^"]*)"/gu)) for (const token of match[1]!.split(/\s+/u)) if (token) found.add(token);
  return found;
}

// RAC-551
test("every class a /ui part writes has a rule in the host's style sheets", () => {
  const sheets = [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkArrivalStylesheet(), renderMolisWorkSettingsStylesheet()].join("\n");
  const defined = (token: string): boolean => new RegExp(`\\.${token.replace(/[\\^$*+?.()|[\]{}]/gu, "\\$&")}(?![\\w-])`, "u").test(sheets);
  const written = new Set<string>();
  for (const html of samples()) for (const token of classesOf(html)) written.add(token);
  assert.ok(written.size > 40, `expected the samples to exercise the parts, saw ${written.size} classes`);
  // `extra` is the sample caller's own class name, not the part's. An alert's `info` and `neutral` tones are the base look, so
  // the host has no rule that adds to it; every other class is the part's and the host defines each.
  const BASE_LOOK = new Set(["extra", "mw-alert--info", "mw-alert--neutral"]);
  const missing = [...written].filter((token) => !BASE_LOOK.has(token) && !defined(token)).sort();
  assert.deepEqual(missing, []);
});

// The unified input's shell (renderComposer, K0c) is published before its rules reach the host's sheets: until K2 they are the
// component board's own (COMPOSER_BOARD_STYLES; specs/unified-input-voice/implementation-plan.md §3.6, batch 10 review desk on
// #1872). These are exactly the classes it writes that the host does not define yet. K2 moves COMPOSER_BOARD_STYLES into the
// page sheets: it empties this list and puts renderComposer into samples() above, so RAC-551 covers it like every other part.
const UNTIL_K2 = [
  "mw-btn-group", "mw-composer", "mw-composer__box", "mw-composer__end", "mw-composer__foot", "mw-composer__input",
  "mw-composer__start", "mw-composer__status", "mw-composer__text", "mw-composer__to", "mw-tag",
];

// UIC-13, RAC-551: renderComposer's classes without a host rule are exactly UNTIL_K2, so any other class missing a rule fails,
// and so does K2 moving the rules without emptying the list.
test("UIC-13 / RAC-551: the classes renderComposer writes without a host rule are exactly the ones waiting for K2", () => {
  const sheets = [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkArrivalStylesheet(), renderMolisWorkSettingsStylesheet()].join("\n");
  const defined = (token: string): boolean => new RegExp(`\\.${token.replace(/[\\^$*+?.()|[\]{}]/gu, "\\$&")}(?![\\w-])`, "u").test(sheets);
  const ai = COMPOSER_AI_LABELS, plain = COMPOSER_PLAIN_LABELS;
  const shells = [
    renderComposer({ kind: "ai", labels: ai, receiver: { label: "Coding", resetLabel: "改回发给助理" }, state: "running", text: "补一句", status: { caption: "运行中", text: "正在做这一轮", action: "查看" } }),
    renderComposer({ kind: "plain", labels: plain, placeholder: "写评论", disabled: { caption: "不可用", reason: "这条已关闭" } }),
    renderComposer({ kind: "plain", labels: plain, state: "sending", text: "好的", status: { caption: "发送中", text: "正在发送…" } }),
  ];
  const written = new Set<string>();
  for (const html of shells) for (const token of classesOf(html)) written.add(token);
  assert.deepEqual([...written].filter((token) => !defined(token)).sort(), UNTIL_K2);
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
