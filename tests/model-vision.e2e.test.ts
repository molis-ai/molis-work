import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { ModelRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { issueView } from "./fixtures/issue-browser.js";

test("ISSUE-54 model settings preserve three image states and Issue uses the saved declaration", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, "user"); if (!b) return;
  const { requests, namings } = await issueModel(t, b.homeDirectory);
  await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, catalog => {
    const provider = catalog.models.get("issue-fixture")!;
    catalog.models.upsert({ ...provider, models: provider.models.map(({ vision: _vision, ...model }) => model) });
  });
  const v = issueView(b, "model-vision");
  const settings = "/settings/models?provider=issue-fixture";
  const selected = "document.querySelector('[data-model-vision]')";
  const set = (selector: string, value: string) => b.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await v.viewport(1440); await v.go(settings);
  await b.waitFor(selected);
  assert.deepEqual(await b.evaluate(`Array.from(${selected}.options, option => [option.value, option.textContent])`),
    [["", "未声明"], ["true", "能看图"], ["false", "不能看图"]]);
  for (const value of ["", "false", "true", ""]) {
    await v.go(settings); await b.waitFor(selected);
    if (value) await set("[data-model-vision]", value);
    else if (namings.length) await set("[data-model-vision]", "");
    else await set("[data-model-name]", "只修改供应商名称");
    await b.click("[data-model-save]");
    await b.waitFor("!document.querySelector('[data-model-settings]').hasAttribute('aria-busy')", 20_000);
    assert.match(await b.evaluate<string>("document.querySelector('[data-model-status]').textContent"), /已保存/);
    const saved = await v.api<{ providers: Array<{ models: ModelRecord[] }> }>("/api/settings/models");
    const model = saved.providers[0]!.models[0]!;
    assert.equal(model.vision, value === "" ? undefined : value === "true");
    assert.equal(Object.hasOwn(model, "vision"), value !== "", "saving an unrelated field must not turn an absent declaration into false");
    await v.go(settings); await b.waitFor(selected);
    assert.equal(await b.evaluate(`${selected}.value`), value, "the saved state is rendered after navigation");
    if (namings.length) break; // The last change clears a previously saved true declaration.
    await v.viewport(480);
    assert.equal(await b.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await b.evaluate(`(async () => { ${selected}.closest('label').scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()`);
    await v.shot(`settings-${value || "unset"}`); await v.viewport(1440);
    await v.go("/"); await v.chord(); await v.composerFocused(); await v.paste();
    await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1 && !$('[data-issue-submit]').disabled");
    const previousCalls = requests.length;
    await v.send();
    if (value === "true") {
      await v.until("!$('[data-state]') && $('[data-issue-list] [data-issue-id]')", 20_000);
      assert.equal(namings.length, 1);
      assert.match(namings[0]!, /"type":"image"/, "the saved declaration enables the actual image attachment");
      const [issue] = (await v.list()).items;
      assert.equal((await v.read(issue!.id)).images.length, 1);
    } else {
      await v.until("$('[data-state=attention]')?.textContent.includes('截图没有交给它')", 20_000);
      assert.equal(namings.length, 0); assert.equal(requests.length, previousCalls);
      assert.equal((await v.list()).items.length, 0);
      await v.press("[data-state=attention]");
      assert.equal(await v.ask("d.querySelectorAll('[data-issue-edit-shots] img').length"), 1, "the screenshot stays available for correction");
      assert.match(await v.ask<string>("$('[data-issue-flag]').textContent"), /设置 → 模型 → 供应商的模型列表/);
      await v.press("[data-issue-cancel]"); await v.until("$('[data-issue-dialog]').open");
      await v.press("[data-issue-dialog] [value=confirm]"); await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
    }
  }
  await v.go(`/locale?lang=en&next=${encodeURIComponent(settings)}`); await b.waitFor(selected);
  assert.deepEqual(await b.evaluate(`Array.from(${selected}.options, option => option.textContent)`),
    ["Not declared", "Can read images", "Cannot read images"]);
  assert.match(await b.evaluate<string>(`${selected}.closest('label').textContent`), /Image input/);
  await v.viewport(480); assert.equal(await b.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await b.evaluate(`(async () => { ${selected}.closest('label').scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()`);
  await v.shot("settings-unset-en");
});
