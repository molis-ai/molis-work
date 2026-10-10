import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";

// DESIGN.md → Focus and accessibility: every target is 44px wherever the pointer is coarse (a phone, a phone held sideways, a
// tablet) or the window is a phone's width, and the desktop window's chrome (the title bar's tab strip and the bottom bar) keeps
// one written, scoped exception for fine-pointer windows. This measures both sides on the real shell. Touch windows, 390×844,
// 852×393 and 1024×768: every control of the strip and of the bar is 44px on its short side, the bar and the strip lay out
// cleanly with them, and the Assistant line stays inside its pill in the states the seeded project does not start in: a current
// work (its chip and the chip's clear mark), the chips that come and go beside the input (materials, attention, who does it, the
// Character, the mode) and the crowd of them all, where the choosers step aside rather than any chip shrinking under 44px.
// A fine-pointer window of 1280px keeps the sizes the exception names and does not sink below its floor, also in a short window.

type Control = { kind: string; area: "strip" | "bar"; label: string; w: number; h: number };
type Part = { name: string; left: number; right: number };
type LineFit = { overflow: number; left: number; right: number; vw: number; crowded: boolean; fit: string; input: number; parts: Part[] };

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
/** The chips of the Assistant line that exist only in some states; the base screens do not show them. */
const LINE_KINDS = ["work chip", "work chip clear", "materials chip", "attention chip", "executor chip", "character chip", "mode chip"];

/** Shows chips of the Assistant line as the island paints them when they have something to say (it hides them otherwise). */
const OPTIONAL_CHIPS = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-executor]", "[data-assistant-character]", "[data-assistant-mode]"];
const showChips = (selectors: string[]) => `(() => {
  for (const selector of ${JSON.stringify(OPTIONAL_CHIPS)}) { const chip = document.querySelector(selector); chip.hidden = true; chip.removeAttribute("data-chosen"); }
  const words = { "[data-assistant-materials-label]": "正在看：需求说明", "[data-assistant-materials-count]": "1", "[data-assistant-attention-count]": "3", "[data-assistant-mode-label]": "方式：执行", "[data-assistant-character-label]": "角色：评审" };
  for (const selector of ${JSON.stringify(selectors)}) {
    const chip = document.querySelector(selector);
    chip.hidden = false;
    if (/executor|character/.test(selector)) chip.setAttribute("data-chosen", "");
  }
  for (const [selector, text] of Object.entries(words)) { const span = document.querySelector(selector); if (span && !span.closest("[hidden]")) span.textContent = text; }
})()`;
const chipsShown = (selectors: string[]) => `${JSON.stringify(selectors)}.every(selector => document.querySelector(selector)?.hidden === false)`;

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

/** Where the parts of the Assistant line sit against its pill and the window: nothing may run past either. */
const LINE_FIT = `(() => {
  const composer = document.querySelector("[data-assistant-composer]");
  const pill = composer.getBoundingClientRect();
  const parts = [];
  for (const el of composer.children) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    parts.push({ name: String(el.className).split(" ")[0] || el.tagName.toLowerCase(), left: Math.round(box.left * 10) / 10, right: Math.round(box.right * 10) / 10 });
  }
  return { overflow: composer.scrollWidth - composer.clientWidth, left: Math.round(pill.left * 10) / 10, right: Math.round(pill.right * 10) / 10, vw: document.documentElement.clientWidth,
    crowded: composer.hasAttribute("data-crowded"), fit: composer.dataset.fit ?? "", input: Math.round(document.querySelector("[data-assistant-input]").getBoundingClientRect().width * 10) / 10, parts };
})()`;

