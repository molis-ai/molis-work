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
  renderDatePicker,
  renderDirectoryAdd,
  renderDirectoryHeading,
  renderDirectoryPanel,
  renderDirectoryRow,
  renderDirectoryTitle,
  renderEmpty,
  renderField,
  renderInput,
  renderPluginStageShell,
  renderProgress,
  renderSidebar,
  renderSkeleton,
  renderSpinner,
  renderStateRing,
  renderStatusMark,
  renderSwitch,
  renderToast,
  STATE_RING_FAMILIES,
  type MwButtonVariant,
  type MwTone,
} from "@molis-ai/molis-work-plugin-sdk/ui";
import { listedIconNames, registeredIconNames } from "@molis-ai/molis-work-design-system";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

// The parts of the Plugin SDK's `/ui` write class names and `data-*` hooks that the host's style sheets and page scripts define,
// so the markup is a contract with the host page (specs/repository-anti-corruption/slices/pg055-sdk-ui-parts.md §4).

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
