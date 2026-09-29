import assert from "node:assert/strict";
import test from "node:test";
import { PLUGIN_ICON, STATUS_ICON } from "../packages/design-system/src/icons.js";
import { pluginTabGlyphs } from "../apps/workbench/src/plugin-catalog.js";
import {
  renderMolisWorkOnboardingStylesheet,
  renderMolisWorkProjectIndexStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "../apps/workbench/src/page-assets.js";

// Soft Workbench visual refinement (specs/soft-workbench-rollout/spec.md → 精修): guards for the fixed scales.

const sheets = () => [
  ["workbench", renderMolisWorkWorkbenchStylesheet()],
  ["settings", renderMolisWorkSettingsStylesheet()],
  ["project-index", renderMolisWorkProjectIndexStylesheet()],
  ["onboarding", renderMolisWorkOnboardingStylesheet()],
] as const;

test("each plugin has one glyph, the same one the Manifests declare, and no two plugins share it", () => {
  const declared = pluginTabGlyphs();
  for (const [id, glyph] of Object.entries(declared)) {
    if (id in PLUGIN_ICON) assert.equal(PLUGIN_ICON[id as keyof typeof PLUGIN_ICON], glyph, `${id} draws ${glyph} in its Manifest`);
  }
  const glyphs = Object.values(PLUGIN_ICON);
  assert.equal(new Set(glyphs).size, glyphs.length, "plugin glyphs are unique");
  assert.ok(!glyphs.includes("sparkles" as never), "the AI mark is not a plugin identity");
});

test("each state has its own fixed glyph", () => {
  const glyphs = Object.values(STATUS_ICON);
  assert.equal(new Set(glyphs).size, glyphs.length);
  assert.deepEqual(Object.keys(STATUS_ICON), ["todo", "progress", "waiting", "needs-you", "blocked", "done", "cancelled"]);
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

test("motion never animates layout properties", () => {
  const layout = /^(?:width|height|min-width|max-width|min-height|max-height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|top|left|right|bottom|inset|gap|grid-template-(?:columns|rows)|flex-basis|font-size|letter-spacing|border-width)$/;
  for (const [name, css] of sheets()) {
    for (const match of css.matchAll(/([^{};]*)\{[^{}]*?(?<![\w-])transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      for (const part of match[2]!.split(",")) {
        assert.doesNotMatch(part.trim().split(/\s+/)[0]!, layout, `${name}: ${match[1]!.trim().slice(-100)} → ${part.trim()}`);
      }
    }
  }
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
