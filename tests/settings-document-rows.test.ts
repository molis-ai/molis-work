import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { renderListToolbar, renderObjectRow, renderQuestionList, renderSettingRow, renderSettingsSection } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createLocalHostWorkbenchRenderer, installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import { workbenchClientSource, type MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";
import { chinesePagePacks, pageTextScriptForPacks } from "./fixtures/page-text-packs.js";

// specs/screen-polish/p5-settings.md: a settings page is a document written in three rows. Acceptance numbers are the
// screen-polish spec's (POLISH-29…32).
installHostUiText();
const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
const settings = (section: string, runtimes: MolisWorkSettingsView["runtimes"] = []): MolisWorkSettingsView => ({ section, runtimes, projects: [],
  web_service: { provider: "unsupported", state: "unsupported", supported: false, owned: false, running: false,
    label: "", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
  diagnostics: { home_directory: "/tmp", installation_state: "ready", version: null, release_directory: null, project_count: 0, launchers: [] },
});
const runtime = (runtime_id: string, connection_state: MolisWorkSettingsView["runtimes"][number]["connection_state"], executable_path: string | null = `/usr/local/bin/${runtime_id}`) =>
  ({ runtime_id, display_name: runtime_id, executable_path, config_path: `/home/.${runtime_id}/config.json`, skill_path: `/home/.${runtime_id}/skills/molis`, connection_state, message: "" }) as MolisWorkSettingsView["runtimes"][number];
const page = (view: MolisWorkSettingsView) => runWithLocale("zh", () => renderer.renderMolisWorkSettings(view));
const documentOf = (html: string) => html.slice(html.indexOf('<div class="settings-content">'), html.indexOf("</main>"));

test("the three rows: names and states are escaped, controls and answers are the caller's (POLISH-30)", () => {
  const row = renderSettingRow({ name: "A <b>", hint: "one & two", control: "<button>x</button>", label: true });
  assert.match(row, /^<label class="mw-setting-row"[^>]*><span class="mw-setting-row__copy"><strong>A &lt;b&gt;<\/strong><span>one &amp; two<\/span><\/span><span class="mw-setting-row__control"><button>x<\/button><\/span><\/label>$/);
  const bare = renderSettingRow({ name: "n" });
  assert.match(bare, /^<div class="mw-setting-row"/, "a row whose control is not a switch is not a label");
  assert.doesNotMatch(bare, /mw-setting-row__control/, "a row that only says something has no empty place for a control");
  // A row that opens in place is a <details>: no script, so a plugin's page opens as the workbench's does. Its summary
  // holds what is chosen and a chevron, and nothing that could itself be pressed.
  const fold = renderSettingRow({ name: "不提醒的地方", hint: "h", fold: { label: "选择地方", body: "<p>choices</p>", labelAttrs: { "data-chosen": true } } });
  assert.match(fold, /^<details class="mw-setting-fold" data-slot="setting-fold"><summary class="mw-setting-row">/);
  assert.match(fold, /<span data-chosen>选择地方<\/span><svg[^>]*><use href="#icon-chevron-down">/);
  assert.match(fold, /<\/summary><div class="mw-setting-open"><p>choices<\/p><\/div><\/details>$/);
  assert.doesNotMatch(fold, /<button|<a /);
  assert.match(renderSettingRow({ name: "n", fold: { label: "l", body: "", open: true } }), /^<details class="mw-setting-fold" data-slot="setting-fold" open>/);

  const plain = renderObjectRow({ name: "Tool", hint: "h", icon: "terminal", state: { label: "已接入", tone: "success" } });
  assert.match(plain, /^<div class="mw-object-row"/);
  assert.doesNotMatch(plain, /<details|mw-object-row__chevron/, "nothing to open, no chevron");
  const open = renderObjectRow({ name: "Tool", state: { label: "本体不完整", tone: "danger" }, action: "<button>修复</button>", body: "<p>inside</p>", open: true });
  assert.match(open, /^<div class="mw-object-row mw-object-row--plain" data-slot="object-row"><details class="mw-object-row__fold" open>/);
  assert.match(open, /data-tone="danger"><svg[^>]*><use href="#icon-circle-alert">/, "a state that is not fine carries a mark, not only a colour");
  assert.match(open, /<div class="mw-object-row__body"><p>inside<\/p><\/div><\/details><span class="mw-object-row__action"><button>修复<\/button><\/span><\/div>$/,
    "what can be done sits beside the part that opens the row, never inside it: a button in a summary is a button in a button");
  assert.doesNotMatch(open.slice(open.indexOf("<summary"), open.indexOf("</summary>")), /<button/);
  assert.match(renderObjectRow({ name: "n", state: { label: "s", tone: "loud" as never } }), /data-tone="neutral"/, "a tone the platform does not have is written as none");

  const questions = renderQuestionList({ rows: [{ question: "装在哪", answer: "<code>/bin/x</code>" }, { question: "连得上吗", answer: "可用", action: "<button>再检查</button>" }] });
  assert.equal((questions.match(/class="mw-question"/g) ?? []).length, 2);
  assert.match(questions, /<dt>装在哪<\/dt><dd><code>\/bin\/x<\/code><\/dd><\/div>/);
  assert.match(questions, /<span class="mw-question__action"><button>再检查<\/button><\/span>/);

  const section = renderSettingsSection({ title: "提醒", id: "s", body: row });
  assert.match(section, /^<section class="mw-settings-section"[^>]* aria-labelledby="s"/);
  assert.equal((section.match(/<div class="mw-settings-section__rows">/g) ?? []).length, 1, "a title, then one card of rows");
  assert.match(section, /<header class="mw-settings-section__head"><h2 id="s">提醒<\/h2><\/header>\s*<div class="mw-settings-section__rows">/, "the title sits outside the card");
  assert.doesNotMatch(renderSettingsSection({ body: row }), /<header|aria-labelledby/, "without a title the card stands alone");

  const bar = renderListToolbar({ label: "筛选", search: "<input type=search>", filters: "<select></select><select></select>", more: { label: "更多筛选", body: "<select></select>" }, end: "<button>添加</button>" });
  assert.ok(bar.indexOf("mw-list-toolbar__search") < bar.indexOf("<select>"), "the search comes first");
  assert.match(bar, /<details class="mw-list-toolbar__more"><summary[^>]*>更多筛选/);
});

test("AI 与执行工具: one tool one row, its paths inside it, and no button that cannot be pressed (POLISH-30, POLISH-32)", () => {
  const html = documentOf(page(settings("runtimes", [
    runtime("codex", "connected"), runtime("claude", "needs_repair"), runtime("opencode", "not_connected"),
    runtime("pi", "molis_work_unavailable"), runtime("grok", "not_detected", null),
  ])));
  assert.equal((html.match(/data-runtime-row=/g) ?? []).length, 5);
  assert.equal((html.match(/class="mw-object-row"/g) ?? []).length, 5, "a runtime and its paths are one object row, not two");
  assert.doesNotMatch(html, /settings-data-disclosure|settings-setting-row/);
  assert.doesNotMatch(html, /<button[^>]*\sdisabled/, "POLISH-32: nothing is greyed out without a reason");
  assert.doesNotMatch(html, /class="mw-hint|data-slot="hint"/, "the lead is the explanation; no ⓘ beside the heading");
  // A row runs to the next row or to the end of its card: its action comes after its <details>.
  const row = (id: string) => { const from = html.indexOf(`data-runtime-row="${id}"`), next = html.indexOf("data-runtime-row=", from + 1), end = html.indexOf("</section>", from);
    return html.slice(from, next === -1 ? end : Math.min(next, end)); };
  assert.match(row("codex"), /data-tone="success"/);
  assert.match(row("codex"), /mw-question__action"><button[^>]*data-runtime-plan="codex" data-runtime-action="remove"/, "a tool that is fine keeps its one action inside");
  assert.match(row("claude"), /data-tone="warning"[\s\S]*<\/details><span class="mw-object-row__action"><button[^>]*data-runtime-plan="claude" data-runtime-action="connect"/);
  // What stops every tool at once is said once, at the top, with the way out beside it; the rows it stops stay quiet.
  assert.match(html, /data-runtime-notice[\s\S]*?mw-object-row--alert[\s\S]*?mw-object-row__action"><a [^>]*href="\/settings\/diagnostics/, "red comes with a mark, a sentence and what to do");
  assert.equal((html.match(/href="\/settings\/diagnostics/g) ?? []).length, 1);
  assert.ok(html.indexOf("data-runtime-notice") < html.indexOf("data-runtime-row="));
  assert.doesNotMatch(row("pi"), /mw-object-row__action|data-tone="danger"/);
  assert.doesNotMatch(row("grok"), /data-runtime-plan=/, "a tool that is not on this machine offers nothing to press");
  assert.match(row("grok"), /<dd>[^<]+<\/dd>/, "and says the executable was not found");
  assert.ok(html.indexOf('id="runtimes-connected"') < html.indexOf('id="runtimes-available"') && html.indexOf('id="runtimes-available"') < html.indexOf('id="runtimes-missing"'));
  assert.equal((html.match(/class="mw-settings-section"/g) ?? []).length, (html.match(/class="mw-settings-section__rows"/g) ?? []).length, "every section is one card");
  const none = documentOf(page(settings("runtimes", [runtime("opencode", "not_connected")])));
  assert.doesNotMatch(none, /id="runtimes-connected"/, "POLISH-30: a section with nothing in it is not drawn");
});

test("助理: the places a rule may name are one row that opens in place, not a wall of checkboxes (POLISH-31)", () => {
  const html = documentOf(page(settings("assistant")));
  const closed = html.replace(/<div class="mw-setting-open">[\s\S]*?<\/details>/g, "</details>");
  const boxes = (text: string) => (text.match(/type="checkbox"/g) ?? []).length;
  assert.ok(boxes(closed) <= 5, `${boxes(closed)} checkboxes before anything is opened`);
  assert.equal((html.match(/<details class="mw-setting-fold" data-slot="setting-fold"/g) ?? []).length, 3, "the two rule rows and the capabilities open in place");
  assert.doesNotMatch(html, /<details class="mw-setting-fold" data-slot="setting-fold" open/, "and start closed");
  assert.doesNotMatch(html, /mw-settings-section__note">[^<]{40,}/, "no paragraph of explanation under a title; a row's own sentence says it");
  assert.match(html, /data-assistant-rule-surfaces><\/div>/, "the places are filled in as a multiple choice by the page");
  assert.doesNotMatch(html, /class="settings-check"|class="settings-section/, "switch rows, each section one card");
  assert.equal(boxes(html), (html.match(/role="switch"/g) ?? []).length, "what is left is switches in setting rows");
});

test("记忆: one toolbar with the search and two filters, the rest behind 更多筛选; no empty card (POLISH-30)", () => {
  const html = documentOf(page(settings("memory")));
  const bar = html.slice(html.indexOf('data-slot="list-toolbar"'), html.indexOf("data-memory-batch"));
  const more = bar.indexOf("mw-list-toolbar__more-body");
  const filters = [...bar.matchAll(/data-memory-filter="(\w+)"/g)].map(match => ({ name: match[1], inMore: (match.index ?? 0) > more }));
  assert.deepEqual(filters.filter(filter => !filter.inMore).map(filter => filter.name), ["query", "scene", "state"]);
  assert.deepEqual(filters.filter(filter => filter.inMore).map(filter => filter.name).sort(), ["expired", "kind", "lifecycle", "source"]);
  assert.doesNotMatch(html, /class="settings-section|<section[^>]*data-memory-classes/, "按分类控制记忆 is one row of 谁可以用, not a form of its own");
  assert.doesNotMatch(html, /<section[^>]*data-memory-pairs-section/, "可能重复或冲突 is one row with its button, not a card that sits empty");
});

test("对外接入: who, where and what are rows of one card; each capability is one row that opens in place (POLISH-30, POLISH-32)", () => {
  const entry = (capability_id: string, status: "ungranted" | "enabled" | "stale" | "unavailable", reason?: string) => ({ capability_id, version: 1, provider_id: "io.acme.notes", title: `<${capability_id}>`,
    provider_title: "Acme Notes", description: "整理笔记", kind: "operation", permissions: ["notes:write"], status, ...(reason ? { reason } : {}), can_enable: status !== "enabled" && status !== "unavailable", can_revoke: status === "enabled" });
  const access = (client_id: string | null, entries: ReturnType<typeof entry>[] = []) => documentOf(page({ ...settings("mcp"),
    mcp_access: { client_id, project_id: null, clients: [{ id: "runtime:codex", title: "Codex" }], entries, query: "", filter: "" } }));
  const empty = access(null);
  assert.equal((empty.match(/class="mw-settings-section__rows"/g) ?? []).length, 1, "before a client is chosen the page is one card");
  assert.equal((empty.match(/data-slot="setting-row"/g) ?? []).length, 4, "client, its identity (hidden), scope, and the row that says what to do next");
  assert.match(empty, /选择一个客户端，查看它能使用的能力/);
  assert.doesNotMatch(empty, /capability-filters|mcp-access-context|settings-empty|data-mcp-access-result/, "no label-over-select form, no footnote, no second empty block");
  assert.equal((empty.match(/<button/g) ?? []).length, 1, "one thing to press: 查看能力");

  const chosen = access("runtime:codex", [entry("notes.tidy", "ungranted"), entry("notes.read", "enabled"), entry("notes.sync", "stale"), entry("notes.gone", "unavailable", "服务未连接")]);
  assert.equal((chosen.match(/class="mw-settings-section__rows"/g) ?? []).length, 2, "the scope card, then the capabilities card");
  assert.match(chosen, /data-mcp-scope-pending[^>]*hidden/, "the scope notice is part of the third row and stays hidden until the scope changes");
  assert.equal((chosen.match(/data-grant-row=/g) ?? []).length, 4);
  assert.equal((chosen.match(/<details class="mw-object-row__fold"/g) ?? []).length, 4, "a capability is one object row; its provider and permissions open in place");
  assert.doesNotMatch(chosen, /<summary[^>]*>(?:(?!<\/summary>)[\s\S])*<button/, "授权 and 撤销 sit beside the row's summary, not inside it");
  assert.match(chosen, /<strong>&lt;notes\.tidy&gt;<\/strong>/, "a declared title is text");
  assert.match(chosen, /data-tone="success" data-status="enabled" data-mw-state="ready"/, "the platform state is on the row's state, where its ring is drawn");
  assert.match(chosen, /data-tone="warning" data-status="stale" data-mw-state="reauth"/);
  assert.match(chosen, /暂不可用 · 服务未连接/, "why a capability cannot be used is said on its row");
  assert.doesNotMatch(chosen, /<button[^>]*\sdisabled/, "POLISH-32: a capability that cannot be granted has no button rather than a grey one");
  const gone = chosen.slice(chosen.indexOf("notes.gone"));
  assert.doesNotMatch(gone.slice(0, gone.indexOf("</article>")), /data-mcp-grant/);
});

// specs/screen-polish/p5-settings.md「收齐的标准」: the same row is written one way. The SDK's settings-rows.ts is the only
// place that writes a settings section, a setting row or an object row; the two older rows are gone with their styles.
test("only the SDK writes a settings section, a setting row or an object row, and the older rows are gone (POLISH-29)", () => {
  const sdk = "packages/plugin-sdk/src/ui/settings-rows.ts";
  const files = execFileSync("git", ["ls-files", "--", "apps", "plugins", "packages", "horizontal"], { encoding: "utf8" }).split("\n")
    .filter(file => /\/src\/.*\.(ts|tsx)$/.test(file) && file !== sdk && existsSync(file));
  assert.ok(files.length > 500, "the scan reads the product's sources");
  const PARTS = new Set(["mw-setting-row", "mw-setting-row__control", "mw-settings-section", "mw-settings-section__head", "mw-settings-section__rows", "mw-object-row", "mw-object-row__head"]);
  const written: string[] = [], older: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // In markup: a class attribute naming one of the parts. In a program: the part's name as a string of its own, as a
    // class given to a new element (a selector starts with a dot and a modifier goes on after the name, so neither matches).
    for (const [, value] of text.matchAll(/class=\\?"([^"]*)"/g)) if (value!.split(/\s+/).some(name => PARTS.has(name))) written.push(`${file}: class="${value}"`);
    for (const [found] of text.matchAll(/["'`]mw-(?:setting-row(?:__control)?|settings-section(?:__head|__rows)?|object-row(?:__head)?)["'` ]/g)) written.push(`${file}: ${found}`);
    if (/SETTING_ROW_STYLES|settings-setting-row|\.mw-setting[ ,{>.:]|["'` ]mw-settings?["'` ]/.test(text)) older.push(file);
  }
  assert.deepEqual(written, [], "a page calls renderSettingsSection, renderSettingRow or renderObjectRow; it does not write their markup");
  assert.deepEqual(older, [], "the workbench's settingRow (.settings-setting-row) and the design system's SETTING_ROW_STYLES (.mw-setting) are gone");
  assert.equal(existsSync("apps/workbench/src/settings-row.ts"), false);
});

test("网页搜索: broken default keeps its fix link ready for switch-away; client serializes switches, clears stale status, and restores focus", async () => {
  const html = documentOf(page({
    ...settings("web-search"),
    web_search: {
      default_source: "conn-1", default_unusable: true, last_use: null,
      sources: [
        { source_id: "builtin:anysearch", kind: "builtin", title: "AnySearch", state: "ready", is_default: false },
        { source_id: "conn-1", kind: "connection", service_id: "tavily", title: "Tavily", account_label: "Work", state: "needs_attention", is_default: true },
      ],
    },
  }));
  const brokenRow = html.slice(html.indexOf('data-web-search-source="conn-1"'));
  assert.match(brokenRow, /class="[^"]*web-search-source__current[^"]*"[\s\S]*用不了/, "broken default shows 用不了 while default");
  assert.match(brokenRow, /class="mw-btn mw-btn--ghost mw-btn--sm web-search-source__use" href="\/capabilities\/connections\?connector=tavily">去处理账号<\/a>/,
    "broken default carries the hidden fix link that takes over once the user switches away");

  // Exercise the shipped client script: busy-disables all buttons, moves focus to status when clicked button vanishes, and clears stale status before error.
  type Node = {
    dataset: Record<string, string>; hidden: boolean; disabled: boolean; textContent: string; tabIndex: number; isConnected: boolean; focused: boolean;
    attrs: Record<string, string>; classes: Set<string>;
    classList: { toggle(name: string, force?: boolean): void };
    setAttribute(name: string, value: string): void; removeAttribute(name: string): void; remove(): void; focus(): void;
    closest(selector: string): Node | null;
  };
  const bodyNode = {} as Node;
  let activeEl: Node | null = null;
  const make = (dataset: Record<string, string> = {}, classes: string[] = []): Node => {
    let isDisabled = false;
    const node: Node = {
      dataset, hidden: false,
      get disabled() { return isDisabled; },
      set disabled(value: boolean) {
        isDisabled = value;
        // Real browsers apply the HTML focus fixup rule: disabling the focused control immediately blurs it to document.body.
        if (value && activeEl === node) activeEl = bodyNode;
      },
      textContent: "", tabIndex: 0, isConnected: true, focused: false, attrs: {}, classes: new Set(classes),
      classList: { toggle(name, force) { if (force) node.classes.add(name); else node.classes.delete(name); } },
      setAttribute(name, value) { node.attrs[name] = value; }, removeAttribute(name) { delete node.attrs[name]; },
      remove() { node.isConnected = false; if (activeEl === node) activeEl = bodyNode; },
      focus() { node.focused = true; activeEl = node; }, closest() { return null; },
    };
    return node;
  };
  const said = make(), error = make(), broken = make(); said.hidden = true; error.hidden = true;
  const rowBuiltin = make({ webSearchSource: "builtin:anysearch" }), rowBroken = make({ webSearchSource: "conn-1" }, ["is-default"]);
  const btnFromBanner = make({ webSearchUse: "builtin:anysearch", webSearchName: "AnySearch" }); btnFromBanner.closest = s => s === "[data-web-search-use]" ? btnFromBanner : null;
  const btnOther = make({ webSearchUse: "conn-2", webSearchName: "Brave" }); btnOther.closest = s => s === "[data-web-search-use]" ? btnOther : null;
  activeEl = btnFromBanner;
  let onClick: ((event: { target: Node }) => Promise<void>) | undefined;
  const doc = { documentElement: {}, body: bodyNode, get activeElement() { return activeEl; }, querySelector: () => root };
  const root = {
    dataset: {} as Record<string, string>,
    matches: (s: string) => s === "[data-web-search-settings]",
    contains: () => true,
    addEventListener: (_: string, fn: (event: { target: Node }) => Promise<void>) => { onClick = fn; },
    querySelector: (s: string) => s === "[data-web-search-said]" ? said : s === "[data-web-search-error]" ? error : s === "[data-web-search-broken]" ? (broken.isConnected ? broken : null) : null,
    querySelectorAll: (s: string) => s === "[data-web-search-use]" ? [btnFromBanner, btnOther] : s === "[data-web-search-source]" ? [rowBuiltin, rowBroken] : [],
  };
  const calls: string[] = [];
  let releaseFirst = () => {};
  const firstPending = new Promise<void>(resolve => { releaseFirst = resolve; });
  let failNext = false;
  const request = Object.assign(async (_url: string, init: { body: { source_id: string } }) => {
    calls.push(init.body.source_id);
    if (calls.length === 1) await firstPending;
    if (failNext) throw new Error("network down");
    return { default_source: init.body.source_id };
  }, { show: (target: Node, failure: unknown) => { target.textContent = String(failure); } });
  const bundle = workbenchClientSource();
  const start = bundle.indexOf("globalThis.molisWorkBindWebSearchSettings =");
  const end = bundle.indexOf("globalThis.molisWorkBindWebSearchSettings?.(document);", start);
  assert.ok(start >= 0 && end > start, "workbench client bundle ships molisWorkBindWebSearchSettings");
  const webSearchScript = bundle.slice(start, end + "globalThis.molisWorkBindWebSearchSettings?.(document);".length);
  vm.runInNewContext(pageTextScriptForPacks("zh", chinesePagePacks()) + "\n" + webSearchScript, {
    document: doc, CSS: { escape: (v: string) => v }, matchMedia: () => ({ matches: true }),
    getComputedStyle: (target: Node) => ({ display: target === btnFromBanner ? "none" : "inline-flex", getPropertyValue: () => "" }),
    molisWorkRequest: request,
  });
  // Click first button (inside broken banner); while pending, second button is disabled and ignores clicks.
  const first = onClick!({ target: btnFromBanner });
  assert.equal(btnFromBanner.disabled, true); assert.equal(btnOther.disabled, true, "all switch buttons disable while a switch is in flight");
  await onClick!({ target: btnOther });
  assert.deepEqual(calls, ["builtin:anysearch"], "concurrent click on another button does not fire a second POST");
  // Simulate banner removal removing btnFromBanner; focus must move to status element rather than falling to body.
  btnFromBanner.isConnected = false;
  releaseFirst(); await first;
  assert.equal(rowBuiltin.classes.has("is-default"), true); assert.equal(rowBroken.classes.has("is-default"), false);
  assert.equal(broken.isConnected, false); assert.equal(said.hidden, false); assert.match(said.textContent, /AnySearch/);
  assert.equal(said.focused, true, "focus moves to status note when the clicked button is removed/hidden");
  assert.equal(btnOther.disabled, false);
  // On subsequent failure, stale status message is cleared before request and stays hidden.
  failNext = true;
  await onClick!({ target: btnOther });
  assert.equal(said.hidden, true, "stale success notice is cleared before next request and stays hidden on failure");
  assert.equal(said.textContent, "");
  assert.equal(error.hidden, false); assert.equal(btnOther.disabled, false);
});
