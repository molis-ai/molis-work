import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_COMPONENT_STYLES, STATUS_ICON } from "@molis-ai/molis-work-design-system";
import { pluginTabGlyphs } from "../apps/workbench/src/plugin-catalog.js";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "../apps/workbench/src/page-assets.js";

// Soft Workbench visual refinement (specs/archive/soft-workbench-rollout/spec.md → 精修): guards for the fixed scales.

const sheets = () => [
  ["workbench", renderMolisWorkWorkbenchStylesheet()],
  ["settings", renderMolisWorkSettingsStylesheet()],
  ["arrival", renderMolisWorkArrivalStylesheet()],
] as const;

// RAC-707 (PG-075): the Manifests are the one source of a plugin's glyph; the design system keeps no table of its own to hold them to.
test("each plugin has one glyph, the one its Manifest declares, and no two plugins share it", () => {
  const glyphs = Object.values(pluginTabGlyphs());
  assert.ok(glyphs.length > 20, "the glyphs are read from the Manifests of the built-in plugins");
  assert.equal(new Set(glyphs).size, glyphs.length, "plugin glyphs are unique");
  assert.ok(!glyphs.includes("sparkles" as never), "the AI mark is not a plugin identity");
});

test("each state has its own fixed glyph", () => {
  const glyphs = Object.values(STATUS_ICON);
  assert.equal(new Set(glyphs).size, glyphs.length);
  assert.deepEqual(Object.keys(STATUS_ICON), ["todo", "progress", "waiting", "needs-you", "blocked", "done", "cancelled"]);
});

// specs/visual-ui-experience §bezier-timing (the guard's expected change, VUX-14): the motion tokens are the four durations and
// two curves, plus the one reveal pair (90 ms, out-cubic) chosen for newly written text. Business styles still name a token,
// never a duration or a curve of their own, so the reveal's 90 ms appears only in its token's definition.
const MOTION_TOKENS = { "dur-hover": "130ms", "dur-press": "130ms", "dur-move": "250ms", "dur-arrive": "420ms", "dur-moment": "640ms", "dur-reveal": "90ms",
  "motion-instant": "130ms", "motion-fast": "130ms", "motion-normal": "250ms", "motion-arrive": "420ms",
  "ease-quint": "cubic-bezier(.22, 1, .36, 1)", "ease-spring": "cubic-bezier(.2, 1.35, .4, 1)", "ease-reveal": "cubic-bezier(.215, .61, .355, 1)",
  "ease-out": "var(--ease-quint)", "ease-standard": "var(--ease-quint)", "ease-swift": "var(--ease-quint)", "ease-settle": "var(--ease-spring)" };
test("the motion tokens are the chosen set and nothing defines another", () => {
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/(?<![\w-])--((?:dur|motion|ease)-[\w-]+)\s*:\s*([^;}]+)/g)) {
      const token = match[1]!, value = match[2]!.trim().replace(/\s+/g, " ");
      assert.ok(token in MOTION_TOKENS, `${name}: --${token} is not one of the chosen motion tokens`);
      assert.equal(value, MOTION_TOKENS[token as keyof typeof MOTION_TOKENS], `${name}: --${token}`);
    }
  }
});

test("motion uses four durations and two curves", () => {
  const allowed = new Set([130, 250, 420, 640]);
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/(?<![\w-])(transition|animation)(?:-duration)?\s*:\s*([^;{}]+)/g)) {
      const value = match[2]!;
      for (const time of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
        const ms = Number(time[1]) * (time[2] === "s" ? 1000 : 1);
        if (ms <= 1) continue; // reduced motion and still mode collapse to 1ms
        assert.ok(allowed.has(ms), `${name}: ${match[0].slice(0, 120)}`);
      }
      assert.doesNotMatch(value, /cubic-bezier|(?<![\w-])(ease|ease-in|ease-out|ease-in-out|linear)(?![\w-])/, `${name}: ${match[0].slice(0, 120)}`);
    }
  }
});

