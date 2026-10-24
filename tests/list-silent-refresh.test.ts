import { SCHEDULE_NATIVE_PLUGIN_ROUTES } from "./schedule-direct-actions.js";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/dist/functions/client.js";
import {
  INBOX_NATIVE_PLUGIN_ROUTES,
  InboxPluginRouteTable,
  createInboxRouteHandlers,
} from "@molis-ai/molis-work-plugin-inbox";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-alchemist";
import { PPT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-ppt";
import {
  SCHEDULE_CLIENT_FACTORY_SCRIPT,
} from "@molis-ai/molis-work-plugin-schedule";
import { CLIENT_EVENTS_PRIMARY_SCRIPT } from "../apps/workbench/dist/scripts/client/events-primary.js";
import { CLIENT_EVENTS_SECONDARY_SCRIPT } from "../apps/workbench/dist/scripts/client/events-secondary.js";
import { CLIENT_NAVIGATION_FEED_SCRIPT } from "../apps/workbench/dist/scripts/client/navigation-feed.js";
import { CLIENT_NAVIGATION_INBOX_SCRIPT } from "../apps/workbench/dist/scripts/client/navigation-inbox.js";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";

// Forms' page is TypeScript bundled and minified into its client pack (W4-04): what its code does is read in the sources.
const lingguangSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/lingguang/src/browser/${file}`, import.meta.url)), "utf8");
const datasetSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/dataset/src/browser/${file}`, import.meta.url)), "utf8");
const pagesSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/pages/src/browser/${file}`, import.meta.url)), "utf8");
const formSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/form/src/browser/${file}`, import.meta.url)), "utf8");

const csrClients = {
  ppt: PPT_CLIENT_FACTORY_SCRIPT,
  functions: FUNCTIONS_CLIENT_FACTORY_SCRIPT,
} as const;

function sliceFn(script: string, startToken: string, endToken: string): string {
  const start = script.indexOf(startToken);
  const end = script.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `找不到 ${startToken}`);
  return script.slice(start, end);
}

test("个人插件列表在创建、删除、返回后重新 GET，并保住滚动位置", () => {
  for (const [name, script] of Object.entries(csrClients)) {
    assert.match(script, /keepListScroll/, `${name} 要保住列表滚动`);
    assert.match(script, /list\.scrollTop = top/, `${name} 画完要写回 scrollTop`);
    assert.match(script, /await loadList\(\)/, `${name} 变更后要重新拉列表`);
    // Functions reloads with { preserveForm: true } so a draft still open elsewhere keeps its form.
    assert.match(script, /\/delete[\s\S]{0,500}loadList\((\{ preserveForm: true \})?\)/, `${name} 删除后要重新拉列表`);
  }
  // 灵光 is TypeScript bundled into its client pack: the list keeps its scroll on every repaint, and discarding and going back
  // each load the list again.
  const lingguangList = sliceFn(lingguangSource("list.ts"), "page.renderList = ", "page.markSelected");
  assert.match(lingguangList, /const top = el\.list\.scrollTop[\s\S]*paintList\(\)[\s\S]*el\.list\.scrollTop = top/, "灵光 要保住列表滚动，画完写回 scrollTop");
  const lingguangCommands = lingguangSource("commands.ts");
  assert.match(sliceFn(lingguangCommands, "const discardIds", "const current"), /\/discard[\s\S]{0,250}await page\.loadList\(\)/, "灵光 丢掉后要重新拉列表");
  assert.match(sliceFn(lingguangCommands, "const back", "const pick"), /await page\.loadList\(\)/, "灵光 返回后要重新拉列表");
  // Dataset is TypeScript bundled into its client pack too: the list keeps its scroll on every repaint, and creating, deleting and
  // going back each load the list again.
  const datasetList = sliceFn(datasetSource("list.ts"), "page.renderList = ", "page.markSelected");
  assert.match(datasetList, /const top = el\.list\.scrollTop[\s\S]*paintList\(\)[\s\S]*el\.list\.scrollTop = top/, "dataset 要保住列表滚动，画完写回 scrollTop");
  const datasetCommands = datasetSource("record-commands.ts");
  assert.match(sliceFn(datasetCommands, "export async function createTable", "export async function openTable"), /await page\.loadList\(\)/, "dataset 新建后要重新拉列表");
  assert.match(sliceFn(datasetCommands, "export async function deleteTable", "\n}\n"), /\/delete[\s\S]{0,250}await page\.loadList\(\)/, "dataset 删除后要重新拉列表");
  assert.match(sliceFn(datasetCommands, "export async function backToList", "export async function pinFixed"), /await page\.loadList\(\)/, "dataset 返回后要重新拉列表");
  assert.match(datasetSource("commands.ts"), /always\("\[data-dataset-back\]", \(page\) => record\.backToList\(page\)\)/, "dataset 的返回按钮走 backToList");
  // Pages is TypeScript bundled into its client pack too: the list keeps its scroll on every repaint (read before the rows are
  // replaced, written back after), and deleting a document or a folder and going back each load the list again.
  const pagesList = sliceFn(pagesSource("list.ts"), "export const renderList", "const paintList");
  assert.match(pagesList, /const top = page\.list\?\.scrollTop[\s\S]*paintList\(page\)[\s\S]*page\.list\.scrollTop = top/, "pages 要保住列表滚动，画完写回 scrollTop");
  const pagesClick = pagesSource("click.ts");
  assert.match(pagesClick, /\/delete[\s\S]{0,500}await loadList\(page\)/, "pages 删除后要重新拉列表");
  assert.match(pagesClick, /data-pages-back[\s\S]{0,400}await loadList\(page\)/, "pages 返回后要重新拉列表");
  // Forms: the list keeps its scroll on every repaint (read before the rows are replaced, written back after), and creating,
  // deleting and going back each load the list again.
  // CLN-04: these helpers are internal; the scroll contract does not depend on an export modifier.
  const formList = sliceFn(formSource("list.ts"), "const renderList", "const markSelected");
  assert.match(formList, /const top = page\.list\?\.scrollTop[\s\S]*page\.rowsEl\.replaceChildren\(\)[\s\S]*page\.list\.scrollTop = top/, "form 要保住列表滚动，画完写回 scrollTop");
  const formCommands = formSource("commands.ts");
  assert.match(sliceFn(formCommands, "const create", "};"), /await loadList\(page\)/, "form 新建后要重新拉列表");
  assert.match(formCommands, /\/delete[\s\S]{0,500}await loadList\(page\)/, "form 删除后要重新拉列表");
  assert.match(formCommands, /data-form-back[\s\S]{0,400}await loadList\(page\)/, "form 返回后要重新拉列表");
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /data-ppt-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /data-functions-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(lingguangCommands, /data-lingguang-back\]"\)\) \{ await back\(\)/, "灵光 的返回按钮走 back()");
  // Alchemist Studio is not a list-and-editor plugin; its content re-render keeps the reader's scroll position.
  // (Its main pane is mainEl and the redraws are paintStudy / paintDir.)
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /const scroll=mainEl\.scrollTop;paint\w+\([^)]*\);mainEl\.scrollTop=scroll;/);
});

