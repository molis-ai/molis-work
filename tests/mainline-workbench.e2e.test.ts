import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Batch 37-2 E2E (MLN-01–19, 21–23, WLN-19/20/23/24, POLISH-62–64, Decision 66,
// BL-dialog-info-column-prototype-gaps #3 & #4): single Chrome instance covering the
// entire mainline switcher, Option A inline create + reading-flow lightweight item First Page,
// per-item state/draft isolation, 「这件事项/整个项目」 scope toggle, 「在：事项名 ×」 pill,
// Decision 66 Personal Space + right-sidebar IM R21, ⌘K work-item ranking, and 1440/1024/390 responsive layout.

const WAIT_MS = 25_000;

test("MLN-01 MLN-02 MLN-03 MLN-04 MLN-05 MLN-06 MLN-07 MLN-08 MLN-09 MLN-10 MLN-15 MLN-16 MLN-17 MLN-18 MLN-19 MLN-21 MLN-23 WLN-19 WLN-20 POLISH-62 POLISH-63 POLISH-64: full mainline workbench flow, Decision 66 alignment, per-item state/draft isolation, scope toggle, composer pill, ⌘K ranking, reload persistence, and responsive layout", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-top-corner-toggle]') && document.querySelector('[data-corner-mainline]') && document.querySelector('[data-assistant-composer] .mw-composer__input'))", WAIT_MS);

  // 1. Default unselected state (MLN-01) + Decision 66 Personal Space pinned top + R21 right-sidebar IM preserved.
  const initialState = await evaluate<{
    hasWorkItem: boolean;
    ringHidden: boolean;
    hasImTab: boolean;
    itemContentsHidden: boolean;
    personalFirst: boolean;
  }>(`(() => {
    const toggle = document.querySelector('[data-top-corner-toggle]');
    const ring = document.querySelector('[data-top-corner-ring]');
    const projects = document.querySelector('.top-corner-projects');
    const firstChild = projects?.firstElementChild;
    return {
      hasWorkItem: toggle.hasAttribute('data-has-work-item'),
      ringHidden: Boolean(ring?.hidden),
      hasImTab: Boolean(document.querySelector('[data-side-tab="discussion"]')),
      itemContentsHidden: Boolean(document.querySelector('[data-side-tab="item-contents"]')?.hidden),
      personalFirst: Boolean(firstChild?.classList.contains('top-corner-personal')),
    };
  })()`);
  assert.equal(initialState.hasWorkItem, false, "MLN-01: no active work item initially");
  assert.equal(initialState.ringHidden, true, "MLN-01: item status ring hidden when unselected");
  assert.equal(initialState.hasImTab, true, "Decision 66 R21: right-sidebar discussion/IM tab preserved");
  assert.equal(initialState.itemContentsHidden, true, "item-contents tab hidden until a work item is selected");
  assert.equal(initialState.personalFirst, true, "Decision 66: Personal Space pinned at top of switcher left column");

  // 2. Open switcher -> actionable empty state + dismissible example; Escape returns focus without changing state (MLN-02, MLN-08).
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("Boolean(!document.querySelector('[data-top-corner-list]').hidden && document.querySelector('[data-mainline-empty]') && document.querySelector('[data-mainline-example]'))", WAIT_MS);
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor("Boolean(document.querySelector('[data-top-corner-list]').hidden)", WAIT_MS);
  const afterEsc = await evaluate<boolean>("document.activeElement === document.querySelector('[data-top-corner-toggle]') && !document.querySelector('[data-top-corner-toggle]').hasAttribute('data-has-work-item')");
  assert.equal(afterEsc, true, "MLN-02: Esc closes switcher, returns focus, changes nothing");

  // Re-open switcher, dismiss example card, create two light items via Option A inline create (MLN-08, MLN-21).
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("Boolean(!document.querySelector('[data-top-corner-list]').hidden && document.querySelector('[data-ml-example-dismiss]'))", WAIT_MS);
  await evaluate("document.querySelector('[data-ml-example-dismiss]').click()");
  await waitFor("!document.querySelector('[data-mainline-example]')", WAIT_MS);

  const createInline = async (name: string) => {
    await evaluate(`(() => {
      const input = document.querySelector('[data-mainline-create-input]');
      input.value = ${JSON.stringify(name)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-ml-create-form]').requestSubmit();
    })()`);
    await waitFor(`[...document.querySelectorAll('[data-ml-row]')].some(el => el.textContent.includes(${JSON.stringify(name)}))`, WAIT_MS);
  };
  await createInline("第一件事项");
  await createInline("第二件事项");

  // 3. Organize dialog: add group, pin item, delete group with zero lost items (MLN-03, MLN-04).
  await evaluate("document.querySelector('[data-mainline-organize-open]').click()");
  await waitFor("Boolean(document.querySelector('dialog[data-mainline-organize-dialog][open] [data-org-add-input]'))", WAIT_MS);
  await evaluate(`(() => {
    const input = document.querySelector('[data-org-add-input]');
    input.value = '本周重点';
    document.querySelector('[data-org-add-group]').requestSubmit();
  })()`);
  await waitFor("[...document.querySelectorAll('[data-org-col]')].some(el => el.textContent.includes('本周重点'))", WAIT_MS);
  await evaluate("document.querySelector('[data-org-pin]').click()");
  await waitFor("Boolean(document.querySelector('[data-org-pin][data-org-pinned=\"true\"]'))", WAIT_MS);
  await evaluate(`(() => {
    const col = [...document.querySelectorAll('[data-org-col]')].find(el => el.textContent.includes('本周重点'));
    col.querySelector('[data-org-group-delete]').click();
  })()`);
  await waitFor("![...document.querySelectorAll('[data-org-col]')].some(el => el.textContent.includes('本周重点'))", WAIT_MS);
  const cardsAfterDelete = await evaluate<number>("document.querySelectorAll('[data-org-card]').length");
  assert.equal(cardsAfterDelete, 2, "MLN-04: deleting group preserves all items");
  await evaluate("document.querySelector('[data-org-close]').click()");
  await waitFor("!document.querySelector('dialog[data-mainline-organize-dialog][open]')", WAIT_MS);

  // 4. Switch to 「第一件事项」: Option A lightweight First Page opens, side 「这件事的东西」 appears, composer pill shows 「在：第一件事项 ×」 (MLN-05, 06, 07, 15, 16).
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("!document.querySelector('[data-top-corner-list]').hidden", WAIT_MS);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('[data-ml-pick]')].find(el => el.textContent.includes('第一件事项'));
    btn.click();
  })()`);
  await waitFor("Boolean(document.querySelector('[data-top-corner-toggle][data-has-work-item]'))", 8_000);
  await waitFor("Boolean(document.querySelector('[data-work-item-page]'))", 8_000);
  await waitFor("Boolean(document.querySelector('[data-work-item-pill]') && !document.querySelector('[data-work-item-pill]').hidden)", 8_000);

  const item1State = await evaluate<{
    cornerLabel: string;
    hasItemEmpty: boolean;
    pillText: string;
    contentsTabVisible: boolean;
    imTabStillPresent: boolean;
  }>(`(() => ({
    cornerLabel: document.querySelector('[data-top-corner-toggle] .top-corner-page-name')?.textContent?.trim() ?? '',
    hasItemEmpty: Boolean(document.querySelector('[data-item-page-empty]')),
    pillText: document.querySelector('[data-work-item-pill]')?.textContent?.trim() ?? '',
    contentsTabVisible: !document.querySelector('[data-side-tab="item-contents"]')?.hidden,
    imTabStillPresent: Boolean(document.querySelector('[data-side-tab="discussion"]')),
  }))()`);
  assert.equal(item1State.cornerLabel, "第一件事项");
  assert.equal(item1State.hasItemEmpty, true, "Option A lightweight item First Page shows actionable empty state");
  assert.match(item1State.pillText, /第一件事项/, "BL-dialog-info-column-prototype-gaps #4: composer shows active item pill");
  assert.equal(item1State.contentsTabVisible, true, "right-sidebar 「这件事的东西」 tab appears for active item");
  assert.equal(item1State.imTabStillPresent, true, "Decision 66 R21: IM tab remains alongside 「这件事的东西」");

  // Type draft in item 1, verify list scope toggle exists (BL-dialog-info-column-prototype-gaps #3).
  await evaluate(`(() => {
    const input = document.querySelector('[data-assistant-composer] .mw-composer__input');
    input.focus();
    input.value = '事项一的未发草稿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const hasScopeToggle = await evaluate<boolean>("Boolean(document.querySelector('[data-work-lists-scope]') && !document.querySelector('[data-work-lists-scope]').hidden)");
  assert.equal(hasScopeToggle, true, "BL-dialog-info-column-prototype-gaps #3: list header scope toggle visible for active item");

  // Switch to 「第二件事项」: draft isolates, pill updates; switch back via Alt+[ -> item 1 draft restored (MLN-06, MLN-16).
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("!document.querySelector('[data-top-corner-list]').hidden", WAIT_MS);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('[data-ml-pick]')].find(el => el.textContent.includes('第二件事项'));
    btn.click();
  })()`);
  await waitFor("document.querySelector('[data-top-corner-toggle] .top-corner-page-name')?.textContent?.trim() === '第二件事项'", WAIT_MS);
  const item2Draft = await evaluate<string>("document.querySelector('[data-assistant-composer] .mw-composer__input').value");
  assert.equal(item2Draft, "", "MLN-16: switching work item clears previous item's unsent draft");
  await evaluate(`(() => {
    const input = document.querySelector('[data-assistant-composer] .mw-composer__input');
    input.focus();
    input.value = '事项二的草稿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  // Jump back to 「第一件事项」 via Alt+[ shortcut (with focus outside text input).
  await evaluate("document.activeElement?.blur?.(); document.dispatchEvent(new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft', altKey: true, bubbles: true }))");
  await waitFor("document.querySelector('[data-top-corner-toggle] .top-corner-page-name')?.textContent?.trim() === '第一件事项'", WAIT_MS);
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input').value === '事项一的未发草稿'", WAIT_MS);

  // Clear composer pill via × -> next send routes to whole project (BL-dialog-info-column-prototype-gaps #4).
  await evaluate("document.querySelector('[data-work-item-pill-clear]').click()");
  await waitFor("!document.querySelector('[data-work-item-pill]') || document.querySelector('[data-work-item-pill]').hidden", WAIT_MS);

  // 5. Reload persistence (active item, Recent, collapsed group) + search auto-expand collapsed group (MLN-23).
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("!document.querySelector('[data-top-corner-list]').hidden", WAIT_MS);
  await evaluate("document.querySelector('[data-ml-group-toggle]')?.click()");
  await waitFor("document.querySelector('[data-ml-group-toggle]')?.getAttribute('aria-expanded') === 'false'", WAIT_MS);
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('[data-top-corner-toggle] .top-corner-page-name')?.textContent?.trim() === '第一件事项'", WAIT_MS);
  await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
  await waitFor("Boolean(!document.querySelector('[data-top-corner-list]').hidden && document.querySelector('.ml-section-label'))", WAIT_MS);
  const persistedCollapsed = await evaluate<string>("document.querySelector('[data-ml-group-toggle]')?.getAttribute('aria-expanded') ?? ''");
  assert.equal(persistedCollapsed, "false", "MLN-23: collapsed group state persists across reload");

  // Search for 「第二」 -> auto-expands the collapsed group and reveals the match!
  await evaluate(`(() => {
    const s = document.querySelector('[data-mainline-search]');
    s.value = '第二';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("[...document.querySelectorAll('[data-ml-pick]')].some(el => el.textContent.includes('第二件事项') && !el.closest('[hidden]'))", WAIT_MS);
  // Clear search, re-expand group, and mark 「第二件事项」 done (MLN-09).
  await evaluate(`(() => {
    const s = document.querySelector('[data-mainline-search]');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('[data-ml-group-toggle]')?.click()");
  await waitFor("document.querySelector('[data-ml-group-toggle]')?.getAttribute('aria-expanded') === 'true' && Boolean(document.querySelector('[data-ml-done]'))", WAIT_MS);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-ml-group-section] [data-ml-row]')].find(el => el.textContent.includes('第二件事项'));
    row.querySelector('[data-ml-done]').click();
  })()`);
  await waitFor("Boolean(document.querySelector('[data-ml-completed-section]'))", WAIT_MS);
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor("Boolean(document.querySelector('[data-top-corner-list]').hidden)", WAIT_MS);

  // 6. ⌘K Global Search ranks matching work items first (MLN-18).
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))");
  await waitFor("Boolean(document.querySelector('dialog[data-global-search-dialog][open] [data-global-search]'))", WAIT_MS);
  await evaluate(`(() => {
    const input = document.querySelector('[data-global-search]');
    input.value = '第一件';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("Boolean(document.querySelector('[data-global-search-hit][data-global-search-kind=\"work_item\"]'))", WAIT_MS);
  const firstSearchIsWorkItem = await evaluate<boolean>(`(() => {
    const results = document.querySelector('[data-global-search-results]');
    const first = results?.querySelector('[data-global-search-hit]');
    return first?.getAttribute('data-global-search-kind') === 'work_item';
  })()`);
  assert.equal(firstSearchIsWorkItem, true, "⌘K ranks matching work items first");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

  // 7. Responsive check at 1024px and 390px mobile bottom sheet with ≥44px touch targets (MLN-19, POLISH-62–64).
  for (const [width, height, mobile] of [[1024, 768, false], [390, 844, true]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    await evaluate("document.querySelector('[data-top-corner-toggle]').click()");
    await waitFor("!document.querySelector('[data-top-corner-list]').hidden", WAIT_MS);
    const metrics = await evaluate<{ overflow: boolean; pickHeight: number; createHeight: number }>(`(() => {
      const pick = document.querySelector('[data-ml-pick]');
      const input = document.querySelector('[data-mainline-create-input]');
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        pickHeight: Math.round(pick?.getBoundingClientRect().height ?? 0),
        createHeight: Math.round(input?.getBoundingClientRect().height ?? 0),
      };
    })()`);
    assert.equal(metrics.overflow, false, `${width}px: zero horizontal overflow`);
    if (mobile) {
      assert.ok(metrics.pickHeight >= 44, `390px mobile item row touch target >= 44px (got ${metrics.pickHeight})`);
      assert.ok(metrics.createHeight >= 44, `390px mobile create input touch target >= 44px (got ${metrics.createHeight})`);
    }
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor("Boolean(document.querySelector('[data-top-corner-list]').hidden)", WAIT_MS);
  }
});
