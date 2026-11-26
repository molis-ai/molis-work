import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { putInput, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";
import { CURRENT_WORK } from "./fixtures/assistant-current-work.js";

// The role drawer (apps/workbench/src/browser/characters/drawer.ts, plan C): an edit stays in this tab's session storage until it is
// saved, keyed by the version it was typed over, so a version saved elsewhere is neither overwritten nor lets the edit go; the edit is
// given up only when the person chooses 丢掉我的改动, and 在新内容上保留我的改动 lays it over the newer content to save.
const DRAWER_READ = "document.querySelector('[data-character-drawer]')?.open === true && document.querySelector('[data-character-versions-fold]')?.hidden === false"
  + " && !document.querySelector('[data-character-drawer-foot] button')?.disabled";
const CONFLICT = "document.querySelector('[data-roles-drawer=merge]') !== null";

// QEA-148 follows the role settings in an isolated Home through save, conflict and retry.
test("RAC-1607 RAC-1608: Characters keeps a tab's unsaved edit across a reload, and a version saved elsewhere is neither overwritten nor lets the edit go", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor } = b;
  const personal = openCharacters(b.homeDirectory, "web-user"); t.after(() => personal.close());
  const draft = personal.service.create({ title: "已保存的名字", instructions: "已保存的做法", host_tools: null });
  const row = `[data-characters] [data-roles-act="open"][data-roles-arg="original:${draft.character_id}"]`;
  const text = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const value = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.value ?? ""`);
  const fill = (selector: string, next: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(next)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const kept = () => personal.service.get(draft.character_id);
  // Settings › 角色 loaded afresh in the same tab; its first read opens the personal space, so allow for that cold start. The page
  // opens no role by itself: the role's row is opened as a person does.
  const openPage = async () => {
    await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
    await click('[data-directory-open="settings"]'); await click('[data-directory-panel=settings] [data-settings-section="characters"]');
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`, 60_000);
  };
  const openRow = async () => { await click(row); await waitFor(DRAWER_READ); };
  await openPage(); await openRow();
  assert.equal(await value("[data-character-title]"), "已保存的名字");

  // RAC-1607: the edit is kept in this tab and not sent; the page loaded again in the same tab brings it back.
  await fill("[data-character-title]", "窗口里的名字"); await fill("[data-character-instructions]", "窗口里的做法");
  assert.equal(kept()?.title, "已保存的名字", "RAC-1607: an unsaved edit is not sent");
  await openPage(); await openRow();
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1607: loading the page again brings the edit back");
  assert.equal(await value("[data-character-instructions]"), "窗口里的做法");
  assert.equal(await text("[data-character-notice]"), "已恢复这个窗口未保存的修改。");
  assert.equal(await evaluate("document.querySelector('[data-roles-drawer=save]').disabled"), false, "RAC-1607: the edit brought back can be saved");

  // RAC-1608: another window saves version 2 while this tab's edit was typed over version 1.
  personal.service.update(draft.character_id, kept()!.revision, { title: "另一个窗口的名字", instructions: "另一个窗口的做法", host_tools: null });
  await openPage(); await openRow(); await waitFor(CONFLICT);
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1608: the edit is still shown");
  assert.equal(await text("[data-character-notice]"), "其他窗口已更新；你的修改仍保留。请核对后重新读取，不能直接覆盖新修订。",
    "RAC-1608: the page says a newer version was saved elsewhere");
  assert.ok((await text("[data-character-drawer-notices]")).includes("你的「另一个窗口的名字」刚在另一个窗口改过"));
  assert.equal(await evaluate("document.querySelector('[data-roles-drawer=save]').disabled"), true, "RAC-1608: saving over the newer version is not offered");
  await click("[data-roles-drawer=diff]"); await waitFor("document.querySelector('[data-roles-drawer=diff]')?.getAttribute('aria-expanded') === 'true'");
  assert.ok((await text("[data-character-drawer-notices] .roles-diff")).includes("另一个窗口的做法"), "RAC-1608: theirs is shown beside the edit");
  assert.deepEqual({ revision: kept()?.revision, title: kept()?.title }, { revision: 2, title: "另一个窗口的名字" }, "RAC-1608: the newer version is not overwritten");

  // 丢掉我的改动 gives the edit up for the saved version; nothing unsaved is left in this tab.
  await click("[data-roles-drawer=reload]"); await waitFor("document.querySelector('[data-character-notice]')?.textContent === '已读取新内容'");
  assert.equal(await value("[data-character-title]"), "另一个窗口的名字", "RAC-1608: 丢掉我的改动 shows the newer version");
  assert.equal(await evaluate(CONFLICT), false);
  await openPage(); await openRow();
  assert.equal(await value("[data-character-title]"), "另一个窗口的名字", "RAC-1608: a dropped edit does not come back");
  assert.notEqual(await text("[data-character-notice]"), "已恢复这个窗口未保存的修改。");

  // A save that meets a newer version saved while the drawer was open is refused by the Host: the edit stays, nothing is overwritten.
  await fill("[data-character-instructions]", "抽屉里的做法");
  personal.service.update(draft.character_id, kept()!.revision, { title: "第三个窗口的名字", instructions: "第三个窗口的做法", host_tools: null });
  await click("[data-roles-drawer=save]"); await waitFor(CONFLICT);
  assert.equal(await value("[data-character-instructions]"), "抽屉里的做法", "RAC-1608: a refused save keeps the edit");
  assert.deepEqual({ revision: kept()?.revision, instructions: kept()?.instructions }, { revision: 3, instructions: "第三个窗口的做法" });

  // 在新内容上保留我的改动 lays the edit over the newer version; saving then writes it as the next version.
  await click("[data-roles-drawer=merge]"); await waitFor(`!(${CONFLICT}) && document.querySelector('[data-roles-drawer=save]')?.disabled === false`);
  assert.equal(await text("[data-character-notice]"), "已读取那边的新内容，你的改动叠在上面，还没保存");
  await click("[data-roles-drawer=save]"); await waitFor("document.querySelector('[data-roles-drawer=save]') === null");
  assert.deepEqual({ revision: kept()?.revision, instructions: kept()?.instructions }, { revision: 4, instructions: "抽屉里的做法" }, "RAC-1608: the kept edit is saved over the newer version");
  const savedNotice = await text("[data-character-drawer-notices]");
  assert.ok(savedNotice.includes("已保存，原件成为 v4"), savedNotice);
});

