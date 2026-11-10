import assert from "node:assert/strict";
import test from "node:test";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { CODING_COMPOSER_STATUS } from "./fixtures/coding-composer.js";

// specs/unified-input-voice K4 (implementation-plan.md §5, B's compromise in #1803 §6 item 10): Coding's composer keeps a session's
// words in the session (`draft:<session_id>`, one PATCH with the next round's choices). This window's sessionStorage copy is only a
// buffer for words the service has not confirmed: a confirmed save leaves none, and a save that failed keeps them, so a reload puts
// them back into the box and saves them again on its own.
test("K4: a confirmed save leaves no window copy; words whose save failed come back after a reload and are saved again", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, click, box, type, start, owner } = opened;
  const id = await start("先存进会话的一版");
  const key = `'molis-coding-draft:'+document.querySelector('${coding}').dataset.codingPrefix+':'+${JSON.stringify(id)}`;
  const buffer = () => evaluate<string | null>(`sessionStorage.getItem(${key})`);
  const path = `/projects/${owner.projectId}/api/plugins/io.molis.work.coding/sessions/${encodeURIComponent(id)}?window=1`;
  const server = () => evaluate<string>(`fetch(${JSON.stringify(path)}).then((r) => r.json()).then((b) => b.draft ?? '')`);

  // Confirmed: the service holds the words and the window keeps no copy of them.
  await waitFor(`patches.some((one) => one.body.includes('先存进会话的一版'))`, 15_000);
  await waitFor(`sessionStorage.getItem(${key}) === null`, 15_000);
  assert.equal(await server(), "先存进会话的一版");

  // The service refuses the next saves: the words stay in the box and in the window's buffer, and the composer says so.
  await evaluate(`(() => { const real = window.fetch; window.fetch = (input, init) => init?.method === 'PATCH' && String(input?.url || input).includes(${JSON.stringify(encodeURIComponent(id))})
    ? Promise.resolve(new Response(JSON.stringify({ error: '写入失败（测试）' }), { status: 503, headers: { 'content-type': 'application/json' } })) : real(input, init); })()`);
  await type("这段还没写进会话");
  await waitFor(`sessionStorage.getItem(${key}) === '这段还没写进会话'`, 15_000);
  await waitFor(`document.querySelector('${coding} ${CODING_COMPOSER_STATUS}')?.textContent.trim().length > 0`, 15_000);
  assert.equal(await server(), "先存进会话的一版", "the service still holds the last confirmed words");

  // A reload: the session's first read finds the unconfirmed words, puts them in the box and saves them again; once confirmed, the copy goes.
  await owner.reloadPage();
  await owner.click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor(`document.querySelector('${coding} [data-coding-session="${id}"]')`, 20_000);
  await click(`${coding} [data-coding-session="${id}"]`);
  await waitFor(`${box}.value === '这段还没写进会话' && !${box}.disabled`, 20_000);
  for (let i = 0; i < 100 && await server() !== "这段还没写进会话"; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await server(), "这段还没写进会话", "saved again on its own");
  await waitFor(`sessionStorage.getItem(${key}) === null`, 15_000);
  assert.equal(await buffer(), null);
});
