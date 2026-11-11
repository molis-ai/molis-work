import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience §composer-mentions「附件身份…新增附件推动邻项让位，移除时邻项收拢」(VUX-16, VUX-18): a file the
// person adds to the Assistant has its own row on the composer's strip from the moment it is added. While it is read the row
// says so and the Send waits; one that cannot be read keeps its name and why on the strip, with 重试 when trying again could
// help, until the person lets it go. The row is the same element through all of it, the others move aside for a new one and
// close up when one goes, and a file let go while it is read does not come back when its late answer arrives.

/** The Host's attachment reads, held until the test answers them: `uploads.answer(name, ok)`. */
const HOLD_UPLOADS = `(() => {
  const real = window.fetch.bind(window), held = new Map();
  window.uploads = {
    names: () => [...held.keys()],
    answer: (name, ok) => { const h = held.get(name); held.delete(name); h(ok); },
  };
  window.fetch = (input, init) => {
    const url = String(input && input.url || input);
    if (!url.endsWith('/api/assistant/attachments')) return real(input, init);
    const { name } = JSON.parse(init.body);
    return new Promise((resolve) => held.set(name, (ok) => resolve(ok
      ? new Response(JSON.stringify({ material: { material_id: 'm-' + name, kind: 'image', title: name, image: { media_type: 'image/png' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ error: '服务暂时读不了', code: 'assistant.attachment_unreadable' }), { status: 503, headers: { 'content-type': 'application/json' } }))));
  };
})()`;

const drop = (files: Array<[string, string]>) => `(() => {
  const data = new DataTransfer();
  for (const [name, type] of ${JSON.stringify(files)}) data.items.add(new File([type.startsWith('image/') ? new Uint8Array([137, 80, 78, 71]) : 'hello'], name, { type }));
  document.querySelector('[data-assistant-composer] .mw-composer__box').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
})()`;

type Row = { text: string; failed: boolean; acts: string[] };

// K3 (UIV-12): the Assistant's files are the unified composer's own strip (one row per file inside the box, the board's upload rows).
// Each file has its row from the moment it is added: being read (and the Send waits), read, or why it cannot go, with × to let it go;
// a failed row holds the Send (greyed) until it is let go — UIC-15: removing it or reading it again frees the Send; a file let go
// while it is read stays gone when its late answer comes. A picture let go can also be added again (重试 in its own row is the next test).
test("VUX-18 UIV-12 UIC-15: an added file has its own row on the composer's strip while it is read, keeps its name and why when it cannot go, and a file let go while it is read stays gone", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__box')", 20_000);
  await evaluate(HOLD_UPLOADS);
  await evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').focus()");
  const rows = () => evaluate<Row[]>(`[...document.querySelectorAll('[data-assistant-composer] .mw-composer__files .mw-upload')].map((row) => ({
    text: row.querySelector(':scope > span:not(.mw-mark)').textContent, failed: Boolean(row.querySelector('small.is-failed')),
    acts: [...row.querySelectorAll('button')].map((button) => button.getAttribute('aria-label') || button.title) }))`);
  const remove = (name: string) => evaluate(`[...document.querySelectorAll('[data-assistant-composer] .mw-composer__files .mw-upload')].find((row) => row.querySelector(':scope > span:not(.mw-mark)').textContent.startsWith(${JSON.stringify(name)})).querySelector('[data-composer-remove]').click()`);
  const sendDisabled = () => evaluate<boolean>("document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
  await command("Input.insertText", { text: "看看这几个文件" }, sessionId);
  assert.equal(await sendDisabled(), false, "words alone can be sent");

  // Three at once: text is read here at once, a picture waits on the Host, an archive cannot go.
  await evaluate(drop([["notes.txt", "text/plain"], ["shot.png", "image/png"], ["bundle.zip", "application/zip"]]));
  await waitFor("uploads.names().includes('shot.png')");
  await waitFor("[...document.querySelectorAll('[data-assistant-composer] .mw-composer__files .mw-upload')].some((row) => row.querySelector(':scope > span:not(.mw-mark)').textContent === 'notes.txt')");
  assert.deepEqual((await rows()).map((row) => [row.text, row.failed]), [
    ["notes.txt", false],
    ["shot.png读取中", false],
    ["bundle.zip暂时只能读取文本文件、PDF 和图片", true],
  ], "each file has its row at once: read, being read, or why it cannot go");
  assert.deepEqual((await rows())[2]!.acts, ["移除 bundle.zip"], "trying an archive again would not help: only × is offered");
  assert.equal(await sendDisabled(), true, "the Send waits while a file is still being read");

  // The Host cannot read the picture: its name and the Host's reason stay on its row.
  await evaluate("uploads.answer('shot.png', false)");
  await waitFor("[...document.querySelectorAll('[data-assistant-composer] .mw-composer__files small.is-failed')].length === 2");
  assert.match((await rows())[1]!.text, /^shot\.png服务暂时读不了/, "the failure keeps the name and the Host's reason on the strip");
  assert.equal(await sendDisabled(), true, "a row that cannot go holds the Send until it is let go");

  // Let go of it and add it again, and this time it is read.
  await remove("shot.png");
  await evaluate(drop([["shot.png", "image/png"]]));
  await waitFor("uploads.names().includes('shot.png')");
  await evaluate("uploads.answer('shot.png', true)");
  await waitFor("[...document.querySelectorAll('[data-assistant-composer] .mw-composer__files .mw-upload')].some((row) => row.querySelector(':scope > span:not(.mw-mark)').textContent === 'shot.png')");
  await remove("bundle.zip");
  assert.deepEqual((await rows()).map((row) => row.text), ["notes.txt", "shot.png"]);
  assert.equal(await sendDisabled(), false, "with every row read, the Send can go");

  // A file let go of while it is read stays gone when its late answer arrives.
  await evaluate(drop([["late.png", "image/png"]]));
  await waitFor("uploads.names().includes('late.png')");
  assert.deepEqual((await rows()).at(-1), { text: "late.png读取中", failed: false, acts: ["移除 late.png"] });
  await remove("late.png");
  assert.equal(await sendDisabled(), false, "letting go of it frees the Send");
  await evaluate("uploads.answer('late.png', true)");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await rows()).map((row) => row.text), ["notes.txt", "shot.png"], "its late answer does not bring it back");
});

