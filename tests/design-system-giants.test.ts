import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CRAFT_FINISH_STYLES, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, PRIMITIVE_CATALOG_IDS, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";

// W5-10 R4a (specs/repository-anti-corruption/slices/w5-10-design-system-giants.md): the design system's giant units were
// cut into pieces without changing what they produce. The pieces are checked here by what they must still add up to.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("RAC-370 the component board lists every primitive's section once and carries the bundled demo script", () => {
  const board = renderPrimitiveCatalog();
  const sections = [...board.matchAll(/<section class="mw-catalog__section" id="([^"]+)"/g)].map((match) => match[1]!);
  assert.equal(new Set(sections).size, sections.length, "a section id appears twice");
  for (const id of PRIMITIVE_CATALOG_IDS) assert.match(board, new RegExp(`data-primitive="${id}"`), `the board lost the ${id} specimen`);
  for (const id of ["palette", "typeface", "icons", "icon-inventory", "craft", "motion", "arrival", "choice", "compose", "button", "field", "form", "overlay", "menu", "tabs", "directory", "layout"]) {
    assert.ok(sections.includes(id), `the board lost the ${id} section`);
  }
  assert.ok(sections.indexOf("choice") < sections.indexOf("compose") && sections.indexOf("compose") < sections.indexOf("button"), "the sections changed order");
  const scripts = [...board.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
  assert.ok(scripts.some((script) => script.includes("data-compose-menu") && script.includes("data-catalog-open")), "the demo script is not on the board");
  assert.match(read("packages/design-system/package.json"), /src\/browser\/catalog\.ts[^&]*--outfile=dist\/catalog-client\.js/, "the demo script is built from TypeScript");
});

test("RAC-371 the finish layer's rules are one cascade cut between rules, not inside one", () => {
  for (const file of ["bar", "assistant", "pages"]) {
    const source = read(`packages/design-system/src/styles/craft-finish-${file}.ts`);
    const css = source.slice(source.indexOf("`") + 1, source.lastIndexOf("`"));
    const open = css.split("{").length - 1, close = css.split("}").length - 1;
    assert.equal(open, close, `craft-finish-${file}.ts ends inside a rule`);
  }
  const whole = read("packages/design-system/src/styles/craft-finish.ts");
  assert.match(whole, /CRAFT_BAR_STYLES \+ CRAFT_ASSISTANT_STYLES \+ CRAFT_PAGES_STYLES/, "the parts are not joined in cascade order");
  assert.ok(CRAFT_FINISH_STYLES.indexOf("Bottom bar: the Dock") < CRAFT_FINISH_STYLES.indexOf("Directory: rows on the desk"), "the sections changed order");
});

test("RAC-372 the generated-plugin renderer is sent to the page as one factory made of its layers", () => {
  const factory = (0, eval)(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT) as unknown;
  assert.equal(typeof factory, "function");
  for (const layer of ["pcKit", "pcRelations", "pcRecords", "pcDetail", "pcControls", "pcOutput", "pcQuery", "pcSubmit", "pcPart", "pcLifecycle"]) {
    assert.match(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, new RegExp(`function ${layer}\\(`), `${layer} is not in the script`);
  }
  // A layer is sent as source, so it may reach only its arguments and the DOM: no module-level import survives in the text.
  assert.doesNotMatch(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, /\bimport\b|\brequire\(/);
  assert.equal(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT.startsWith("((present)=>{"), true);
});
