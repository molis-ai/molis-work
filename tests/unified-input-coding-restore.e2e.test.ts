import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

test("UIV-04 Coding refresh restores its complete configuration without an early composer change overwriting it", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  await issueModel(t, b.homeDirectory, { replyText: "本地配置恢复验收" });
  const { click, evaluate, waitFor, command, sessionId } = b;
  const workspace = join(b.homeDirectory, "coding-restore-fixture"); await mkdir(workspace);
  const fill = (selector: string, value: string) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-restore-fixture')");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.querySelector('[data-work-surface=coding]')?.getBoundingClientRect().width>100");
  await click('[data-coding-new]');
  await waitFor("!document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-model]').options.length>0");
  await fill('[data-coding-model]', JSON.stringify(['issue-fixture', 'fixture']));
  await fill('[data-coding-intent]', 'discuss');
  await fill('[data-coding-task]', '重启后继续这份文字和同一套模型、方式、工作区。');
  await waitFor("document.querySelector('[data-coding-draft-status]').textContent.includes('已保存') && !document.querySelector('[data-coding-send]').disabled");
  const id = await evaluate<string>("document.querySelector('[data-coding-composer]').dataset.uivKey");
  const url = `${b.origin}/projects/${b.projectId}/api/plugins/io.molis.work.coding/sessions/${id}`;
  const before = await (await fetch(url)).json();
  assert.equal(before.configuration.provider_id, 'issue-fixture');
  assert.ok(before.configuration.workspace_id);
  await b.reloadPage();
  await waitFor("document.querySelector('[data-coding-task]').value.includes('重启后继续') && document.querySelector('[data-coding-model]').options.length>0");
  assert.deepEqual(await evaluate("(() => {const q=s=>document.querySelector(s);return {model:q('[data-coding-model]').value,intent:q('[data-coding-intent]').value,workspace:q('[data-coding-workspace-choice]').value,disabled:q('[data-coding-send]').disabled};})()"), {
    model: JSON.stringify(['issue-fixture', 'fixture']), intent: 'discuss', workspace: before.configuration.workspace_id, disabled: false,
  });
  // UIV-01: asynchronous loading must clear the unavailable state without another user edit.
  await waitFor("document.querySelector('[data-coding-composer]').dataset.uivState === 'draft'");
  assert.equal(await evaluate("document.querySelector('[data-coding-composer] [data-uiv-field-state]').textContent"), '已有草稿');
  await fill('[data-coding-task]', '恢复后继续编辑，配置不能变成空值。');
  await waitFor("document.querySelector('[data-coding-draft-status]').textContent.includes('已保存')");
  const after = await (await fetch(url)).json();
  assert.deepEqual(after.configuration, before.configuration);
  assert.equal(after.draft, '恢复后继续编辑，配置不能变成空值。');
  assert.equal(after.runs.length, 0, 'restoring and editing never submit a round');
});
