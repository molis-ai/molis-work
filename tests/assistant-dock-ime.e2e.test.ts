import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/** Capture the fixture's real registered after hook so both successful deletion and a real permission refusal can be observed. */
function fixtureCleanup(t: TestContext) {
  let callback: (() => void | Promise<void>) | undefined;
  const context = new Proxy(t, { get(target, key) {
    if (key === "after") return (hook: () => void | Promise<void>) => { callback = hook; };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { context, async close() { if (callback) await callback(); } };
}

// AC27: typing Chinese through an input method, the Enter that commits a candidate is the IME's, never a Send.
test("底栏：输入法组合中按回车只确认候选、不发送；组合结束后回车才发送", { timeout: 60_000 }, async t => {
  const cleanup = fixtureCleanup(t);
  let homeDirectory: string | undefined;
  t.after(async () => {
    await cleanup.close();
    // BROWSER-CLEAN-01: this existing Linux product-smoke entry proves its actual temporary Home was removed.
    if (homeDirectory) assert.equal(existsSync(homeDirectory), false, "the browser fixture must remove its own Home after closing");
  });
  const browser = await openGoalBrowser(cleanup.context, "seeded");
  if (!browser) return;
  homeDirectory = browser.homeDirectory;
  const marker = join(homeDirectory, "cleanup-observation.txt");
  await writeFile(marker, "an actual file created by this test");
  assert.equal(existsSync(marker), true);
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]')");
  const works = async () => (await evaluate<number>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(r => r.json()).then(b => b.works.length)`));
  const before = await works();
  await evaluate("(() => { const input = document.querySelector('[data-assistant-input]'); window.__keys = []; input.addEventListener('keydown', e => window.__keys.push([e.key, e.keyCode, e.isComposing]), true); input.focus(); })()");
  // Pinyin still being composed; the IME's own Enter (key code 229) arrives while the composition is open.
  // RAC-1459: no native key code on these synthetic Enters. 229 is Windows' VK_PROCESSKEY and 13 is not Enter on macOS;
  // as the native code they can hide the page in macOS Chrome (BL-393), so only the Windows virtual key code stays.
  await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await works(), before, "nothing was sent while composing");
  // The page did receive that Enter: the guard, not a lost key, is what kept it from sending.
  assert.ok((await evaluate<Array<[string, number, boolean]>>("window.__keys")).some(([key, code, composing]) => key === "Enter" && (code === 229 || composing)), "the IME's Enter reached the input");
  // Since Chrome 155 a synthetic Enter during composition makes the browser itself commit the pinyin (a bare textarea
  // does the same), so the candidate is checked on a composition of its own: picking it replaces the pinyin.
  await evaluate("(() => { const input = document.querySelector('[data-assistant-input]'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); })()");
  await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await command("Input.insertText", { text: "测试" }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "测试", "the candidate is committed into the input");
  assert.equal(await works(), before, "committing a candidate sends nothing");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), true, "no work opened");
  // With the composition over, Enter sends what was typed.
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor(`!document.querySelector('[data-assistant-panel]').hidden`);
  assert.equal(await works(), before + 1, "one Enter after the composition sends once");
});


// BROWSER-CLEAN-01: retries never swallow a persistent permission refusal or replace its original filesystem cause.
test("browser fixture cleanup preserves a real permission failure in its final AggregateError", {
  timeout: 60_000,
  skip: process.platform === "win32" ? "requires Unix directory permissions" : process.getuid?.() === 0 ? "root bypasses directory permissions" : false,
}, async t => {
  const cleanup = fixtureCleanup(t);
  let homeDirectory: string | undefined;
  let locked: string | undefined;
  let closeStarted = false;
  const failures: unknown[] = [];
  try {
    const browser = await openGoalBrowser(cleanup.context);
    if (!browser) return;
    homeDirectory = browser.homeDirectory;
    locked = join(homeDirectory, "permission-refusal");
    const deniedPath = locked;
    await mkdir(locked);
    await writeFile(join(locked, "kept.txt"), "a real file that cannot be unlinked without write permission");
    await chmod(locked, 0o500);
    closeStarted = true;
    await assert.rejects(cleanup.close(), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.message, "Browser fixture cleanup failed");
      assert.equal(error.errors.length, 1, "no Chrome, server, Host or database cleanup failure may be ignored");
      const cause: unknown = error.errors[0];
      assert.ok(cause instanceof Error && "code" in cause && (cause.code === "EACCES" || cause.code === "EPERM"));
      assert.ok("path" in cause && (cause.path === deniedPath || cause.path === join(deniedPath, "kept.txt")),
        "the sole filesystem cause must belong to the directory this test intentionally protected");
      return true;
    });
    assert.equal(existsSync(homeDirectory), true, "a refused deletion must leave its directory observable");
    assert.equal(existsSync(join(locked, "kept.txt")), true);
  } catch (error) { failures.push(error); }
  finally {
    try { if (locked && existsSync(locked)) await chmod(locked, 0o700); }
    catch (error) { failures.push(error); }
    finally {
      try { if (!closeStarted) await cleanup.close(); }
      catch (error) { failures.push(error); }
      finally {
        try { if (homeDirectory) await rm(homeDirectory, { recursive: true, force: true }); }
        catch (error) { failures.push(error); }
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Browser cleanup regression could not restore its temporary Home");
  }
});
