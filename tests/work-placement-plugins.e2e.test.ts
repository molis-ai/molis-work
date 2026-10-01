import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

// specs/archive/work-placement per plugin, through the real workbench: a Goal's materials create straight into its project and
// stay bound (AC2); a form's answers become a dataset that says where it came from; a spark turns into a document and
// a Goal; one Shelf item is used in two projects without copies, and deleting it leaves a clear, cleanable row (AC4).
test("placement per plugin: Goal materials, Form to Dataset, Lingguang conversions, Shelf used in two projects then deleted", { timeout: 240_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, reloadPage, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const other = await catalog.createProject({ display_name: "市场活动", actor_id: "placement-test" });
  catalog.close();
  const text = JSON.stringify;
  const output = new URL(`../${specEvidenceDirectory("specs/archive/work-placement/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`placement-plugins-${name}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const go = (path: string) => navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
  // The URL asks for a plugin; a tab restored from before may still be in front, so fall back to its strip entry.
  const openPlugin = async (plugin: string, project: string) => {
    await go(`/projects/${project}/?openPlugin=${plugin}`);
    await waitFor(`document.querySelector('[data-plugin-strip] [data-plugin-id=${plugin}]')`, 15_000);
    if (await evaluate("document.body.dataset.desktopSurface") !== plugin) await click(`[data-plugin-strip] [data-plugin-id=${plugin}]`);
    await waitFor(`document.body.dataset.desktopSurface === '${plugin}'`, 15_000);
  };
  const visible = (selector: string, label?: string) => `[...document.querySelectorAll(${text(selector)})].find(node => node.getClientRects().length${label ? ` && node.textContent.trim() === ${text(label)}` : ""})`;
  // A real pointer click on the first visible match (several plugins render hidden copies of the same control).
  const press = async (selector: string, label?: string) => {
    await waitFor(`Boolean(${visible(selector, label)})`, 15_000);
    await evaluate(`(() => { document.querySelectorAll('[data-e2e-target]').forEach(node => node.removeAttribute('data-e2e-target')); ${visible(selector, label)}.setAttribute('data-e2e-target', ''); })()`);
    await click("[data-e2e-target]");
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
  type Description = { state: string; title: string; location: { title: string; kind: string } | null; associations: { type: string; label: string; target: { project_id: string | null } }[] };
  const describe = (object: { kind: string; id: string; project_id: string | null }) => evaluate<Description>(`globalThis.molisPlacement.describe(${text(object)}, true)`);
  const post = (path: string, body: unknown = {}) => evaluate<Record<string, unknown>>(`fetch(${text(path)}, { method: 'POST', headers: molisWorkControlHeaders(), body: ${text(JSON.stringify(body))} })
    .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || response.status); return value; })`);
  // The project home is its own tab; a plugin tab restored from before may be in front of it.
  const projectHome = async (project: string) => {
    await go(`/projects/${project}/`);
    await waitFor("document.querySelector('.tab-item[data-tab-kind=home]')", 15_000);
    if (!await evaluate<boolean>("Boolean(document.querySelector('.tab-item[data-tab-kind=home][aria-current]'))")) await click(".tab-item[data-tab-kind=home] .tab-item-trigger");
    await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')", 15_000);
  };
  const typeInto = (selector: string, value: string) => evaluate(`(() => { const input = ${visible(selector)}; input.focus(); input.value = ${text(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await go(`/projects/${projectId}/`);
  const spaces = await evaluate<{ project_id: string; title: string }[]>("fetch('/api/placement/spaces').then(r => r.json()).then(v => v.spaces)");
  const projectTitle = spaces.find(space => space.project_id === projectId)!.title;
  assert.ok(spaces.some(space => space.project_id === other.project_id), "the second project is a place to put things");

  // 1. AC2 — launched from a Goal: the new deck goes into the Goal's project, is bound to the Goal and opens from there.
  await go(`/projects/${projectId}/?openPlugin=goals&openItem=CORE&openGoalView=work`);
  await press('[data-goal-view="CORE"] [data-goal-materials-entry]');
  await press('[data-placement-goal-materials][data-goal-id="CORE"] [data-placement-create="ppt"]');
  await card("已新建演示稿《");
  assert.match(await evaluate<string>("[...document.querySelectorAll('.placement-toast')].map(node => node.innerText).join('\\n')"), new RegExp(`存到 项目「${projectTitle}」 · 已关联到这个 Goal`, "u"));
  await waitFor(`Boolean(${visible('[data-placement-material][data-placement-kind="presentation"]')}) && ${visible('[data-placement-material][data-placement-kind="presentation"]')}.innerText.includes(${text(`放在 项目「${projectTitle}」`)})`, 15_000);
  await screenshot("goal-material");
  const deckId = await evaluate<string>(`${visible('[data-placement-material][data-placement-kind="presentation"]')}.dataset.placementId`);
  await reloadPage();
  await press('[data-goal-view="CORE"] [data-goal-materials-entry]');
  await waitFor(`Boolean(${visible(`[data-placement-material][data-placement-id="${deckId}"]`)})`, 15_000);
  await press(`[data-placement-material][data-placement-id="${deckId}"] button`, "打开");
  await waitFor(`document.body.dataset.desktopSurface === 'ppt'`, 15_000);
  await waitFor(`[...document.querySelectorAll('[data-assistant-context]')].some(node => node.getClientRects().length && (JSON.parse(node.getAttribute('data-assistant-context') || '{}').object || {}).id === ${text(deckId)})`, 15_000);
  const deck = await describe({ kind: "presentation", id: deckId, project_id: projectId });
  assert.equal(deck.location?.title, `项目「${projectTitle}」`);
  assert.ok(deck.associations.some(link => link.type === "goal_in" || link.label.startsWith("Goal「")), "the deck knows the Goal it serves");

  // 2. Form → Dataset: the answers become a table in the same project that says where it came from; the form is unchanged.
  const forms = openFormStore(homeDirectory);
  let formId: string;
  try {
    const form = forms.receive(projectId!, "placement-e2e", "活动报名", [{ id: "name", title: "姓名" }, { id: "team", title: "团队" }]);
    formId = form.id;
    forms.submit(form.id, { name: "林一", team: "设计" }, projectId!, { source: "preview", requestId: "a1" });
    forms.submit(form.id, { name: "周二", team: "工程" }, projectId!, { source: "preview", requestId: "a2" });
  } finally { forms.close(); }
  await openPlugin("form", projectId!);
  await press(`[data-form-id="${formId}"]`);
  await press('[data-form-tab="results"]');
  await press("[data-form-to-dataset]");
  await cardButton("已转成《活动报名 · 答卷》", "打开");
  await waitFor("document.body.dataset.desktopSurface === 'dataset'", 15_000);
  await waitFor(`${visible("[data-dataset-title]")}?.value === '活动报名 · 答卷'`, 15_000);
  const table = await current();
  assert.equal(table?.kind, "dataset");
  const derived = await describe({ kind: "dataset", id: table!.id, project_id: projectId });
  assert.equal(derived.location?.title, `项目「${projectTitle}」`);
  assert.ok(derived.associations.some(link => link.label.includes("来自《活动报名》")), `dataset says where it came from: ${text(derived.associations)}`);
  await screenshot("form-to-dataset");
  const source = await describe({ kind: "form", id: formId, project_id: projectId });
  assert.equal(source.title, "活动报名", "the form itself is unchanged");
  assert.ok(source.associations.some(link => link.label.includes("已转成《活动报名 · 答卷》")));

  // 3. Lingguang: a spark turns into a document and into a Goal; the spark stays and remembers both.
  await openPlugin("lingguang", projectId!);
  await press("[data-lingguang-capture]");
  await card("已新建");
  await typeInto("[data-lingguang-title]", "展台改成开放式");
  await waitFor(`${visible("[data-lingguang-save-status]")}?.textContent === '已保存'`, 15_000);
  const spark = await current();
  assert.equal(spark?.kind, "lingguang_spark");
  await press("[data-lingguang-to-doc]");
  await cardButton("已转成《展台改成开放式》", "打开");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 15_000);
  await waitFor(`${visible("[data-pages-title]")}?.value === '展台改成开放式'`, 15_000);
  const page = await current();
  const fromSpark = await describe({ kind: "pages_document", id: page!.id, project_id: projectId });
  assert.ok(fromSpark.associations.some(link => link.label.includes("来自《展台改成开放式》")), `document says where it came from: ${text(fromSpark.associations)}`);
  await openPlugin("lingguang", projectId!);
  await press(`[data-lingguang-id="${spark!.id}"]`);
  await press("[data-lingguang-to-goal]");
  await card("已建成 Goal《展台改成开放式》");
  const kept = await describe({ kind: "lingguang_spark", id: spark!.id, project_id: projectId });
  assert.equal(kept.state, "ok", "the spark stays");
  const labels = kept.associations.map(link => link.label).join(" | ");
  assert.match(labels, /已转成《展台改成开放式》/u);
  assert.match(labels, /已建成 Goal《展台改成开放式》/u);
  await screenshot("lingguang-converted");

  // 4. AC4 — one Shelf item used in two projects: no copies; deleted, both projects say so and can clean the row up.
  const admitted = await post("/api/shelf/items", { text: "A 厂 12 元，B 厂 15 元，C 厂 11 元。", title: "竞品价格表" });
  const item = admitted.item as { item_id: string; name: string };
  assert.ok(item?.item_id, "admitted into the Shelf");
  const useHere = async (project: string, title: string) => {
    await openPlugin("shelf", project);
    await press(`[data-shelf-list=materials] [data-shelf-item="${item.item_id}"]`);
    await press("[data-shelf-use-in-project]");
    await waitFor("document.querySelector('dialog.placement-dialog')?.open", 12_000);
    assert.equal(await evaluate(`document.querySelector('dialog.placement-dialog input[name="project"]:checked')?.value`), project, "the project you are in is the default");
    await click("dialog.placement-dialog [data-placement-confirm]");
    await card(`已用于项目「${title}」`);
  };
  await useHere(projectId!, projectTitle);
  await useHere(other.project_id, "市场活动");
  const shelfItem = { kind: "shelf_item", id: item.item_id, project_id: null };
  const used = await describe(shelfItem);
  assert.equal(used.location?.title, "个人空间", "using it in projects does not move or copy it");
  assert.equal(used.associations.filter(link => link.type === "used_in").length, 2);
  // From the project, “打开” lands on that very item in the Shelf (a link load, not a list to search through).
  await projectHome(projectId!);
  await press(`[data-placement-related] [data-placement-open="${item.item_id}"]`);
  await waitFor(`document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-list=materials] [data-shelf-item="${item.item_id}"]')?.getAttribute('aria-selected') === 'true'`, 15_000);
  assert.equal((await current())?.id, item.item_id, "the Shelf names the opened item");
  await press(`[data-shelf-list=materials] [data-shelf-item="${item.item_id}"] [data-shelf-row-action="delete"]`);
  await waitFor(`!document.querySelector('[data-shelf-list=materials] [data-shelf-item="${item.item_id}"]')`, 15_000);
  for (const [project, name] of [[other.project_id, "other"], [projectId!, "first"]] as const) {
    await projectHome(project);
    await waitFor(`[...document.querySelectorAll('[data-placement-related] .placement-related-row.is-gone')].some(row => row.innerText.includes('竞品价格表') && row.innerText.includes('原对象已删除'))`, 15_000);
    await screenshot(`shelf-deleted-${name}`);
    await press("[data-placement-related] .placement-related-row.is-gone button", "清理");
    await card("已清理这条关联");
    await waitFor(`![...document.querySelectorAll('[data-placement-related] .placement-related-row')].some(row => row.innerText.includes('竞品价格表'))`, 12_000);
    await reloadPage();
    await waitFor("document.readyState === 'complete'", 12_000);
    await evaluate("new Promise(resolve => setTimeout(resolve, 800))");
    assert.equal(await evaluate<boolean>(`[...document.querySelectorAll('[data-placement-related] .placement-related-row')].some(row => row.innerText.includes('竞品价格表'))`), false, "cleaned up for good");
  }
});
