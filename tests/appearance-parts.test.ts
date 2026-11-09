import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { BASELINE_FONT, BASELINE_SKIN, BASELINE_SPEC, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";
import { fontTokenDeclarations, skinTokenDeclarations } from "@molis-ai/molis-work-plugin-sdk/ui";
import { EN } from "@molis-ai/molis-work-app-workbench";

// The look card, the specimen card and the fade when the look changes, on the component board (docs/design/appearance-selection/README.md「组件板新增」;
// specs/font-and-skin-system/a-section-contract.md FSS-66, FSS-67, FSS-68). What the page does with them is in board-appearance.e2e.test.ts; this file
// holds the markup, the tokens and the words.

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../packages/design-system/src/${path}`, import.meta.url)), "utf8");
const sectionOf = (html: string, id: string) => {
  const start = html.indexOf(`<section class="mw-catalog__section" id="${id}"`);
  assert.ok(start >= 0, `section ${id}`);
  return html.slice(start, html.indexOf("</section>", start));
};
const cardsOf = (html: string) => html.split('<div class="mw-look-card" data-look-card="').slice(1).map((card) => ({ id: /^(\w+)"/u.exec(card)![1]!, html: card }));
const board = renderPrimitiveCatalog();
const styleOf = (html: string) => html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const style = styleOf(board);
const english = renderPrimitiveCatalog({ say: (text, values = {}) => (EN[text] ?? text).replace(/\{(\w+)\}/gu, (whole, name: string) => String(values[name] ?? whole)) });
const PARTS = ["look-card", "look-proof", "look-fade"];

test("FSS-66: the board has the three look sections, after the type section and in order", () => {
  const ids = [...board.matchAll(/<section class="mw-catalog__section" id="([^"]+)"/gu)].map((match) => match[1]!);
  assert.deepEqual(ids.filter((id) => PARTS.includes(id)), PARTS);
  assert.equal(ids.indexOf("look-card"), ids.indexOf("typeface") + 1, "right after the type section");
});

test("FSS-66: a look card is one button that says whether it is pressed; its more-actions button is its own, beside it", () => {
  const section = sectionOf(board, "look-card");
  const cards = cardsOf(section);
  assert.equal(cards.length, 5, "three in a row, one narrow with a long name, one with its menu open");
  for (const { id, html } of cards) {
    const picks = html.match(/<button type="button" class="mw-look-card__pick" aria-pressed="(?:true|false)"[^>]*>.*?<\/button>/gsu) ?? [];
    assert.equal(picks.length, 1, `${id}: exactly one pick button`);
    const [pick] = picks;
    assert.doesNotMatch(pick!, /<button[^>]*>.*<button/su, `${id}: no button inside the pick button`);
    assert.doesNotMatch(pick!, /data-compose-menu/u, `${id}: the menu is outside the pick button`);
    assert.match(pick!, /aria-hidden="true"/u, `${id}: the picture is decoration; the words name the card`);
    assert.match(pick!, /mw-look-card__name/u);
    assert.match(pick!, /推荐「/u, `${id}: the type it suggests is in words`);
    const toggles = html.match(/<button[^>]*data-compose-menu-toggle[^>]*>/gu) ?? [];
    assert.equal(toggles.length, 1, `${id}: one more-actions button`);
    assert.match(toggles[0]!, /aria-haspopup="menu"/u);
    assert.match(toggles[0]!, /aria-expanded="(?:true|false)"/u);
    assert.match(toggles[0]!, /aria-label="更多操作：[^"]+"/u, `${id}: it names the look it acts on`);
    assert.ok(html.indexOf("</button>") < html.indexOf("data-compose-menu-toggle"), `${id}: the more button comes after the pick button closes`);
  }
  assert.equal((section.match(/aria-pressed="true"/gu) ?? []).length, 1, "one card is pressed in the row");
});

test("FSS-66: the state of a card is a word as well as a colour, and a look in use says why it cannot be removed", () => {
  const section = sectionOf(board, "look-card");
  assert.match(section, /mw-badge--success[^>]*>在用</u, "in use");
  assert.match(section, /<span class="mw-look-card__trial"><span[^>]*mw-badge--info[^>]*>样张里</u, "in the specimen, visible on the one that is tried");
  assert.match(section, /<span class="mw-look-card__trial" hidden>/u, "and hidden on the others");
  assert.match(section, /mw-badge--warning[^>]*>没通过检查</u, "fails its checks");
  const [soft, teal, warm, , open] = cardsOf(section);
  assert.deepEqual([soft!.id, teal!.id, warm!.id, open!.id], ["soft", "teal", "warm", "teal"]);
  assert.doesNotMatch(soft!.html, /导出…|移除/u, "a built-in look can be copied and nothing else");
  assert.match(teal!.html, /导出….*移除/su, "one of mine can be exported and removed");
  assert.doesNotMatch(teal!.html, /<button[^>]*menuitem[^>]*disabled/u, "when it is not in use");
  assert.match(open!.html, /<button[^>]*menuitem[^>]*disabled[^>]*>.*?移除.*?<small[^>]*>在用的外观不能移除</su, "Remove is unavailable on the look in use, with its reason beside it");
  assert.match(open!.html, /aria-expanded="true"[^>]*data-compose-menu-toggle=""><svg[^]*?<div class="mw-compose__menu" data-compose-menu data-menu-held>/u, "the specimen shows the menu open, and holds it open");
  assert.match(section, /mw-look-grid--narrow mw-look-grid--room/u, "with room under the card for it");
});

test("FSS-66: the card's rules are in the board, the picture takes its look's tokens, and nothing is a written colour", () => {
  for (const rule of [".mw-look-card__pick", ".mw-look-card__view", ".mw-look-card__more", ".mw-look-grid--narrow"]) assert.ok(style.includes(rule), rule);
  assert.match(style, /\.mw-look-card__pick:focus-visible \{ outline: var\(--focus-stroke\)/u, "the keyboard's focus is the page's");
  assert.match(style, /\.mw-look-card__pick\[aria-pressed="true"\] \{ border-color: var\(--accent\)/u, "pressed is drawn from the page's accent");
});

test("FSS-67: the specimen card has every state, its canvas is a named picture that cannot be operated, and the card's foot says what is happening", () => {
  const proof = sectionOf(board, "look-proof");
  const states = [...proof.matchAll(/<article class="mw-card mw-look-proof" data-slot="card" data-state="(\w+)">/gu)].map((match) => match[1]);
  for (const state of ["idle", "ready", "loading", "failed", "invalid", "conflict"]) assert.ok(states.includes(state), `state ${state}`);
  const pictures = proof.match(/<div class="mw-look-proof__picture" role="img" aria-label="[^"]+">\s*<div class="mw-look-proof__canvas" data-look="\w+"[^>]* inert>/gu) ?? [];
  assert.equal(pictures.length, states.length + 2, "every card and the light and dark pair draw an inert canvas under one name");
  assert.equal((proof.match(/data-look-theme="light"/gu) ?? []).length, 1);
  assert.equal((proof.match(/data-look-theme="dark"/gu) ?? []).length, 1);
  const foots = [...proof.matchAll(/<div class="mw-look-proof__status" role="status" aria-live="polite">(.*?)<\/div><div class="mw-look-proof__actions">/gsu)].map((match) => match[1]!);
  assert.equal(foots.length, states.length);
  assert.ok(foots.every((foot) => foot.replace(/<[^>]+>/gu, "").trim().length > 0), "every state says something in words");
  assert.match(proof, /data-state="loading"[^]*?mw-state-ring/u, "loading is shown with a mark, not only a colour");
  assert.match(proof, /data-state="invalid"[^]*?<ul><li>.*?<\/li><li>.*?<\/li><\/ul>/su, "a failed check lists what is wrong");
  assert.match(proof, /data-state="conflict"[^]*?仍然用上/u, "a clash offers the same action, named for what it does");
  // The canvas has no controls a person could reach; its words stay readable by the picture's one name.
  assert.match(proof, /<div class="mw-look-proof__canvas"[^>]* inert>/u);
});

test("FSS-67: the tokens a look draws with are the baseline's, whole, and each sample look only points at other baseline roles", () => {
  for (const theme of ["light", "dark"] as const) {
    const whole = skinTokenDeclarations(BASELINE_SKIN, { theme });
    assert.ok(style.includes(whole), `the baseline's ${theme} tokens, as the SDK writes them, are in the board`);
  }
  assert.ok(style.includes(fontTokenDeclarations(BASELINE_FONT)), "and its font tokens");
  const roles = new Set(BASELINE_SPEC.groups.flatMap((group) => group.roles.map((role) => role.name)));
  const rules = [...style.matchAll(/(\[data-look="(teal|warm)"\][^{]*)\{([^}]*)\}/gu)];
  assert.ok(rules.length >= 4, "each sample has a rule for each theme");
  for (const [, , id, declarations] of rules) {
    const written = [...declarations!.matchAll(/--([\w-]+):\s*([^;]+);/gu)];
    assert.ok(written.length >= 3, `${id} says something`);
    for (const [, name, value] of written) {
      assert.ok(roles.has(name!), `${id}: --${name} is a role of the baseline spec`);
      assert.match(value!, /^var\(--[\w-]+\)$/u, `${id}: --${name} points at another role (${value}); a value is never written here`);
      assert.ok(roles.has(/var\(--([\w-]+)\)/u.exec(value!)![1]!), `${id}: ${value} is a role of the baseline spec`);
    }
  }
  assert.ok(roles.size > 100, "the spec is the real one");
});