// The island's chip test, kept by intent on the composer's strip (K3): 重试 on a failed file, the picture's thumbnail, one row kept
// through its states, and the neighbours easing aside and closing up. Where the composer's design differs it is said at the line:
// the rows are the board's upload rows, one under another inside the box (the box grows upward, so the rows above a gap come down into it, not across), each
// named by `data-composer-file`; their names and buttons are the composer's ("移除 …", "重试 …"); and a failed row holds the Send
// until it is retried or let go (K2's rule, UIV-12; UIC-15: the failed row greys the Send, and 重试 through to read or × frees it),
// where the island's strip let the Send go without it.
type Chip = { key: string; text: string; state: string; busy: boolean; acts: string[] };

test("VUX-18 UIC-15: an added file has its own row while it is read, keeps its failure and 重试 on the strip, and its neighbours move aside and close up", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__box') && typeof window.molisReflow === 'function'", 20_000);
  // Product pages hold motion still under automation; the neighbours' moves are what is checked here.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await evaluate(HOLD_UPLOADS);
  await evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').focus()");
  const ROWS = "[data-assistant-composer] .mw-composer__files .mw-upload";
  const chips = () => evaluate<Chip[]>(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].map((row) => ({
    key: row.dataset.composerFile, text: row.querySelector(':scope > span:not(.mw-mark)').textContent, state: ['is-reading', 'is-failed'].find((name) => row.classList.contains(name)) || '',
    busy: row.getAttribute('aria-busy') === 'true', acts: [...row.querySelectorAll('button')].map((button) => button.getAttribute('aria-label') || button.title) }))`);
  const byKey = (key: string) => `document.querySelector('[data-composer-file="' + CSS.escape(${JSON.stringify(key)}) + '"]')`;
  const sendDisabled = () => evaluate<boolean>("document.querySelector('[data-assistant-composer] [data-composer-send]').disabled");
  await command("Input.insertText", { text: "看看这几个文件" }, sessionId);
  assert.equal(await sendDisabled(), false, "words alone can be sent");

  // Three at once: text is read here at once, a picture waits on the Host, an archive cannot go.
  await evaluate(drop([["notes.txt", "text/plain"], ["shot.png", "image/png"], ["bundle.zip", "application/zip"]]));
  await waitFor("uploads.names().includes('shot.png')");
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].some((row) => row.textContent.includes('notes.txt') && !row.classList.contains('is-reading'))`);
  let now = await chips();
  // The composer's row says 读取中 after the name (its `reading` label), where the island's chip said 图片：.
  assert.deepEqual(now.map((chip) => [chip.text, chip.state, chip.busy]), [
    ["notes.txt", "", false],
    ["shot.png读取中", "is-reading", true],
    ["bundle.zip暂时只能读取文本文件、PDF 和图片", "is-failed", false],
  ], "each file has its row at once: read, being read, or why it cannot go");
  assert.deepEqual(now[2]!.acts, ["移除 bundle.zip"], "trying an archive again would not help: only × is offered");
  assert.equal(await sendDisabled(), true, "the Send waits while a file is still being read");
  await evaluate(`window.shotChip = ${byKey(now[1]!.key)}`);

  // The Host cannot read the picture: its name and why stay, with 重试.
  await evaluate("uploads.answer('shot.png', false)");
  await waitFor("shotChip.classList.contains('is-failed')");
  now = await chips();
  assert.match(now[1]!.text, /shot\.png服务暂时读不了/, "the failure keeps the name and the Host's reason on the strip");
  assert.deepEqual(now[1]!.acts, ["重试 shot.png", "移除 shot.png"], "重试 and × on the failed row");
  // Differs from the island: a row that cannot go holds the Send until it is retried or let go (the composer's rule).
  assert.equal(await sendDisabled(), true, "a failed file holds the Send");
  assert.equal(await evaluate(`${byKey(now[1]!.key)} === shotChip`), true, "the same row, not a new one");

  // Retry, and this time it is read: the same row turns into the picture, with its thumbnail.
  await evaluate("shotChip.querySelector('[data-composer-retry]').focus(); shotChip.querySelector('[data-composer-retry]').click()");
  await waitFor("shotChip.classList.contains('is-reading') && uploads.names().includes('shot.png')");
  assert.equal(await evaluate("document.activeElement === shotChip.querySelector('[data-composer-remove]')"), true, "focus stays on the row, on its × while it is read again");
  await evaluate("uploads.answer('shot.png', true)");
  await waitFor("!shotChip.classList.contains('is-reading') && !shotChip.classList.contains('is-failed')");
  assert.equal(await evaluate("shotChip.isConnected && !!shotChip.querySelector('img.mw-composer__thumb')"), true, "the row that was being read is the picture now, in the same element");
  assert.deepEqual((await chips()).map((chip) => chip.key), now.map((chip) => chip.key), "every row kept its place");

  // Letting go of a row: its neighbours close up from where they were. Differs from the island's strip, which ran left to right:
  // the composer stands on the bar and grows upward, so letting go of the last row brings the rows above it down into the gap.
  // Click and look in one go: under load the 250 ms move could be over before a second call looks.
  const moved = await evaluate<{ before: number; animating: boolean; top: number; settled: number }>(`(() => {
    const before = shotChip.getBoundingClientRect().top;
    ${byKey(now[2]!.key)}.querySelector('[data-composer-remove]').click();
    const motions = shotChip.getAnimations().filter((a) => a.id === 'mw-reflow'), top = shotChip.getBoundingClientRect().top;
    motions.forEach((a) => a.finish());
    return { before, animating: motions.length > 0, top, settled: shotChip.getBoundingClientRect().top };
  })()`);
  assert.equal(moved.animating, true, "the neighbour eases into the gap");
  assert.ok(Math.abs(moved.top - moved.before) < 2, "it starts where it was seen, so it does not jump");
  assert.ok(moved.settled > moved.top + 20, "and ends where the gap was");
  assert.deepEqual((await chips()).map((chip) => chip.text), ["notes.txt", "shot.png"]);
  assert.equal(await sendDisabled(), false, "with every row read, the Send can go");

  // A new row grows in and the rows above make room; one let go of while it is read stays gone when its late answer arrives.
  const grew = await evaluate<{ grows: boolean; aside: boolean }>(`(() => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'late.png', { type: 'image/png' }));
    document.querySelector('[data-assistant-composer] .mw-composer__box').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    const row = [...document.querySelectorAll(${JSON.stringify(ROWS)})].at(-1), easing = (node) => node.getAnimations().some((a) => a.id === 'mw-reflow');
    return { grows: easing(row), aside: easing(shotChip) };
  })()`);
  assert.deepEqual(grew, { grows: true, aside: true }, "a new row grows in and its neighbours move aside");
  await waitFor("uploads.names().includes('late.png')");
  const late = (await chips()).find((chip) => chip.text.includes("late.png"))!;
  assert.equal(late.state, "is-reading");
  await evaluate(`${byKey(late.key)}.querySelector('[data-composer-remove]').click()`);
  assert.equal(await sendDisabled(), false, "letting go of it frees the Send");
  await evaluate("uploads.answer('late.png', true)");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await chips()).map((chip) => chip.text), ["notes.txt", "shot.png"], "its late answer does not bring it back");
});
