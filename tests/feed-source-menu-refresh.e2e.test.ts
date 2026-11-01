import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { LocalHostHttpClient } from '@molis-ai/molis-work-test-kit/local-host-http';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { seedBoard } from './fixtures/goal-application.js';
import { reviewEvidenceUrl } from './fixtures/review-evidence.js';

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Snapshot = { project: string; cursor: number; goals: string[]; same: boolean; bodySame: boolean; visible: boolean; top: boolean;
  surface: string; collection: string; mobile: string; mode: string; task: string; source: string; selected: string; dirty: boolean;
  menuOpen: boolean; expanded: string | null; railOpen: string; dialogHidden: boolean; choicesHidden: boolean; setupHidden: boolean;
  graphPresent: boolean; graphLoaded: string; syncing: boolean; tabFeed: boolean; membership: number; attention: number[] };
type PublicState = { project?: { project_id: string }; snapshot: { cursor: number; board: { project_id: string } }; goals: { goal: { goal_id: string } }[] };
const limits = { post: 15_000, cursor: 10_000, natural: 30_000, hold: 5_000, commit: 5_000 };
const railAdd = '[data-feed-source-menu] [data-feed-source-rail] [data-feed-add-toggle]';

function http(b: Browser) {
  return new LocalHostHttpClient({ origin: b.origin, controlToken: b.controlToken,
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(init?.method === 'POST' ? limits.post : 1000) }) });
}
async function page(b: Browser) {
  await b.setViewport(390, 640, false);
  await b.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, b.sessionId);
  await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/?openPlugin=feed` }, b.sessionId));
  await b.waitFor("document.body.dataset.desktopSurface==='feed' && document.querySelector('[data-feed-workbench]')?.hidden===false && !document.querySelector('[data-ui-client-state=loading]')");
  await b.evaluate(`(() => {
    const roots=document.querySelectorAll('[data-feed-workbench]'); if(roots.length!==1) throw Error('ambiguous Feed root');
    const body=document.body,root=roots[0],menu=root.querySelector('[data-feed-source-menu]'),add=root.querySelector(${JSON.stringify(railAdd)}),dialog=root.querySelector('[data-feed-sources-dialog]');
    if(!menu||!add||!dialog) throw Error('missing Feed controls'); let membership=0;const attention=[];
    const onMember=()=>membership++,onAttention=e=>attention.push(e.detail.board_cursor);
    document.addEventListener('molis-work:plugins-changed',onMember);document.addEventListener('molis-work:attention',onAttention);
    const snapshot=()=>{const state=JSON.parse(document.querySelector('#molis-work-data').textContent),workspace=document.querySelector('[data-workspace]');return {
      project:state.project?.project_id||state.snapshot.board.project_id,cursor:state.snapshot.cursor,goals:state.goals.map(x=>x.goal.goal_id),
      same:root===document.querySelector('[data-feed-workbench]')&&menu===root.querySelector('[data-feed-source-menu]')&&add===root.querySelector(${JSON.stringify(railAdd)})&&dialog===root.querySelector('[data-feed-sources-dialog]')&&[root,menu,add,dialog].every(x=>x.isConnected),bodySame:body===document.body&&body.isConnected,visible:!document.hidden,top:window===top,
      surface:body.dataset.desktopSurface,collection:body.dataset.boardView,mobile:workspace.dataset.mobileView,mode:workspace.dataset.workspaceMode,
      task:root.dataset.selectedSource,source:document.querySelector('[data-source-entry-id].is-selected')?.dataset.sourceEntryId||'',selected:history.state?.goalId||'',dirty:!!document.querySelector('[data-live-dirty=true],[data-record-menu][open],[data-event-form][aria-busy=true]'),
      menuOpen:menu.open,expanded:menu.querySelector('summary').getAttribute('aria-expanded'),railOpen:root.dataset.railOpen,dialogHidden:dialog.hidden,choicesHidden:dialog.querySelector('[data-feed-source-choices]').hidden,setupHidden:dialog.querySelector('[data-feed-source-setup]').hidden,
      graphPresent:!!document.querySelector('[data-goal-momentum]'),graphLoaded:document.querySelector('[data-goal-momentum]')?.dataset.loaded||'',syncing:document.querySelector('[data-document-pane]')?.classList.contains('is-syncing'),tabFeed:!!document.querySelector('[data-tab-id][aria-current][data-plugin=feed]'),membership,attention:[...attention]};};
    window.__feedMenuTest={snapshot,point(selector){const node=selector==='summary'?menu.querySelector(':scope > summary'):root.querySelector(selector);if(!snapshot().same||!node?.isConnected)throw Error('Feed identity changed');
      const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      if(!r.width||!r.height||!node.getClientRects().length||node.closest('[hidden],[inert]')||node.matches(':disabled')||x<0||y<0||x>=innerWidth||y>=innerHeight||!node.contains(document.elementFromPoint(x,y)))throw Error('Feed target is not operable');return{x,y};},
      selectedTask(id){return root.querySelector('[data-feed-task-toggle="'+CSS.escape(id)+'"]').getAttribute('aria-current');},stop(){document.removeEventListener('molis-work:plugins-changed',onMember);document.removeEventListener('molis-work:attention',onAttention);delete window.__feedMenuTest;}};
  })()`);
}
const snapshot = (b: Browser) => b.evaluate<Snapshot>('window.__feedMenuTest.snapshot()');
async function native(b: Browser, selector: string) {
  const point = await b.evaluate<{ x: number; y: number }>(`window.__feedMenuTest.point(${JSON.stringify(selector)})`);
  await b.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }, b.sessionId);
  await b.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }, b.sessionId);
}
async function shot(b: Browser, name: string) {
  const dir = reviewEvidenceUrl('feed-source-menu-refresh/'); await mkdir(dir, { recursive: true });
  const image = await b.command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, b.sessionId, 1500);
  await writeFile(new URL(name + '.png', dir), Buffer.from(image.data, 'base64'));
}

/** One real Response gate; callbacks fail the case, and cleanup attempts every remaining resource. */
function refreshGate(b: Browser) {
  const errors: unknown[] = [], tasks = new Set<Promise<void>>(), pending = new Set<string>(), requests = new Map<string, string>();
  let active = false, armed = false, refreshes = 0, initializedAt = 0, held: { id: string; networkId: string; at: number; status: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, releasing: Promise<void> | undefined;
  let resolve!: () => void; const paused = new Promise<void>(r => { resolve = r; });
  const command = <T,>(method: string, params: Record<string, unknown> = {}) => b.command<T>(method, params, b.sessionId, 1000);
  const track = (work: Promise<void>) => { tasks.add(work); void work.catch(error => { errors.push(error); }).finally(() => tasks.delete(work)); };
  const fail = (message: string) => { errors.push(new Error(message)); };
  const route = (url: string) => {
    const value = new URL(url); if (value.origin !== b.origin) return null;
    const prefix = `/projects/${b.projectId}`;
    if (value.pathname === prefix + '/api/board/refresh') return { kind: 'refresh', exact: value.searchParams.get('view') === 'current' && !value.searchParams.has('goal_id') };
    if (value.pathname === prefix + '/api/attention') return { kind: 'attention', exact: true };
    if (value.pathname === prefix + '/api/board/cursor') return { kind: 'cursor', exact: true };
    if (value.pathname === prefix + '/' || value.pathname.startsWith(prefix + '/goals/')) return { kind: 'fallback', exact: true };
    return null;
  };
  const release = () => {
    if (!held) return Promise.reject(new Error('No held response'));
    if (!releasing) {
      clearTimeout(timer);
      releasing = command('Fetch.continueRequest', { requestId: held.id }).then(() => { pending.delete(held!.id); });
    }
    return releasing;
  };
  const stops = [
    b.on('Network.requestWillBeSent', (event, session) => {
      if (session !== b.sessionId) return; const request = event.request as { url: string; method: string }; const kind = route(request.url); if (!kind) return;
      requests.set(String(event.requestId), kind.kind);
      if (kind.kind === 'refresh') { refreshes++; if (active && (!armed || refreshes !== 1 || !kind.exact || request.method !== 'GET')) fail('Unexpected refresh request'); }
      if (active && kind.kind === 'fallback') fail('Refresh fallback/navigation polluted the case');
    }),
    b.on('Network.loadingFailed', (event, session) => { if (active && session === b.sessionId && requests.has(String(event.requestId))) fail('A required network read failed'); }),
    b.on('Runtime.consoleAPICalled', (event, session) => { if (active && session === b.sessionId && ['warning', 'warn', 'error'].includes(String(event.type))) fail('Browser warning/error during refresh'); }),
    b.on('Runtime.exceptionThrown', (_event, session) => { if (active && session === b.sessionId) fail('Browser exception during refresh'); }),
    b.on('Page.frameNavigated', (event, session) => { if (active && session === b.sessionId && !(event.frame as { parentId?: string }).parentId) fail('Navigation during refresh'); }),
    b.on('Runtime.executionContextsCleared', (_event, session) => { if (active && session === b.sessionId) fail('Page context destroyed'); }),
    b.on('Target.detachedFromTarget', event => { if (active && event.sessionId === b.sessionId) fail('Page session detached'); }),
    b.on('Fetch.requestPaused', (event, session) => {
      const id = String(event.requestId); pending.add(id); const request = event.request as { url: string; method: string }; const kind = route(request.url);
      if (session !== b.sessionId || !armed || held || kind?.kind !== 'refresh' || !kind.exact || request.method !== 'GET') {
        fail('Unexpected paused response'); track(command('Fetch.continueRequest', { requestId: id }).then(() => { pending.delete(id); })); return;
      }
      held = { id, networkId: String(event.networkId), at: performance.now(), status: Number(event.responseStatusCode) };
      timer = setTimeout(() => { fail('Response hold exceeded its budget'); track(release()); }, 4000); resolve();
    }),
  ];
  return {
    check() { if (initializedAt) assert.ok(performance.now() - initializedAt < 90_000, 'Initialized experiment exceeded its overall budget'); if (errors.length) throw new AggregateError(errors, 'Refresh observations failed'); },
    async start() { await command('Network.enable'); await command('Runtime.enable'); },
    control() { initializedAt = performance.now(); active = true; assert.equal(refreshes, 0, 'No refresh may predate the control'); },
    async arm() { armed = true; await command('Fetch.enable', { patterns: [{ urlPattern: `${b.origin}/projects/${b.projectId}/api/board/refresh*`, requestStage: 'Response' }] }); },
    async response(goalId: string) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([paused, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Natural refresh response was not observed')), limits.natural); })]); }
      finally { clearTimeout(deadline); }
      this.check(); assert.ok(held); assert.equal(held.status, 200); assert.equal(refreshes, 1); assert.equal(requests.get(held.networkId), 'refresh');
      const raw = await command<{ body: string; base64Encoded: boolean }>('Fetch.getResponseBody', { requestId: held.id });
      const html = raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString() : raw.body;
      const match = /<script\b[^>]*id=["']molis-work-data["'][^>]*>([\s\S]*?)<\/script>/.exec(html); assert.ok(match);
      const state = JSON.parse(match[1]!) as PublicState;
      assert.equal(state.project?.project_id || state.snapshot.board.project_id, b.projectId); assert.ok(state.goals.some(row => row.goal.goal_id === goalId));
      return state.snapshot.cursor;
    },
    async release() { assert.ok(held); assert.ok(performance.now() - held.at < 3000, 'Leave margin before the hold deadline'); await release(); assert.ok(performance.now() - held.at < limits.hold); this.check(); },
    count() { return refreshes; },
    async close() {
      clearTimeout(timer); active = false;
      for (const id of [...pending]) { try { await command('Fetch.continueRequest', { requestId: id }); pending.delete(id); } catch (error) { errors.push(error); } }
      try { await command('Fetch.disable'); } catch (error) { errors.push(error); }
      for (const stop of stops) { try { stop(); } catch (error) { errors.push(error); } }
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([Promise.allSettled([...tasks]), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Callback cleanup exceeded its budget')), 1000); })]); }
      catch (error) { errors.push(error); } finally { clearTimeout(deadline); }
      try { await b.evaluate('window.__feedMenuTest?.stop()'); } catch (error) { errors.push(error); }
      this.check();
    },
  };
}

async function cursorAfter(client: LocalHostHttpClient, prefix: string, before: number) {
  const deadline = performance.now() + limits.cursor;
  for (;;) {
    const state = await client.get<{ observed_event_cursor: number }>(prefix + '/api/board/cursor');
    if (state.observed_event_cursor > before) return state.observed_event_cursor;
    assert.ok(performance.now() < deadline, 'Public cursor did not catch up'); await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function browser(t: TestContext) { const b = await openGoalBrowser(t, 'seeded', seedBoard, null); assert.ok(b, 'A dedicated Chrome is required'); return b; }

test('RAC-2840: an unrelated Goal refresh preserves the current source menu and its native add/choose/cancel path', { timeout: 120_000 }, async t => {
  const b = await browser(t), gate = refreshGate(b), failures: unknown[] = [];
  try {
    await gate.start(); await page(b); gate.control(); const initial = await snapshot(b); const client = http(b), prefix = `/projects/${b.projectId}`;
    const c0 = (await client.get<{ observed_event_cursor: number }>(prefix + '/api/board/cursor')).observed_event_cursor;
    assert.equal(initial.cursor, c0); assert.equal(initial.project, b.projectId); assert.equal(initial.collection, 'current'); assert.equal(initial.selected, ''); assert.deepEqual(initial.goals, []);
    assert.ok(initial.same && initial.bodySame && initial.visible && initial.top && !initial.dirty); assert.equal(initial.task, 'all'); assert.equal(initial.menuOpen, false, 'Restore must not open a closed menu');
    await native(b, 'summary'); await b.waitFor('window.__feedMenuTest.snapshot().menuOpen'); await native(b, railAdd);
    await b.waitFor('!window.__feedMenuTest.snapshot().dialogHidden && !window.__feedMenuTest.snapshot().choicesHidden');
    await native(b, '[data-feed-sources-close]'); await b.waitFor('window.__feedMenuTest.snapshot().dialogHidden');
    assert.equal((await snapshot(b)).cursor, c0); assert.equal(gate.count(), 0); gate.check();
    await gate.arm(); const goalId = randomUUID();
    await client.post(prefix + '/api/plugins/io.molis.work.goals/goals', { goal_id: goalId, title: 'An unrelated Goal', outcome: 'Refresh the collection', why: 'Keep the current menu', business_logic: 'Public write', priority: 10, acceptance_criteria: ['Visible in the next public snapshot'] });
    const c1 = await cursorAfter(client, prefix, c0), commit = await gate.response(goalId); assert.ok(commit >= c1);
    const held = await snapshot(b); assert.equal(held.cursor, c0); assert.equal(held.selected, ''); assert.equal(held.task, 'all'); assert.equal(held.surface, 'feed'); assert.ok(held.attention.some(cursor => cursor > c0)); gate.check();
    await native(b, 'summary'); await b.waitFor('window.__feedMenuTest.snapshot().menuOpen'); const open = await snapshot(b); assert.ok(open.same && open.bodySame); gate.check();
    await gate.release();
    // is-syncing is already false before refresh: this is a task-after state, not proof of an observed rAF transition.
    await b.waitFor(`(()=>{const s=window.__feedMenuTest.snapshot();return s.cursor===${commit}&&s.goals.includes(${JSON.stringify(goalId)})&&!s.syncing;})()`, limits.commit);
    const after = await snapshot(b); gate.check();
    assert.equal(after.project, b.projectId); assert.ok(after.same && after.bodySame && after.visible && after.top && after.tabFeed && !after.dirty);
    assert.equal(after.surface, 'feed'); assert.equal(after.mobile, 'document'); assert.equal(after.mode, after.graphPresent ? 'graph' : 'focus'); assert.notEqual(after.graphLoaded, 'true');
    assert.equal(after.task, 'all'); assert.equal(after.source, open.source); assert.equal(after.membership, 0); assert.equal(gate.count(), 1); assert.equal(after.dialogHidden, true);
    assert.equal(after.menuOpen, true, 'RAC-2840: unrelated Goal refresh must preserve the current source menu');
    assert.equal(after.expanded, 'true'); assert.equal(after.railOpen, 'true');
    await native(b, railAdd); await b.waitFor('!window.__feedMenuTest.snapshot().dialogHidden && !window.__feedMenuTest.snapshot().choicesHidden');
    await native(b, '[data-feed-choose-kind=custom_rss]'); await b.waitFor('!window.__feedMenuTest.snapshot().setupHidden && window.__feedMenuTest.snapshot().choicesHidden');
    await native(b, '[data-feed-sources-close]'); await b.waitFor('window.__feedMenuTest.snapshot().dialogHidden');
    assert.equal((await snapshot(b)).menuOpen, false); gate.check();
  } catch (error) { failures.push(error); try { await shot(b, 'refresh-failed'); } catch (captureError) { failures.push(captureError); } }
  finally { try { await gate.close(); } catch (error) { failures.push(error); } }
  if (failures.length) throw new AggregateError(failures, 'RAC-2840 source-menu refresh failed');
});

test('RAC-2841: explicitly reselecting all, selecting a source and reselecting that source close the menu', { timeout: 60_000 }, async t => {
  const b = await browser(t), failures: unknown[] = [];
  try {
    const result = await http(b).post<{ source: { source_id: string } }>(`/projects/${b.projectId}/api/plugins/io.molis.work.feed/sources`, { kind: 'custom_rss', feed_url: 'https://example.com/feed.xml', name: 'Menu source' });
    await page(b);
    for (const id of ['all', result.source.source_id, result.source.source_id]) {
      await native(b, 'summary'); await b.waitFor('window.__feedMenuTest.snapshot().menuOpen');
      await native(b, `[data-feed-source-menu] [data-feed-task-toggle=${JSON.stringify(id)}]`);
      await b.waitFor(`(()=>{const s=window.__feedMenuTest.snapshot();return !s.menuOpen&&s.expanded==='false'&&s.railOpen==='false'&&s.task===${JSON.stringify(id)};})()`); const state = await snapshot(b);
      assert.equal(state.task, id); assert.equal(state.expanded, 'false'); assert.equal(state.railOpen, 'false'); assert.equal(state.dialogHidden, true);
      assert.equal(await b.evaluate(`window.__feedMenuTest.selectedTask(${JSON.stringify(id)})`), 'page');
    }
  } catch (error) { failures.push(error); try { await shot(b, 'selection-failed'); } catch (captureError) { failures.push(captureError); } }
  finally { try { await b.evaluate('window.__feedMenuTest?.stop()'); } catch (error) { failures.push(error); } }
  if (failures.length) throw new AggregateError(failures, 'RAC-2841 explicit source selection failed');
});