test("FSS-67: the board's own look sources write no colour, no duration and no curve", () => {
  for (const file of ["primitives/catalog-appearance.ts", "primitives/catalog-appearance-looks.ts", "primitives/catalog-appearance-styles.ts", "browser/catalog-appearance.ts"]) {
    const text = source(file);
    assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b/iu, `${file}: no hex colour`);
    assert.doesNotMatch(text, /\b(?:rgb|rgba|hsl|oklch)\(/iu, `${file}: no colour function`);
    assert.doesNotMatch(text, /\b\d+(?:\.\d+)?m?s\b(?![-\w])/u, `${file}: no written duration`);
    assert.doesNotMatch(text, /cubic-bezier|\bease(?:-in|-out|-in-out)?\b(?!-)/u, `${file}: no written curve`);
  }
});

test("FSS-68: the page fades on the move clock and curve, and a page that asks for less motion changes at once", () => {
  assert.match(style, /::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation-duration: var\(--dur-move\); animation-timing-function: var\(--ease-quint\); \}/u);
  const quiet = style.slice(style.indexOf("@media (prefers-reduced-motion: reduce)", style.indexOf(".mw-look-fade")));
  assert.match(quiet, /::view-transition-group\(root\), ::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation: none; \}/u, "a second guard in the rules");
  const script = source("look-fade.ts");
  for (const guard of ['typeof document.startViewTransition === "function"', "!document.hidden", 'document.documentElement.hasAttribute("data-craft-still")', 'matchMedia("(prefers-reduced-motion: reduce)")']) assert.ok(script.includes(guard), `the script asks: ${guard}`);
  assert.match(script, /running\?\.skipTransition\(\)/u, "a second change does not queue behind the first");
  assert.match(script, /else commit\(\);/u, "without the fade the change is made on the spot");
  assert.match(source("browser/catalog-appearance.ts"), /createLookFade\(\)/u);
  assert.ok(board.includes("startViewTransition"), "the board carries the script");
  const fade = sectionOf(board, "look-fade");
  assert.match(fade, /data-look-fade data-look-fade-look="\w+"/u);
  assert.match(fade, /role="status" aria-live="polite" data-look-fade-now/u, "the change is also said in words");
  assert.match(fade, /data-look-fade-back="" disabled|disabled[^>]*data-look-fade-back/u, "nothing to switch back from at the start");
});

