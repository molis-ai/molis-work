import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience §composer-mentions「附件身份…新增附件推动邻项让位，移除时邻项收拢」(VUX-16, VUX-18): a file the
// person adds to the Assistant has its own chip on the context strip from the moment it is added. While it is read the chip
// says so and the Send waits; one that cannot be read keeps its name and why on the strip, with 重试 when trying again could
// help, until the person lets it go. The chip is the same element through all of it, the others move aside for a new one and
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
  document.querySelector('[data-assistant-composer]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
})()`;

type Chip = { key: string; text: string; state: string; busy: boolean; acts: string[] };

test("VUX-18: an added file has its own chip while it is read, keeps its failure and retry on the strip, and its neighbours move aside and close up", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] [data-assistant-input]') && typeof window.molisReflow === 'function'", 20_000);
  // Product pages hold motion still under automation; the neighbours' moves are what is checked here.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await evaluate(HOLD_UPLOADS);
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  const chips = () => evaluate<Chip[]>(`[...document.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')].filter((chip) => chip.dataset.stripKey.startsWith('file:')).map((chip) => ({
    key: chip.dataset.stripKey, text: chip.textContent, state: ['is-reading', 'is-failed'].find((name) => chip.classList.contains(name)) || '',
    busy: chip.getAttribute('aria-busy') === 'true', acts: [...chip.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')) }))`);
  const sendDisabled = () => evaluate<boolean>("document.querySelector('[data-assistant-send]').disabled");
  await command("Input.insertText", { text: "看看这几个文件" }, sessionId);
  assert.equal(await sendDisabled(), false, "words alone can be sent");

  // Three at once: text is read here at once, a picture waits on the Host, an archive cannot go.
  await evaluate(drop([["notes.txt", "text/plain"], ["shot.png", "image/png"], ["bundle.zip", "application/zip"]]));
  await waitFor("uploads.names().includes('shot.png')");
  await waitFor("[...document.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')].some((chip) => chip.textContent.includes('notes.txt') && !chip.classList.contains('is-reading'))");
  let now = await chips();
  assert.deepEqual(now.map((chip) => [chip.text.replace(/[×↻]/g, ""), chip.state, chip.busy]), [
    ["notes.txt", "", false],
    ["图片：shot.png读取中", "is-reading", true],
    ["bundle.zip暂时只能读取文本文件、PDF 和图片", "is-failed", false],
  ], "each file has its chip at once: read, being read, or why it cannot go");
  assert.deepEqual(now[2]!.acts, ["不带上：bundle.zip"], "trying an archive again would not help: only × is offered");
  assert.equal(await sendDisabled(), true, "the Send waits while a file is still being read");
  await evaluate("window.shotChip = document.querySelector('[data-strip-key=\"' + CSS.escape(" + JSON.stringify(now[1]!.key) + ") + '\"]')");

  // The Host cannot read the picture: its name and why stay, with 重试, and the Send can go without it.
  await evaluate("uploads.answer('shot.png', false)");
  await waitFor("shotChip.classList.contains('is-failed')");
  now = await chips();
  assert.match(now[1]!.text, /shot\.png服务暂时读不了/, "the failure keeps the name and the Host's reason on the strip");
  assert.deepEqual(now[1]!.acts, ["重试：图片：shot.png", "不带上：图片：shot.png"], "重试 and × on the failed chip");
  assert.equal(await sendDisabled(), false, "a failed file does not hold the Send");
  assert.equal(await evaluate("document.querySelector('[data-strip-key=\"' + CSS.escape(" + JSON.stringify(now[1]!.key) + ") + '\"]') === shotChip"), true, "the same chip, not a new one");

  // Retry, and this time it is read: the same chip turns into the picture, with its thumbnail.
  await evaluate("shotChip.querySelector('button[aria-label^=\"重试\"]').click()");
  await waitFor("shotChip.classList.contains('is-reading') && uploads.names().includes('shot.png')");
  await evaluate("uploads.answer('shot.png', true)");
  await waitFor("!shotChip.classList.contains('is-reading') && !shotChip.classList.contains('is-failed')");
  assert.equal(await evaluate("shotChip.isConnected && !!shotChip.querySelector('img.assistant-strip-thumb')"), true, "the chip that was being read is the picture now, in the same element");
  assert.deepEqual((await chips()).map((chip) => chip.key), now.map((chip) => chip.key), "every chip kept its place");

  // Letting go of the first: the others close up from where they were.
  // Click and look in one go: under load the 250 ms move could be over before a second call looks.
  const moved = await evaluate<{ before: number; animating: boolean; left: number; settled: number }>(`(() => {
    const before = shotChip.getBoundingClientRect().left;
    document.querySelector('[data-strip-key="' + CSS.escape(${JSON.stringify(now[0]!.key)}) + '"] button').click();
    const motions = shotChip.getAnimations().filter((a) => a.id === 'mw-reflow'), left = shotChip.getBoundingClientRect().left;
    motions.forEach((a) => a.finish());
    return { before, animating: motions.length > 0, left, settled: shotChip.getBoundingClientRect().left };
  })()`);
  assert.equal(moved.animating, true, "the neighbour eases into the gap");
  assert.ok(Math.abs(moved.left - moved.before) < 2, "it starts where it was seen, so it does not jump");
  assert.ok(moved.settled < moved.left - 20, "and ends where the gap was");
  assert.deepEqual((await chips()).map((chip) => chip.text.replace(/[×↻]/g, "")), ["图片：shot.png", "bundle.zip暂时只能读取文本文件、PDF 和图片"]);

  // A file let go of while it is read stays gone when its late answer arrives.
  await evaluate(drop([["late.png", "image/png"]]));
  await waitFor("uploads.names().includes('late.png')");
  const late = (await chips()).find((chip) => chip.text.includes("late.png"))!;
  assert.equal(late.state, "is-reading");
  await evaluate(`document.querySelector('[data-strip-key="' + CSS.escape(${JSON.stringify(late.key)}) + '"] button').click()`);
  assert.equal(await sendDisabled(), false, "letting go of it frees the Send");
  await evaluate("uploads.answer('late.png', true)");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await chips()).map((chip) => chip.text.replace(/[×↻]/g, "")), ["图片：shot.png", "bundle.zip暂时只能读取文本文件、PDF 和图片"], "its late answer does not bring it back");
});