test("Functions 静默刷新当前草稿时不重挂编辑器，保存失败保留表单", () => {
  const loadList = sliceFn(FUNCTIONS_CLIENT_FACTORY_SCRIPT, "const loadList = async (opts = {}) => {", "const draftBody");
  const saveDraft = sliceFn(FUNCTIONS_CLIENT_FACTORY_SCRIPT, "const saveDraft = async () => {", "const queueSave");
  assert.match(loadList, /if \(opts\.preserveForm\)/);
  assert.match(loadList, /titleEl\.textContent = next\.name/);
  assert.equal([...loadList.matchAll(/fillEditor\(/g)].length, 1);
  assert.match(saveDraft, /preserveForm: true/);
  // The save that comes back for a draft the person has since left must not write into the open one (the selection is `sel`).
  assert.match(saveDraft, /sel\?\.id !== savingId/);
  assert.doesNotMatch(saveDraft, /remount:\s*true/);
  assert.doesNotMatch(saveDraft, /fillEditor/);
});

test("Feed / Inbox 成功路径改走舞台刷新，工作台脚本含 refresh helpers", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.match(script, /const refreshFeedStage = async/);
  assert.match(script, /const refreshInboxStage = async/);
  assert.match(CLIENT_NAVIGATION_FEED_SCRIPT, /const refreshFeedStage = async/);
  assert.match(CLIENT_NAVIGATION_INBOX_SCRIPT, /const refreshInboxStage = async/);
  assert.doesNotMatch(CLIENT_EVENTS_PRIMARY_SCRIPT, /location\.reload\(/);
  assert.doesNotMatch(CLIENT_EVENTS_SECONDARY_SCRIPT, /location\.reload\(/);
  assert.match(CLIENT_EVENTS_PRIMARY_SCRIPT, /await refreshFeedStage\(\)/);
  assert.match(CLIENT_EVENTS_SECONDARY_SCRIPT, /await refreshInboxStage\(\)/);
  assert.match(CLIENT_EVENTS_SECONDARY_SCRIPT, /await refreshFeedStage\(\)/);
  // A failed stage refresh keeps the page and says so; it never falls back to a full reload.
  for (const script of [CLIENT_NAVIGATION_FEED_SCRIPT, CLIENT_NAVIGATION_INBOX_SCRIPT]) {
    assert.doesNotMatch(script, /location\.reload\(/);
    // The toast is the shared request helper's error (with its 诊断编号 when the call left a row, W3-10), marked as a failure
    // (it carries the failure glyph, DESIGN.md → Toasts); the request names what could not be refreshed.
    assert.match(script, /showToast\(error,\s*true\)/);
    assert.match(script, /fallback:\s*L\("无法更新 (Feed|Inbox) 列表"\s*\)/);
  }
});

test("Inbox fragment and Schedule isolated view refresh retain their presentation boundaries", async () => {
  assert.ok(INBOX_NATIVE_PLUGIN_ROUTES.some((route) => route.route_id === "inbox.workbench"));
  assert.ok(!SCHEDULE_NATIVE_PLUGIN_ROUTES.some((route) => route.route_id === "schedule.workbench"));
  assert.ok(SCHEDULE_NATIVE_PLUGIN_ROUTES.some((route) => route.route_id === "schedule.task.archive"));

  const inbox = new InboxPluginRouteTable(createInboxRouteHandlers({
    actions: { discover: async () => [], invoke: async <Input, Output>(definition: import("@molis-ai/molis-work-contracts/platform/actions").ActionDefinition<Input, Output>, input: Input): Promise<Output> => {
      assert.equal(definition, inboxActions.list);
      assert.deepEqual(input, {});
      return { entries: [] } as Output;
    } },
    changed() {},
    renderWorkbench: () => '<section data-inbox-workbench><div data-inbox-list></div><div data-inbox-stage-workspace></div></section>',
  }));
  const inboxPage = await inbox.handle({
    method: "GET",
    pathname: "/api/inbox/workbench",
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(inboxPage?.status, 200);
  assert.match(String(inboxPage?.html), /data-inbox-list/);

  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /await host\.view\.readDocument\(\)/);
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /const refreshStage = async/);
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /await refreshStage\(/);
  assert.doesNotMatch(SCHEDULE_CLIENT_FACTORY_SCRIPT, /location\.reload\(/);
});
