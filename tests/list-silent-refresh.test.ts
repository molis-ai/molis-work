import assert from "node:assert/strict";
import test from "node:test";

import { DATASET_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-dataset";
import { FORM_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-form";
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-functions";
import {
  INBOX_NATIVE_PLUGIN_ROUTES,
  InboxPluginRouteTable,
  createInboxRouteHandlers,
} from "@molis-ai/molis-work-plugin-inbox";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-lingguang";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-alchemist";
import { PAGES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-pages";
import { PPT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-ppt";
import {
  SCHEDULE_CLIENT_FACTORY_SCRIPT,
  SCHEDULE_NATIVE_PLUGIN_ROUTES,
  SchedulePluginRouteTable,
  createScheduleRouteHandlers,
} from "@molis-ai/molis-work-plugin-schedule";
import { CLIENT_EVENTS_PRIMARY_SCRIPT } from "../apps/workbench/src/scripts/client/events-primary.ts";
import { CLIENT_EVENTS_SECONDARY_SCRIPT } from "../apps/workbench/src/scripts/client/events-secondary.ts";
import { CLIENT_NAVIGATION_FEED_SCRIPT } from "../apps/workbench/src/scripts/client/navigation-feed.ts";
import { CLIENT_NAVIGATION_INBOX_SCRIPT } from "../apps/workbench/src/scripts/client/navigation-inbox.ts";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";

const csrClients = {
  form: FORM_CLIENT_FACTORY_SCRIPT,
  dataset: DATASET_CLIENT_FACTORY_SCRIPT,
  ppt: PPT_CLIENT_FACTORY_SCRIPT,
  functions: FUNCTIONS_CLIENT_FACTORY_SCRIPT,
  pages: PAGES_CLIENT_FACTORY_SCRIPT,
  lingguang: LINGGUANG_CLIENT_FACTORY_SCRIPT,
  alchemist: ALCHEMIST_CLIENT_FACTORY_SCRIPT,
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
    if (name === "lingguang") {
      assert.match(script, /\/discard[\s\S]{0,250}loadList\(\)/, `${name} 丢掉后要重新拉列表`);
    } else {
      assert.match(script, /\/delete[\s\S]{0,500}loadList\(\)/, `${name} 删除后要重新拉列表`);
    }
  }
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-form-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /data-dataset-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /data-ppt-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /data-functions-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /data-lingguang-back[\s\S]{0,400}await loadList\(\)/);
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /data-alchemist-back[\s\S]{0,400}await loadList\(\)/);
});

test("Functions 静默刷新当前草稿时不重挂编辑器，保存失败保留表单", () => {
  const loadList = sliceFn(FUNCTIONS_CLIENT_FACTORY_SCRIPT, "const loadList = async (opts = {}) => {", "const draftBody");
  const saveDraft = sliceFn(FUNCTIONS_CLIENT_FACTORY_SCRIPT, "const saveDraft = async () => {", "const queueSave");
  assert.match(loadList, /if \(opts\.preserveForm\)/);
  assert.match(loadList, /titleEl\.textContent = next\.name/);
  assert.equal([...loadList.matchAll(/fillEditor\(/g)].length, 1);
  assert.match(saveDraft, /preserveForm: true/);
  assert.match(saveDraft, /selected\?\.id !== savingId/);
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
  assert.equal([...CLIENT_NAVIGATION_FEED_SCRIPT.matchAll(/location\.reload\(/g)].length, 1);
  assert.equal([...CLIENT_NAVIGATION_INBOX_SCRIPT.matchAll(/location\.reload\(/g)].length, 1);
});

test("Inbox / Schedule 工作区 fragment 走 HTML 路由", async () => {
  assert.ok(INBOX_NATIVE_PLUGIN_ROUTES.some((route) => route.route_id === "inbox.workbench"));
  assert.ok(SCHEDULE_NATIVE_PLUGIN_ROUTES.some((route) => route.route_id === "schedule.workbench"));
  assert.equal(SCHEDULE_NATIVE_PLUGIN_ROUTES.length, 6);

  const inbox = new InboxPluginRouteTable(createInboxRouteHandlers({
    listEntries: () => [],
    setStatus: () => {
      throw new Error("unused");
    },
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

  const schedule = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    listJobs: () => [],
    setEnabled: () => {
      throw new Error("unused");
    },
    listTasks: () => [],
    createTask: () => {
      throw new Error("unused");
    },
    setTaskEnabled: () => {
      throw new Error("unused");
    },
    openTask: () => {
      throw new Error("unused");
    },
    changed() {},
    renderWorkbench: () => '<section data-schedule-workbench><div data-schedule-list></div><div data-schedule-stage-workspace></div></section>',
  }));
  const schedulePage = await schedule.handle({
    method: "GET",
    pathname: "/api/schedule/workbench",
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(schedulePage?.status, 200);
  assert.match(String(schedulePage?.html), /data-schedule-list/);
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /const refreshStage = async/);
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /await refreshStage\(/);
  assert.equal([...SCHEDULE_CLIENT_FACTORY_SCRIPT.matchAll(/location\.reload\(/g)].length, 1);
});
