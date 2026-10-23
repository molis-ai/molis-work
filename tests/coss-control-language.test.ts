import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COSS_CONTROL_STYLES, INTERACTION_QUESTION_STYLES, PRIMITIVE_STYLES } from "@molis-ai/molis-work-design-system";
import { FEED_STYLES } from "@molis-ai/molis-work-plugin-feed";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("disabled primary actions keep Action fill instead of rail gray", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  assert.doesNotMatch(workbench, /\.mw-btn--primary:disabled \{[^}]*background: var\(--rail\)/);
  assert.doesNotMatch(settings, /\.mw-btn--primary:disabled \{[^}]*background: var\(--rail\)/);
  assert.doesNotMatch(settings, /\.settings-record-action \.mw-btn:disabled \{[^}]*background: var\(--rail\)/);
});

test("generic focus rings do not cover mw-* primitive halos", () => {
  assert.match(COSS_CONTROL_STYLES, /body\.settings-page :focus-visible:not\(\[class\^="mw-"\]\)/);
  assert.match(COSS_CONTROL_STYLES, /button:focus-visible:not\(\[class\^="mw-"\]\)/);
});

// Soft Workbench (DESIGN.md → Focus and accessibility): controls take the shared copper stroke; fields answer
// with a copper border and a 3px copper halo instead of the retired inset ink stroke.
test("keyboard focus uses the shared copper stroke and field halo", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(PRIMITIVE_STYLES, /\.mw-input:focus-visible, \.mw-textarea:focus-visible, \.mw-select:focus-visible,\s*\.mw-input:focus, \.mw-textarea:focus \{ outline: none; border-color: var\(--accent\); box-shadow: 0 0 0 3px color-mix\(in srgb, var\(--accent\) 16%, transparent\)/);
  // The focused field's edge is full copper so it reaches 3:1 against its surface (the 55% mix read about 2.8:1).
  assert.doesNotMatch(PRIMITIVE_STYLES, /0 0 0 3\.5px/);
  assert.match(workbench, /body\.immersive-workbench :focus-visible \{[\s\S]*outline: var\(--focus-stroke\);[\s\S]*outline-offset: var\(--focus-stroke-inset\)/);
  // The Feed source setup is an inline panel now; its fields take the same inside stroke from the Feed stylesheet.
  // Feed's rewritten stylesheet (spec → 第二轮 · 信息流) keeps the shared stroke and adds its source-menu summary.
  // Controls take the stroke; `mw-input`/`mw-textarea` fields keep the shared field focus, so no field shows two rings.
  assert.match(FEED_STYLES, /\.feed-workbench :is\(button:not\(\.mw-select\), summary, select:not\(\.mw-select\), input:not\(\.mw-input\), textarea:not\(\.mw-textarea\)\):focus-visible \{ outline: var\(--focus-stroke\); outline-offset: var\(--focus-stroke-inset\); \}/);
  assert.equal(workbench.includes("inset 0 0 0 1.5px color-mix(in srgb, var(--blue)"), false);
  assert.equal(workbench.includes("outline: 2px solid var(--blue)"), false);
  assert.equal(workbench.includes("outline: 2px solid var(--focus)"), false);
});

test("production CSS does not paint indigo or blue focus strokes", () => {
  const banned = [
    /outline\s*:\s*2px\s+solid\s+var\(--(?:focus|blue)\)/,
    /outline\s*:\s*2px\s+solid\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--blue/,
    /0\s+0\s+0\s+2px\s+var\(--(?:focus|blue)\)/,
    /0\s+0\s+0\s+2px\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--(?:focus|blue)/,
    /0\s+0\s+0\s+3px\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--blue/,
    /border-color:\s*var\(--focus\)/,
  ];
  const roots = [
    "apps/workbench/src",
    "apps/desktop/src",
    "packages/design-system/src",
    "plugins/native",
  ];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".css")) continue;
      const text = readFileSync(path, "utf8");
      if (banned.some((pattern) => pattern.test(text))) hits.push(path.replace(`${process.cwd()}/`, ""));
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  assert.deepEqual(hits, []);
  const assembled = [
    renderMolisWorkWorkbenchStylesheet(),
    renderMolisWorkSettingsStylesheet(),
    renderMolisWorkArrivalStylesheet(),
  ].join("\n");
  assert.equal(banned.some((pattern) => pattern.test(assembled)), false);
});

