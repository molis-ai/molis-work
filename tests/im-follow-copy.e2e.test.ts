import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-26 and VUX-19 in the project discussion: the real side panel on a real Host opens the IM
// page, which carries the shared scroll owner and copy feedback. A reader who scrolled up stays put when a message arrives;
// 回到最新消息 brings them back and the stream follows again. Its copy buttons answer through the shared copy feedback.
test("RAC-129-IM / VUX-26 VUX-19: the discussion preserves DOM and focus, follows at the end, stays put for a reader, and answers copy on the button", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')");
  await click("[data-side-toggle]");
  await waitFor("document.querySelector('[data-side-tab=\"discussion\"]')?.checkVisibility()");
  await click("[data-side-tab=\"discussion\"]");
  const im = "document.querySelector('[data-side-body=\"discussion\"] iframe')?.contentDocument";
  // A first visit asks for a name, as a person gives it.
  await waitFor(`${im}?.querySelector('[data-name-form] input')`, 30_000);
  await evaluate(`(() => { const form = ${im}.querySelector('[data-name-form]'); form.querySelector('input').value = '读者'; form.requestSubmit(); })()`);
  await waitFor(`${im}?.querySelector('[data-conversations]')?.hidden === false`, 30_000);
  const stream = `${im}.querySelector('[data-scroll="group"]')`;

  // Enough messages to scroll, posted the way the composer posts them.
  const room = await evaluate<string>(`(async () => { const win = document.querySelector('[data-side-body="discussion"] iframe').contentWindow;
    const answer = await win.fetch('/im/api/projects/' + ${JSON.stringify(projectId)} + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return (await answer.json()).room.id; })()`);
  const post = (body: string) => evaluate<number>(`document.querySelector('[data-side-body="discussion"] iframe').contentWindow.fetch('/im/api/rooms/${room}/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: crypto.randomUUID(), body: ${JSON.stringify(body)} }) }).then((r) => r.status)`);
  for (let index = 1; index <= 30; index++) assert.equal(await post(`第 ${index} 条：${"把要说的事说清楚。".repeat(4)}`), 200);
  await waitFor(`${stream}.textContent.includes('第 30 条')`, 20_000);
  await waitFor(`${stream}.dataset.follow === 'following' && ${stream}.scrollHeight - ${stream}.scrollTop - ${stream}.clientHeight <= 1`);
  // Keep real DOM identities and a keyboard target across the next SSE render.
  await evaluate(`(() => { const doc = ${im}; doc.defaultView.__rac129Row = doc.querySelector('[data-message]'); doc.querySelector('[data-action="new-topic"]').focus({ preventScroll: true }); })()`);

  // The person scrolls up with the wheel: detached; a new message does not move them, and 回到最新消息 is offered.
  const box = await evaluate<{ x: number; y: number }>(`(() => { const frame = document.querySelector('[data-side-body="discussion"] iframe').getBoundingClientRect(), r = ${stream}.getBoundingClientRect(); return { x: frame.x + r.x + r.width / 2, y: frame.y + r.y + r.height / 2 }; })()`);
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: -600 }, sessionId);
  await waitFor(`${stream}.dataset.follow === 'detached'`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const reading = await evaluate<number>(`${stream}.scrollTop`);
  assert.equal(await post("第 31 条：读者往上看时到的"), 200);
  await waitFor(`${stream}.textContent.includes('第 31 条')`, 20_000);
  await waitFor(`${im}.querySelector('[data-action="latest-group"]').hidden === false`);
  assert.equal(await evaluate<number>(`${stream}.scrollTop`), reading, "a message arriving does not move a reader who scrolled up");
  assert.equal(await evaluate<boolean>(`(() => { const doc = ${im}, old = doc.defaultView.__rac129Row; return old.isConnected && doc.querySelector('[data-message="' + CSS.escape(old.dataset.message) + '"]') === old; })()`), true, "unchanged message DOM survives the actual redraw");
  assert.equal(await evaluate<string>(`${im}.activeElement.dataset.action`), "new-topic", "chrome redraw preserves the focused action");

  // The pill is the one trip back; the stream follows again, and the next message lands in view.
  await evaluate(`${im}.querySelector('[data-action="latest-group"]').click()`);
  await waitFor(`${stream}.dataset.follow === 'following' && ${stream}.scrollHeight - ${stream}.scrollTop - ${stream}.clientHeight <= 1`, 10_000);
  await waitFor(`${im}.querySelector('[data-action="latest-group"]').hidden === true`);
  assert.equal(await post("第 32 条：跟随时到的"), 200);
  await waitFor(`${stream}.textContent.includes('第 32 条') && ${stream}.scrollHeight - ${stream}.scrollTop - ${stream}.clientHeight <= 1`, 20_000);

  // Scrolled up a little, past the follower's 48 px but under IM's old 70 px "at the bottom", the reader has left the end: the
  // next message does not pull them back, because IM asks the follower rather than measuring a distance of its own.
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: -60 }, sessionId);
  await waitFor(`${stream}.dataset.follow === 'detached'`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const near = await evaluate<{ top: number; gap: number }>(`({ top: ${stream}.scrollTop, gap: ${stream}.scrollHeight - ${stream}.scrollTop - ${stream}.clientHeight })`);
  assert.ok(near.gap > 48 && near.gap < 70, `the reader is ${near.gap} px from the end`);
  assert.equal(await post("第 33 条：刚往上滚一点时到的"), 200);
  await waitFor(`${stream}.textContent.includes('第 33 条')`, 20_000);
  await waitFor(`${im}.querySelector('[data-action="latest-group"]').hidden === false`);
  assert.equal(await evaluate<number>(`${stream}.scrollTop`), near.top, "a reader a few pixels from the end stays where they are");
  await evaluate(`${im}.querySelector('[data-action="latest-group"]').click()`);
  await waitFor(`${stream}.dataset.follow === 'following' && ${stream}.scrollHeight - ${stream}.scrollTop - ${stream}.clientHeight <= 1`, 10_000);

  // The IM page carries the shared copy feedback after its own button rules: on one of its primary buttons, the answer stacks
  // in the same box and is read out. (The invite link it serves is offered for shared rooms, not a project's.)
  // A real press, so the frame has focus as it does when a person copies.
  const spot = await evaluate<{ x: number; y: number; before: number }>(`(() => { const doc = ${im}, button = doc.createElement('button');
    button.className = 'im-primary'; button.type = 'button'; button.id = 'probe-copy'; button.textContent = '复制链接'; doc.querySelector('[data-group-pane]').prepend(button);
    button.addEventListener('click', () => doc.defaultView.molisCopy(button, 'molis', { done: '已复制', failed: '复制失败' }));
    const frame = document.querySelector('[data-side-body="discussion"] iframe').getBoundingClientRect(), r = button.getBoundingClientRect();
    return { x: frame.x + r.x + r.width / 2, y: frame.y + r.y + r.height / 2, before: r.width }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: spot.x, y: spot.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor(`${im}.getElementById('probe-copy').dataset.copy`);
  const copied = await evaluate<{ before: number; after: number; state: string; faces: string }>(`(() => { const button = ${im}.getElementById('probe-copy');
    return { before: ${spot.before}, after: button.getBoundingClientRect().width, state: button.dataset.copy, faces: getComputedStyle(button).display }; })()`);
  assert.equal(copied.state, "done");
  assert.match(copied.faces, /grid$/, "the copy rule comes after the IM button rules, so the faces share one cell");
  assert.ok(Math.abs(copied.after - copied.before) <= 1, `the button keeps its width (${copied.before} → ${copied.after})`);
  assert.equal(await evaluate("navigator.clipboard.readText()"), "molis");
  await waitFor(`${im}.querySelector('[role=status].mw-sr-only')?.textContent === '已复制'`);
  assert.equal(await evaluate<boolean>(`${im}.querySelector('[role=status].mw-sr-only').getBoundingClientRect().width <= 1`), true, "the read-out stays off screen");
});
