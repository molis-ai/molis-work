import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AGENT_STUDIO_STYLES } from "@molis-ai/molis-work-plugin-builder";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

/** Every style rule's selector list, with comments removed and at-rule preludes skipped. */
function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let start = 0, quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) { if (ch === quote && text[i - 1] !== "\\") quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") { const prelude = text.slice(start, i).trim(); if (prelude && !prelude.startsWith("@")) out.push(prelude); start = i + 1; }
    else if (ch === "}" || ch === ";") start = i + 1;
  }
  return out;
}
function topLevel(selector: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0, current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && separators.includes(ch)) { parts.push(current); current = ""; } else current += ch;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}
/** Each `:has(` in a complex selector: the compound that holds it and its argument. */
function hasUses(complex: string) {
  const uses: { compound: string; argument: string }[] = [];
  for (const compound of topLevel(complex, " >+~")) {
    for (let at = compound.indexOf(":has("); at >= 0; at = compound.indexOf(":has(", at + 1)) {
      let depth = 0, end = at + 4;
      for (; end < compound.length; end++) { if (compound[end] === "(") depth++; if (compound[end] === ")" && --depth === 0) break; }
      uses.push({ compound, argument: compound.slice(at + 5, end).trim() });
    }
  }
  return uses;
}

/** Index of the `)` that closes the `(` at `at`. */
function closing(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) { if (text[i] === "(") depth++; else if (text[i] === ")" && --depth === 0) return i; }
  return text.length;
}
/** Splits at a separator outside parentheses. */
function splitOutside(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "(") depth++; else if (ch === ")") depth--; else if (!depth && separator.test(ch)) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts.map(part => part.trim()).filter(Boolean);
}
const lastCompound = (selector: string) => splitOutside(selector.replace(/([>+~])/g, " $1 "), /\s/).filter(part => !/^[>+~]$/.test(part)).at(-1) ?? "";
/** Whether a compound names a class, id or attribute, itself or in every branch of an :is()/:where(); a bare tag, `*` or only :not() and other pseudo-classes is broad. */
function named(compound: string): boolean {
  let core = "", i = 0, branches = false;
  while (i < compound.length) {
    const open = /^::?([a-z-]+)\(/.exec(compound.slice(i));
    if (open) {
      const end = closing(compound, i + open[0].length - 1);
      if (open[1] === "is" || open[1] === "where") branches ||= splitOutside(compound.slice(i + open[0].length, end), /,/).every(branch => named(lastCompound(branch)));
      i = end + 1; continue;
    }
    const pseudo = /^::?[a-z-]+/.exec(compound.slice(i));
    if (pseudo) { i += pseudo[0].length; continue; }
    core += compound[i++];
  }
  return branches || /[.#[]/.test(core);
}
/**
 * The second shape (the same one `tests/has-anchors.e2e.test.ts` reads from the live page, `expensiveHasSelectors` in
 * `tests/fixtures/style-invalidation.ts`): what follows the last `:has()` ends in a bare tag (`.row:has(input:checked) strong`) or
 * a broad part (`.a:has(.b) > :not(.c)`, `> *`). One such rule anywhere makes every `:has()` anchor on the page re-check its
 * whole subtree, and every bare tag in the page get checked, for each node put in it (VUX-36, slices 53 and 54).
 */
function broadAfterHas(item: string): boolean {
  const at = item.lastIndexOf(":has(");
  if (at < 0) return false;
  let end = closing(item, at + 4) + 1;
  while (end < item.length && !/[\s>+~]/.test(item[end]!)) end = item[end] === "(" ? closing(item, end) + 1 : end + 1;
  const after = lastCompound(item.slice(end));
  return !!after && !named(after.replace(/::?[a-z-]+$/, ""));
}

/** Rule preludes that hold a `:has(`, read from source text (a template string in a `.ts` file or a `.css` file): the text between the last `{`, `}`, `;` or backtick and the next `{`. `${…}` becomes a class name, as every one stands for a scope prefix. */
function sourceSelectors(source: string): string[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\$\{[^{}]*\}/g, ".interpolated");
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "{") { const prelude = text.slice(start, i); if (prelude.includes(":has(")) out.push(prelude.replace(/\s+/g, " ").trim()); start = i + 1; }
    else if (ch === "}" || ch === ";" || ch === "`") start = i + 1;
  }
  return out;
}

// A `:has()` makes Chrome re-check its compound whenever something its argument names changes inside it; on the page root, or
// placed before a combinator, a match restyles everything under it. Measured on the plugin switch (VUX-35, VUX-36): the
// switcher's whole list and the work area were restyled on every press. Such state is marked on the element instead.
const LARGE = /^(?:html|body|:root)\b|\.immersive-workspace|\[data-workspace\]|\.tab-workspace(?:-panes)?\b|\.plugin-picker(?![\w-])|\[data-plugin-picker\]|\[data-dock\]|\.workbench-bar(?![\w-])/;
// Only in short windows (max-height: 560px): the Goals record form is the plugin's own node, and the bar is the host's.
const KNOWN = new Set([".immersive-workspace:has(.is-editing-goal)"]);

// Measured in Chrome on a 13,000-node page (VUX-36): a :has() in a rule for one of these pseudo-elements, on the subject, on an
// ancestor or inside :not(), made one node put anywhere cost 29–31 ms of style (0.3 ms without), where ::before, ::after, ::marker,
// ::selection, ::backdrop and the scroll-bar and slider parts cost nothing. `details:not([open]):has(> .menu)::details-content` did.
const SLOW_PSEUDO = /::?first-(?:line|letter)\s*$|::(?:details-content|placeholder|file-selector-button)\s*$/;