test("RAC-1608: a member's edit saved to the original after a conflict keeps what the original's other section says now", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor } = b;
  const personal = openCharacters(b.homeDirectory, "web-user"); t.after(() => personal.close());
  const original = personal.service.create({ title: "核对者", instructions: "原来的做法", host_tools: ["read-file"] });
  const member = personal.service.roles.addMember(b.projectId!, original.character_id);
  const row = `[data-characters][data-character-scope=project] [data-roles-act="open"][data-roles-arg="member:${member.current.member_id}"]`;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/settings/characters` }, b.sessionId));
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`, 60_000);
  await click(row); await waitFor(DRAWER_READ);
  await evaluate(`(()=>{const node=document.querySelector('[data-character-instructions]');node.value='抽屉里的做法';node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  // Meanwhile the original's tools change elsewhere; this edit goes to the original, so the save meets the newer version.
  personal.service.update(original.character_id, original.revision, { title: "核对者", instructions: "原来的做法", host_tools: ["read-file", "search"] });
  await click('[data-roles-drawer=where][data-roles-where=mine]');
  await click("[data-roles-drawer=save]"); await waitFor(CONFLICT);
  assert.deepEqual(personal.service.get(original.character_id)?.host_tools, ["read-file", "search"], "the refused save wrote nothing");
  await click("[data-roles-drawer=merge]"); await waitFor(`!(${CONFLICT}) && document.querySelector('[data-roles-drawer=save]')?.disabled === false`);
  await click("[data-roles-drawer=save]"); await waitFor("document.querySelector('[data-roles-drawer=save]') === null");
  const saved = personal.service.get(original.character_id)!;
  assert.equal(saved.instructions, "抽屉里的做法", "the edited section goes to the original");
  assert.deepEqual(saved.host_tools, ["read-file", "search"], "the section not edited here keeps what the original says now");
  await click("[data-roles-drawer=undo]");
  await waitFor("document.querySelector('[data-character-notice]')?.textContent.includes('已撤销')");
  assert.equal(personal.service.get(original.character_id)?.instructions, "原来的做法", "B36F-05 undo restores the previous original");
  assert.deepEqual(personal.service.get(original.character_id)?.host_tools, ["read-file", "search"]);
  assert.deepEqual(personal.service.roles.memberRole(b.projectId!, member.current.member_id)?.sections.work_style, { mode: "follow" });
  // The member version is unchanged when a followed original changes, so reopen must compare the original version as well.
  personal.service.update(original.character_id, personal.service.get(original.character_id)!.revision, {
    title: "核对者", instructions: "原来的做法", host_tools: ["search"],
  });
  await b.reloadPage();
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`, 60_000);
  await click(row); await waitFor(DRAWER_READ); await waitFor(CONFLICT);
  await click("[data-roles-drawer=merge]");
  await waitFor(`!(${CONFLICT}) && document.querySelector('[data-roles-drawer=save]')?.disabled === false`);
  assert.equal(await evaluate("document.querySelector('[data-character-instructions]').value"), "抽屉里的做法");
  assert.equal(await evaluate("document.querySelector('[data-character-tools]').value"), "search");

  const savedMember = personal.service.roles.memberRole(b.projectId!, member.current.member_id)!;
  personal.service.roles.saveMember(b.projectId!, member.current.member_id, savedMember.revision, savedMember.current.original.version, {
    work_style: { instructions: "不要显示这节的差异" }, capabilities: { host_tools: ["read-file"], action_tools: [] },
  });
  const beforeUpstream = personal.service.get(original.character_id)!;
  personal.service.update(original.character_id, beforeUpstream.revision, { title: beforeUpstream.title, instructions: beforeUpstream.instructions, host_tools: ["search", "read-file"] });
  await b.reloadPage();
  const diff = `[data-roles-act=diff][data-roles-arg="${member.current.member_id}"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(diff)}))`, 60_000);
  await click(diff); await waitFor("Boolean(document.querySelector('.roles-diff'))");
  const comparison = await evaluate<string>("document.querySelector('.roles-diff').textContent");
  assert.ok(comparison.includes("能用什么") && comparison.includes("read-file") && comparison.includes("search"));
  assert.ok(!comparison.includes("不要显示这节的差异"), "only the changed upstream section is compared");
});

