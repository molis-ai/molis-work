import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { openCharacters } from '@molis-ai/molis-work-module-characters';
import { CHARACTER_PLUGIN_ID } from '@molis-ai/molis-work-contracts/modules/characters';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { openTestShelfStore } from './shelf-direct-actions.js';

test('Characters still lists the person\'s drafts in a project that keeps the removed Characters plugin\'s install record', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const personal = openCharacters(b.homeDirectory, 'web-user');
  t.after(() => personal.close());
  const draft = personal.service.create();
  personal.service.update(draft.character_id, 1, { title: '升级前的角色草稿', instructions: '保留原有做事方式', host_tools: null });
  // RAC-74: what an install of the Characters plugin left before Characters moved into the Host (CHR-1). Nothing starts or rewrites it;
  // it stays until the maintenance in docs/releases/CHECKLIST.md removes it.
  const left: PluginInstanceRecord = { install_id: 'plugin-install-characters-left', installation_generation: 'generation-1', plugin_id: CHARACTER_PLUGIN_ID,
    version: '1.6.0', publisher_id: 'io.molis.work', publisher_signature: 'builtin', manifest_digest: 'sha256:left-behind', deployment: 'local',
    selected_entrypoint: 'builtin', grants: ['artifact:read', 'artifact:write'], execution: 'host', publisher_trust: 'host', state: 'running', recovery_count: 0, last_error_code: null,
    installed_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', uninstalled_at: null, retain_private_data: true };
  const repository = new SqlitePluginRuntimeRepository(b.store.db);
  repository.save(left);
  await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  // Characters' page is Settings › 角色 (specs/archive/page-interaction-flow), now a section of the Host's own settings.
  await b.click('[data-directory-open="settings"]');
  await b.click('[data-directory-panel=settings] [data-settings-section="characters"]');
  await b.waitFor("document.querySelector('[data-character-list]')?.textContent.includes('升级前的角色草稿')");
  assert.deepEqual(repository.get(left.install_id), left, 'the left-behind record is neither started nor rewritten');
  assert.equal(personal.service.get(draft.character_id)?.instructions, '保留原有做事方式');
});

test('Shelf saves the last keystroke before returning and keeps a failed draft available to retry', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  const child = await pluginFrameBrowser(t,b,'shelf');
  const shelf = openTestShelfStore(b.homeDirectory, { disabled: true });
  const a = await shelf.admit({ filename: '最后输入.md', bytes: Buffer.from('# A\n原文 A'), mime: 'text/markdown' });
  const second = await shelf.admit({ filename: '独立材料.md', bytes: Buffer.from('# B\n原文 B'), mime: 'text/markdown' });
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=window.fetch;window.failShelfEdit=false;window.fetch=(url,options)=>window.failShelfEdit && String(url).endsWith('/${a.item_id}/edit')?Promise.resolve(new Response(JSON.stringify({error:'暂时无法写入副本'}),{status:503})):original(url,options)})()`},sessionId);
  // Pin the viewport to the regression scenario so geometry does not depend on the host window size.
  await command('Emulation.setDeviceMetricsOverride', { width: 756, height: 469, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  // craft-finish round 4, side-shelf §3.1: the right of the bottom bar is the side panel's one button (Shelf, 灵光 and the
  // rest are its tabs). At this short, narrow window it must still be a whole, uncovered 32px+ target inside the viewport.
  const layout = await evaluate<any>(`(() => {
    const shelf = document.querySelector('.workbench-bar [data-side-toggle]');
    const r = shelf?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    const neighbours = [...document.querySelectorAll('.workbench-bar :is(.dock-pin, .navigator-project-selector, .bar-composer)')].filter(e => e !== shelf && e.getClientRects().length)
      .map(e => e.getBoundingClientRect()).filter(n => r && n.left < r.right && n.right > r.left && n.top < r.bottom && n.bottom > r.top).length;
    return { viewport: { w: innerWidth, h: innerHeight }, shelf: r ? { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null,
      hitsShelf: !!(hit && shelf.contains(hit)), hitTag: hit?.tagName.toLowerCase(), neighbours };
  })()`);
  assert.equal(layout.viewport.w, 756);
  assert.equal(layout.viewport.h, 469);
  assert.ok(layout.shelf, 'the bottom bar has the side panel button');
  assert.ok(layout.shelf.w >= 32 && layout.shelf.h >= 32, 'the side panel button keeps a whole target: ' + JSON.stringify(layout.shelf));
  assert.ok(layout.shelf.top >= 0 && layout.shelf.bottom <= layout.viewport.h && layout.shelf.right <= layout.viewport.w, 'the side panel button stays inside the viewport');
  assert.equal(layout.neighbours, 0, 'no other bar control overlaps the side panel button');
  assert.equal(layout.hitsShelf, true, `elementFromPoint must hit the side panel button (got ${layout.hitTag})`);
  // Shelf's side panel tab, in the document the panel's frame loads.
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/side/shelf/side` }, sessionId));
  const row = `[data-shelf-list=materials] [data-shelf-item="${a.item_id}"]`;
  await child.waitFor(`document.querySelector('${row}')`);
  await child.click(row);
  await child.click('[data-shelf-edit]');
  await child.waitFor("document.querySelector('[data-shelf-editor]')");
  await child.evaluate(`{ const editor = document.querySelector('[data-shelf-editor]'); editor.value = '# A\\n最后输入也要保存';
    editor.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-shelf-collapse]').click(); }`);
  await child.waitFor("document.querySelector('[data-shelf-stage-shell]').dataset.expanded === 'false'");
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n最后输入也要保存');
  assert.equal(shelf.readFile(second.item_id).bytes.toString('utf8'), '# B\n原文 B');
  await child.click(row);
  await child.click('[data-shelf-edit]');
  await child.waitFor("document.querySelector('[data-shelf-editor]')");
  assert.equal(await child.evaluate("document.querySelector('[data-shelf-editor]').value"), '# A\n最后输入也要保存');
  await evaluate('window.failShelfEdit=true');
  await child.evaluate(`{ const editor = document.querySelector('[data-shelf-editor]'); editor.value = '# A\\n失败后保留的原稿';
    editor.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-shelf-collapse]').click(); }`);
  await child.waitFor("document.querySelector('[data-shelf-edit-status]')?.textContent.includes('暂时无法写入副本')");
  assert.equal(await child.evaluate("document.querySelector('[data-shelf-stage-shell]').dataset.expanded"), 'true');
  assert.equal(await child.evaluate("document.querySelector('[data-shelf-editor]').value"), '# A\n失败后保留的原稿');
  assert.equal(await child.evaluate("document.querySelector('[data-shelf-editor]').readOnly"), false);
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n最后输入也要保存');
  await evaluate('window.failShelfEdit=false');
  await child.click('[data-shelf-collapse]');
  await child.waitFor("document.querySelector('[data-shelf-stage-shell]').dataset.expanded === 'false'");
  assert.equal(shelf.readFile(a.item_id).bytes.toString('utf8'), '# A\n失败后保留的原稿');
  assert.equal(shelf.readFile(second.item_id).bytes.toString('utf8'), '# B\n原文 B');
});

