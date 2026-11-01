import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Settings › 角色 (apps/workbench/src/browser/characters/client.ts): an edit stays in this tab's session storage until it is saved,
// and a save names the revision the edit started from, so a revision saved elsewhere is neither overwritten nor lets the edit go;
// 重新读取 gives the edit up only once the person confirms.
test("RAC-1607 RAC-1608: Characters keeps a tab's unsaved edit across a reload, and a revision saved elsewhere is neither overwritten nor lets the edit go", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor } = b;
  const personal = openCharacters(b.homeDirectory, "web-user"); t.after(() => personal.close());
  const draft = personal.service.create();
  personal.service.update(draft.character_id, 1, { title: "已保存的名字", instructions: "已保存的做法", host_tools: null });
  const row = `[data-character-list] [data-character-id="${draft.character_id}"]`;
  const text = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const value = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.value ?? ""`);
  const fill = (selector: string, next: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(next)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // Settings › 角色 loaded afresh in the same tab, as tests/security-invariants-plugin-terminals.e2e.test.ts opens it. The page opens
  // no Character by itself, so its row is clicked as a person does.
  const openPage = async () => {
    await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?settings=characters` }, b.sessionId));
    await b.surfaceReady("characters");
    await waitFor(`document.querySelector(${JSON.stringify(row)}) !== null`);
  };
  const openRow = async () => {
    await click(row);
    await waitFor("document.querySelector('[data-character-workspace]')?.hidden === false && document.querySelector('[data-character-title]')?.disabled === false");
  };
  await openPage(); await openRow();

  // RAC-1607: the edit is kept in this tab and not sent; the page loaded again in the same tab brings it back.
  await fill("[data-character-title]", "窗口里的名字"); await fill("[data-character-instructions]", "窗口里的做法");
  assert.equal(await text("[data-character-draft-note]"), "有未保存的修改，已暂存在此窗口；发布前会先保存。");
  assert.equal(personal.service.get(draft.character_id)?.title, "已保存的名字", "RAC-1607: an unsaved edit is not sent");
  await openPage();
  assert.ok((await text(row)).includes("有未保存的修改"), "RAC-1607: the list marks the Character that has an unsaved edit");
  await openRow();
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1607: loading the page again brings the edit back");
  assert.equal(await value("[data-character-instructions]"), "窗口里的做法");
  assert.equal(await text("[data-character-draft-note]"), "已恢复此窗口未保存的修改。");

  // RAC-1608: another window saves revision 3 while this tab's edit started from revision 2.
  personal.service.update(draft.character_id, 2, { title: "另一个窗口的名字", instructions: "另一个窗口的做法", host_tools: null });
  await openPage(); await openRow();
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1608: the edit is still shown");
  assert.equal(await text("[data-character-draft-note]"), "其他窗口已更新；你的修改仍保留。请核对后重新读取，不能直接覆盖新修订。",
    "RAC-1608: the page says a newer revision was saved elsewhere");
  await click("[data-character-save]");
  await waitFor("document.querySelector('[data-character-notice]')?.textContent !== ''");
  assert.equal(await text("[data-character-notice]"), "角色在另一个窗口已改变，请重新读取后决定；当前修改尚未保存",
    "RAC-1608: saving over the newer revision is refused");
  const kept = personal.service.get(draft.character_id);
  assert.deepEqual({ revision: kept?.revision, title: kept?.title }, { revision: 3, title: "另一个窗口的名字" }, "RAC-1608: the newer revision is not overwritten");
  await openPage(); await openRow();
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1608: a refused save keeps the edit");
  // 重新读取 gives the edit up for the saved revision, and only once the person confirms.
  await click("[data-character-reload]"); await waitFor("document.querySelector('[data-character-dialog]')?.open === true");
  assert.equal(await text("[data-character-dialog-title]"), "重新读取草稿");
  // RAC-2852: the confirmation dialog still receives the Characters page rules.
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-character-dialog] .mw-form__body')).display"), "flex");
  assert.equal(await value("[data-character-title]"), "窗口里的名字", "RAC-1608: opening the dialog alone changes nothing");
  await click("[data-character-confirm]");
  await waitFor("document.querySelector('[data-character-notice]')?.textContent === '已读取最新草稿。'");
  assert.equal(await value("[data-character-title]"), "另一个窗口的名字", "RAC-1608: 重新读取 shows the newer revision");
  assert.equal(await text("[data-character-draft-note]"), "已保存。发布会固定这份内容，已有执行保持原版本。");
  assert.ok(!(await text(row)).includes("有未保存的修改"), "RAC-1608: nothing unsaved is left in this tab");
});

