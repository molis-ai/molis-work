import assert from "node:assert/strict";
import test from "node:test";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-26 in the Assistant itself: the conversation's scroll has one owner (window.molisFollow).
// Read away from the end, what arrives waits behind 「新消息」; the pill brings the reader back and the conversation follows again.
test("VUX-26: in the Assistant, a reader who scrolled up stays put when news arrives, and 新消息 brings them back to following", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, projectId } = browser;
  const id = await seedWork(browser, "列一下这周要做的事");
  await openWork(browser, id);
  const thread = "document.querySelector('[data-assistant-thread]')";
  await waitFor(`${thread}.querySelector('.assistant-msg--assistant')`);
  // A short window onto a long conversation, so there is somewhere to scroll.
  await evaluate(`(() => { const filler = document.createElement('div'); filler.style.height = '1600px'; ${thread}.prepend(filler); ${thread}.style.maxHeight = '240px'; ${thread}.scrollTop = ${thread}.scrollHeight; })()`);
  const offer = (title: string) => evaluate(`fetch('/projects/${projectId}/api/assistant/cards', { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ message_id: crypto.randomUUID(),
    source: { surface: 'pages', title: 'Pages' }, work_id: ${JSON.stringify(id)}, card: { title: ${JSON.stringify(title)}, summary: '把选中的文字记到待办',
      reference: { capability_id: 'todo.items.create', version: 1, provider_id: 'io.molis.work.todo' }, input: { title: ${JSON.stringify(title)}, placement: 'project' } } }) }).then((r) => r.status)`);

  // The page's first look at the conversation makes its owner; at the end, it follows.
  await offer("第一张卡"); await openWork(browser, id);
  await waitFor(`${thread}.dataset.follow === 'following' && ${thread}.textContent.includes('第一张卡')`);
  await waitFor(`${thread}.scrollHeight - ${thread}.scrollTop - ${thread}.clientHeight <= 1`);

  // The person scrolls up: detached at once.
  const box = await evaluate<{ x: number; y: number }>(`(() => { const r = ${thread}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: -400 }, sessionId);
  await waitFor(`${thread}.dataset.follow === 'detached'`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const reading = await evaluate<number>(`${thread}.scrollTop`);

  // News arrives: the reader stays where they are, and the pill says there is more below.
  assert.equal(await offer("第二张卡"), 200);
  await openWork(browser, id);
  await waitFor(`${thread}.textContent.includes('第二张卡')`);
  await waitFor(`document.querySelector('[data-assistant-jump]')?.hidden === false`);
  assert.equal(await evaluate<number>(`${thread}.scrollTop`), reading, "arriving content does not move a reader who scrolled away");

  // The pill: one trip back, following again, and the pill goes.
  await click("[data-assistant-jump]");
  await waitFor(`${thread}.dataset.follow === 'following' && ${thread}.scrollHeight - ${thread}.scrollTop - ${thread}.clientHeight <= 1`);
  await waitFor(`document.querySelector('[data-assistant-jump]').hidden === true`);
});
