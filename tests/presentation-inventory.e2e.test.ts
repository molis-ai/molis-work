import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("IUI-21: the presentation board separates sample data from the complete built-in declaration inventory", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, command, sessionId, navigate, origin, waitFor, setViewport } = browser;
  const words = {
    zh: { example: "示例数据", plugins: "内置插件的对象呈现", declared: "已声明", missing: "缺对象呈现" },
    en: { example: "Sample data", plugins: "Built-in plugin declarations", declared: "Declared", missing: "Missing object presentation" },
  };
  for (const width of [1440, 390]) for (const lang of ["zh", "en"] as const) {
    const label = `${width}/${lang}`;
    await setViewport(width, 900);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}&inventory-width=${width}#presentation-forms` }, sessionId));
    await waitFor('document.readyState === "complete" && !!document.querySelector("#presentation-plugin-declarations")', 15_000);
    const board = await evaluate<{
      example: string; inventory: string; separate: boolean; interactive: boolean; markupBytes: number;
      rows: Array<{ id: string; name: string; status: string; readable: boolean }>;
    }>(`(() => {
      const section = document.querySelector("#presentation-forms");
      const sample = section.querySelector("[data-presentation-example]");
      const heading = section.querySelector("#presentation-plugin-declarations");
      const inventory = heading.closest("section");
      const visible = node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility === "visible";
      };
      const rows = [...inventory.querySelectorAll(".mw-items > .mw-item")].map(row => {
        const name = row.querySelector("strong"), status = row.querySelector("[data-slot=badge]");
        const bounds = row.getBoundingClientRect();
        const fits = node => {
          const box = node.getBoundingClientRect();
          return visible(node) && box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && node.scrollWidth <= node.clientWidth + 1;
        };
        return { id: row.dataset.presentationPluginId, name: name.innerText, status: status.innerText,
          readable: visible(row) && bounds.left >= 0 && bounds.right <= innerWidth + 1 && fits(name) && fits(status) };
      });
      const caption = sample.querySelector("p");
      return {
        example: visible(caption) ? caption.innerText : "",
        inventory: visible(heading) ? heading.innerText : "",
        separate: Boolean(sample.querySelector(".mw-presentation--card")) && !sample.contains(inventory) && !inventory.contains(sample),
        interactive: Boolean(inventory.querySelector("button, a[href], [tabindex], [data-presentation-action]")),
        markupBytes: new TextEncoder().encode(inventory.outerHTML + caption.outerHTML).byteLength,
        rows,
      };
    })()`);
    const expected = BUILTIN_PLUGIN_CATALOG.map(({ manifest }) => ({
      id: manifest.plugin_id,
      name: lang === "en" && manifest.name_en !== undefined ? manifest.name_en : manifest.name,
      status: manifest.presentation && manifest.presentation.objects.length > 0 ? words[lang].declared : words[lang].missing,
    }));
    assert.equal(board.example, words[lang].example, label);
    assert.equal(board.inventory, words[lang].plugins, label);
    assert.equal(board.separate, true, label);
    assert.equal(board.interactive, false, label);
    assert.equal(new Set(board.rows.map(row => row.id)).size, board.rows.length, `unique plugin ids ${label}`);
    assert.deepEqual(board.rows.map(({ id, name, status }) => ({ id, name, status })), expected, `complete built-in inventory ${label}`);
    assert.deepEqual(board.rows.filter(row => !row.readable).map(row => row.id), [], `every row is readable ${label}`);
    t.diagnostic(`${label}: ${board.rows.length} entries, ${board.markupBytes} added markup bytes`);
  }
});