test('Schedule keeps the submitting draft stable, retries failures, and opens the created task once', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  const child=await pluginFrameBrowser(t,b,'schedule');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original = window.fetch; window.scheduleRequests = 0;
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/api/plugins/io.molis.work.schedule/tasks') && options?.method === 'POST') {
        window.scheduleRequests++;
        if (window.scheduleRequests === 1) return new Response(JSON.stringify({ error: '服务暂时不可用' }), { status: 503 });
        const response = await original(url, options);
        window.createdScheduleId = (await response.clone().json()).task.task_id;
        await new Promise(resolve => { window.releaseScheduleResponse = resolve; }); return response;
      }
      return original(url, options);
    };
})()`},sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id=schedule]');
  await child.click('[data-schedule-new]');
  await child.evaluate(`{ const form = document.querySelector('[data-schedule-create-form]');
    form.elements.title.value = '第二轮交互检查'; form.elements.instructions.value = '仅用于隔离测试'; form.elements.time.value = '23:59';
  }`);
  await child.click('[data-schedule-create-form] [type=submit]');
  await child.waitFor("document.querySelector('[data-schedule-create-error]').textContent.includes('服务暂时不可用')");
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value"), '第二轮交互检查');
  await child.click('[data-schedule-create-form] [type=submit]');
  await waitFor('Boolean(window.releaseScheduleResponse)');
  // ASC-40: cancellation is deliberately attempted while the real save response is held.
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form] footer [data-schedule-create-close]').disabled"), true);
  const closeBox=await child.evaluate<{x:number;y:number}>("(()=>{const r=document.querySelector('[data-schedule-create-form] footer [data-schedule-create-close]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  const frameBox=await evaluate<{x:number;y:number}>("(()=>{const r=document.querySelector('iframe[data-plugin-frame=schedule]').getBoundingClientRect();return{x:r.x,y:r.y}})()");
  for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:closeBox.x+frameBox.x,y:closeBox.y+frameBox.y,button:'left',clickCount:1},sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await child.evaluate("document.querySelector('[data-schedule-create-form]').requestSubmit()");
  assert.equal(await evaluate('window.scheduleRequests'), 2);
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-dialog]').open"), true);
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form] .mw-form__body').inert"), true);
  await evaluate('window.releaseScheduleResponse()');
  const created=await evaluate<string>('window.createdScheduleId');
  await child.waitFor(`!document.querySelector('[data-schedule-create-dialog]').open && document.querySelector('[data-schedule-detail="${created}"]:not([hidden])')`);
  await child.click('[data-schedule-collapse]');
  await child.click('[data-schedule-new]');
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form]').elements.title.value"), '');
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), false);
  assert.equal(await child.evaluate("document.querySelector('[data-schedule-create-form] .mw-form__body').inert"), false);
  await child.click('[data-schedule-create-form] footer [data-schedule-create-close]');
  const response = await fetch(`${origin}/projects/${projectId}/api/plugins/io.molis.work.schedule/list`);
  const saved = await response.json();
  assert.equal(saved.tasks.filter((task: { title: string }) => task.title === '第二轮交互检查').length, 1);
});
