import assert from "node:assert/strict";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// One 🟢 (U+1F7E2) is one character and two UTF-16 units. The Images page shows the first 40 characters of a prompt in the file name of a result
// and in the Shelf receipt, and the first 80 in the Assistant's context. Cut by units, a prompt whose unit 40 (or 80) is the first half of such a
// character kept half of it, and encodeURIComponent on the file name threw, so the result was never drawn. The prompts are typed into the real
// page, the provider is a local server that always answers with one PNG, and everything is read back from the page, the saved file and the receipt.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const wide = "🟢";

type Seen = { figures: number; prompt: string | null; name: string | null; hrefName: string | null; notes: string[] };

/** The Images page in a real browser with a local image service saved. `generate` types a prompt, generates, and waits for the finished result. */
async function openImages(t: TestContext) {
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain the real provider request */ }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => { provider.closeAllConnections(); return new Promise<void>(resolve => provider.close(() => resolve())); });
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click("[data-images-new]");
  await click("[data-images-connections]");
  await waitFor("document.querySelector('[data-images-dialog]').open");
  await click('[data-images-preset="custom"]');
  await evaluate(`(() => {
    document.querySelector('[data-images-connection-name]').value = '整字截取验证';
    document.querySelector('[data-images-connection-url]').value = 'http://127.0.0.1:${address.port}/v1';
    document.querySelector('[data-images-connection-model]').value = 'fixture-image';
  })()`);
  await click("[data-images-save-connection]");
  await waitFor("(document.querySelector('[data-images-saved-connections]')?.textContent || '').includes('整字截取验证')");
  await waitFor("!document.querySelector('[data-images-dialog]').open");
  return {
    async generate(prompt: string) {
      await click("[data-images-new]");
      await evaluate(`(() => {const e=document.querySelector('[data-images-prompt]');e.value=${JSON.stringify(prompt)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await waitFor("!document.querySelector('[data-images-generate]').disabled");
      await click("[data-images-generate]");
      // "New" hid the earlier result: it is shown again, with a finished status, only for this job.
      await waitFor("!document.querySelector('[data-images-result]').hidden && document.querySelector('[data-images-result] h2[data-mw-state=done]')", 15_000);
    },
    /** What the result area holds and says, as a person would see it. `name` is the link's download name, `hrefName` the one in its address. */
    seen: () => evaluate<Seen>(`(() => {
      const result = document.querySelector('[data-images-result]');
      const link = result.querySelector('a[download]');
      const shown = ['[data-images-note]', '[data-images-list-note]'].map(selector => document.querySelector(selector)).filter(node => node && !node.hidden && node.textContent.trim());
      return {
        figures: result.querySelectorAll('figure').length,
        prompt: result.querySelector('.images-result-prompt')?.textContent ?? null,
        name: link ? link.download : null,
        hrefName: link ? new URL(link.getAttribute('href'), 'http://localhost').searchParams.get('name') : null,
        notes: shown.map(node => node.textContent.trim()),
      };
    })()`),
    /** Click the download link for real, then read what Chrome saved, by file name. */
    async saved() {
      const folder = join(homeDirectory, "image-downloads");
      await mkdir(folder, { recursive: true });
      await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: folder });
      await click("[data-images-result] a[download]");
      const deadline = Date.now() + 8000;
      let names: string[] = [];
      while (Date.now() < deadline) {
        names = (await readdir(folder)).filter(name => !name.endsWith(".crdownload"));
        if (names.length) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return Promise.all(names.map(async name => ({ name, bytes: await readFile(join(folder, name)) })));
    },
    /** Click "put in Shelf" and wait for the receipt the page hands the workbench (or for the page to say it failed). */
    async keepInShelf() {
      await evaluate("(() => { window.__placed = null; window.addEventListener('molis:placement-result', event => { window.__placed = event.detail; }, { once: true }); })()");
      await click("[data-images-result] figcaption button");
      await waitFor("window.__placed || (!document.querySelector('[data-images-note]').hidden && document.querySelector('[data-images-note]').textContent)", 15_000);
      return evaluate<{ placed: { title: string; note: string } | null; error: string }>(
        "({ placed: window.__placed ? { title: window.__placed.title, note: window.__placed.note } : null, error: document.querySelector('[data-images-note]').textContent })");
    },
    /** The object the page tells the Assistant about: its kind, whether its title is whole characters, how many it has, and the title. */
    contextObject: () => evaluate<{ kind: string; whole: boolean; characters: number; title: string }>(`(() => {
      const whole = text => { try { encodeURIComponent(text); return true; } catch { return false; } };
      const object = JSON.parse(document.querySelector('[data-images=workbench]').getAttribute('data-assistant-context')).object;
      return { kind: object.kind, whole: whole(object.title), characters: [...object.title].length, title: object.title };
    })()`),
  };
}

test("RAC-1995 RAC-1996: a prompt whose 40th character is a 🟢 still draws its result, and the download link and the saved file carry that whole character", { timeout: 150_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  // The 40th character is a 🟢: its two units are indexes 39 and 40, so slice(0, 40) ends on its first half.
  const prompt = "a".repeat(39) + wide + "bcd", head = "a".repeat(39) + wide;
  await images.generate(prompt);
  const drawn = await images.seen();
  assert.deepEqual({ figures: drawn.figures, prompt: drawn.prompt, notes: drawn.notes }, { figures: 1, prompt, notes: [] },
    "RAC-1995: the result is drawn (one picture, the prompt, no note under it) although the file name would have ended on half of a 🟢");
  assert.deepEqual({ name: drawn.name, hrefName: drawn.hrefName }, { name: head + ".png", hrefName: head + ".png" },
    "RAC-1996: the link's download name and the name in its address are the first 40 whole characters");
  const saved = await images.saved();
  assert.deepEqual(saved.map(file => file.name), [head + ".png"], "RAC-1996: Chrome saved one file, under that name");
  assert.deepEqual(saved[0]!.bytes, Buffer.from(PNG, "base64"), "RAC-1996: and it holds the picture");
});

test("RAC-1997: the Shelf receipt names the prompt by its first 40 whole characters, counted on the prompt as it was written", { timeout: 150_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  // Written with a run of 8 spaces: the page squeezes it to one space for the file name, which then needs no cut at all, but the receipt takes the
  // prompt as written, and there the 40th character is a 🟢 (indexes 39 and 40).
  const prompt = "a".repeat(29) + " ".repeat(8) + "bb" + wide + "tail", head = "a".repeat(29) + " ".repeat(8) + "bb" + wide;
  const name = "a".repeat(29) + " bb" + wide + "tail.png";
  await images.generate(prompt);
  const drawn = await images.seen();
  assert.deepEqual({ figures: drawn.figures, name: drawn.name, notes: drawn.notes }, { figures: 1, name, notes: [] },
    "the result draws on its own, and its file name is made from the squeezed prompt (this holds before the change too)");
  const kept = await images.keepInShelf();
  assert.ok(kept.placed, `Shelf took the copy (the page says: ${kept.error})`);
  assert.ok(kept.placed.note.includes(head + " · "), `RAC-1997: the receipt names the prompt by its first 40 whole characters: ${JSON.stringify(kept.placed.note)}`);
  assert.equal(kept.placed.title, name, "the copy in Shelf is named as the download is (this holds before the change too)");
});

test("RAC-1998: the object the Assistant is told about is titled by the first 80 whole characters of the prompt", { timeout: 150_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  // The 80th character is a 🟢 (indexes 79 and 80); the file name is cut at 40 characters, well before it.
  const prompt = "d".repeat(79) + wide + "tail";
  await images.generate(prompt);
  const object = await images.contextObject();
  assert.deepEqual({ kind: object.kind, whole: object.whole, characters: object.characters }, { kind: "image_job", whole: true, characters: 80 },
    "RAC-1998: the title is 80 characters and none of them is half of a pair");
  assert.equal(object.title, "d".repeat(79) + wide, "RAC-1998: it is the start of the prompt, with the 🟢 whole");
  const drawn = await images.seen();
  assert.deepEqual({ figures: drawn.figures, name: drawn.name }, { figures: 1, name: "d".repeat(40) + ".png" }, "the file name is cut at 40 characters, as before");
});

test("RAC-1999: names that fit, or are cut between two characters, or lose forbidden characters, are exactly what they were", { timeout: 150_000 }, async t => {
  const images = await openImages(t); if (!images) return;
  const cases: [prompt: string, name: string][] = [
    ["b".repeat(38) + wide, "b".repeat(38) + wide + ".png"], // 40 units, 39 characters: fits, the 🟢 stays
    ["c".repeat(40) + wide, "c".repeat(40) + ".png"], // the 41st character is cut, and it is cut whole
    ["清晨的书桌 / 咖啡: 暖色调?", "清晨的书桌 咖啡 暖色调.png"], // forbidden characters and runs of spaces become one space, the ends are trimmed
  ];
  for (const [prompt, name] of cases) {
    await images.generate(prompt);
    const drawn = await images.seen();
    assert.deepEqual({ figures: drawn.figures, prompt: drawn.prompt, name: drawn.name, hrefName: drawn.hrefName, notes: drawn.notes }, { figures: 1, prompt, name, hrefName: name, notes: [] },
      `RAC-1999: ${JSON.stringify(prompt)}`);
  }
});