test("legacy input cosmetics leave mw-* fields to the primitive layer", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input,[\s\S]*?background: transparent/);
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input:is\(:hover, :focus, :focus-visible, \[aria-invalid="true"\]\)/);
  const settings = renderMolisWorkSettingsStylesheet();
  assert.match(settings, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\)/);
  assert.match(settings, /:not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\):not\(\.mw-textarea\):not\(\.mw-select\)/);
});

// Soft Workbench (DESIGN.md → Shapes): 8px controls, 14px surfaces, 32px controls from the shared helpers.
test("shared tokens describe control radius, height, and translucent borders", () => {
  assert.match(COSS_CONTROL_STYLES, /--radius-control: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-item: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-surface: 14px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-h: 32px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-border: color-mix\(in srgb, var\(--ink\) 9%, transparent\)/);
});

test("workbench, settings, and the way in keep the Coss control layer after later surface CSS", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  const arrival = renderMolisWorkArrivalStylesheet();
  const marker = COSS_CONTROL_STYLES.trim().slice(0, 80);
  assert.ok(workbench.includes(marker));
  assert.ok(settings.includes(marker));
  assert.ok(arrival.includes(marker));
  assert.ok(workbench.lastIndexOf(".mw-btn--primary") > workbench.lastIndexOf(marker));
  assert.doesNotMatch(workbench, /feed-detail-actions \.button-primary \{ color: var\(--paper\); background: var\(--blue-dark\);/);
  assert.doesNotMatch(workbench, /feed-stage-add-actions \.button-primary \{ color: var\(--paper\); background: var\(--blue-dark\);/);
});

test("settings secondary buttons leave the 4px blue-outline contract", () => {
  const settings = renderMolisWorkSettingsStylesheet();
  // The secondary button takes its corner and size from .mw-btn (and --sm/--lg); it adds only its colours.
  assert.match(PRIMITIVE_STYLES, /\.mw-btn \{[^}]*border: 1px solid transparent;[^}]*border-radius: var\(--radius-control, 8px\);/);
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--secondary \{ background: var\(--control-fill\); color: var\(--ink\); \}/);
  assert.ok(settings.includes(".mw-btn--secondary {"));
  assert.doesNotMatch(
    settings,
    /\.settings-record-action button, \.settings-button,[^{]*\{[^}]*border-radius: 4px;[^}]*color: var\(--blue-dark\)/,
  );
});

test("primary actions stay Action fill on mw-* without chasing business selectors", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(workbench, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.doesNotMatch(
    COSS_CONTROL_STYLES,
    /\.button-primary,[\s\S]*min-height: var\(--control-h\) !important;[\s\S]*background: var\(--action\) !important;/,
  );
  const coss = workbench.slice(workbench.lastIndexOf(COSS_CONTROL_STYLES.trim().slice(0, 80)));
  // Soft Workbench (DESIGN.md → Plugin stage lists): the create control is a soft wash and needs no `!important`.
  assert.match(coss, /body\.immersive-workbench \.tree-create,\s*body\.immersive-workbench \[data-tree-filter-trigger\] \{[^}]*background: var\(--control-fill\);/);
  assert.match(coss, /body\.immersive-workbench \[data-tree-filter-trigger\] \{[^}]*padding: 0;/);
  assert.doesNotMatch(coss, /body\.immersive-workbench \.tree-create,[^{]*\{[^}]*!important/);
  assert.doesNotMatch(coss, /source-mobile-add/);
  assert.doesNotMatch(workbench, /feed-source-task/);
  assert.doesNotMatch(workbench, /tree-pane \.feed-list-item/);
});

test("product stylesheets stop painting mw-btn fills through descendant button rules", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const arrival = renderMolisWorkArrivalStylesheet();
  assert.doesNotMatch(workbench, /\.feed-list-empty button \{[^}]*background: transparent;[^}]*color: var\(--blue-dark\)/);
  assert.doesNotMatch(workbench, /\.goal-canvas-empty button,[^{]*\{[^}]*background: var\(--paper\)/);
  assert.match(arrival, /\.mw-btn--primary/);
  assert.doesNotMatch(arrival, /\.onboarding-actions button \{[^}]*background: transparent;/);
});

