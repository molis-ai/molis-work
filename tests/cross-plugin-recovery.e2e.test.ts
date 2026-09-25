import assert from 'node:assert/strict';
import test from 'node:test';
import { openShelfStore } from '@molis-ai/molis-work-module-shelf';
import { openCharacters } from '@molis-ai/molis-work-module-characters';
import { charactersManifest } from '@molis-ai/molis-work-plugin-characters';
import { PluginRuntime, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { openGoalBrowser } from './fixtures/goal-browser.js';

test('Characters opens an existing project after its manifest upgrade without losing personal drafts', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const personal = openCharacters(b.homeDirectory, 'web-user');
  t.after(() => personal.close());
  const draft = personal.service.create();
  personal.service.update(draft.character_id, 1, { title: '升级前的角色草稿', instructions: '保留原有做事方式', host_tools: null });
  const legacy = { ...structuredClone(charactersManifest), version: '1.0.0',
    routes: charactersManifest.routes.filter(route => !route.route_id.startsWith('characters.import') && route.route_id !== 'characters.discover') };
  const repository = new SqlitePluginRuntimeRepository(b.store.db);
  const installed = new PluginRuntime(repository).install({ definition: { manifest: legacy, async start() { return {}; } },
    deployment: 'local', grants: legacy.permissions.filter(p => p.required).map(p => p.permission) });
  await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=characters]');
  await b.waitFor("document.querySelector('[data-character-list]')?.textContent.includes('升级前的角色草稿')");
  const upgraded = repository.get(installed.install.install_id)!;
  assert.equal(upgraded.version, charactersManifest.version);
  assert.notEqual(upgraded.version, legacy.version);
  assert.deepEqual(upgraded.grants, installed.install.grants);
  assert.equal(upgraded.installed_at, installed.install.installed_at);
  assert.equal(personal.service.get(draft.character_id)?.instructions, '保留原有做事方式');
});