// specs/visual-ui-experience §5 (the guard's expected change): grid-template-rows moves only on the outer row of a
// natural-height fold (0fr → 1fr), each named here: the shared disclosure, the Assistant's side groups, whose head is a
// button because folding is remembered per viewer (VUX-08), and a round's steps and a step's detail in the conversation
// (VUX-13, `disclosureHeight`), drawn by the shared `processFold` for the Assistant and for the Coding timeline's round groups
// and steps. Every other selector, grid-template-columns and every other layout property is still refused.
const NATURAL_HEIGHT_ROWS = [/\.mw-collapsible::details-content$/, /\.assistant-block:not\(\[hidden\], ?\.assistant-block--usage\)$/,
  /:is\(\.assistant-steps,\.assistant-activity-fold\)::details-content$/, /:is\(\.coding-activity,\.coding-tool\)::details-content$/];
test("motion never animates layout properties", () => {
  const layout = /^(?:width|height|min-width|max-width|min-height|max-height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|top|left|right|bottom|inset|gap|grid-template-(?:columns|rows)|flex-basis|font-size|letter-spacing|border-width)$/;
  const folds = new Set<RegExp>();
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?(?<![\w-])transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      const selector = match[1]!.trim();
      for (const part of match[2]!.split(",")) {
        const property = part.trim().split(/\s+/)[0]!;
        const fold = property === "grid-template-rows" ? NATURAL_HEIGHT_ROWS.find(row => row.test(selector)) : undefined;
        if (fold) { folds.add(fold); continue; }
        assert.doesNotMatch(property, layout, `${name}: ${selector.slice(-100)} → ${part.trim()}`);
      }
    }
  }
  assert.deepEqual(NATURAL_HEIGHT_ROWS.filter(row => !folds.has(row)), [], "every named fold is found, so no exception is dead");
});

// The other expected change (VUX-14): `filter` moves only in the fresh-text reveal, a 2 px blur on a piece of newly written
// text; no other keyframes, transition or element blurs, and the reveal is the only user of its duration and curve.
test("filter animates only in the fresh-text reveal", () => {
  for (const [name, css] of sheets()) {
    const frames = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)];
    for (const [, frame, body] of frames) if (/(?<![\w-])filter\s*:/.test(body!)) assert.equal(frame, "mw-fresh", `${name}: @keyframes ${frame} blurs`);
    assert.match(css, /@keyframes mw-fresh\{from\{opacity:0;filter:blur\(2px\)\}\}/, `${name}: the reveal starts from 2 px and ends on the text as it is`);
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?(?<![\w-])transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      assert.doesNotMatch(match[2]!, /(?<![\w-])(?:filter|backdrop-filter|all)(?![\w-])/, `${name}: ${match[1]!.trim().slice(-100)} → ${match[2]}`);
    }
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?(?<![\w-])animation(?:-name)?\s*:\s*[^;}]*(?<![\w-])mw-fresh(?![\w-])/g)) assert.equal(match[1]!.trim(), ".mw-fresh", `${name}: only .mw-fresh plays the reveal`);
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*var\(--(?:dur|ease)-reveal\)/g)) assert.equal(match[1]!.trim(), ".mw-fresh", `${name}: the reveal tokens belong to the reveal`);
    assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.mw-fresh\{animation:none\}\}/, `${name}: reduced motion shows fresh text at once`);
  }
});

// VUX-27: an edge that fades is the one shared overflow fade, shown only where there is more; no surface keeps a fixed
// gradient mask of its own (Workflows' chain had one, faded even when the chain fit). An icon drawn as a mask is not a fade.
test("a gradient mask is only the shared overflow fade", () => {
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?(?<![\w-])(?:-webkit-)?mask(?:-image)?\s*:\s*([^;}]+)/g)) {
      if (!/gradient\(/.test(match[2]!)) continue;
      assert.match(match[1]!.trim(), /^\[data-overflow-fade\]\[data-more\]$/, `${name}: ${match[1]!.trim().slice(-100)} masks with a gradient of its own`);
    }
  }
});