/** A finding that is about the strip or the bar (the page behind them has its own audits). */
const IN_SHELL = /bar-composer|assistant-composer|dock-pin|bar-resident|bar-chat|plugin-picker|navigator-project|navigator-directory|immersive-show|workbench-bar|bar-start|bar-end|tab-view-chip|tab-item|tab-strip|tab-add|tab-split|workspace-history/;

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** The windows of one test: open a size on a path, measure the shell, and put the Assistant line in a state. */
function windowsOf(browser: Browser, scheme: "light" | "dark", touch: boolean) {
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  const short = (control: Control) => Math.min(control.w, control.h);
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))");
  const start = async () => {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    if (touch) await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  };
  const open = async (width: number, height: number, path: string, ready: string) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${path}` }, sessionId));
    await waitFor(`${ready} && !!document.querySelector('[data-dock-pins] [data-dock-pin]')`, 20_000);
    // Text widths feed the Dock's fold; wait for the fonts, but a slow machine's font load is not what is under test.
    await waitFor("document.fonts.status === 'loaded'", 10_000).catch(() => undefined);
    assert.equal(await evaluate("document.documentElement.dataset.resolvedTheme"), scheme, "the page follows the emulated scheme");
    assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`), touch, `the window is a ${touch ? "coarse" : "fine"}-pointer one`);
    // The Dock folds what does not fit after its first paint; let it settle before measuring.
    await settle();
    return evaluate<Control[]>(SHELL_CONTROLS);
  };
  // The directory's resize grip runs the full height of the window's grid and crosses the bar between 601 and about 900px wide
  // whatever the control sizes are; it is not what is measured here.
  const shellFindings = async () => (await layoutFindings(evaluate)).filter(finding => IN_SHELL.test(`${finding.a ?? ""} ${finding.b ?? ""}`) && !/tree-resizer/.test(`${finding.a ?? ""} ${finding.b ?? ""}`));

  /** The Assistant line with some chips shown: they are the ones the island shows beside the input in that state. */
  const line = async (name: string, chips: string[], expected: string[], absent: string[], floor: number) => {
    if (expected.includes("work chip")) await waitFor("document.querySelector('[data-assistant-target-wrap]')?.getClientRects().length > 0", 10_000);
    // The island repaints its chips when its first answers come back and would hide what was shown; show them again until they stay.
    let bar: Control[] = [];
    let kinds = new Set<string>();
    for (let attempt = 0; attempt < 5; attempt++) {
      await evaluate(showChips(chips));
      await settle();
      bar = (await evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.area === "bar");
      kinds = new Set(bar.map(control => control.kind));
      if (expected.every(kind => kinds.has(kind)) && (!chips.length || await evaluate<boolean>(chipsShown(chips)))) break;
    }
    assert.deepEqual(expected.filter(kind => !kinds.has(kind)), [], `${name}: every chip of the state is there to measure`);
    assert.deepEqual(absent.filter(kind => kinds.has(kind)), [], `${name}: the chips that step aside from a crowded line are not on it`);
    assert.deepEqual(bar.filter(control => short(control) < floor).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [], `${name}: no control of the bar is under ${floor}px`);
    assert.deepEqual(bar.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name}: every control is a known one`);
    const fit = await evaluate<LineFit>(LINE_FIT);
    assert.ok(fit.overflow <= 1, `${name}: the line does not overflow its pill (by ${fit.overflow}px; ${JSON.stringify(fit)})`);
    assert.deepEqual(fit.parts.filter(part => part.left < fit.left - 1 || part.right > fit.right + 1 || part.right > fit.vw).map(part => `${part.name} ${part.left}–${part.right}`), [],
      `${name}: every part of the line is inside its pill (${fit.left}–${fit.right}) and the window (${fit.vw})`);
    assert.ok(fit.input >= (floor >= 44 ? 44 : 28), `${name}: the input keeps its box (${fit.input}px)`);
    return fit;
  };

  /** A send without a model keeps the work, which is all the chip needs; the island remembers it as this viewer's current work. */
  const makeCurrentWork = () => evaluate(`(async () => {
    const api = ${JSON.stringify(`/projects/${projectId}/api/assistant`)};
    await fetch(api + "/send", { method: "POST", headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
      body: JSON.stringify({ text: "整理一下本周的待办", request_id: "touch-targets-1" }) });
    const { works } = await fetch(api + "/works").then(response => response.json());
    localStorage.setItem("molis.assistant.current", works[0].work_id);
  })()`);

  return { start, open, short, settle, shellFindings, line, makeCurrentWork, evaluate, waitFor };
}

const NEW_WORK = ["[data-assistant-executor]", "[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-mode]"];
const NEW_WORK_KINDS = ["executor chip", "materials chip", "attention chip", "mode chip"];
const WITH_WORK = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-character]", "[data-assistant-mode]"];
const WITH_WORK_KINDS = ["work chip", "work chip clear", "materials chip", "attention chip", "character chip", "mode chip"];
const CROWD = ["[data-assistant-materials]", "[data-assistant-attention]", "[data-assistant-character]"];
const BASE = ["work chip", "work chip clear", "materials chip", "attention chip"];

for (const scheme of ["light", "dark"] as const) {
  test(`touch windows: the shell's controls are 44px and the Assistant line stays inside its pill · ${scheme}`, { timeout: 420_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, true);
    await w.start();

    // A phone, 390×844. Three screens carry every control: the project's home, a plugin's page (its location chip), and the
    // project's settings (a cover chip with its close mark, and the directory toggle: the widest the bar gets).
    const seen = new Set<string>();
    for (const [name, path, ready] of [
      ["home", "", "true"],
      ["a plugin's page", "?openPlugin=todo", "!!document.querySelector('.tab-view-chip')"],
      ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"],
    ] as const) {
      const controls = await w.open(390, 844, path, ready);
      for (const control of controls) seen.add(control.kind);
      assert.deepEqual(controls.filter(control => w.short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
        `${name} · 390: every control of the strip and the bar is a 44px target`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 390: a control this test does not know is a control nobody measured`);
      assert.deepEqual(await w.shellFindings(), [], `${name} · 390: the bar and the strip lay out cleanly with 44px targets`);
    }
    assert.deepEqual(Object.values(KINDS).filter(kind => !LINE_KINDS.includes(kind) && !seen.has(kind)), [], "the three screens showed every kind of control, so none went unmeasured");

    // The Assistant line stays a 44px input with room to type, and its attach and send keep their size while typing.
    await w.evaluate(`(() => { const input = document.querySelector('[data-assistant-input]'); input.focus(); input.value = '整理一下本周的待办'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const typing = (await w.evaluate<Control[]>(SHELL_CONTROLS)).filter(control => control.kind.startsWith("assistant"));
    assert.equal(typing.length, 3, "input, attach and send are all there while typing");
    assert.deepEqual(typing.filter(control => w.short(control) < 44), [], "and are still 44px");
    assert.ok(typing.find(control => control.kind === "assistant input")!.w >= 120, "the input keeps room to type");

    // A phone held sideways (852×393) and a tablet (1024×768) are wider than 600px but their pointer is coarse: the strip and
    // the bar are 44px there too, and a short window does not take the desktop's 34px Dock buttons.
    for (const [name, width, height] of [["a phone held sideways", 852, 393], ["a tablet", 1024, 768]] as const) {
      for (const [screen, path, ready] of [["home", "", "true"], ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"]] as const) {
        const controls = await w.open(width, height, path, ready);
        assert.deepEqual(controls.filter(control => w.short(control) < 44).map(control => `${control.kind} 「${control.label}」 ${control.w}×${control.h}`), [],
          `${name} · ${screen} · ${width}×${height}: every control of the strip and the bar is a 44px target`);
        assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · ${screen}: every control is a known one`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${screen} · ${width}×${height}: the bar and the strip lay out cleanly with 44px targets`);
      }
    }

    // The Assistant line in the states the seeded project does not start in. The chips of a state are the ones the island shows
    // beside the input then (it hides them otherwise); what is measured is their box on the real bar. A new work whose carrier
    // was chosen, with the chips that wait beside the input, comes first; then a current work, whose chip stands in front of the
    // input with a mark to start a new work instead.
    for (const [width, height] of [[390, 844], [852, 393]] as const) {
      await w.open(width, height, "", "true");
      await w.line(`a new work · ${width}`, NEW_WORK, NEW_WORK_KINDS, [], 44);
      assert.deepEqual(await w.shellFindings(), [], `a new work · ${width}: the bar lays out cleanly with 44px chips`);
    }
    await w.makeCurrentWork();
    for (const [width, height] of [[390, 844], [852, 393]] as const) {
      await w.open(width, height, "", "true");
      for (const [name, chips, kinds] of [
        ["a current work", [], ["work chip", "work chip clear"]],
        ["a current work with its materials and a notice", ["[data-assistant-materials]", "[data-assistant-attention]"], BASE],
        ["a Coding work", ["[data-assistant-mode]"], ["work chip", "work chip clear", "mode chip"]],
      ] as const) {
        const fit = await w.line(`${name} · ${width}`, [...chips], [...kinds], [], 44);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar lays out cleanly with 44px chips`);
        assert.ok(fit.input >= 64, `${name} · ${width}: the input keeps room to type beside the chips (${fit.input}px)`);
      }
      // The crowd: a work, its materials, a notice and a chosen Character, with and without the Coding mode. A phone's line cannot
      // hold them all at 44px, so the choosers step aside (the side pane has them) and the rest stay 44px inside the pill.
      for (const [name, chips] of [["a work with materials, a notice and a Character", CROWD], ["the same with a Coding mode", [...CROWD, "[data-assistant-mode]"]]] as const) {
        const phone = width === 390;
        const fit = await w.line(`${name} · ${width}`, [...chips], phone ? BASE : ["work chip", "work chip clear"], phone ? ["character chip", "mode chip"] : [], 44);
        if (phone) assert.equal(fit.crowded, true, `${name} · ${width}: the island measured the line as crowded`);
        assert.deepEqual(await w.shellFindings(), [], `${name} · ${width}: the bar lays out cleanly in the crowd`);
      }
    }

    // A tablet's line, with every chip.
    await w.open(1024, 768, "", "true");
    await w.line("a work with every chip · 1024", WITH_WORK, ["work chip", "work chip clear", "materials chip", "attention chip"], [], 44);
    assert.deepEqual(await w.shellFindings(), [], "a work with every chip · 1024: the bar lays out cleanly");
  });

  test(`a fine-pointer window keeps the desktop bar's written sizes and its floor · ${scheme}`, { timeout: 300_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const w = windowsOf(browser, scheme, false);
    await w.start();

    // A desktop window: the exception is the sizes DESIGN.md names, and its floor holds.
    const floors = { strip: 20, bar: 28 };
    for (const [name, path, ready] of [
      ["home", "", "true"],
      ["the project's settings", "settings", "!!document.querySelector('.tab-view-chip-close')"],
    ] as const) {
      const controls = await w.open(1280, 800, path, ready);
      assert.deepEqual(controls.filter(control => w.short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
        `${name} · 1280: nothing in the strip is under ${floors.strip}px or in the bar under ${floors.bar}px`);
      assert.deepEqual(controls.filter(control => control.kind.startsWith("unlisted")).map(control => control.kind), [], `${name} · 1280: every control is a known one`);
      const input = controls.find(control => control.kind === "assistant input");
      assert.ok(input && input.h <= 32, "the desktop Assistant line stays the 28px line the exception describes, not a phone's 44px");
      assert.ok(controls.some(control => w.short(control) < 44), `${name} · 1280: the desktop chrome is denser than 44px, as the exception says`);
    }

    // A short window: DESIGN.md writes the Dock, resident and switcher buttons as 34px there, and the floors still hold.
    const shortWindow = await w.open(1280, 500, "", "true");
    assert.deepEqual(shortWindow.filter(control => w.short(control) < floors[control.area]).map(control => `${control.kind} ${control.w}×${control.h}`), [],
      "a short window · 1280×500: nothing in the strip is under 20px or in the bar under 28px");
    assert.deepEqual(shortWindow.filter(control => ["dock", "resident", "plugin switcher"].includes(control.kind) && control.area === "bar").map(control => control.h).filter(h => h !== 34), [],
      "a short window · 1280×500: the Dock, resident and switcher buttons are the 34px DESIGN.md writes");

    // The Assistant line in the states the seeded project does not start in, on the desktop bar's 28px floor.
    await w.open(1280, 800, "", "true");
    await w.line("a new work · 1280", NEW_WORK, NEW_WORK_KINDS, [], floors.bar);
    await w.makeCurrentWork();
    await w.open(1280, 800, "", "true");
    await w.line("a current work · 1280", [], ["work chip", "work chip clear"], [], floors.bar);
    await w.line("a current work with every chip · 1280", WITH_WORK, WITH_WORK_KINDS, [], floors.bar);
    await w.open(1280, 500, "", "true");
    await w.line("a current work · short window 1280×500", [], ["work chip", "work chip clear"], [], floors.bar);
  });
}
