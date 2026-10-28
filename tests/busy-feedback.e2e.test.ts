import assert from "node:assert/strict";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-31 (§feedback-lifecycle, Skeleton Geometry): a quick load never flashes a waiting mark, and
// a slow one shows it in time. Every frame is sampled for a visible spinner, skeleton or dimmed busy region while each plugin
// opens (twice round) and Files and Git refresh. Before, Todo's skeleton showed for 3 frames on its first open, and the
// Files and Git refresh spinners for 1 to 4 frames on every open and refresh; marks now wait 250ms (`.mw-loading`'s rule).
// A refresh held back in Chrome (a real request) keeps the button's label at first and shows the spinner after the wait.
// How long a load takes is the runner's, not the rule's: a mark that shows only once its own 250ms wait (`mw-loading-in` or
// `mw-busy-dim`, on the mark or an ancestor) has passed is a slow load and is not counted; a mark with no such wait (none, a
// shorter one, or only an unrelated ancestor's delayed animation) is the flash this test is for.

const SAMPLE = `window.__marks = []; (() => { const seen = (el) => { if (!el.isConnected) return false; const box = el.getBoundingClientRect(); if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) return false;
    for (let node = el; node; node = node.parentElement) { const style = getComputedStyle(node); if (style.display === 'none' || +style.opacity < 0.05 || (node === el && style.visibility !== 'visible')) return false; } return true; };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '');
  const waited = (el) => { for (let node = el; node; node = node.parentElement) if (node.getAnimations().some((motion) => { const delay = motion.effect?.getTiming().delay ?? 0; return ['mw-loading-in', 'mw-busy-dim'].includes(motion.animationName) && delay >= 250 && motion.currentTime >= delay; })) return true; return false; };
  const marksNow = (root = document) => { const now = [];
    for (const el of root.querySelectorAll('.mw-spinner, .mw-skeleton')) if (seen(el) && !waited(el)) now.push(name(el));
    for (const el of root.querySelectorAll('[aria-busy=true]')) if (seen(el)) for (const part of [el, ...el.children]) if (seen(part) && +getComputedStyle(part).opacity < 0.95 && !waited(part)) { now.push('dim ' + name(part)); break; }
    return now; };
  window.__marksNow = marksNow;
  const frame = () => { const now = marksNow(); if (now.length) window.__marks.push(now.join(', ')); requestAnimationFrame(frame); }; requestAnimationFrame(frame); })();`;
const ORDER = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git", "home"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Seen = { busy: boolean; view: string; opacity: number; mark: number | null };
type Refresh = { busy: boolean; label: number; spinner: number };

