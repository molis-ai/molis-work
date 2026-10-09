import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";

// DESIGN.md → Focus and accessibility: every target is 44px on a phone, except that the desktop window's chrome (the
// title bar's tab strip and the bottom bar) keeps a written, scoped exception. This measures both sides of it on the real
// shell: at 390px (a phone) every control of the strip and of the bar is 44px on its short side, and the bar and the strip
// still lay out cleanly with them; at 1280px the chrome keeps the sizes the exception names and does not sink below its floor,
// also in a short window (34px Dock buttons); on a touch window of 768 and 1024px the strip is 44px and the bar is the desktop
// bar above its floor, the known gap DESIGN.md names (BL-123), which this keeps true until the gap is closed. The Assistant line
// is measured in the states the seeded project does not start in: a current work (its chip and the chip's clear mark) and the
// chips that come and go beside the input (materials, attention, who does it, the Character, the mode).

type Control = { kind: string; area: "strip" | "bar"; label: string; w: number; h: number };

const KINDS: Record<string, string> = {
  "[data-assistant-input]": "assistant input",
  "[data-assistant-attach]": "assistant attach",
  "[data-assistant-send]": "assistant send",
  "[data-plugin-picker-toggle]": "plugin switcher",
  ".dock-pin": "dock",
  ".bar-resident": "resident",
  ".bar-chat": "discussion",
  ".navigator-project-selector": "project",
  ".immersive-show-directory, .navigator-directory-toggle": "directory toggle",
  ".workspace-history-button": "history",
  ".tab-item-trigger": "tab",
  ".tab-item-close": "tab close",
  ".tab-add-button": "open plugin",
  ".tab-split-button": "layout",
  ".tab-view-chip": "location chip",
  ".tab-view-chip-close": "cover close",
  ".assistant-target-main": "work chip",
  ".assistant-target-clear": "work chip clear",
  ".assistant-materials-button": "materials chip",
  ".assistant-attention": "attention chip",
  "[data-assistant-executor]": "executor chip",
  "[data-assistant-character]": "character chip",
  "[data-assistant-mode]": "mode chip",
};
/** The chips of the Assistant line that exist only in some states; the three base screens do not show them. */
const LINE_KINDS = ["work chip", "work chip clear", "materials chip", "attention chip", "executor chip", "character chip", "mode chip"];

/** Shows chips of the Assistant line as the island paints them when they have something to say (it hides them otherwise). */
const showChips = (selectors: string[]) => `(() => {
  const words = { "[data-assistant-materials-label]": "正在看：需求说明", "[data-assistant-materials-count]": "1", "[data-assistant-attention-count]": "3", "[data-assistant-mode-label]": "方式：执行" };
  for (const selector of ${JSON.stringify(selectors)}) {
    const chip = document.querySelector(selector);
    chip.hidden = false;
    if (/executor|character/.test(selector)) chip.setAttribute("data-chosen", "");
  }
  for (const [selector, text] of Object.entries(words)) { const span = document.querySelector(selector); if (span && !span.closest("[hidden]")) span.textContent = text; }
})()`;

/** Every shown control of the strip and of the bar (not what opens from them), with its kind and box. */
const SHELL_CONTROLS = `(() => {
  const kinds = ${JSON.stringify(KINDS)};
  const out = [];
  const roots = [["bar", ".workbench-bar"], ["strip", "nav.tab-strip"], ["strip", ".immersive-titlebar"]];
  for (const [area, root] of roots) {
    for (const el of document.querySelectorAll(root + " :is(button, summary, input, [role=tab])")) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest("[hidden], [inert], .assistant-panel, .assistant-popover, .plugin-picker-popover, [data-dock-overflow], .navigator-project-menu-popover")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const kind = Object.entries(kinds).find(([selector]) => el.matches(selector))?.[1];
      out.push({ kind: kind ?? "unlisted " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0], area, label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10 });
    }
  }
  return out;
})()`;

/** A finding that is about the strip or the bar (the page behind them has its own audits). */
const IN_SHELL = /bar-composer|assistant-composer|dock-pin|bar-resident|bar-chat|plugin-picker|navigator-project|navigator-directory|immersive-show|workbench-bar|bar-start|bar-end|tab-view-chip|tab-item|tab-strip|tab-add|tab-split|workspace-history/;

