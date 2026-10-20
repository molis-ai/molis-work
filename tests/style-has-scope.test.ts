import assert from "node:assert/strict";
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

// A `:has()` makes Chrome re-check its compound whenever something its argument names changes inside it; on the page root, or
// placed before a combinator, a match restyles everything under it. Measured on the plugin switch (VUX-35, VUX-36): the
// switcher's whole list and the work area were restyled on every press. Such state is marked on the element instead.
const LARGE = /^(?:html|body|:root)\b|\.immersive-workspace|\[data-workspace\]|\.tab-workspace(?:-panes)?\b|\.plugin-picker(?![\w-])|\[data-plugin-picker\]|\[data-dock\]|\.workbench-bar(?![\w-])/;
// Only in short windows (max-height: 560px): the Goals record form is the plugin's own node, and the bar is the host's.
const KNOWN = new Set([".immersive-workspace:has(.is-editing-goal)"]);

test("VUX-36 no style rule makes the page root, the work area or the switcher re-check a :has() over its whole subtree", () => {
  const sheets = { workbench: renderMolisWorkWorkbenchStylesheet(), arrival: renderMolisWorkArrivalStylesheet(), settings: renderMolisWorkSettingsStylesheet(), studio: AGENT_STUDIO_STYLES };
  const found: string[] = [];
  let checked = 0;
  for (const [sheet, css] of Object.entries(sheets)) {
    for (const list of selectors(css)) for (const complex of topLevel(list, ",")) for (const use of hasUses(complex)) {
      checked++;
      const root = /^(?:html|body|:root)\b/.test(use.compound);
      if (KNOWN.has(use.compound)) continue;
      if (root && !use.argument.startsWith(">")) found.push(`${sheet}: ${complex} — the page root may only look at its own children`);
      else if (!root && LARGE.test(use.compound)) found.push(`${sheet}: ${complex} — mark this state on the element instead`);
    }
  }
  assert.ok(checked > 50, "the stylesheets were read");
  assert.deepEqual(found, []);
});
