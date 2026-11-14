import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CRAFT_FINISH_CLIENT_SCRIPT, CRAFT_FINISH_STYLES, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";
import { presentationOwnerHue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { withPageText } from "./fixtures/page-text.js";

// The design language the board opens with (specs/workbench-experience-upgrade/spec.md「第一轮：全局设计语言」; DESIGN「Colors → Pairing」,
// 「Layout → Zones」,「Motion」): what each colour means, which change gets which motion, and a board whose index is read by chapter.
// What the page does with the specimens (the find field, the measured contrast, the three motions) is in board-design-language.e2e.test.ts.

const board = withPageText("zh", [], renderPrimitiveCatalog);
const source = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const sectionOf = (id: string) => {
  const start = board.indexOf(`<section class="mw-catalog__section" id="${id}"`);
  assert.ok(start >= 0, `section ${id}`);
  return board.slice(start, board.indexOf("</section>", start));
};
const index = board.slice(board.indexOf('<nav class="mw-catalog__index"'), board.indexOf("</nav>"));

test("UXUP-02 an owner's identity hue is a cool one, the same for the same plugin", () => {
  const cool = new Set(["blue", "indigo", "purple", "slate", "steel"]);
  const ids = ["io.molis.work.feed", "io.molis.work.goals", "io.molis.work.inbox", "io.molis.work.todo", "io.molis.work.pages", "io.molis.work.coding",
    "io.molis.work.shelf", "io.molis.work.issues", "com.example.one", "com.example.two", ...Array.from({ length: 200 }, (_, n) => `dev.author.plugin-${n}`)];
  const seen = new Set<string>();
  for (const id of ids) {
    const hue = presentationOwnerHue(id);
    assert.ok(cool.has(hue), `${id} takes ${hue}: a warm, red, green, cyan or grey hue would read as a state`);
    assert.equal(presentationOwnerHue(id), hue, "the same id keeps its hue");
    seen.add(hue);
  }
  assert.deepEqual([...seen].sort(), [...cool].sort(), "every cool hue is used");
});

test("UXUP-05 the board opens with the design language and its index is grouped by chapter, with a find field", () => {
  const chapters = [...index.matchAll(/data-catalog-group[^>]*>([^<]+)</gu)].map(([, name]) => name);
  assert.deepEqual(chapters.slice(0, 6), ["设计语言", "图标与状态", "控件", "反馈与浮层", "列表与条目", "模式与场景"]);
  assert.match(index, /<input class="mw-input" type="search" data-catalog-find [^>]*aria-label="[^"]+"/u, "the index has a named find field");
  assert.match(index, /data-catalog-none hidden/u, "the line for a name nobody has starts hidden");
  const order = [...board.matchAll(/<section class="mw-catalog__section" id="([^"]+)"/gu)].map(([, id]) => id);
  assert.equal(order[0], "language", "the first section is the design language");
  for (const id of ["language", "palette", "pairing", "zones", "motion"]) {
    assert.ok(order.includes(id), `section ${id}`);
    const link = index.indexOf(`<a href="#${id}"`);
    assert.ok(link > index.indexOf(">设计语言<") && link < index.indexOf(">图标与状态<"), `${id} is in the index, in the design-language chapter`);
  }
});

test("UXUP-01 the principles name the three questions; UXUP-02 each colour has one meaning and the contrast is measured on the board", () => {
  const language = sectionOf("language");
  for (const question of ["我在哪", "现在怎样", "下一步"]) assert.ok(language.includes(`<strong>${question}</strong>`), question);
  assert.equal(language.split("<li>").length - 1, 5, "five pairing rules");

  const pairing = sectionOf("pairing");
  for (const token of ["--action", "--accent", "--tone-attention", "--tone-hold", "--tone-blocked", "--tone-done", "--tone-idle"]) {
    assert.ok(pairing.includes(`<code>${token}</code>`), `${token} has a row in the colour-temperature table`);
  }
  const stage = pairing.slice(pairing.indexOf('class="mw-lang-stage"'), pairing.indexOf("</aside>"));
  assert.equal(stage.split("mw-btn--primary").length - 1, 1, "the roles specimen has exactly one ink-blue button");
  assert.equal(stage.split("mw-status--attention").length - 1, 1, "and exactly one warm mark");
  // Eight inks on four surfaces; the page writes the measured ratio into each cell.
  assert.equal(pairing.split("data-lang-contrast").length - 1, 32);
  for (const surface of ["--page", "--paper", "--surface-soft", "--rail"]) assert.ok(pairing.includes(`background:var(${surface})`), surface);
  assert.equal(pairing.split('class="mw-lang-tile"').length - 1, 5, "five identity hues");
  assert.doesNotMatch(pairing, /#[0-9a-f]{6}\b/iu, "the specimens take their colours from tokens");

  const zones = sectionOf("zones");
  for (const zone of ["标题栏", "工作面", "右侧", "底栏", "浮层"]) assert.ok(zones.includes(`<strong>${zone}</strong>`), zone);
});

test("UXUP-03 one change, one motion: turn, ask and carry are written once, on the shared clocks, and stand still under reduced motion", () => {
  const grammar = sectionOf("motion");
  for (const name of ["craft-rise", "craft-fade-in", "molisCraft.carry", "molisCraft.turn", "molisCraft.land", "molisCraft.ask", "molisCraft.celebrate", "craft-drop"]) {
    assert.ok(grammar.includes(`<code>${name}</code>`), `${name} is in the grammar table`);
  }
  for (const hook of ["data-lang-carry", 'data-lang-demo="forward"', 'data-lang-demo="back"', 'data-lang-demo="ask"']) assert.ok(grammar.includes(hook), hook);

  const styles = CRAFT_FINISH_STYLES;
  assert.match(styles, /\[data-craft-turn\] \{ animation: craft-turn var\(--dur-arrive, 420ms\) var\(--ease-quint\); \}/u);
  assert.match(styles, /\[data-craft-turn="back"\] \{ --craft-turn-from: -16px; \}/u);
  assert.match(styles, /\[data-craft-ask\] \{ animation: craft-ask var\(--dur-moment, 640ms\) var\(--ease-quint\); \}/u);
  const ask = /@keyframes craft-ask \{([^@]+?)\n  \}/u.exec(styles)?.[1] ?? "";
  assert.match(ask, /var\(--tone-attention/u, "the ring is the your-turn colour");
  assert.doesNotMatch(ask, /\b(?:width|height|inline-size|block-size|margin|padding|border|box-shadow)\s*:/u, "the ring is an outline: nothing reflows");
  assert.match(styles, /::view-transition-group\(craft-carried\) \{ animation-duration: var\(--dur-arrive, 420ms\); animation-timing-function: var\(--ease-quint\); \}/u);
  assert.match(styles, /prefers-reduced-motion: reduce\) \{ \[data-craft-turn\], \[data-craft-ask\] \{ animation: none; \} \}/u);
  for (const name of ["craft-turn", "craft-ask"]) assert.equal(styles.split(`@keyframes ${name} {`).length - 1, 1, `${name} is written once`);

  const script = CRAFT_FINISH_CLIENT_SCRIPT;
  assert.match(script, /globalThis\.molisCraft = Object\.freeze\(\{ celebrate, land, turn, ask, carry \}\)/u);
  for (const body of [/const turn = \(node, back\) => \{\s*if \(!node \|\| reduced\(\)\) return;/u, /const ask = \(node\) => \{\s*if \(!node \|\| reduced\(\)\) return;/u]) assert.match(script, body);
  assert.match(script, /if \(!from \|\| reduced\(\) \|\| typeof document\.startViewTransition !== "function"\) return change\(\);/u,
    "without view transitions, or with reduced motion, the change simply happens");
});

test("UXUP-01 UXUP-02 Home is headed by the project's name, and only the first waiting row carries the ink-blue button", () => {
  const page = source("apps/workbench/src/project-home.ts");
  assert.match(page, /<header class="home-heading"><p class="home-heading__place">\$\{uiText\("workbench\.project-home\.project-home"\)\}<\/p><h1>\$\{e\(name\)\}<\/h1><\/header>/u);
  const render = source("apps/workbench/src/browser/project-home-render.ts");
  assert.match(render, /primary: ref === "open" && group\.kind === "attention" && lead/u);
  assert.match(render, /class="home-clear" data-home-group="attention"/u, "nothing waiting is one quiet line, still the attention group");
  for (const locale of ["zh", "en"]) {
    assert.ok(!("workbench.home.lead" in JSON.parse(source(`apps/workbench/resources/locales/${locale}.json`))), `${locale}: the lead sentence is gone with its key`);
  }
});