test("VUX-31: quick loads never flash a waiting mark, and a slow refresh shows its spinner after the wait", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const views = Object.fromEntries(await Promise.all(ORDER.map(async id => [id, await pluginFrameBrowser(t, browser, id,
    id === "shelf" ? '[data-side-body="plugin:shelf/side"] iframe' : undefined)])));
  await pluginFrameInitScript(t, browser, SAMPLE);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete' && typeof molisWorkOpenPlugin === 'function'", 20_000);
  await pause(1_500);
  await evaluate(SAMPLE);
  // The criterion has to catch what it is for. Each probe is made, read and removed in one script, with its animations held at a
  // known time, so no frame samples it and no runner speed enters. A stand-in for craft-rise's staggered arrival (`both`, a delay
  // past 250ms) is an ancestor that must not excuse a mark; the same mark under its own finished wait is the slow load.
  const probes = await evaluate<Record<string, string[]>>(`(() => {
    const style = document.createElement('style'); style.textContent = '@keyframes probe-rise { from { opacity: 0 } to { opacity: 1 } }'; document.head.append(style);
    const stage = document.createElement('div'); stage.style.cssText = 'position: fixed; top: 8px; left: 8px'; document.body.append(stage);
    const probe = (html, time) => { stage.innerHTML = html; for (const motion of stage.getAnimations({ subtree: true })) { motion.pause(); motion.currentTime = time; } const marks = window.__marksNow(stage); stage.replaceChildren(); return marks; };
    const skeleton = (style) => '<div class="mw-skeleton" style="width: 40px; ' + style + '"></div>';
    const dim = (style) => '<div aria-busy="true"><div style="width: 40px; height: 10px; --busy-dim: .5; ' + style + '">x</div></div>';
    const result = {
      noWait: probe(skeleton('animation: none'), 600),
      shortWait: probe(skeleton('animation-delay: 200ms'), 600),
      unrelatedAncestor: probe('<div style="animation: probe-rise 100ms 300ms both">' + skeleton('animation: none') + '</div>', 600),
      dimNoWait: probe(dim('opacity: .5'), 600),
      ownWait: probe(skeleton(''), 600),
      inWait: probe(skeleton(''), 240),
      ancestorWait: probe('<div style="animation: mw-loading-in 250ms ease 250ms both">' + skeleton('animation: none') + '</div>', 600),
      dimWait: probe(dim('animation: mw-busy-dim 250ms ease 250ms both'), 600),
    };
    style.remove(); stage.remove(); return result;
  })()`);
  assert.deepEqual(probes, {
    noWait: ["div.mw-skeleton"], shortWait: ["div.mw-skeleton"], unrelatedAncestor: ["div.mw-skeleton"], dimNoWait: ["dim div"],
    ownWait: [], inWait: [], ancestorWait: [], dimWait: [],
  }, "the sampler counts a mark with no wait, a short one or only an unrelated ancestor's delay, and not one past its own 250ms wait");
  const flashes: string[] = [];
  const visibleChild = (id: string) => evaluate<boolean>(`(()=>{const owner=${id === "shelf" ? `document.querySelector('[data-side-body="plugin:shelf/side"] iframe')` : "null"};
    return !!(owner?.contentDocument??document).querySelector('iframe[data-plugin-frame="${id}"]');})()`);
  const watch = async (label: string, id: string, run: () => Promise<unknown>) => {
    await evaluate("window.__marks.length = 0");
    if (await visibleChild(id)) await views[id]!.evaluate("window.__marks.length=0");
    await run(); await pause(1_500);
    const marks = await evaluate<string[]>("window.__marks");
    if (await visibleChild(id)) marks.push(...await views[id]!.evaluate<string[]>("window.__marks"));
    if (marks.length) flashes.push(`${label}: ${[...new Set(marks)].join(" / ")} (${marks.length} frames)`);
  };
  for (const round of [1, 2]) for (const id of ORDER) await watch(`open ${id} (round ${round})`, id, () => evaluate(`molisWorkOpenPlugin(${JSON.stringify(id)})`));
  for (const id of ["files", "git"]) {
    await evaluate(`molisWorkOpenPlugin(${JSON.stringify(id)})`); await views[id]!.waitFor(`!document.querySelector('[data-${id}-refresh]').disabled`, 15_000);
    await watch(`${id} refresh`, id, () => views[id]!.evaluate(`document.querySelector('[data-${id}-refresh]').click()`));
  }
  assert.deepEqual(flashes, [], "a quick load showed a waiting mark");

  // Slow: the refresh's read is held.
  await evaluate("molisWorkOpenPlugin('files')"); await views.files!.waitFor("!document.querySelector('[data-files-refresh]').disabled", 15_000);
  const barrier = await sendBarrier(browser as never, [{ urlPattern: "*files/state*", requestStage: "Request" }]);
  const parts = `(() => { const button = document.querySelector('[data-files-refresh]'), opacity = (el) => getComputedStyle(el).visibility === 'visible' ? +getComputedStyle(el).opacity : 0;
    return { busy: button.hasAttribute('data-loading'), label: opacity(button.querySelector(':scope > :not(.mw-spinner)')), spinner: button.querySelector('.mw-spinner').hidden ? 0 : opacity(button.querySelector('.mw-spinner')) }; })()`;
  // The wait is two animations' 250ms delay, so a runner that answers the click late would read the finished swap, and the label's
  // animation (a `backwards` fill) is gone from getAnimations() once it ends. Have the button's animations start paused, then hold
  // them at a known time (240ms in, just inside the wait, then past delay plus duration) and read both states in one script, as
  // tests/menu-exit-motion.e2e.test.ts does.
  await views.files!.evaluate(`document.head.append(Object.assign(document.createElement('style'), { textContent: '.mw-btn[data-loading], .mw-btn[data-loading] > * { animation-play-state: paused !important; }' }))`);
  await views.files!.evaluate("document.querySelector('[data-files-refresh]').click()"); const held = await barrier.next();
  const seen = await views.files!.evaluate<{ motions: string[]; early: Refresh; late: Refresh }>(`(() => {
    const motions = document.querySelector('[data-files-refresh]').getAnimations({ subtree: true }).filter((motion) => ['mw-loading-in', 'mw-loading-out'].includes(motion.animationName));
    const at = (time) => { for (const motion of motions) motion.currentTime = time; return ${parts}; };
    return { motions: [...new Set(motions.map((motion) => motion.animationName))].sort(), early: at(240), late: at(600) };
  })()`);
  assert.deepEqual(seen.motions, ["mw-loading-in", "mw-loading-out"], "the label and the spinner both wait on a real animation");
  assert.deepEqual(seen.early, { busy: true, label: 1, spinner: 0 }, "just after the click the label stays and no spinner shows");
  assert.deepEqual(seen.late, { busy: true, label: 0, spinner: 1 }, "past the wait the spinner shows in the label's place");
  await barrier.release(held); await barrier.close();
  await views.files!.waitFor("!document.querySelector('[data-files-refresh]').hasAttribute('data-loading')", 15_000);
  assert.deepEqual(await views.files!.evaluate(parts), { busy: false, label: 1, spinner: 0 }, "when the read answers the label comes back at once");
});

