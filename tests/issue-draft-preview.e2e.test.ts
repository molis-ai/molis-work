import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueView } from "./fixtures/issue-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

const digestImages = `(items => Promise.all(items.map(async image => {
  const bytes = Uint8Array.from(atob(image.data_url.split(',')[1]), c => c.charCodeAt(0));
  const digest = await d.defaultView.crypto.subtle.digest('SHA-256', bytes);
  return { name: image.name, bytes: bytes.length, hash: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') };
})))`;
const thumbnails = digestImages + "([...d.querySelectorAll('[data-issue-thumbs] img')].map(i => ({ name: i.alt, data_url: i.src })))";

test("ISSUE-45 image drafts survive full navigation, removal, sending and undo beyond localStorage quota", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = issueView(b, "issue-draft-preview");
  await v.go("/"); await v.chord(); await v.composerFocused();
  await v.type("跨页面填写图文草稿，所有截图应保持原始顺序和内容。");
  // Four independently decodable noisy PNGs exceed the 5 MiB localStorage quota while fitting Issue's 8 MiB limit.
  await v.ask(`(async () => {
    const c = d.createElement('canvas'); c.width = 800; c.height = 600;
    const g = c.getContext('2d'), p = g.createImageData(800, 600); let seed = 17;
    for (let i = 0; i < p.data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; p.data[i] = i % 4 === 3 ? 255 : seed >>> 24; }
    g.putImageData(p, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const transfer = new DataTransfer();
    for (let i = 0; i < 4; i++) transfer.items.add(new File([blob], '截图-' + i + '.png', { type: 'image/png' }));
    $('[data-issue-composer]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 4 && !$('[data-issue-submit]').disabled", 15_000);
  const original = await v.ask<Array<{ name: string; bytes: number; hash: string }>>(thumbnails);
  const bytes = original.reduce((sum, item) => sum + item.bytes, 0);
  assert.ok(bytes > 5 * 1024 * 1024 && bytes <= 8 * 1024 * 1024, `representative large draft: ${bytes}`);
  for (const path of [`/projects/${b.projectId}/?desktop=1`, "/"]) {
    await v.go(path); await v.chord(); await v.composerFocused();
    await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 4");
    assert.deepEqual(await v.ask(thumbnails), original);
    assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "跨页面填写图文草稿，所有截图应保持原始顺序和内容。");
  }
  await v.press('[data-issue-thumbs] [data-remove="1"]');
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 3");
  await v.go("/"); await v.chord(); await v.composerFocused();
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 3");
  const kept = original.filter((_, i) => i !== 1);
  assert.deepEqual(await v.ask(thumbnails), kept, "removed images do not return after reload");
  await v.send();
  await v.until("$('[data-issue-toast] span').textContent.startsWith('已记录：')", 25_000);
  const [record] = (await v.list()).items; assert.ok(record);
  assert.deepEqual(await v.ask(`(async () => { const response = await d.defaultView.fetch('/api/plugins/io.molis.work.issues/read?id=${record.id}', { headers: d.defaultView.molisWorkControlHeaders() }); return ${digestImages}((await response.json()).images); })()`), kept);
  await v.press('[data-issue-toast-action]');
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 3");
  await v.go("/"); await v.chord(); await v.composerFocused();
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 3");
  assert.deepEqual(await v.ask(thumbnails), kept, "undo restores the persistent image draft");
  assert.match(await v.ask<string>("$('[data-issue-composer] [name=description]').value"), /跨页面/);
  await v.send(); await v.until("$('[data-issue-toast] span').textContent.startsWith('已记录：')", 25_000);
  await v.go("/"); await v.chord(); await v.composerFocused();
  await v.until("$('[data-issue-submit]').disabled");
  assert.deepEqual(await v.ask(thumbnails), [], "sending clears the stored images");
});

test("ISSUE-45 a failed draft write rejects the new image visibly and preserves the previous draft", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  const v = issueView(b);
  await v.go('/plugins/issues'); await v.press('[data-issue-composer] [name=description]'); await v.type('保留这句话与原图');
  await v.paste('已有图片.png'); await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1");
  const before = await v.ask(thumbnails);
  await v.ask("(d.defaultView.savedPut = d.defaultView.Cache.prototype.put, d.defaultView.Cache.prototype.put = function() { throw new DOMException('full', 'QuotaExceededError'); }, true)");
  await v.paste('不应假装保存.png');
  await v.until("$('[data-issue-composer] [data-issue-tip]').textContent.includes('截图草稿未能保存在本机')");
  assert.deepEqual(await v.ask(thumbnails), before);
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), '保留这句话与原图');
  await v.ask('(d.defaultView.Cache.prototype.put = d.defaultView.savedPut, true)');
  await v.paste('恢复后添加.png'); await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 2");
});

test("ISSUE-45 sending clears immediately without erasing words typed during the disk write", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, 'empty', undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = issueView(b);
  await v.go('/plugins/issues'); await v.press('[data-issue-composer] [name=description]');
  await v.type('记录第一条，后续输入属于下一条'); await v.paste();
  await v.until("!!$('[data-issue-thumbs] img') && !$('[data-issue-submit]').disabled");
  await v.ask(`(() => { const w = d.defaultView, put = w.Cache.prototype.put;
    const gate = new Promise(resolve => w.releaseDraftWrite = resolve);
    w.Cache.prototype.put = async function(...args) { await gate; return put.apply(this, args); }; return true;
  })()`);
  await v.send(); await v.until("!$('[data-issue-composer] [name=description]').value");
  await v.type('下一条的文字不能被上一次保存擦掉');
  await v.ask('(d.defaultView.releaseDraftWrite(), true)');
  await v.until("$('[data-issue-toast] span').textContent.startsWith('已记录：')", 25_000);
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), '下一条的文字不能被上一次保存擦掉');
  await v.go('/plugins/issues');
  await v.until("$('[data-issue-composer] [name=description]').value === '下一条的文字不能被上一次保存擦掉'");
  assert.deepEqual(await v.ask(thumbnails), []);
  // Both drops decode while the first write is pending. Each must append to the preceding persisted draft.
  await v.press('[data-issue-composer] [name=description]');
  await v.paste('连续添加一.png'); await v.paste('连续添加二.png');
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 2");
  const original = await v.ask(thumbnails);
  await v.go('/plugins/issues'); await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 2");
  assert.deepEqual(await v.ask(thumbnails), original);
});

test("ISSUE-46 preview close and zoom stay visible and clickable after two-axis scrolling in every layout", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, 'user', undefined, null); if (!b) return;
  const v = issueView(b, 'issue-draft-preview');
  for (const path of ['/plugins/issues', '/']) {
    await v.go(path); if (path === '/') { await v.chord(); await v.composerFocused(); }
    else { await v.press('[data-issue-composer] [name=description]'); await v.ask(`(async () => {
      const c = d.createElement('canvas'); c.width = c.height = 2400;
      const g = c.getContext('2d'); g.fillStyle = '#d4a18b'; g.fillRect(0, 0, 2400, 2400);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')), data = new DataTransfer();
      data.items.add(new File([blob], '双向滚动截图.png', { type: 'image/png' }));
      d.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    })()`); }
    await v.until("!!$('[data-issue-thumbs] img')");
    for (const width of [1440, 1024, 390]) for (const theme of ['light', 'dark']) {
      await v.viewport(width, 844);
      await v.ask(`(d.documentElement.dataset.theme = '${theme}', true)`);
      await v.press('[data-preview]'); await v.until("d.defaultView.getComputedStyle($('[data-issue-preview]')).opacity === '1'"); await v.press('[data-issue-zoom]');
      await v.ask("(() => { const box = $('.issues-preview-body'); box.scrollLeft = box.scrollWidth; box.scrollTop = box.scrollHeight; return true; })()");
      await v.until("$('.issues-preview-body').scrollLeft > 0 && $('.issues-preview-body').scrollTop > 0");
      assert.deepEqual(await v.ask(`[...d.querySelectorAll('.issues-preview header button')].map(button => {
        const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= d.defaultView.innerHeight && r.left >= 0 && r.right <= d.defaultView.innerWidth && button.contains(d.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })`), [true, true], `${path} ${width} ${theme}`);
      await v.shot(`preview-${path === '/' ? 'side' : 'page'}-${width}-${theme}`);
      await v.press('[data-issue-zoom]'); await v.until("!$('[data-issue-preview]').hasAttribute('data-zoom')");
      await v.press('.issues-preview header button:last-child'); await v.until("!$('[data-issue-preview]').open");
      await v.press('[data-preview]');
      assert.equal(await v.ask("$('.issues-preview-body').scrollTop + $('.issues-preview-body').scrollLeft"), 0);
      await v.escape(); await v.until("!$('[data-issue-preview]').open");
    }
  }
});