test('Shelf saves the last keystroke before returning and keeps a failed draft available to retry', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  const shelf = openShelfStore(b.homeDirectory, { disabled: true });
  const a = shelf.admit({ filename: '最后输入.md', bytes: Buffer.from('# A\n原文 A'), mime: 'text/markdown' });
  const second = shelf.admit({ filename: '独立材料.md', bytes: Buffer.from('# B\n原文 B'), mime: 'text/markdown' });
  // Pin the viewport to the regression scenario so geometry does not depend on the host window size.
  await command('Emulation.setDeviceMetricsOverride', { width: 756, height: 469, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  // Scroll the Shelf entry into view inside the rail so the hit-test reflects the click path.
  await evaluate(`(() => {
    const el = document.querySelector('[data-plugin-strip] [data-plugin-id=shelf]');
    if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
  })()`);
  const layout = await evaluate(`(() => {
    const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height, top:r.top, bottom:r.bottom }; })() : null;
    const stack = document.querySelector('.plugin-stack');
    const items = document.querySelector('.plugin-rail-items');
    const footer = document.querySelector('.personal-sidebar-footer');
    const shelf = document.querySelector('[data-plugin-strip] [data-plugin-id=shelf]');
    const itemsStyle = items ? getComputedStyle(items) : null;
    const shelfRect = rect(shelf);
    const itemsRect = rect(items);
    const footerRect = rect(footer);
    const hit = shelfRect ? document.elementFromPoint(shelfRect.x + shelfRect.w/2, shelfRect.y + shelfRect.h/2) : null;
    const hitsShelf = !!(hit && (hit === shelf || (hit.closest && hit.closest('[data-plugin-strip] [data-plugin-id=shelf]'))));
    return {
      viewport: { w: innerWidth, h: innerHeight },
      stack: rect(stack),
      items: itemsRect,
      footer: footerRect,
      shelf: shelfRect,
      shelfInsideItems: !!(shelf && items && shelfRect.bottom <= itemsRect.bottom + 1),
      itemsScroll: items ? { scrollTop: items.scrollTop, scrollHeight: items.scrollHeight, clientHeight: items.clientHeight, overflowY: itemsStyle ? itemsStyle.overflowY : null } : null,
      shelfHeight: shelfRect ? shelfRect.h : null,
      hitTag: hit ? hit.tagName.toLowerCase() : null,
      hitClosestRailItem: hit ? !!hit.closest('.plugin-rail-item, .personal-sidebar-footer, [data-plugin-id]') : null,
      hitsShelf
    };
  })()`);
  assert.equal(layout.viewport.w, 756);
  assert.equal(layout.viewport.h, 469);
  // The rail lives inside the 48px-wide column; the middle .plugin-rail-items must be tall enough
  // to expose at least one fully-sized entry, otherwise users can scroll past it but never click it.
  const itemHeight = layout.items?.h ?? 0;
  assert.ok(itemHeight >= layout.shelfHeight - 1,
    `plugin-rail-items must fit at least one Shelf button (got ${itemHeight} vs button ${layout.shelfHeight})`);
  // No overlap: the footer must start below the rail items and stay within the viewport.
  assert.ok(layout.items && layout.footer, 'rail items and footer must both exist');
  assert.ok(layout.footer.top + 0.5 >= layout.items.bottom - 0.5,
    `footer must sit below rail items (items.bottom=${layout.items.bottom}, footer.top=${layout.footer.top})`);
  assert.ok(layout.footer.bottom <= layout.viewport.h + 0.5,
    `footer must stay within viewport (footer.bottom=${layout.footer.bottom}, vh=${layout.viewport.h})`);
  // Hit test must land on the Shelf entry (or a tight ancestor of it), not on the bare rail container.
  assert.ok(layout.shelfInsideItems, 'Shelf must live inside .plugin-rail-items');
  assert.equal(layout.hitsShelf, true,
    `elementFromPoint must hit the Shelf entry (got tag=${layout.hitTag}, closestRailItem=${layout.hitClosestRailItem})`);
  await click('[data-plugin-strip] [data-plugin-id=shelf]');
  const row = `[data-shelf-list=materials] [data-shelf-item="${a.item_id}"]`;
  await waitFor(`document.querySelector('${row}')`);
  await click(row);
  await click('[data-shelf-edit]');
  await evaluate(`{ const editor = document.querySelector('[data-shelf-editor]'); editor.value = '# A\\n最后输入也要保存';
    editor.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-shelf-collapse]').click(); }`);
  await waitFor("document.querySelector('[data-shelf-stage-shell]').dataset.expanded === 'false'");
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n最后输入也要保存');
  assert.equal(shelf.readFile(second.item_id).bytes.toString('utf8'), '# B\n原文 B');
  await click(row);
  await click('[data-shelf-edit]');
  assert.equal(await evaluate("document.querySelector('[data-shelf-editor]').value"), '# A\n最后输入也要保存');
  await evaluate(`{ const original = window.fetch; window.restoreShelfFetch = () => window.fetch = original;
    window.fetch = (url, options) => String(url).endsWith('/${a.item_id}/edit')
      ? Promise.resolve(new Response(JSON.stringify({ error: '暂时无法写入副本' }), { status: 503 })) : original(url, options);
    const editor = document.querySelector('[data-shelf-editor]'); editor.value = '# A\\n失败后保留的原稿';
    editor.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-shelf-collapse]').click(); }`);
  await waitFor("document.querySelector('[data-shelf-edit-status]')?.textContent.includes('暂时无法写入副本')");
  assert.equal(await evaluate("document.querySelector('[data-shelf-stage-shell]').dataset.expanded"), 'true');
  assert.equal(await evaluate("document.querySelector('[data-shelf-editor]').value"), '# A\n失败后保留的原稿');
  assert.equal(await evaluate("document.querySelector('[data-shelf-editor]').readOnly"), false);
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n最后输入也要保存');
  await evaluate('window.restoreShelfFetch()');
  await click('[data-shelf-collapse]');
  await waitFor("document.querySelector('[data-shelf-stage-shell]').dataset.expanded === 'false'");
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n失败后保留的原稿');
  assert.equal(shelf.readFile(second.item_id).bytes.toString('utf8'), '# B\n原文 B');
});

test('Schedule keeps the submitting draft stable, retries failures, and opens the created task once', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id=schedule]');
  await click('[data-schedule-new]');
  await evaluate(`{ const form = document.querySelector('[data-schedule-create-form]');
    form.elements.title.value = '第二轮交互检查'; form.elements.instructions.value = '仅用于隔离测试'; form.elements.time.value = '23:59';
    const original = window.fetch; window.scheduleRequests = 0;
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/api/schedule/tasks') && options?.method === 'POST') {
        window.scheduleRequests++;
        if (window.scheduleRequests === 1) return new Response(JSON.stringify({ error: '服务暂时不可用' }), { status: 503 });
        const response = await original(url, options);
        window.createdScheduleId = (await response.clone().json()).task.task_id;
        await new Promise(resolve => { window.releaseScheduleResponse = resolve; }); return response;
      }
      return original(url, options);
    }; }`);
  await click('[data-schedule-create-form] [type=submit]');
  await waitFor("document.querySelector('[data-schedule-create-error]').textContent.includes('服务暂时不可用')");
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value"), '第二轮交互检查');
  await click('[data-schedule-create-form] [type=submit]');
  await waitFor('Boolean(window.releaseScheduleResponse)');
  await click('[data-schedule-create-form] footer [data-schedule-create-close]');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await evaluate("document.querySelector('[data-schedule-create-form]').requestSubmit()");
  assert.equal(await evaluate('window.scheduleRequests'), 2);
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-dialog]').open"), true);
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form] .mw-form__body').inert"), true);
  await evaluate('window.releaseScheduleResponse()');
  await waitFor("!document.querySelector('[data-schedule-create-dialog]').open && document.querySelector('[data-schedule-detail=\"' + window.createdScheduleId + '\"]:not([hidden])')");
  await click('[data-schedule-collapse]');
  await click('[data-schedule-new]');
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value"), '');
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), false);
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form] .mw-form__body').inert"), false);
  await click('[data-schedule-create-form] footer [data-schedule-create-close]');
  const response = await fetch(`${origin}/projects/${projectId}/api/schedule`);
  const saved = await response.json();
  assert.equal(saved.tasks.filter((task: { title: string }) => task.title === '第二轮交互检查').length, 1);
});
