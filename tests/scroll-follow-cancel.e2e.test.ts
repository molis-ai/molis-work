import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { SCROLL_FOLLOW_CLIENT_SCRIPT, FOLLOW_COOLDOWN_MS } from "@molis-ai/molis-work-design-system";

test("D0025 scrollbar cancellation, lost capture and window blur release following", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); if (!executable) { t.skip("Chrome is unavailable"); return; }
  const directory = await mkdtemp(join(tmpdir(), "follow-cancel-"));
  const browser = await ChromeHarness.start(directory, { executable });
  t.after(async () => { await browser.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.page();
  await page.evaluate(`document.body.innerHTML='<div id="thread" style="height:200px;overflow:auto"></div>'; const s=document.createElement('script');s.textContent=${JSON.stringify(SCROLL_FOLLOW_CLIENT_SCRIPT)};document.body.append(s)`);
  for (const event of ["pointercancel", "lostpointercapture", "blur"]) {
    await page.evaluate(`(() => { const box=document.querySelector('#thread');window.follow?.dispose();box.innerHTML='<p style="height:600px">Original</p>';box.scrollTop=box.scrollHeight;window.follow=molisFollow(box);
      box.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
      const more=document.createElement('p');more.style.height='400px';more.textContent='New';box.append(more);follow.pin();
    })()`);
    assert.ok(await page.evaluate<number>("thread.scrollHeight-thread.scrollTop-thread.clientHeight") > 100, "holding delays the programmatic pin");
    await page.evaluate(event === "blur" ? "window.dispatchEvent(new Event('blur'))" : `thread.dispatchEvent(new PointerEvent(${JSON.stringify(event)},{bubbles:true,pointerId:1}))`);
    await page.evaluate(`new Promise(resolve=>setTimeout(resolve,${FOLLOW_COOLDOWN_MS + 80}))`);
    await page.wait("thread.scrollHeight-thread.scrollTop-thread.clientHeight<=1");
    assert.equal(await page.evaluate("thread.dataset.follow"), "following", event);
  }
});
