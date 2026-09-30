import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { formFillPageHtml, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

/** The shared moves of a placement journey in the real workbench (real pointer clicks, first visible match). */
async function journey(t: TestContext, mode: "empty" | "seeded", name: string) {
  const browser = await openGoalBrowser(t, mode);
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  const text = JSON.stringify;
  const output = new URL(`../${specEvidenceDirectory("specs/work-placement/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (step: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`placement-${name}-${step}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const go = (path: string) => navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
  const visible = (selector: string, label?: string) => `[...document.querySelectorAll(${text(selector)})].find(node => node.getClientRects().length${label ? ` && node.textContent.trim() === ${text(label)}` : ""})`;
  // A bar or list may repaint between marking the target and clicking it; mark the fresh one and click again.
  const press = async (selector: string, label?: string) => {
    for (let attempt = 0; ; attempt++) {
      await waitFor(`Boolean(${visible(selector, label)})`, 15_000);
      await evaluate(`(() => { document.querySelectorAll('[data-e2e-target]').forEach(node => node.removeAttribute('data-e2e-target')); ${visible(selector, label)}.setAttribute('data-e2e-target', ''); })()`);
      try { await click("[data-e2e-target]"); return; }
      catch (error) { if (attempt >= 2 || !/Click target disappeared|Missing click target/u.test(String((error as Error).message))) throw error; }
    }
  };
  const card = (words: string) => waitFor(`[...document.querySelectorAll('.placement-toast')].some(node => node.innerText.includes(${text(words)}))`, 15_000);
  const cardButton = async (words: string, label: string) => {
    await card(words);
    await evaluate(`(() => { document.querySelectorAll('[data-e2e-target]').forEach(node => node.removeAttribute('data-e2e-target'));
      const toast = [...document.querySelectorAll('.placement-toast')].find(node => node.innerText.includes(${text(words)}));
      [...toast.querySelectorAll('button')].find(button => button.textContent.trim() === ${text(label)}).setAttribute('data-e2e-target', ''); })()`);
    await click("[data-e2e-target]");
  };
  const current = () => evaluate<{ kind: string; id: string; title: string } | null>(`(() => {
    const node = [...document.querySelectorAll('[data-assistant-context]')].find(element => element.getClientRects().length && JSON.parse(element.getAttribute('data-assistant-context') || '{}').object);
    return node ? JSON.parse(node.getAttribute('data-assistant-context')).object : null; })()`);
  type Description = { state: string; title: string; location: { title: string } | null; moved_from: { title: string } | null; associations: { type: string; label: string; target: { project_id: string | null } }[] };
  const describe = (object: { kind: string; id: string; project_id: string | null }) => evaluate<Description>(`globalThis.molisPlacement.describe(${text(object)}, true)`);
  const openPlugin = async (plugin: string, project: string) => {
    await go(`/projects/${project}/?openPlugin=${plugin}`);
    await waitFor(`document.querySelector('[data-plugin-strip] [data-plugin-id=${plugin}]')`, 15_000);
    if (await evaluate("document.body.dataset.desktopSurface") !== plugin) await click(`[data-plugin-strip] [data-plugin-id=${plugin}]`);
    await waitFor(`document.body.dataset.desktopSurface === '${plugin}'`, 15_000);
  };
  const projectHome = async (project: string) => {
    await go(`/projects/${project}/`);
    await waitFor("document.querySelector('.tab-item[data-tab-kind=home]')", 15_000);
    if (!await evaluate<boolean>("Boolean(document.querySelector('.tab-item[data-tab-kind=home][aria-current]'))")) await click(".tab-item[data-tab-kind=home] .tab-item-trigger");
    await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')", 15_000);
  };
  // The bar repaints as descriptions arrive; if the click landed on a node that was just replaced, click the new one.
  const panel = async (action: string) => {
    for (let attempt = 0; ; attempt++) {
      await press(".placement-bar");
      try { await waitFor(`document.querySelector('.placement-panel [data-placement-action="${action}"]')`, 5_000); return; }
      catch (error) { if (attempt >= 2) throw error; }
    }
  };
  const title = async (value: string) => {
    await evaluate(`(() => { const input = ${visible("[data-pages-title]")}; input.focus(); input.value = ${text(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(`${visible("[data-pages-editor-status]")}?.textContent === '已保存'`, 15_000);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  return { ...browser, text, screenshot, go, visible, press, card, cardButton, current, describe, openPlugin, projectHome, panel, title };
}

// AC3: a brand-new Home, no project at all. The work gets done in the personal space; what needs a project says so plainly;
// once a project exists the same document moves there and opens in its new place.
test("placement journey: no project yet — start in the personal space, finish the work, organize it later", { timeout: 150_000 }, async t => {
  const j = await journey(t, "empty", "no-project");
  if (!j) return;
  const { go, press, card, cardButton, current, describe, openPlugin, panel, title, evaluate, waitFor, click, reloadPage, homeDirectory, screenshot, command, sessionId } = j;
  await go("/onboarding");
  // A first run opens with language and appearance; the person goes past both before choosing how to start.
  await press('[data-action="intro-next"]');
  await press('[data-action="intro-next"]');
  await press('[data-action="blank"]');
  await j.navigate(() => press('[data-action="personal"]'));
  await waitFor("location.pathname.startsWith('/projects/personal/')", 15_000);
  await openPlugin("pages", "personal");
  await press("[data-pages-new]");
  await card("存到 个人空间");
  await title("读书笔记：长期主义");
  const doc = (await current())!;
  const personal = { kind: doc.kind, id: doc.id, project_id: "personal" };
  // The work itself: what Pages promises is a document you can take away, as Markdown and as a web page, with what you wrote.
  await evaluate("document.querySelector('[data-pages-editor] [contenteditable=\"true\"]').focus()");
  await command("Input.insertText", { text: "复利来自长期坚持。" }, sessionId);
  await evaluate("new Promise(resolve => setTimeout(resolve, 1200))");
  await waitFor(`${j.visible("[data-pages-editor-status]")}?.textContent === '已保存'`, 15_000);
  const downloads = join(homeDirectory, "exports");
  await mkdir(downloads);
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads }, sessionId);
  for (const format of ["md", "html"]) {
    await press("[data-pages-more]");
    await press(`[data-pages-export="${format}"]`);
    await card("已导出");
    let file = "";
    for (let tries = 0; !file; tries++) {
      const name = (await readdir(downloads)).find(entry => entry.endsWith("." + format));
      if (name) file = await readFile(join(downloads, name), "utf8");
      else if (tries > 50) assert.fail(`no .${format} file was downloaded`);
      else await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.match(file, /读书笔记：长期主义/u, `the ${format} file carries the title`);
    assert.match(file, /复利来自长期坚持/u, `the ${format} file carries what was written`);
  }
  // Nothing to use it in yet: the choice is there, greyed out, and says why; moving says there is nowhere else.
  await panel("use-in-project");
  assert.deepEqual(await evaluate(`(() => { const b = document.querySelector('.placement-panel [data-placement-action="use-in-project"]'); return [b.disabled, b.title]; })()`), [true, "还没有其他项目"]);
  await screenshot("panel");
  await click('.placement-panel [data-placement-action="move"]');
  await card("没有别的位置");
  // Later a project exists; the same document goes there and opens there, with where it came from.
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const club = await catalog.createProject({ display_name: "读书会", actor_id: "placement-test" });
  catalog.addProjectPlugin({ project_id: club.project_id, plugin_id: "pages", actor_id: "placement-test" });
  catalog.close();
  // After a reload Pages is back on its list, the document first; one click continues it.
  await reloadPage();
  await press(`[data-page-id="${doc.id}"]`);
  await waitFor(`${j.visible("[data-pages-title]")}?.value === '读书笔记：长期主义'`, 15_000);
  await panel("move");
  await click('.placement-panel [data-placement-action="move"]');
  await waitFor("document.querySelector('dialog.placement-dialog')?.open", 12_000);
  await click(`dialog.placement-dialog input[name="to"][value="${club.project_id}"]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await cardButton("已移到 项目「读书会」", "在新位置打开");
  await waitFor(`location.pathname === '/projects/${club.project_id}/' && ${j.visible("[data-pages-title]")}?.value === '读书笔记：长期主义'`, 15_000);
  assert.equal((await current())?.id, doc.id, "the same document, now in the project");
  const moved = await describe(personal);
  assert.deepEqual([moved.location?.title, moved.moved_from?.title], ["项目「读书会」", "个人空间"]);
  await screenshot("organized");
});

// AC4 in the real UI: one document serves two projects and a Goal. An edit shows everywhere; taking it out of one project
// leaves the others; a move that fails leaves it where it was and still editable; deleting it is shown where it was used.
test("placement journey: one document used by two projects and a Goal — edit, remove one use, a failed move, delete", { timeout: 200_000 }, async t => {
  const j = await journey(t, "seeded", "shared");
  if (!j) return;
  const { go, press, card, current, describe, openPlugin, projectHome, panel, title, evaluate, waitFor, click, projectId, homeDirectory, screenshot, text } = j;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const other = await catalog.createProject({ display_name: "市场活动", actor_id: "placement-test" });
  const doomed = await catalog.createProject({ display_name: "临时项目", actor_id: "placement-test" });
  catalog.close();
  await go(`/projects/${projectId}/`);
  const projectTitle = await evaluate<string>(`fetch('/api/placement/spaces').then(r => r.json()).then(v => v.spaces.find(s => s.project_id === ${text(projectId)}).title)`);
  await openPlugin("pages", "personal");
  await press("[data-pages-new]");
  await card("存到 个人空间");
  await title("竞品调研");
  const doc = (await current())!;
  const personal = { kind: doc.kind, id: doc.id, project_id: "personal" };
  for (const [project, name] of [[projectId!, projectTitle], [other.project_id, "市场活动"]] as const) {
    await panel("use-in-project");
    await click('.placement-panel [data-placement-action="use-in-project"]');
    await waitFor("document.querySelector('dialog.placement-dialog')?.open", 12_000);
    await click(`dialog.placement-dialog input[name="project"][value="${project}"]`);
    await click("dialog.placement-dialog [data-placement-confirm]");
    await card(`已用于项目「${name}」`);
  }
  await panel("goal");
  await click('.placement-panel [data-placement-action="goal"]');
  await waitFor(`document.querySelector('dialog.placement-dialog input[name="goal"][value="${projectId}|CORE"]')`, 12_000);
  await click(`dialog.placement-dialog input[name="goal"][value="${projectId}|CORE"]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await card("已关联到 Goal「");

  // One edit, seen from both projects: it is the same document, not two copies.
  await title("竞品调研（含定价）");
  for (const project of [projectId!, other.project_id]) {
    await projectHome(project);
    await waitFor(`[...document.querySelectorAll('[data-placement-related] .placement-related-row')].some(row => row.innerText.includes('竞品调研（含定价）'))`, 15_000);
  }
  await screenshot("used-twice");
  // Taken out of 市场活动 only: 市场活动 stops listing it, the other project and the Goal keep it.
  await press(`[data-placement-related] .placement-related-row button`, "移除关联");
  await card("已移除关联");
  await waitFor(`![...document.querySelectorAll('[data-placement-related] .placement-related-row')].some(row => row.innerText.includes('竞品调研'))`, 12_000);
  await projectHome(projectId!);
  await waitFor(`[...document.querySelectorAll('[data-placement-related] .placement-related-row')].some(row => row.innerText.includes('竞品调研（含定价）'))`, 15_000);
  const kept = await describe(personal);
  assert.deepEqual(kept.associations.filter(link => link.type === "used_in").map(link => link.target.project_id), [projectId], "only the other project's use went away");
  assert.ok(kept.associations.some(link => link.label.startsWith("Goal「")), "the Goal still has it");

  // A move that fails (the chosen project is deleted while the dialog is open) says why, keeps the dialog for another
  // choice, and leaves the document where it was, still editable.
  await press(`[data-placement-related] [data-placement-open="${doc.id}"]`);
  await waitFor(`location.pathname === '/projects/personal/' && ${j.visible("[data-pages-title]")}?.value === '竞品调研（含定价）'`, 15_000);
  await panel("move");
  await click('.placement-panel [data-placement-action="move"]');
  await waitFor(`document.querySelector('dialog.placement-dialog input[name="to"][value="${doomed.project_id}"]')`, 12_000);
  const deleting = await openMolisWorkProjectCatalog({ homeDirectory });
  await deleting.deleteProject({ project_id: doomed.project_id, actor_id: "placement-test", delete_confirmed: true, idempotency_key: "delete-doomed" });
  deleting.close();
  await click(`dialog.placement-dialog input[name="to"][value="${doomed.project_id}"]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await waitFor("document.querySelector('dialog.placement-dialog')?.open && document.querySelector('.placement-dialog-error').textContent.length > 0", 12_000);
  await waitFor(`!document.querySelector('dialog.placement-dialog input[name="to"][value="${doomed.project_id}"]')`, 12_000);
  await screenshot("move-failed");
  assert.equal((await describe(personal)).location?.title, "个人空间", "a failed move leaves it where it was");
  await click(`dialog.placement-dialog input[name="to"][value="${projectId}"]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await card(`已移到 项目「${projectTitle}」`);
  const moved = await describe(personal);
  assert.deepEqual([moved.location?.title, moved.moved_from?.title], [`项目「${projectTitle}」`, "个人空间"]);
  assert.ok(moved.associations.some(link => link.label.startsWith("Goal「")), "the Goal relation survives the move");

  // Deleted in its new place: the Goal's materials say the original is gone and offer to clean up.
  await go(`/projects/${projectId}/?openPlugin=pages&openItem=${doc.id}`);
  await waitFor(`${j.visible("[data-pages-title]")}?.value === '竞品调研（含定价）'`, 15_000);
  await press("[data-pages-more]");
  await press("[data-pages-delete]");
  await press("[data-pages-confirm] [data-confirm-ok]");
  for (let tries = 0; (await describe(personal)).state !== "missing"; tries++) {
    if (tries > 50) assert.fail("the deleted document still reads as there");
    await evaluate("new Promise(resolve => setTimeout(resolve, 200))");
  }
  await go(`/projects/${projectId}/?openPlugin=goals&openItem=CORE&openGoalView=work`);
  await press('[data-goal-view="CORE"] [data-goal-materials-entry]');
  await waitFor(`Boolean(${j.visible(`[data-placement-material][data-placement-id="${doc.id}"]`)}) && ${j.visible(`[data-placement-material][data-placement-id="${doc.id}"]`)}.innerText.includes('原对象已删除')`, 15_000);
  await screenshot("deleted-in-goal");
  await press(`[data-placement-material][data-placement-id="${doc.id}"] button`, "清理");
  await card("已移除关联");
  await waitFor(`!document.querySelector('[data-placement-material][data-placement-id="${doc.id}"]')`, 12_000);
});

// AC5 for forms: the exported fill page is what someone else gets. It speaks their browser's language, refuses an empty
// required answer in words, and saves an answer file that the form then takes in, once.
test("placement journey: the exported fill page works in the filler's language and its answer file comes back in", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, homeDirectory, projectId } = browser;
  const forms = openFormStore(homeDirectory);
  const form = forms.receive(projectId!, "fill-page-e2e", "Beta 用户满意度", [{ id: "why", title: "最希望改进的地方", required: true }]);
  forms.close();
  const page = join(homeDirectory, "Beta 用户满意度 · 填写页.html");
  await writeFile(page, formFillPageHtml(form));
  const downloads = join(homeDirectory, "answers");
  await mkdir(downloads);
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads }, sessionId);
  const userAgent = await evaluate<string>("navigator.userAgent");
  for (const [language, words] of [["en-US", { go: "Save my answers", missing: "A required question is still empty: 最希望改进的地方", done: "Answer file saved", file: " · answers · " }],
    ["zh-CN", { go: "生成答卷文件", missing: "还有必填题没填：最希望改进的地方", done: "答卷文件已保存", file: " · 答卷 · " }]] as const) {
    await command("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: language }, sessionId);
    await navigate(() => command("Page.navigate", { url: "file://" + page }, sessionId));
    assert.equal(await evaluate("document.querySelector('#go').textContent"), words.go);
    await click("#go");
    await waitFor(`document.querySelector('#e').textContent === ${JSON.stringify(words.missing)}`, 5_000);
    await evaluate(`(() => { const input = document.querySelector('input[name="why"]'); input.value = ${JSON.stringify(language === "en-US" ? "Faster export" : "导出更快")}; })()`);
    await click("#go");
    await waitFor(`document.querySelector('#okt').textContent === ${JSON.stringify(words.done)} && getComputedStyle(document.querySelector('#ok')).display !== 'none'`, 5_000);
    let name = "";
    for (let tries = 0; !name; tries++) {
      name = (await readdir(downloads)).find(entry => entry.includes(words.file) && entry.endsWith(".molis-answer.json")) ?? "";
      if (!name && tries > 50) assert.fail(`no answer file for ${language}`);
      if (!name) await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  // Both files go back into the form; importing them again adds nothing.
  const files = await Promise.all((await readdir(downloads)).filter(entry => entry.endsWith(".molis-answer.json")).map(async entry => ({ name: entry, content: await readFile(join(downloads, entry), "utf8") })));
  const back = openFormStore(homeDirectory);
  try {
    assert.equal(back.importAnswers(form.id, files, projectId!).imported, 2);
    assert.equal(back.importAnswers(form.id, files, projectId!).imported, 0, "the same answer counts once");
    assert.deepEqual(back.listSubmissions(form.id, projectId!).map(item => item.answers.why).sort(), ["Faster export", "导出更快"]);
  } finally { back.close(); }
});
