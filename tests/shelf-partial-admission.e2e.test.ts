import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// specs/visual-ui-experience VUX-12 「部分成功…反馈准确可恢复」: several files put on the Shelf at once, one of which the Host refuses.
// Before, the first refusal stopped the loop (the files after it were never tried) and the page showed only the Host's sentence, naming
// no file and not saying that the files before it were already on the Shelf. Now every file is tried, the page says how many went in,
// which did not and why, and one button asks again for just those.
const files = ["first.md", "second.md", "third.md"];
const dropped = `(() => {
  const dt = new DataTransfer();
  for (const name of ${JSON.stringify(files)}) dt.items.add(new File(["# " + name + "\\n"], name, { type: "text/markdown" }));
  document.querySelector("[data-shelf=workbench]").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
})()`;

test("VUX-12: files dropped on the Shelf together say which went in and which did not, and the refused one can be tried again alone", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, on } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "shelf");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/side/shelf/side` }, sessionId));
  await waitFor("document.querySelector('[data-shelf-stage-shell]')", 15_000);
  const asked: string[] = [];
  let refusing = true;
  t.after(on("Fetch.requestPaused", async (event, session) => {
    if (session !== sessionId) return;
    const request = event.request as { url: string; method: string; postData?: string };
    const requestId = String(event.requestId);
    if (request.method === "POST" && request.url.endsWith("/io.molis.work.shelf/items")) {
      const name = /"filename":"([^"]+)"/u.exec(request.postData ?? "")?.[1] ?? "";
      asked.push(name);
      if (refusing && name === "second.md") {
        await command("Fetch.fulfillRequest", { requestId, responseCode: 413, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from(JSON.stringify({ error: "文件太大", code: "files.too_large" })).toString("base64") }, sessionId);
        return;
      }
    }
    await command("Fetch.continueRequest", { requestId }, sessionId).catch(() => undefined);
  }));
  await command("Fetch.enable", { patterns: [{ urlPattern: "*/io.molis.work.shelf/items", requestStage: "Request" }] }, sessionId);
  t.after(() => command("Fetch.disable", {}, sessionId).catch(() => undefined));
  const names = () => evaluate<string[]>(`[...document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]')].map((row) => row.dataset.shelfName)`);

  // The command bar is drawn by the client's first load: after it, the page listens for drops.
  await waitFor("document.querySelector('[data-shelf-bar]')?.children.length > 0", 15_000);
  await evaluate(dropped);
  await waitFor(`document.querySelector('[data-shelf-bar-hint]')?.checkVisibility() && document.querySelector('[data-shelf-retry-admit]')`, 15_000);

  assert.deepEqual(asked, files, "VUX-12: every file is tried; the refusal of the second does not stop the third");
  const said = await evaluate<string>(`document.querySelector('[data-shelf-bar-hint]').textContent`);
  assert.ok(said.includes("已加入 2 个") && said.includes("second.md") && said.includes("文件太大"), `VUX-12: how many went in, which did not and why (${said})`);
  assert.ok(!said.includes("first.md") && !said.includes("third.md"), "the files that went in are not listed as failures");
  const listed = await names();
  assert.ok(listed.includes("first.md") && listed.includes("third.md") && !listed.includes("second.md"), `the two that went in are on the Shelf, the refused one is not (${listed})`);

  refusing = false;
  asked.length = 0;
  await click("[data-shelf-retry-admit]");
  await waitFor(`[...document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]')].some((row) => row.dataset.shelfName === 'second.md')`, 15_000);
  assert.deepEqual(asked, ["second.md"], "VUX-12: asking again sends only the file that did not go in");
  await waitFor(`!document.querySelector('[data-shelf-retry-admit]')`, 5_000);
});