test("RAC-2851 RAC-2852 Characters keeps its own styles on first open, cached reopen and project changes", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const personal = openCharacters(b.homeDirectory, "web-user"); t.after(() => personal.close());
  const configuration = join(b.homeDirectory, "character-source"); await mkdir(configuration);
  const source = join(configuration, "AGENTS.md"); await writeFile(source, "Read the fixture before editing.\n");
  const { draft } = personal.service.import({ runtime_id: "codex", config_root: configuration, captured_at: new Date().toISOString(), rules: [{ path: source, scope: "global", content: "Read the fixture before editing." }], skills: [] }, { rule_paths: [source], skill_ids: [] });
  const saved = personal.service.update(draft.character_id, draft.revision, { title: "PG070 personal role", instructions: "Original fixture instructions", host_tools: null });
  const second = await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, catalog => catalog.createProject({ display_name: "PG070 second project", actor_id: "web-user" }));
  const row = `[data-character-list] [data-character-id="${draft.character_id}"]`;
  const directory = join(REVIEW_EVIDENCE, "pg070-current"); await mkdir(directory, { recursive: true });
  const shot = async (name: string) => { const image = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(image.data, "base64")); };
  const open = async (project: string) => {
    await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project}/?settings=characters` }, b.sessionId));
    await b.surfaceReady("characters"); await b.waitFor(`!!document.querySelector(${JSON.stringify(row)})`);
  };
  const editor = async () => { await b.click(row); await b.waitFor("document.querySelector('[data-character-workspace]')?.hidden===false && document.querySelector('[data-character-title]')?.disabled===false"); };
  const styled = async () => {
    assert.equal(await b.evaluate("document.querySelector('[data-characters]').querySelectorAll(':scope > style').length"), 1);
    assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.characters-row')).display"), "grid");
    // The unchanged settings-stage selector has higher specificity than the Character's 200px declaration.
    assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-character-instructions]')).minHeight"), "36px");
  };
  await b.setViewport(1440, 1000); await open(b.projectId!);
  await b.click("[data-character-import-open]"); await b.waitFor("document.querySelector('[data-character-import-dialog]')?.open===true");
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-character-import-dialog]')).width"), "992px");
  await shot("characters-import-desktop");
  await b.waitFor("!document.querySelector('[data-character-import-close]')?.disabled"); await b.click("[data-character-import-close]");
  await b.waitFor("!document.querySelector('[data-character-import-dialog]')?.open");
  await editor(); await styled();
  assert.equal(await b.evaluate("document.querySelector('[data-character-source-detail]').hidden"), false);
  await b.evaluate("(()=>{const field=document.querySelector('[data-character-instructions]');field.value='Saved PG070 instructions';field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await b.click("[data-character-save]"); await b.waitFor("document.querySelector('[data-character-draft-note]')?.textContent.includes('已保存')");
  assert.equal(personal.service.get(draft.character_id)?.instructions, "Saved PG070 instructions");
  assert.equal(personal.service.get(draft.character_id)?.revision, saved.revision + 1);
  await b.evaluate("globalThis.t393CharacterSection=document.querySelector('[data-characters]')"); await shot("characters-first-open");
  await b.click("[data-cover-close]"); await b.waitFor("!document.querySelector('[data-tab-workspace]').dataset.exclusive");
  await b.click("[data-directory-open=settings]"); await b.waitFor("document.querySelector('[data-characters]').closest('[data-work-surface=settings]')!==null");
  assert.equal(await b.evaluate("globalThis.t393CharacterSection===document.querySelector('[data-characters]')"), true, "cached reopen moves the same section with its style");
  await styled(); await shot("characters-cached-reopen");
  await open(second.project_id); await editor(); await styled();
  assert.equal(await b.evaluate("document.querySelector('[data-character-instructions]').value"), "Saved PG070 instructions");
  await b.setViewport(390, 500);
  await b.click("[data-character-back]"); await b.waitFor("document.querySelector('[data-characters]').dataset.expanded==='false'");
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.characters-steps')).gridTemplateColumns.split(' ').length"), 1);
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.characters-block-head')).flexDirection"), "column");
  await shot("characters-second-project-narrow");
  await b.setViewport(1440, 1000); await open(b.projectId!); await editor(); await styled();
  assert.equal(await b.evaluate("document.querySelector('[data-character-instructions]').value"), "Saved PG070 instructions");
  await shot("characters-returned-project");
});