// specs/visual-ui-experience §composer-mentions (VUX-16): one intrinsic sizing. A field that grows with what is written
// marks itself data-fit; no page writes its own field-sizing rule or sets a height from scrollHeight.
test("a field grows only through the shared intrinsic sizing", () => {
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?field-sizing\s*:\s*content/g)) assert.equal(match[1]!.trim(), ":where(textarea[data-fit])", `${name}: ${match[1]!.trim().slice(-100)} sizes a field of its own`);
  }
  const roots = ["apps", "packages", "plugins/native"].flatMap(top => readdirSync(top, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => join(top, entry.name, "src")));
  const own = new Set([join("packages", "design-system", "src", "field-fit.ts"), join("packages", "design-system", "src", "browser", "field-fit.ts")]);
  for (const root of roots) {
    let files: string[];
    try { files = readdirSync(root, { recursive: true, encoding: "utf8" }); } catch { continue; }
    for (const file of files.filter(file => file.endsWith(".ts")).map(file => join(root, file))) {
      if (own.has(file)) continue;
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /field-sizing\s*:\s*content/, `${file} sizes a field of its own; mark it data-fit`);
      assert.doesNotMatch(source, /\.style\.height\s*=[^;\n]*scrollHeight/, `${file} grows a field by hand; mark it data-fit`);
    }
  }
});

test("the natural-height exception admits only the fold's outer row", () => {
  const refused = (selector: string) => !NATURAL_HEIGHT_ROWS.some(row => row.test(selector));
  assert.equal(refused(".mw-collapsible::details-content"), false);
  assert.equal(refused("body .assistant-block:not([hidden], .assistant-block--usage)"), false);
  for (const selector of [".mw-collapsible", ".mw-collapsible::details-content .inner", ".assistant-log", "details::details-content",
    ".assistant-block", ".assistant-block-body", ".assistant-block:not([hidden], .assistant-block--usage) .assistant-block-body"]) assert.equal(refused(selector), true, selector);
});

test("only loading indicators loop", () => {
  const loops = new Set<string>();
  for (const [, css] of sheets()) {
    for (const match of css.matchAll(/animation\s*:\s*([a-z-]+)[^;{}]*\binfinite\b/g)) loops.add(match[1]!);
  }
  for (const name of loops) assert.match(name, /spin|navigation-progress/, `${name} loops`);
});

test("font sizes stay on the type scale", () => {
  const scale = new Set([11, 12, 13, 15, 17, 20, 24, 30]);
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      const size = Number(match[2]);
      if (scale.has(size)) continue;
      // Above the scale only for content itself: a Pages document title and the onboarding greeting word.
      if (size > 30 && /pages-title|ob-greeting/.test(match[1]!)) continue;
      // 16px keeps iOS from zooming into a form field.
      if (size === 16 && /input|textarea|select|mw-input|mw-textarea|composer-input/.test(match[1]!)) continue;
      assert.fail(`${name}: ${size}px in ${match[1]!.trim().slice(-120)}`);
    }
    // Fixed steps, not fluid ones: a heading does not drift between sizes with the window.
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?font-size\s*:\s*(clamp\([^)]*\)|[\d.]+(?:vw|vh|cqi|cqw))/g)) {
      assert.fail(`${name}: ${match[2]} in ${match[1]!.trim().slice(-120)}`);
    }
  }
});