// Soft Workbench (DESIGN.md → Onboarding, 项目选择页): the way in (the chooser, the opening, Welcome, the new-project
// journey, the update page) is drawn on the shell's own tokens in both themes and keeps no palette of its own: the desk
// is the shell's desk and the sheet its paper, so it follows every token change.
test("the way in shares the workbench tokens in both themes", () => {
  const arrival = renderMolisWorkArrivalStylesheet();
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /--page: #eeefef/);
  assert.match(workbench, /--page: #1c1d20/);
  assert.match(arrival, /--page: #eeefef/);
  assert.match(arrival, /data-resolved-theme="dark"[\s\S]*--page: #1c1d20/);
  assert.match(arrival, /\.arrival \{[^}]*background: var\(--desk\)/);
  assert.match(arrival, /\.stage-sheet \{[^}]*background: var\(--paper\)/);
  assert.doesNotMatch(arrival, /--ob-page|--ob-window|--onboarding-/);
});

test("product HTML no longer uses retired control class names", () => {
  // Only where a class name can appear: class attributes, classList calls and CSS selectors. A module named
  // "./document-action.js" is not a control class.
  const names = "document-action|text-button|button-primary|goal-primary-action|planning-primary-action|settings-button|guidance-primary-action";
  const banned = new RegExp(`(?:class(?:Name)?\\s*=\\s*["'\`][^"'\`]*?\\b|classList\\.\\w+\\(\\s*["'\`]|(?<![./\\w-])\\.)(?:${names})(?![\\w-])`);
  const roots = ["apps/workbench/src", "plugins/native", "packages/design-system/src"];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue;
      const text = readFileSync(path, "utf8");
      if (banned.test(text)) hits.push(path);
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  assert.deepEqual(hits, []);
});


// Soft Workbench (DESIGN.md → Focus and accessibility): touch sizing goes by the input, not the width. A phone or any coarse
// pointer has 44px targets in the bar and the title strip; a fine-pointer window keeps one written, scoped exception.
// tests/touch-targets.e2e.test.ts measures the real shell; this keeps the declarations and the written exception in step
// without a browser.
test("touch sizing goes by the input: 44px targets for phones and coarse pointers, the desktop bar keeps its sizes, DESIGN.md writes the exception", () => {
  const css = renderMolisWorkWorkbenchStylesheet();
  assert.match(css, /--dock-btn: 38px;/, "the desktop bar keeps its 38px Dock buttons");
  const touch = css.match(/@media \(max-width: 600px\), \(pointer: coarse\) \{\s*:is\(body\.immersive-workbench[^{]*\) \{ --dock-btn: 44px; --menu-row: 44px; \}[\s\S]*?\n  \}\n/)?.[0] ?? "";
  assert.ok(touch, "a phone's width or a coarse pointer makes the Dock, resident, discussion and directory buttons 44px");
  assert.match(touch, /\[data-assistant-send\] \{ width: 44px; height: 44px; min-height: 44px; \}/, "send is 44px on touch");
  assert.match(touch, /\.bar-composer \.bar-composer-attach \{[^}]*min-width: 44px; height: 44px;/, "attach is 44px on touch");
  assert.match(touch, /\.bar-composer \.assistant-composer-input \{ height: 44px;/, "the input is 44px tall on touch");
  assert.match(touch, /\.navigator-project-selector \{ grid-template-columns: 44px; width: 44px; height: 44px; min-height: 44px; \}/, "the project mark is 44px on touch");
  assert.match(touch, /\.plugin-picker-trigger \{[^}]*min-width: 44px;/, "the plugin switcher is 44px wide on touch");
  // The 「材料」 chip left the line for the strip above it (context-program §21.2 point 1); the rest keep their sizes.
  assert.match(touch, /\.assistant-target-main, \.assistant-target-clear, \.assistant-executor, \.assistant-attention\) \{ height: 44px; \}/, "the Assistant line's chips are 44px tall on touch");
  assert.match(touch, /\.bar-composer :is\(\.assistant-executor, \.assistant-attention, \.assistant-target-clear\) \{ min-width: 44px; \}/, "and 44px wide: no chip is squeezed under it");
  assert.match(touch, /\.assistant-strip-chip \{ height: 44px; \}/, "and the strip's chips are 44px tall");
  assert.match(touch, /\.bar-composer\[data-fit="narrow"\] \.assistant-executor:not\(\[data-chosen\]\) \{ min-width: 44px; \}/, "a narrowed line does not squeeze the choosers nobody changed to a sliver either");
  assert.match(touch, /\.bar-composer \.assistant-target\[data-mode="work"\] \{ min-width: 88px; \}/, "and the work chip keeps room for both its buttons");
  assert.match(touch, /\.bar-composer\[data-crowded\] :is\(\[data-assistant-character\], \[data-assistant-executor\], \[data-assistant-mode\]\) \{ display: none; \}/, "a crowded line lets the choosers go instead of overflowing its pill");
  assert.match(touch, /\.bar-composer:is\(\[data-crowded="mark"\], \[data-crowded="chips"\]\) \.assistant-target-clear \{ display: none; \}/, "a line still over its edge then lets the work chip's mark go");
  assert.match(touch, /\.bar-composer:is\(\[data-crowded="mark"\], \[data-crowded="chips"\]\) \.assistant-target\[data-mode="work"\] \{ min-width: 44px; \}/, "and the work chip then needs room for one button");
  assert.match(touch, /\.bar-composer\[data-crowded="chips"\] \.assistant-attention \{ display: none; \}/, "and last the notice, which the \"+\" menu then lists");
  assert.match(touch, /\) :is\(\.assistant-popover, \.assistant-next-row, \.assistant-context-strip, \.plugin-picker-popover, \.dock-overflow, \.navigator-project-menu-popover, \.assistant-panel\) :is\(button:not\(\.assistant-inline-object\), summary, a\[href\]:not\(\.assistant-link\), input:not\(\[type=checkbox\], \[type=radio\]\), select, textarea\) \{ min-width: 44px; min-height: 44px; \}/, "what the bar opens (the \"+\" menu's rows, the choosers, the notices, the strip's chips, the switcher's buttons, the Dock's list, the project menu, the whole opened panel: its tab bar, the list of works, the details and the conversation) is 44px on touch, and only what sits inside a sentence is left to the two rules below");
  assert.match(touch, /\.assistant-works \{ top: 52px; \}/, "the list of all works hangs below the panel's 50px tab bar");
  assert.match(touch, /\.assistant-code-head \{ min-height: 44px; \}/, "a code block's head is 44px");
  // A question's options and a card's buttons are the shared interaction parts now (A1+H2): 44px on touch in their own sheet.
  assert.match(INTERACTION_QUESTION_STYLES, /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*:is\(\.mw-ix-option, \.mw-ix-choices \.mw-choice\) \{ min-height: 44px; \}\s*\.mw-ix-card \.mw-btn \{ min-height: 44px; \}/, "a question's options and a card's buttons are 44px");
  assert.match(touch, /\.assistant-link \{ padding-block: 15px; \}/, "a link inside a sentence is 44px tall by padding, which takes no line room");
  assert.match(touch, /\.assistant-inline-object \{ position: relative; min-width: 44px; justify-content: center; \}[\s\S]*?\.assistant-inline-object::after \{ content: ""; position: absolute; inset: -12px -2px; \}/, "and an object chip inside a sentence is answered for by an invisible area around it");
  assert.match(touch, /\.plugin-picker-popover \{ --ops-btn: 44px; \}/, "and the switcher's pin and add buttons are 44px, with the room for two of them in the row");
  assert.match(css, /\.plugin-picker-popover \{ --ops-btn: var\(--control-h, 32px\); --tile-yield: calc\(var\(--ops-btn\) \* 2 \+ 16px\); \}[\s\S]*?\.plugin-rail-ops > \.mw-btn \{\s*width: var\(--ops-btn\); min-width: var\(--ops-btn\); min-height: var\(--ops-btn\);/, "with a fine pointer they are the floor's size (32px, 28px compact), not the 28px of a small icon button, and the row gives up room for them");
  assert.match(touch, /\.assistant-tabbar \{ height: 50px; gap: 0; \}\s*body\.immersive-workbench:not\(\[data-pane-embedded\]\) :is\(\.assistant-tab, \.assistant-tab-new\) \{ height: 44px; margin-bottom: 0; \}/, "and the panel's tab bar holds its 44px targets: a 50px bar, 44px tabs and a new-work button that sits on the bar's floor");
  assert.match(css, /@media\(max-width:760px\),\(pointer:coarse\) \{\s*\.workspace-layout-menu button, \.workspace-tab-menu input \{ min-height:44px; \}\s*\.workspace-tab-menu-colors \{ --swatch: 44px; \}/, "the strip's menus (the layout and tab rows, a group's name field and its colour swatches, drawn small inside their target) are 44px where the strip is");
  assert.match(css, /\.workspace-tab-menu-colors \{ --swatch: 32px; display:grid; grid-template-columns:repeat\(4, var\(--swatch\)\);[^}]*\}\s*\.workspace-tab-menu-colors button \{ position:relative; width:var\(--swatch\); height:var\(--swatch\); min-width:var\(--swatch\); min-height:var\(--swatch\);[^}]*\}\s*\.workspace-tab-menu-colors button::before \{ content:""; position:absolute; inset:calc\(\(var\(--swatch\) - 18px\) \/ 2\);/, "and with a fine pointer a colour swatch is a 32px target with the 18px dot drawn inside it, not an 18px button");
  assert.match(touch, /\.bar-composer\[data-crowded="chips"\]:has\(\.assistant-attention:not\(\[hidden\]\)\) \.bar-composer-attach::after \{[^}]*content: ""; position: absolute;[^}]*width: 8px; height: 8px; border-radius: 50%; background: var\(--accent\);/, "and a dot on the \"+\" points to the folded chip");
  // The phone hides the chips while the input has focus; the island measures the line with them on it (`data-measuring`), so the steps do not follow focus.
  const typingRules = css.match(/\.bar-composer:has\(\.assistant-composer-input:focus\)[^{]*\{ display: none; \}/g) ?? [];
  assert.equal(typingRules.length, 2, "the narrow column and the phone each hide the chips while typing");
  assert.deepEqual(typingRules.filter(rule => !rule.includes(":not([data-measuring])")), [], "and neither applies while the island measures the line");
  assert.match(css, /@media \(max-width: 374px\) \{ [^\n]*\.workbench-bar \{ column-gap: 0; padding-inline: 0; \} [^\n]*\.bar-center \{ margin-inline: 8px; \} \}/, "below 375px (eight 44px targets and the bar's padding) the bar's gap and side padding give way, so the phone's second row fits 360 and 320px and the Assistant line above it keeps its place");
  assert.match(css, /@media \(pointer: coarse\) and \(max-height: 560px\) and \(min-width: 601px\) \{[^}]*--dock-h: 60px; --composer-h: 50px;/, "a coarse-pointer short window keeps 44px buttons and a full composer");
  assert.doesNotMatch(css, /@media \(max-width: 600px\) \{\s*:is\(body\.immersive-workbench[^{]*\) \{[^}]*--dock-btn: 44px;/, "the phone layout block no longer owns the 44px sizing");
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\) \{[^}]*\.tab-view-chip \{ height: 44px; \}/, "the cover chip is 44px where the tabs are");
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*body\.immersive-workbench \.tab-view-chip-close \{ width: 44px; height: 44px; \}/, "and so is its close mark");
  assert.match(css, /\.assistant-target-clear \{[^}]*width: 28px; height: 28px;/, "the mark that starts a new work is 28px on a desktop bar, the bar's floor");
  const design = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");
  assert.match(design, /\*\*Exception: the desktop window's chrome\.\*\*[^\n]*fine-pointer window[^\n]*touch sizing goes by the input, not by the width/, "DESIGN.md writes the exception for fine-pointer windows only");
  assert.match(design, /`data-crowded`/, "and says what a crowded line does");
  assert.match(design, /\*\*Touch windows\.\*\*[^\n]*44px target[^\n]*\n\nIn a touch window the Assistant line holds inside its pill from 320px/, "and where the touch rules hold");
  assert.match(design, /tests\/touch-targets\.e2e\.test\.ts/, "and names the test that holds it");
  assert.doesNotMatch(design, /Known gap: the coarse-pointer bar/, "no coarse-pointer gap is left open");
});
