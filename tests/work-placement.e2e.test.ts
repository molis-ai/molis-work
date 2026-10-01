import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

// specs/archive/work-placement AC1/AC3/AC6 through the real workbench: capture with no project, use it in a project without
// copying, keep editing the same document, move it into the project later, and find everything again after a reload.
for (const width of [1440, 390]) test(`placement ${width}px: capture in the personal space, use it in a project, keep editing, move it there, find it after reload`, { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, reloadPage } = browser;
  const text = JSON.stringify;
  const output = new URL(`../${specEvidenceDirectory("specs/archive/work-placement/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`placement-${name}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const card = (words: string) => waitFor(`[...document.querySelectorAll('.placement-toast')].some(node => node.innerText.includes(${text(words)}))`, 12_000);
  const bar = (words: string) => waitFor(`[...document.querySelectorAll('.placement-bar')].some(node => node.getClientRects().length && node.innerText.includes(${text(words)}))`, 12_000);
  const current = () => evaluate<{ kind: string; id: string; title: string } | null>(`(() => {
    const node = [...document.querySelectorAll('[data-assistant-context]')].find(element => element.getClientRects().length && JSON.parse(element.getAttribute('data-assistant-context') || '{}').object);
    return node ? JSON.parse(node.getAttribute('data-assistant-context')).object : null; })()`);
  const describe = (object: { kind: string; id: string; project_id: string | null }) =>
    evaluate<{ state: string; title: string; location: { title: string; kind: string } | null; moved_from: { title: string } | null; associations: { type: string; label: string }[] }>(
      `globalThis.molisPlacement.describe(${text(object)}, true)`);
  const openPlugin = async (plugin: string) => {
    await waitFor(`document.querySelector('[data-plugin-id=${plugin}]')`, 12_000);
    if (await evaluate("document.body.dataset.desktopSurface") !== plugin) await click(`[data-plugin-strip] [data-plugin-id=${plugin}]`);
    await waitFor(`document.body.dataset.desktopSurface === '${plugin}'`, 12_000);
  };
  const panel = async (action: string) => {
    await click(".placement-bar");
    await waitFor(`document.querySelector('.placement-panel [data-placement-action="${action}"]')`, 12_000);
    await click(`.placement-panel [data-placement-action="${action}"]`);
    await waitFor("document.querySelector('dialog.placement-dialog')?.open", 12_000);
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

  // 1. No project needed: a new document in the personal space says where it went and who can see it.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/personal/?openPlugin=pages` }, sessionId));
  await openPlugin("pages");
  const projectTitle = await evaluate<string>(`fetch('/api/placement/spaces').then(r => r.json()).then(v => v.spaces.find(s => s.project_id === ${text(projectId)}).title)`);
  await click("[data-pages-new]");
  await card("存到 个人空间");
  const doc = await current();
  assert.equal(doc?.kind, "pages_document");
  await evaluate(`(() => { const input = document.querySelector('[data-pages-title]'); input.focus(); input.value = '上线前检查清单'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 12_000);
  await bar("个人空间");
  const personal = { kind: doc!.kind, id: doc!.id, project_id: "personal" };
  assert.equal((await describe(personal)).location?.title, "个人空间");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "不横向滚动");
  await screenshot("captured");

  // 2. Used in the project: a relation, not a copy; it stays in the personal space.
  await panel("use-in-project");
  await click(`dialog.placement-dialog input[name="project"][value=${text(projectId)}]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await card(`已用于项目「${projectTitle}」`);
  const used = await describe(personal);
  assert.equal(used.location?.title, "个人空间", "using it in a project does not move it");
  assert.ok(used.associations.some(link => link.type === "used_in" && link.label.includes(projectTitle)));

  // 3. The project lists it and opens the same document; editing there changes the one in the personal space.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('[data-placement-open=${text(doc!.id)}]')`, 15_000);
  assert.match(await evaluate<string>("document.querySelector('[data-placement-related]').innerText"), /上线前检查清单[\s\S]*个人空间[\s\S]*只有你能打开/u);
  await screenshot("project-home");
  await click(`[data-placement-open=${text(doc!.id)}]`);
  await waitFor(`location.pathname === '/projects/personal/' && document.querySelector('[data-pages-title]')?.value === '上线前检查清单'`, 15_000);
  assert.equal((await current())?.id, doc!.id, "the same document, not a copy");
  await evaluate(`(() => { const input = document.querySelector('[data-pages-title]'); input.focus(); input.value = '上线前检查清单（第二版）'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 12_000);

  // 4. Organized later: moved into the project, the same identity; the old reference still finds it.
  await bar("个人空间");
  await panel("move");
  await click(`dialog.placement-dialog input[name="to"][value=${text(projectId)}]`);
  await click("dialog.placement-dialog [data-placement-confirm]");
  await card(`已移到 项目「${projectTitle}」`);
  const moved = await describe(personal);
  assert.deepEqual([moved.state, moved.title, moved.location?.title, moved.moved_from?.title], ["ok", "上线前检查清单（第二版）", `项目「${projectTitle}」`, "个人空间"]);
  assert.ok(!moved.associations.some(link => link.type === "used_in"), "used in the project it now lives in says nothing more");
  await screenshot("moved");

  // 5. After a reload the move, its origin and the edit are all still there.
  await reloadPage();
  const again = await describe(personal);
  assert.deepEqual([again.location?.title, again.moved_from?.title, again.title], [`项目「${projectTitle}」`, "个人空间", "上线前检查清单（第二版）"]);
});