test("hover, pressed and selected use the shared washes, and floating layers keep tokens", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /accent-color: var\(--action\)/);
  assert.match(workbench, /::selection \{ background: color-mix\(in srgb, var\(--accent\) 22%, transparent\)/);
  // The --hue-* palette is data for colours people pick (tab groups, calendar categories); the interface itself uses none of it.
  const interfaceCss = workbench.replace(/--hue-[\w-]+:\s*[^;]+;/g, "");
  assert.doesNotMatch(interfaceCss, /#3b82f6|#5e6ad2|rgba\(57,\s*123,\s*250/i, "no system blue or indigo");
  assert.doesNotMatch(workbench, /::backdrop\s*\{[^}]*background:\s*(?:#|rgba?\()/, "backdrops use --scrim");
});

// specs/visual-ui-experience slice 78 (motion review of 2026-10-21, with the user's choices for menus and dialogs).
test("a surface rises once; menus and dialogs each have one entrance and one exit", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  // Showing a surface again is a short cross-fade; only its first reveal (is-arriving) rises.
  assert.match(workbench, /\.tab-pane-body > \[data-work-surface\]:not\(\[hidden\]\),[^{]*\{\s*animation: craft-fade-in var\(--dur-hover\)/);
  assert.match(workbench, /\.tab-pane-body > \[data-work-surface\]\.is-arriving:not\(\[hidden\]\),[^{]*\{\s*animation: craft-rise var\(--dur-arrive\)/);
  // Menus grow 4px at .97 from their control and go back the same way on the short clock.
  for (const [name, css] of sheets()) {
    const drop = "@keyframes craft-drop { from { opacity: 0; transform: translateY(-4px) scale(.97); } to { opacity: 1; transform: none; } }";
    assert.equal(css.split("@keyframes craft-drop").length - 1, css.split(drop).length - 1, `${name}: every craft-drop is the one menu keyframe`);
    assert.ok(css.includes(drop), `${name}: has the menu keyframe`);
    assert.doesNotMatch(css, /@keyframes (tab-menu-in|feed-menu-in|craft-dialog-in)\b/, `${name}: no second menu or dialog entrance`);
    assert.doesNotMatch(css, /var\(--motion-normal, ?130ms\)/, `${name}: the state clock's fallback is its own 250ms`);
  }
  assert.match(workbench, /details:not\(\[open\]\) > :is\([^)]*\.mw-menu[^)]*\)[^{]*\{ opacity: 0; transform: translateY\(-4px\) scale\(\.97\); pointer-events: none; \}/);
  // Only closing holds the content on screen: a hold on opening kept the opening menu undrawn and unclickable for 130ms. The hold is a
  // custom property on the menu's own details, read by the pseudo-element rule that acts on a closed details only: a :has() on a
  // ::details-content subject cost every node put anywhere in the page 30 ms of style (VUX-36).
  assert.match(workbench, /details:has\(> :is\([^)]*\.mw-menu[^)]*\)\) \{ --exit-hold: var\(--dur-hover\); \}/);
  assert.match(workbench, /:where\(details:not\(\[open\]\)\)::details-content \{ transition: content-visibility var\(--exit-hold, 0s\) allow-discrete; \}/);
  assert.doesNotMatch(workbench, /:has\([^{}]*\)::details-content/);
  // Dialogs: in over 250ms from 8px below at .98, out the same way over 130ms; one recipe, nothing restates it.
  assert.match(workbench, /:where\(dialog\) \{ transition: opacity var\(--dur-hover\)[^}]*transform: translateY\(8px\) scale\(\.98\); \}/);
  assert.match(workbench, /:where\(dialog\[open\]\) \{ opacity: 1; transform: none; transition-duration: var\(--dur-move\); \}/);
  assert.doesNotMatch(workbench, /dialog\[open\]\) \{ animation: surface-arrive/);
});

test("a generated plugin's success note stays readable for its whole life before it fades", () => {
  // The note lives 3.4 s (plugin-component-client): it rises in, holds, and the timer fades it out over the state clock.
  // It used to run a 640ms keyframe that ended invisible after about half a second, leaving a blank note for 3 seconds.
  assert.match(PLUGIN_COMPONENT_STYLES, /\.pc-success\{margin-top:12px;animation:craft-rise var\(--dur-move\) var\(--ease-quint\);transition:opacity var\(--dur-move\) var\(--ease-quint\)\}\.pc-success\.is-leaving\{opacity:0\}/);
  assert.doesNotMatch(PLUGIN_COMPONENT_STYLES, /pc-toast/);
});