/** What is wrong with one complex selector (a selector list already split at its commas), if anything. */
function problems(complex: string): string[] {
  const uses = hasUses(complex);
  const found: string[] = [];
  for (const use of uses) {
    const root = /^(?:html|body|:root)\b/.test(use.compound);
    if (KNOWN.has(use.compound)) continue;
    if (root && !use.argument.startsWith(">")) found.push(`${complex} — the page root may only look at its own children`);
    else if (!root && LARGE.test(use.compound)) found.push(`${complex} — mark this state on the element instead`);
  }
  if (uses.length && SLOW_PSEUDO.test(complex)) found.push(`${complex} — a :has() anywhere in a rule for this pseudo-element makes every node put in the page cost 30 ms of style; set a custom property on the element and read it in the pseudo-element rule`);
  if (uses.length && broadAfterHas(complex)) found.push(`${complex} — end the part after a :has() in a class, an id or an attribute, not a bare tag, :not() or *`);
  return found;
}
const audit = (label: string, list: string) => topLevel(list, ",").flatMap(complex => problems(complex).map(message => `${label}: ${message}`));
const countHas = (list: string) => topLevel(list, ",").reduce((count, complex) => count + hasUses(complex).length, 0);

// The sheets the host serves under /assets/ (the workbench, the way in and Settings) and the Plugin Studio's, rendered as the
// browser gets them; then every other rule written anywhere in the source (a plugin's own full page or exported file, the
// design system's specimens, a client script's injected sheet), so that a new sheet cannot leave this guard behind.
const SOURCE_PATHS = ["apps", "packages", "plugins", "horizontal", "modules", "server", "scripts"];
function sourcesWithHas(): string[] {
  return execFileSync("git", ["grep", "-l", "-F", ":has(", "--", ...SOURCE_PATHS, ":!*test*", ":!*/dist/*", ":!*.md"], { encoding: "utf8" })
    .split("\n").filter(file => /\.(?:ts|mts|css|js|mjs)$/.test(file));
}

test("VUX-36 no style rule makes the page root, the work area or the switcher re-check a :has() over its whole subtree", () => {
  const sheets = { workbench: renderMolisWorkWorkbenchStylesheet(), arrival: renderMolisWorkArrivalStylesheet(), settings: renderMolisWorkSettingsStylesheet(), studio: AGENT_STUDIO_STYLES };
  const found: string[] = [];
  let checked = 0;
  for (const [sheet, css] of Object.entries(sheets)) {
    for (const list of selectors(css)) { checked += countHas(list); found.push(...audit(sheet, list)); }
  }
  assert.ok(checked > 50, "the stylesheets were read");
  assert.deepEqual(found, []);
});

test("VUX-36 no :has() rule anywhere in the source (plugin pages, exported files, specimens, client scripts) is page-wide", () => {
  const files = sourcesWithHas();
  assert.ok(files.some(file => file.endsWith("plugins/native/pages/src/styles.ts")) && files.some(file => file.endsWith("packages/im-ui/src/styles.ts")), "the plugins' own sheets are among the files");
  const found: string[] = [];
  let checked = 0;
  for (const file of files) for (const list of sourceSelectors(readFileSync(file, "utf8"))) { checked += countHas(list); found.push(...audit(file, list)); }
  assert.ok(checked > 150, `the rules were read (${checked})`);
  assert.deepEqual(found, []);
});

test("VUX-36 the checks recognise each page-wide shape, and only those", () => {
  const bad = [
    "html:has(.x) .y", "body:has(.x)", ":root:has(.x)", ".immersive-workspace:has(.x) .y", "[data-workspace]:has(.x) > .y", ".tab-workspace:has(.x) .y",
    ".plugin-picker:has(.x) .y", "[data-dock]:has(.x) .y", ".workbench-bar:has(.x) > .y",
    ".a:has(input:checked) strong", ".b:has(.c) > :not(.d)", ".b:has(.c) > *", ".e:has(.f) :is(.g, span)",
    "details:not([open]):has(> .mw-menu)::details-content", ".a:has(.b) input::placeholder", ".a:has(.b) .c::first-line", "li:not(:has(.x))::first-letter",
  ];
  for (const selector of bad) assert.notDeepEqual(problems(selector), [], selector);
  const fine = [
    "html:has(> body.x)", ":root:has(> body.x) .y", ".a:has(.b) > .c", ".a:has(.b) :is(.c, .d)", ".a:has(.b):not(.e) .c::before", ".a:has(.b) [data-x]:not(.d)",
    ".row:has(input:checked)", ".a:has(.b)::before", ".a:has(.b) .c::after", "details:not([open])::details-content", "details:has(> .x) > .s::marker", ".a:not(:has(.b)) .c", ".plugin-picker-popover:has(.x) .y", ".immersive-home .home-layout:has(> .z) .home-tl",
  ];
  for (const selector of fine) assert.deepEqual(problems(selector), [], selector);
  const source = "export const S = `\n  ${A} .x:has(.y) ${B} .z { color: red }\n  .p { margin: 0 }\n  @media (max-width: 1px) { .q:has(> .r), .s { top: 0 } }\n`;";
  assert.deepEqual(sourceSelectors(source), [".interpolated .x:has(.y) .interpolated .z", ".q:has(> .r), .s"]);
});