test("B36F-04 the task role picker uses the shared editor and sets defaults in place", { timeout: 180_000 }, async t => {
  const b = await sendBrowser(t); if (!b) return;
  const { click, evaluate, waitFor } = b;
  const characters = openCharacters(b.homeDirectory, "web-user"); t.after(() => characters.close());
  const good = characters.service.create({ title: "本项目审稿", instructions: "看结构", host_tools: [] });
  const limited = characters.service.create({ title: "工具不合适", instructions: "需要读文件", host_tools: ["read-file"] });
  const member = characters.service.roles.addMember(b.projectId!, good.character_id);
  characters.service.roles.addMember(b.projectId!, limited.character_id);
  characters.service.roles.setDefault(b.projectId!, { layer: "project", selection: { kind: "project", member_id: member.current.member_id } });
  const pick = "[data-task-role-select]", role = "project:" + member.current.member_id;
  const choose = (value: string) => evaluate(`(() => { const select = document.querySelector("${pick}"); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  const action = (name: string) => click(`[data-task-role-act="${name}"]`);
  const button = '[data-composer-control="character"]';
  const side = "[data-assistant-role-picker]";
  const source = () => evaluate<string>("document.querySelector('[data-task-role-source]').textContent");
  const send = async (prior: string | null, rounds: number) => {
    await click("[data-assistant-composer] [data-composer-send]");
    if (prior) await waitFor(`${CURRENT_WORK} && ${CURRENT_WORK} !== ${JSON.stringify(prior)}`);
    else await waitFor(CURRENT_WORK);
    return waitWork(b, await evaluate<string>(CURRENT_WORK), view => view.rounds.length === rounds && view.work.state === "completed");
  };
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  const more = "[data-assistant-composer] [data-composer-more]";
  const open = async () => {
    await click('[data-assistant-composer] .mw-composer__input');
    if (await evaluate(`Boolean(document.querySelector("${more}")?.getClientRects().length)`)) await click(more);
    await click(button); await waitFor(`document.querySelector("${pick}")?.options.length > 2`, 60_000);
  };
  const path = await evaluate("location.pathname");
  await open();
  assert.equal(await source(), "助理自己", "the empty Now conversation skips the project default");
  assert.equal(await evaluate(`!!document.querySelector("${pick} option[value=inherit]")`), false);
  await action("close");
  await waitFor("!document.querySelector('[data-task-role-picker]')");
  await putInput(b, "先和助理对话");
  const main = await send(null, 1);
  assert.equal(main.work.main, true);
  assert.equal(main.rounds[0]?.character, undefined);
  await click("[data-assistant-more]"); await click("[data-assistant-new]");
  await click("[data-assistant-panel-close]");

  await putInput(b, "选角前已输入的草稿");
  await open();
  assert.match(await source(), /项目默认 · 本项目审稿/);
  assert.equal(await evaluate(`[...document.querySelector("${pick}").options].find(row => row.textContent.includes("工具不合适"))?.disabled`), true);
  await choose(role);
  await action("project"); await action("apply");
  await waitFor("document.querySelector('[data-task-role-notice]')?.textContent.includes('本项目的新任务从现在起用它')");
  assert.deepEqual(characters.service.roles.catalog(b.projectId!, characters.service.list()).defaults.project, { kind: "project", member_id: member.current.member_id });
  await action("personal");
  assert.equal(await evaluate(`document.querySelector("${pick}").value`), "personal:" + good.character_id, "the personal default mode selects the member's original");
  await action("apply");
  await waitFor("document.querySelector('[data-task-role-notice]')?.textContent.includes('你的默认已改')");
  assert.deepEqual(characters.service.roles.catalog(null, characters.service.list()).defaults.personal, { kind: "personal", character_id: good.character_id });
  await choose(role);
  await action("edit");
  await waitFor(DRAWER_READ);
  assert.equal(await evaluate("document.querySelector('[data-character-instructions]').value"), "看结构");
  await click("[data-roles-drawer=close]");
  await waitFor("!document.querySelector('[data-character-drawer]')");
  await action("new");
  await waitFor("document.querySelector('[data-character-drawer]')?.open === true");
  await evaluate(`(() => {
    for (const [field, value] of [["title", "本次新角色"], ["instructions", "先归纳"]]) {
      const input = document.querySelector("[data-character-" + field + "]"); input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  })()`);
  await click("[data-roles-drawer=save]");
  await waitFor("document.querySelector('[data-character-drawer-notices]')?.textContent.includes('已保存')");
  await click("[data-roles-drawer=close]");
  await waitFor(`document.querySelector("${pick}")?.selectedOptions[0]?.textContent === "本次新角色"`);
  await action("apply");
  assert.equal(await evaluate("location.pathname"), path);
  await waitFor(`Array.from(document.querySelectorAll(${JSON.stringify(button)})).some(node => node.textContent.includes("本次新角色"))`);
  await waitFor(`document.activeElement.matches(${JSON.stringify(button)})`);
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').value"), "选角前已输入的草稿");
  assert.deepEqual(characters.service.roles.catalog(b.projectId!, characters.service.list()).defaults.project, { kind: "project", member_id: member.current.member_id });

  const work = await send(main.work.work_id, 1);
  assert.equal(work.rounds[0]?.character?.title, "本次新角色");
  // The work's own 谁来做 row is in the conversation's details (更多 › 详情, 36A-3).
  await click("[data-assistant-more]"); await click("[data-info-details-open]");
  await waitFor(`Boolean(document.querySelector("${side}")?.getClientRects().length)`);
  await evaluate(`document.querySelector("${side}").focus()`);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, b.sessionId);
  await waitFor(`document.querySelector("${pick}")?.options.length > 2`);
  assert.match(await source(), /任务里另选 · 本次新角色/);
  await choose("assistant");
  assert.equal(await source(), "助理自己");
  await action("apply");
  await waitFor(`document.activeElement.matches("${side}")`);
  await putInput(b, "这轮助理自己做");
  const again = await send(null, 2);
  assert.equal(again.work.work_id, work.work.work_id);
  assert.equal(again.rounds[1]?.character, undefined);
});

test("RAC-2851 RAC-2852 Characters keeps its own styles on first open, cached reopen and project changes", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const personal = openCharacters(b.homeDirectory, "web-user"); t.after(() => personal.close());
  const original = personal.service.create({ title: "PG070 personal role", instructions: "Original fixture instructions", host_tools: null });
  const second = await createProject(b.web, "PG070 second project");
  for (const project of [b.projectId!, second.project_id]) personal.service.roles.addMember(project, original.character_id);
  const directory = join(REVIEW_EVIDENCE, "pg070-current"); await mkdir(directory, { recursive: true });
  const shot = async (name: string) => { const image = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(image.data, "base64")); };
  const memberRow = (scope: string) => `[data-characters][data-character-scope=${scope}] [data-roles-act="open"][data-roles-arg^="member:"]`;
  const originalRow = `[data-characters][data-character-scope=personal] [data-roles-act="open"][data-roles-arg="original:${original.character_id}"]`;
  // 项目设置 › 角色 of one project: this project's members.
  const projectRoles = async (project: string) => {
    await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project}/settings/characters` }, b.sessionId));
    await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(memberRow("project"))}))`, 60_000);
  };
  // Settings › 角色: the person's own roles.
  const personalRoles = async () => {
    await b.click('[data-directory-open="settings"]'); await b.click('[data-directory-panel=settings] [data-settings-section="characters"]');
    await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(originalRow)}))`, 60_000);
  };
  // RAC-2851: the section carries its one style element, and its rows take the rules in it.
  const styled = async (scope: "project" | "personal") => {
    const page = `[data-characters][data-character-scope=${scope}]`;
    assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(page)}).querySelectorAll(':scope > style').length`), 1);
    assert.equal(await b.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(page + " .roles-row")})).flexWrap`), "wrap");
  };
  // RAC-2852: the drawer and the import dialog opened from the page still receive the page's rules.
  const drawer = async (row: string, width?: string) => {
    await b.click(row); await b.waitFor(DRAWER_READ);
    if (width) assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-character-drawer]')).width"), width);
    else assert.equal(await b.evaluate("document.querySelector('[data-character-drawer]').getBoundingClientRect().right <= innerWidth"), true, "the drawer fits the screen");
    assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-character-drawer] .roles-dsec')).display"), "grid");
    assert.equal(await b.evaluate("document.querySelector('[data-character-instructions]').value"), "Original fixture instructions");
  };
  const closeDrawer = async () => { await b.click("[data-roles-drawer=close]"); await b.waitFor("!document.querySelector('[data-character-drawer]')?.open"); };

  await b.setViewport(1440, 1000); await projectRoles(b.projectId!); await styled("project");
  await drawer(memberRow("project"), "520px"); await shot("characters-first-open"); await closeDrawer();

  await personalRoles(); await styled("personal");
  await b.click("[data-characters][data-character-scope=personal] [data-roles-act=import]"); await b.waitFor("document.querySelector('[data-character-import-dialog]')?.open === true");
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-character-import-dialog]')).width"), "992px");
  await shot("characters-import-desktop");
  await b.waitFor("!document.querySelector('[data-character-import-close]')?.disabled"); await b.click("[data-character-import-close]");
  await b.waitFor("!document.querySelector('[data-character-import-dialog]')?.open");
  // A cached reopen of Settings › 角色 moves the same section, with its style, back into place.
  await b.evaluate("globalThis.pg070RoleSection = document.querySelector('[data-characters][data-character-scope=personal]')");
  await b.click("[data-cover-close]"); await b.waitFor("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  await personalRoles();
  assert.equal(await b.evaluate("globalThis.pg070RoleSection === document.querySelector('[data-characters][data-character-scope=personal]')"), true,
    "cached reopen moves the same section with its style");
  await styled("personal"); await drawer(originalRow, "520px"); await shot("characters-cached-reopen"); await closeDrawer();

  // Another project draws its own 项目设置 › 角色 with the same rules, at desktop and phone width.
  await projectRoles(second.project_id); await styled("project");
  await b.setViewport(390, 844);
  await drawer(memberRow("project"));
  assert.equal(await b.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "the drawer fits a phone width");
  await shot("characters-second-project-narrow"); await closeDrawer();
  await b.setViewport(1440, 1000); await projectRoles(b.projectId!); await styled("project"); await shot("characters-returned-project");
});