// The plugins' own waits follow the same 250ms: switching the Goal shown in the work view keeps the old document and shows
// no mark while the read is quick, and past the wait fades it out under "正在载入 Goal…". Before, the mark showed on the
// first frame of every switch, and the old document never faded in the work view (the rule only reached a direct child).
test("VUX-31: switching the Goal in the work view keeps the old document until the wait passes", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, click, openGoalFrame, openGoalWork, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await openGoalWork();
  await waitFor("document.querySelector('.document-pane [data-goal-view]')?.dataset.goalView === 'CORE' && document.querySelector('.document-pane').getClientRects().length > 0", 15_000);
  const parts = `(() => { const pane = document.querySelector('.document-pane'), view = pane.querySelector('[data-goal-view]'), mark = pane.querySelector('[data-goal-document-loading]');
    return { busy: pane.getAttribute('aria-busy') === 'true', view: view.dataset.goalView, opacity: Math.round(+getComputedStyle(view).opacity * 100) / 100, mark: mark ? Math.round(+getComputedStyle(mark).opacity * 100) / 100 : null }; })()`;
  const barrier = await sendBarrier(browser as never, [{ urlPattern: "*/api/goals/V1/document*", requestStage: "Request" }]);
  await evaluate(`[...document.querySelectorAll('.tree-node[data-select-goal="V1"]')].find((node) => node.getClientRects().length).click()`);
  const held = await barrier.next();
  // The wait is two animations' 250ms delay, so a runner that answers the click late would sample the finished fade. Hold the
  // pane's real animations at a known time (240ms in, just inside the wait, then past delay plus duration) and read both states in one script, as
  // tests/menu-exit-motion.e2e.test.ts does.
  const seen = await evaluate<{ motions: string[]; elapsed: number; early: Seen; late: Seen }>(`(() => {
    const motions = document.querySelector('.document-pane').getAnimations({ subtree: true }).filter((motion) => ['mw-busy-dim', 'mw-loading-in'].includes(motion.animationName));
    const elapsed = Math.max(0, ...motions.map((motion) => Number(motion.currentTime) || 0));
    const at = (time) => { for (const motion of motions) { motion.pause(); motion.currentTime = time; } return ${parts}; };
    return { motions: [...new Set(motions.map((motion) => motion.animationName))].sort(), elapsed, early: at(240), late: at(600) };
  })()`);
  // How late the old sleep-based read would have been, so a slow runner (or a slower switch) shows in the log without failing the test.
  t.diagnostic(`VUX-31 switch: the wait animations were ${Math.round(seen.elapsed)}ms in when read (the wait ends at 250ms)`);
  assert.deepEqual(seen.motions, ["mw-busy-dim", "mw-loading-in"], "the old document and the mark both wait on a real animation");
  assert.deepEqual(seen.early, { busy: true, view: "CORE", opacity: 1, mark: 0 }, "just after the switch the old document stays and no mark shows");
  assert.deepEqual(seen.late, { busy: true, view: "CORE", opacity: 0, mark: 1 }, "past the wait the old document has faded under the mark");
  await barrier.release(held); await barrier.close();
  await waitFor("document.querySelector('.document-pane [data-goal-view]')?.dataset.goalView === 'V1'", 15_000);
  assert.deepEqual(await evaluate(parts), { busy: false, view: "V1", opacity: 1, mark: null }, "the new document shows at once when it answers");
});
