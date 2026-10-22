import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OVERFLOW_FADE_CLIENT_SCRIPT, OVERFLOW_FADE_SAMPLES, OVERFLOW_FADE_STYLES, OVERFLOW_FADE_WIDTH, overflowSides } from "@molis-ai/molis-work-design-system";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";

// The overflow fade (specs/visual-ui-experience §overflow-fade): the shipped stylesheet and sensor, on real scrollers.
test("VUX-27 the sensor names only the sides that really have more, with 1px rounding", () => {
  assert.equal(overflowSides(0, 0), "");
  assert.equal(overflowSides(0, 1), "", "a pixel of rounding is not overflow");
  assert.equal(overflowSides(0, 200), "end");
  assert.equal(overflowSides(1, 200), "end");
  assert.equal(overflowSides(80, 200), "both");
  assert.equal(overflowSides(199, 200), "start");
  assert.equal(OVERFLOW_FADE_WIDTH, 28);
  assert.deepEqual(OVERFLOW_FADE_SAMPLES, [[0, 0], [.15, .05], [.3, .15], [.45, .3], [.6, .5], [.75, .7], [.87, .85], [1, 1]], "the specimen's eight samples");
});

test("VUX-27 a strip fades only where it has more, clears at each edge, follows content, size and direction, and keeps focus clear", { timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "overflow-fade-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  t.after(async () => { await browser.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.page();
  await page.viewport(800, 400);
  const chips = (count: number) => Array.from({ length: count }, (_, i) => `<button style="flex:none;width:90px;height:28px">项 ${i + 1}</button>`).join("");
  await page.evaluate(`(() => {
    const style = document.createElement("style");
    style.textContent = ${JSON.stringify(OVERFLOW_FADE_STYLES)} + ".row{display:flex;gap:4px;width:300px;overflow-x:auto;scrollbar-width:none}";
    document.head.append(style);
    document.body.innerHTML = '<div class="row" id="ltr" data-overflow-fade>${chips(8)}</div><div class="row" id="rtl" dir="rtl" data-overflow-fade>${chips(8)}</div><div class="row" id="fits" data-overflow-fade>${chips(2)}</div>';
    ${OVERFLOW_FADE_CLIENT_SCRIPT}
  })()`);
  const more = (id: string) => `(document.getElementById(${JSON.stringify(id)}).dataset.more ?? "")`;
  const fade = (id: string) => page.evaluate<{ mask: string; start: string; end: string }>(`(() => { const s = getComputedStyle(document.getElementById(${JSON.stringify(id)}));
    return { mask: s.maskImage, start: s.getPropertyValue("--mw-fs").trim(), end: s.getPropertyValue("--mw-fe").trim() }; })()`);
  const scrollTo = (id: string, left: number) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).scrollLeft = ${left}`);

  // At rest nothing that fits is masked; a strip with more fades only its far side, over 28px with the eight samples.
  await page.wait(`${more("ltr")} === "end" && ${more("rtl")} === "end"`);
  assert.equal(await page.evaluate(more("fits")), "");
  assert.equal((await fade("fits")).mask, "none", "a strip that fits stays clear on both sides");
  let ltr = await fade("ltr");
  assert.deepEqual([ltr.start, ltr.end], ["0px", "28px"]);
  assert.match(ltr.mask, /^linear-gradient\(to right/);
  for (const [at, alpha] of OVERFLOW_FADE_SAMPLES.slice(1, -1)) {
    const inset = +(OVERFLOW_FADE_WIDTH * at).toFixed(2);
    assert.ok(ltr.mask.includes(`rgba(0, 0, 0, ${alpha}) calc(100% - ${inset}px)`), `sample ${at}/${alpha} sits ${inset}px from the end`);
  }

  // Scrolled into the middle both sides fade; touching the end clears that side.
  await scrollTo("ltr", 150);
  await page.wait(`${more("ltr")} === "both"`);
  ltr = await fade("ltr");
  assert.deepEqual([ltr.start, ltr.end], ["28px", "28px"]);
  await scrollTo("ltr", 10_000);
  await page.wait(`${more("ltr")} === "start"`);
  assert.equal((await fade("ltr")).end, "0px", "the side that reached its edge is clear");

  // Right to left: the scroll position is normalised, and the feather runs from the left.
  assert.match((await fade("rtl")).mask, /^linear-gradient\(to left/);
  await scrollTo("rtl", -10_000);
  await page.wait(`${more("rtl")} === "start"`);

  // Content and size changes are seen without a scroll: fewer chips clear the fade, a narrower box brings it back.
  await page.evaluate(`document.getElementById("ltr").replaceChildren(...[...document.getElementById("ltr").children].slice(0, 2))`);
  await page.wait(`${more("ltr")} === ""`);
  assert.equal((await fade("ltr")).mask, "none");
  await page.evaluate(`document.getElementById("fits").style.width = "120px"`);
  await page.wait(`${more("fits")} === "end"`);

  // A child hidden or shown by the page, without a click or a box resize, is measured too.
  await page.evaluate(`(() => { const child = document.getElementById("fits").firstElementChild; child.id = "fits-hidden"; child.hidden = true; })()`);
  await page.wait(`${more("fits")} === ""`);
  await page.evaluate(`document.getElementById("fits-hidden").hidden = false`);
  await page.wait(`${more("fits")} === "end"`);

  // A box that does not scroll is never masked, however wide its content: the mask would cut off what it lets show.
  await page.evaluate(`(() => { const row = document.getElementById("fits"); row.style.overflowX = "visible"; row.append(...${JSON.stringify(chips(6))}.split("</button>").filter(Boolean).map((html) => { const t = document.createElement("template"); t.innerHTML = html + "</button>"; return t.content; })); })()`);
  await page.wait(`${more("fits")} === "" && document.getElementById("fits").scrollWidth > 400`);
  await page.evaluate(`document.getElementById("fits").style.overflowX = ""`);
  await page.wait(`${more("fits")} === "end"`);

  // A change of writing direction is seen too: the feather moves to the other side.
  await page.evaluate(`document.getElementById("fits").dir = "rtl"`);
  await page.wait(`getComputedStyle(document.getElementById("fits")).maskImage.startsWith("linear-gradient(to left")`);

  // A chip reached by keyboard comes to rest clear of the feather, not under it.
  await scrollTo("rtl", 0);
  await page.evaluate(`document.querySelectorAll("#rtl button")[3].focus()`);
  await page.wait(`(() => { const row = document.getElementById("rtl").getBoundingClientRect(), box = document.activeElement.getBoundingClientRect();
    return box.left >= row.left + 27 && box.right <= row.right - 27; })()`);

  // Forced colours: no mask; the strip shows its own scrollbar instead.
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
  await page.wait(`getComputedStyle(document.getElementById("fits")).maskImage === "none" && getComputedStyle(document.getElementById("fits")).scrollbarWidth === "thin"`);
});