for (const scheme of ["light", "dark"] as const) {
  test(`the shell's controls are 44px on a phone and keep the written desktop exception · ${scheme}`, { timeout: 300_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

    const open = async (width: number, height: number, mobile: boolean, path: string, ready: string) => {
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${path}` }, sessionId));
      await waitFor(`${ready} && !!document.querySelector('[data-dock-pins] [data-dock-pin]')`, 20_000);
      // Text widths feed the Dock's fold; wait for the fonts, but a slow machine's font load is not what is under test.
      await waitFor("document.fonts.status === 'loaded'", 10_000).catch(() => undefined);
      assert.equal(await evaluate("document.documentElement.dataset.resolvedTheme"), scheme, "the page follows the emulated scheme");
      // The Dock folds what does not fit after its first paint; let it settle before measuring.
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))");
      return evaluate<Control[]>(SHELL_CONTROLS);
    };
    const shellFindings = async () => (await layoutFindings(evaluate)).filter(finding => IN_SHELL.test(`${finding.a ?? ""} ${finding.b ?? ""}`));
    const short = (control: Control) => Math.min(control.w, control.h);

    // A phone. Three screens carry every control: the project's home, a plugin's page (its location chip), and the project's
    // settings (a cover chip with its close mark, and the directory toggle: the widest the bar gets).
    const seen = new Set<string>();
    for (const [name, path, ready] of [
      ["home", "", "true"],
      ["a plugin's page", "?openPlugin=todo", "!!document.querySelector('.tab-view-chip')"],
      ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"],
    ] as const) {
      const controls = await open(390, 844, true, path, ready);
      for (const control of controls) seen.add(control.kind);
      assert.deepEqual(controls.filter(control => short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
        `${name} · 390: every control of the strip and the bar is a 44px target`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 390: a control this test does not know is a control nobody measured`);
      assert.deepEqual(await shellFindings(), [], `${name} · 390: the bar and the strip lay out cleanly with 44px targets`);
    }
    assert.deepEqual(Object.values(KINDS).filter(kind => !LINE_KINDS.includes(kind) && !seen.has(kind)), [], "the three screens showed every kind of control, so none went unmeasured");

    // The Assistant line stays a 44px input with room to type, and its attach and send keep their size while typing.
    await evaluate(`(() => { const input = document.querySelector('[data-assistant-input]'); input.focus(); input.value = '整理一下本周的待办'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const typing = (await evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.kind.startsWith("assistant"));
    assert.equal(typing.length, 3, "input, attach and send are all there while typing");
    assert.deepEqual(typing.filter(control => short(control) < 44), [], "and are still 44px");
    assert.ok(typing.find(control => control.kind === "assistant input")!.w >= 120, "the input keeps room to type");

    // A desktop window: the exception is the sizes DESIGN.md names, and its floor holds.
    const floors = { strip: 20, bar: 28 };
    for (const [name, path, ready] of [
      ["home", "", "true"],
      ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"],
    ] as const) {
      const controls = await open(1280, 800, false, path, ready);
      assert.deepEqual(controls.filter(control => short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
        `${name} · 1280: nothing in the strip is under ${floors.strip}px or in the bar under ${floors.bar}px`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 1280: every control is a known one`);
      const input = controls.find(control => control.kind === "assistant input");
      assert.ok(input && input.h <= 32, "the desktop Assistant line stays the 28px line the exception describes, not a phone's 44px");
    }

    // A short window (a phone held sideways falls here too): DESIGN.md writes the Dock, resident and switcher buttons as 34px
    // there, and the floors still hold.
    const shortWindow = await open(1280, 500, false, "", "true");
    assert.deepEqual(shortWindow.filter(control => short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
      "a short window · 1280×500: nothing in the strip is under 20px or in the bar under 28px");
    assert.deepEqual(shortWindow.filter(control => ["dock", "resident", "plugin switcher"].includes(control.kind) && control.area === "bar").map(control => control.h).filter(h => h !== 34), [],
      "a short window · 1280×500: the Dock, resident and switcher buttons are the 34px DESIGN.md writes");

    // The Assistant line in the states the seeded project does not start in. The chips of a state are the ones the island shows
    // beside the input then (it hides them otherwise); what is measured is their box on the real bar.
    const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))");
    const line = async (name: string, width: number, height: number, mobile: boolean, chips: string[], expected: string[], floor: number) => {
      await open(width, height, mobile, "", "true");
      // The island paints the chip once its list of works has come back.
      if (expected.includes("work chip")) await waitFor("document.querySelector('[data-assistant-target-wrap]')?.getClientRects().length > 0", 10_000);
      // The island repaints its chips when its first answers come back and would hide what was shown; show them again until they stay.
      let bar: Control[] = [];
      let kinds = new Set<string>();
      for (let attempt = 0; attempt < 5; attempt++) {
        if (chips.length) { await evaluate(showChips(chips)); await settle(); }
        bar = (await evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.area === "bar");
        kinds = new Set(bar.map(control => control.kind));
        if (expected.every(kind => kinds.has(kind))) break;
      }
      assert.deepEqual(expected.filter(kind => !kinds.has(kind)), [], `${name}: every chip of the state is there to measure`);
      assert.deepEqual(bar.filter(control => short(control) < floor).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [], `${name}: no control of the bar is under ${floor}px`);
      assert.deepEqual(bar.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name}: every control is a known one`);
    };
    // A new work whose carrier was chosen, with the chips that wait beside the input.
    const newWork = ["[data-assistant-executor]", "[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-mode]"];
    const newWorkKinds = ["executor chip", "materials chip", "attention chip", "mode chip"];
    await line("a new work · 390", 390, 844, true, newWork, newWorkKinds, 44);
    await line("a new work · 1280", 1280, 800, false, newWork, newWorkKinds, floors.bar);

    // A current work: its chip stands in front of the input, with a mark to start a new work instead. A send without a model
    // keeps the work, which is all the chip needs; the island remembers it as this viewer's current work.
    await evaluate(`(async () => {
      const api = ${JSON.stringify(`/projects/${projectId}/api/assistant`)};
      await fetch(api + "/send", { method: "POST", headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
        body: JSON.stringify({ text: "整理一下本周的待办", request_id: "touch-targets-1" }) });
      const { works } = await fetch(api + "/works").then(response => response.json());
      localStorage.setItem("molis.assistant.current", works[0].work_id);
    })()`);
    const withWork = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-character]", "[data-assistant-mode]"];
    const withWorkKinds = ["work chip", "work chip clear", "materials chip", "attention chip", "character chip", "mode chip"];
    // On a phone the line has room for the work's chip and two more 44px chips beside the input; each state below is one the
    // island produces (a page's materials and a notice; a Coding work, which shows its mode), and none overflows the bar.
    for (const [name, chips, kinds] of [
      ["a current work", [], ["work chip", "work chip clear"]],
      ["a current work with its materials and a notice", ["[data-assistant-materials]", "[data-assistant-attention]"], ["work chip", "work chip clear", "materials chip", "attention chip"]],
      ["a Coding work", ["[data-assistant-mode]"], ["work chip", "work chip clear", "mode chip"]],
    ] as const) {
      await line(`${name} · 390`, 390, 844, true, [...chips], [...kinds], 44);
      assert.deepEqual(await shellFindings(), [], `${name} · 390: the bar lays out cleanly with 44px chips`);
      assert.ok((await evaluate<number>("document.querySelector('[data-assistant-input]').getBoundingClientRect().width")) >= 64, `${name} · 390: the input keeps room to type beside the chips`);
    }
    await line("a current work · 1280", 1280, 800, false, [], ["work chip", "work chip clear"], floors.bar);
    await line("a current work with every chip · 1280", 1280, 800, false, withWork, withWorkKinds, floors.bar);
    await line("a current work · short window 1280×500", 1280, 500, false, [], ["work chip", "work chip clear"], floors.bar);

    // A touch window wider than 600px (a tablet) is the known gap, and DESIGN.md says so: the strip is already 44px, the bar is
    // still the desktop bar above its floor. When the bar is fixed this goes red on purpose: change DESIGN.md and BL-123 with it.
    await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    for (const [width, height] of [[768, 1024], [1024, 768]] as const) {
      await open(width, height, false, "settings", "!!document.querySelector('.tab-view-chip-close')");
      await waitFor("document.querySelector('[data-assistant-target-wrap]')?.getClientRects().length > 0", 10_000);
      const controls = await evaluate<Control[]>(SHELL_CONTROLS);
      assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`), true, `the emulation makes ${width} a coarse-pointer window`);
      assert.ok(controls.some(control => control.kind === "work chip clear"), `a touch window · ${width}: the work's chip and its mark are measured too`);
      assert.deepEqual(controls.filter(control => control.area === "strip" && short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
        `a touch window · ${width}: every control of the strip is a 44px target`);
      assert.deepEqual(controls.filter(control => control.area === "bar" && short(control) < floors.bar).map(control => `${control.kind} ${control.w}×${control.h}`), [],
        `a touch window · ${width}: the bar stays above the 28px floor`);
      const bar = controls.filter(control => control.area === "bar");
      assert.ok(bar.some(control => short(control) < 44), `a touch window · ${width}: the bar is still the desktop bar, the known gap DESIGN.md names (BL-123)`);
    }
  });
}
