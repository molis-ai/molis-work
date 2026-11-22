// Walks the sample with real key presses (CDP key events, not element.focus()), in a throwaway headless Chrome. No Home is touched.
//   python3 -m http.server 4437 --bind 127.0.0.1 --directory docs/design     (in another terminal)
//   node docs/design/rule-stale-reload/keys.mjs
// Prints each step and whether it held; exits 1 if any did not.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kit = await import(pathToFileURL(join(root, "packages/test-kit/dist/browser/index.js")).href);
const profile = mkdtempSync(join(tmpdir(), "rule-stale-keys-"));
const browser = await kit.launchHeadlessChrome({ executable: kit.locateTestChrome(), profileDirectory: profile });
const harness = await kit.ChromeHarness.connect(browser.debuggerUrl, {}, browser);
const page = await harness.page();

const KEYS = {
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
};
const press = async (name, modifiers = 0) => {
  const { text, ...key } = KEYS[name];
  await page.command("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...key, ...(text ? { text } : {}), modifiers });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", ...key, modifiers });
  await new Promise((done) => setTimeout(done, 40));
};
const FOCUS = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { name: "body" };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const style = getComputedStyle(el);
  return { name: (el.getAttribute("aria-label") || el.textContent || el.dataset.act || el.tagName).trim().slice(0, 40), tag: el.tagName, id: el.id,
    seen: Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el))), ring: el.matches(":focus-visible") && (style.outlineStyle !== "none" || style.boxShadow !== "none") };
})()`;
const focus = () => page.evaluate(FOCUS);
const open = async (hash, width = 1440, height = 900) => {
  await page.viewport(width, height, false);
  await page.evaluate(`location.href = "about:blank"`);
  await page.evaluate(`location.href = "http://127.0.0.1:4437/rule-stale-reload/index.html#${hash}&d=plain&l=zh&t=light"`);
  await page.wait(`document.readyState === "complete" && !!document.querySelector("#app > *")`);
  await new Promise((done) => setTimeout(done, 80));
};
let failed = 0;
const check = (title, ok, detail = "") => { if (!ok) failed += 1; process.stdout.write(`${ok ? "ok  " : "FAIL"} ${title}${detail ? `  (${detail})` : ""}\n`); };
const tabTo = async (test, limit = 40, modifiers = 0) => {
  const path = [];
  for (let i = 0; i < limit; i += 1) {
    await press("Tab", modifiers);
    const now = await focus();
    path.push(now);
    if (test(now)) return path;
  }
  return null;
};
const allSeen = (path) => path.filter((step) => step.name !== "body" && !step.seen);
const allRinged = (path) => path.filter((step) => step.name !== "body" && !step.ring);

// --- Rule editor: the collision while typing, reached and answered from the keyboard alone.
await open("h=editor&st=normal");
await page.command("Input.insertText", { text: "再" });
await page.wait(`!!document.querySelector(".cand-band")`);
let now = await focus();
check("editor: the collision does not take focus from the box being typed in", now.tag === "TEXTAREA", now.name);
const typed = await page.evaluate(`document.querySelector("[data-functions-instructions]").value.includes("再")`);
check("editor: what was typed is still in the box", typed);
let path = await tabTo((step) => step.id === "band-primary");
check("editor: Tab reaches 载入最新版", Boolean(path), path ? `${path.length} presses` : "");
if (path) {
  check("editor: every stop on the way is visible", allSeen(path).length === 0, allSeen(path).map((s) => s.name).join(", "));
  check("editor: every stop on the way shows a focus ring", allRinged(path).length === 0, allRinged(path).map((s) => s.name).join(", "));
}
await press("Enter");
await page.wait(`!!document.querySelector(".mw-alert--success.cand-band")`);
now = await focus();
check("editor: after loading, focus is on the first 放回", now.name.startsWith("放回"), now.name);
await press("Space");
now = await focus();
check("editor: Space puts it back, focus stays on the same row's 换回", now.name.startsWith("换回"), now.name);
await press("Enter");
now = await focus();
check("editor: Enter swaps back, focus stays", now.name.startsWith("放回"), now.name);
path = await tabTo((step) => step.tag === "TEXTAREA" || step.tag === "INPUT");
check("editor: Tab moves on from the kept row to the next field", Boolean(path), path?.map((s) => s.name).join(" > "));
await press("Tab", 8);
now = await focus();
check("editor: Shift+Tab comes back", now.tag === "BUTTON", now.name);
await press("Escape");
check("editor: Esc with nothing open changes nothing", await page.evaluate(`!!document.querySelector(".cand-kept") && !document.querySelector("dialog[open]")`));

// --- A blocked publish, and leaving.
await open("h=editor&st=kept");
path = await tabTo((step) => /发布/.test(step.name));
check("editor: Tab reaches 发布 while work is unsaved", Boolean(path), path ? `${path.length} presses` : "");
await press("Enter");
now = await focus();
check("editor: 发布 sends focus to 载入最新版, nothing is published", now.id === "band-primary" && !(await page.evaluate(`!!document.querySelector(".proto-toast")`)), now.name);
await open("h=editor&st=kept");
await page.evaluate(`document.querySelector("[data-functions-back]").focus()`);
await press("Enter");
await page.wait(`!!document.querySelector("dialog[open]")`);
now = await focus();
check("leaving: the dialog opens with focus on 留在这里", now.name === "留在这里", now.name);
const stops = new Set();
for (let i = 0; i < 4; i += 1) { await press("Tab"); const step = await focus(); stops.add(step.name); }
const inside = await page.evaluate(`document.activeElement === document.body || !!document.activeElement.closest("dialog[open]")`);
check("leaving: Tab stays in the dialog", inside, [...stops].join(" | "));
await press("Escape");
await page.wait(`!document.querySelector("dialog[open]")`, { timeoutMs: 1500 });
now = await focus();
check("leaving: Esc closes it, focus back on 载入最新版, band still up", now.id === "band-primary" && (await page.evaluate(`!!document.querySelector(".cand-band")`)), now.name);

// --- The other ways out.
await open("h=editor&st=offline");
path = await tabTo((step) => step.id === "band-primary");
check("offline: Tab reaches 再试一次", Boolean(path), path?.at(-1)?.name);
await press("Enter");
await page.wait(`!!document.querySelector(".mw-alert--success.cand-band")`);
check("offline: Enter retries and loads", true);
await open("h=editor&st=deleted");
path = await tabTo((step) => step.id === "band-primary");
check("deleted: Tab reaches 存成新规则", Boolean(path), path?.at(-1)?.name);
await press("Enter");
await page.wait(`!!document.querySelector(".mw-alert--success.cand-band")`);
check("deleted: Enter keeps it as a new rule, the input is still there", await page.evaluate(`document.querySelector("[data-functions-instructions]").value.length > 0`));

// --- Feed, wide and on a phone: submitting from the keyboard, focus never behind the pinned band.
for (const [width, height, where] of [[1440, 900, "wide"], [390, 844, "phone"]]) {
  await open("h=feed&st=normal", width, height);
  await page.evaluate(`document.querySelector("[data-feed-out-rule-name]").focus()`);
  path = await tabTo((step) => /预览最近消息/.test(step.name));
  check(`feed ${where}: Tab reaches 预览最近消息`, Boolean(path), path ? `${path.length} presses` : "");
  await press("Enter");
  await page.wait(`!!document.querySelector(".cand-band")`);
  now = await focus();
  check(`feed ${where}: the failed submit sends focus to 载入最新版, in view`, now.id === "band-primary" && now.seen, now.name);
  await press("Enter");
  await page.wait(`!!document.querySelector(".mw-alert--success.cand-band")`);
  now = await focus();
  check(`feed ${where}: after loading, focus is on the first 放回, in view`, now.name.startsWith("放回") && now.seen, now.name);
  path = await tabTo((step) => /预览最近消息/.test(step.name));
  check(`feed ${where}: every stop down to 预览最近消息 is in view`, Boolean(path) && allSeen(path).length === 0, path ? allSeen(path).map((s) => s.name).join(", ") : "not reached");
}

process.stdout.write(failed ? `\n${failed} failed\n` : "\nall held\n");
await harness.close?.();
await browser.close();
rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