test("FSS-66, FSS-67, FSS-68: every word of the three sections has an English, and none is left in Chinese", () => {
  for (const id of PARTS) {
    // A type sample shows both scripts on purpose: the picture's "Aa 你好 12" and the paragraph that mixes 中文 into English (a word joiner keeps the two characters on one line).
    const text = sectionOf(english, id).replace(/<style[\s\S]*?<\/style>/gu, "").replaceAll("Aa 你好 12", "Aa").replace(/中\u2060?文 mixed/gu, "mixed");
    assert.deepEqual(text.match(/[㐀-鿿]+/gu) ?? [], [], `${id}: no Chinese is left in English`);
  }
  assert.match(sectionOf(english, "look-card"), /<h2>Look Card<\/h2>/u);
  assert.match(sectionOf(english, "look-proof"), /<h2>Look Specimen<\/h2>/u);
  assert.match(sectionOf(english, "look-fade"), /<h2>Look Fade<\/h2>/u);
});

test("FSS-66, FSS-67, FSS-68: the parts sit on the board only: the SDK's published API and the page sheets do not change", () => {
  const sdk = readFileSync(fileURLToPath(new URL("../tooling/gates/api/plugin-sdk/ui.txt", import.meta.url)), "utf8");
  assert.doesNotMatch(sdk, /renderLookCard|renderLookProof|renderLookCanvas|LOOK_BOARD/u, "the render functions are lifted with the page that draws them");
  assert.doesNotMatch(source("styles/craft-finish.ts") + source("styles/foundation.ts"), /mw-look-|data-look/u, "no rule for these parts is in the served sheets");
});
