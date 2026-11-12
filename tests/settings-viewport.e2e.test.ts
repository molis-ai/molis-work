import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject } from '@molis-ai/molis-work-test-kit/local-host-http';
import { mkdir, writeFile } from 'node:fs/promises';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

for (const [width, height] of [[1024, 400], [390, 500]]) {
  test(`Settings ${width}×${height}: fixed actions, cancel, failed retry and pending save`, { timeout: 60000 }, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    const { command, sessionId, navigate, origin, projectId, click, evaluate, waitFor } = b;
    const prefix = `${origin}/projects/${projectId}`;
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command('Network.enable', {}, sessionId);
    const fill = (selector: string, value: string) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const rect = (selector: string) => evaluate<{ top: number; bottom: number }>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
    const contained = async (selector: string) => {
      const r = await rect(selector);
      assert.ok(r.top >= -1 && r.bottom <= height + 1, `${selector}: ${JSON.stringify(r)}`);
      return r;
    };
    const capture = async (name: string) => {
      await evaluate('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
      const dir = process.env.MOLIS_CONTENT_CAPTURE || `${REVIEW_EVIDENCE}/settings-viewport-v9`;
      await mkdir(dir, { recursive: true });
      const png = await command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(`${dir}/${name}-${width}.png`, Buffer.from(png.data, 'base64'));
    };
    const scrollFields = async (body: string, header: string, footer: string) => {
      await evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))");
      const before = [await contained(header), await contained(footer)];
      const field = await evaluate<{ x: number; y: number; ch: number; sh: number }>(`(()=>{const e=document.querySelector('${body}'),r=e.getBoundingClientRect();return {x:r.x+12,y:r.y+12,ch:e.clientHeight,sh:e.scrollHeight}})()`);
      assert.ok(field.ch >= 80 && field.sh > field.ch, 'real fields have a usable internal scroll region');
      await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: field.x, y: field.y, deltaX: 0, deltaY: 1500 }, sessionId);
      await waitFor(`document.querySelector('${body}').scrollTop > 0`);
      assert.deepEqual([await contained(header), await contained(footer)], before);
      assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollTop===0'), true);
    };
    // Project settings open in the workbench (specs/artifact-positioning S6); a save reloads it on the same category.
    const loaded = (selector: string) => waitFor(`!!document.querySelector('[data-work-surface=project-settings] ${selector}')`, 15000);
    await navigate(() => command('Page.navigate', { url: prefix + '/settings/rules' }, sessionId));
    await loaded('[data-policy-form]');
    const cursor = boardSnapshot(b.store, DEMO_PROJECT_ID).cursor;
    const accepted = "document.querySelector('[name=human_approval]').checked";
    const original = await evaluate<boolean>(accepted);
    await evaluate(accepted + " = " + String(!original));
    await click('[data-policy-cancel]');
    assert.equal(await evaluate(accepted), original);
    assert.equal(boardSnapshot(b.store, DEMO_PROJECT_ID).cursor, cursor);
    await evaluate(accepted + " = " + String(!original));
    await command('Network.setBlockedURLs', { urls: [prefix + '/api/plugins/io.molis.work.goals/policy-bindings'] }, sessionId);
    await click('[data-policy-form] button[type=submit]');
    await waitFor("!document.querySelector('[data-policy-error]').hidden");
    await contained('[data-policy-error]');
    assert.match(await evaluate<string>("document.querySelector('[data-policy-error]').textContent"), /输入已保留/);
    await evaluate("document.querySelector('.settings-save-footer').scrollIntoView({block:'nearest'})");
    await contained('.settings-save-footer');
    assert.equal(await evaluate(accepted), !original);
    await command('Network.setBlockedURLs', { urls: [] }, sessionId);
    await command('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    await navigate(async () => {
      await click('[data-policy-form] button[type=submit]');
      assert.equal(await evaluate("document.querySelector('[data-policy-cancel]').disabled && document.querySelector('[name=human_approval]').disabled"), true);
    });
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    await loaded('[data-policy-form]');
    assert.equal(await evaluate(accepted), !original);
    assert.ok(boardSnapshot(b.store, DEMO_PROJECT_ID).cursor > cursor);
    await b.reloadPage();
    await loaded('[data-policy-form]');
    assert.equal(await evaluate(accepted), !original);

    await navigate(() => command('Page.navigate', { url: prefix + '/settings/guidance' }, sessionId));
    const trigger = '[data-guidance-kind="constraint"]';
    await loaded(trigger);
    await click(trigger);
    await waitFor("document.activeElement.name === 'content'");
    await scrollFields('.guidance-editor-body', '.guidance-editor > header', '.guidance-editor footer');
    await fill('[name=content]', '不应保存的说明草稿');
    await click('[data-guidance-editor-close]');
    assert.equal(await evaluate(`document.activeElement.matches('${trigger}')`), true);
    const guidance = async () => (await (await fetch(prefix + '/api/plugins/io.molis.work.goals/project-guidance')).json());
    assert.equal((await guidance()).entries.length, 0);
    await click(trigger);
    await waitFor("document.activeElement.name === 'content'");
    assert.equal(await evaluate("document.querySelector('[name=content]').value"), '');
    const content = '用户数据和备份只保存在本机。\n' + '保留原始文件，所有导出均由用户主动发起。\n'.repeat(12);
    await fill('[name=content]', content);
    await fill('[name=reason]', '明确项目的数据边界，并验证失败时草稿完整保留。');
    await command('Network.setBlockedURLs', { urls: [prefix + '/api/plugins/io.molis.work.goals/project-guidance'] }, sessionId);
    await click('[data-guidance-form] button[type=submit]');
    await waitFor("!document.querySelector('[data-guidance-editor-error]').hidden");
    assert.equal(await evaluate("document.querySelector('[name=content]').value"), content);
    assert.equal(await evaluate("document.querySelector('[data-guidance-editor-close]').disabled"), false);
    await contained('[data-guidance-editor-error]');
    assert.match(await evaluate<string>("document.querySelector('[data-guidance-editor-error]').textContent"), /不知道这次操作有没有完成/, "the answer never came, so the page does not claim to know; the draft above is still there");
    await contained('.guidance-editor footer');
    await capture('guidance-error');
    await evaluate("localStorage.setItem('molis-work:theme','dark');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'dark'}))");
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await evaluate('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
    await capture('guidance-error-dark');
    await command('Network.setBlockedURLs', { urls: [] }, sessionId);
    await command('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    await navigate(async () => {
      await click('[data-guidance-form] button[type=submit]');
      assert.equal(await evaluate("document.querySelector('[data-guidance-form]').getAttribute('aria-busy')"), 'true');
      assert.equal(await evaluate("document.querySelector('[data-guidance-editor-close]').disabled && document.querySelector('[name=content]').disabled"), true);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
      assert.equal(await evaluate("document.querySelector('[data-guidance-editor]').hidden"), false);
    });
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    const saved = await guidance();
    assert.equal(saved.entries.length, 1);
    assert.equal(saved.entries[0].content, content.trim());
    assert.equal(saved.entries[0].kind, 'constraint');
    assert.equal(saved.revisions.length, 1);
    await b.reloadPage();
    await loaded('.guidance-entry');
    assert.match(await evaluate<string>("document.querySelector('.guidance-entry').textContent"), /用户数据和备份只保存在本机/);
    await click('[data-guidance-action="deactivate"]');
    await waitFor("document.activeElement.name === 'reason'");
    assert.equal(await evaluate("document.querySelector('[name=content]').disabled"), true);
    await scrollFields('.guidance-editor-body', '.guidance-editor > header', '.guidance-editor footer');
    await fill('[name=reason]', '验证说明停用后保留历史。');
    await navigate(() => click('[data-guidance-form] button[type=submit]'));
    const stopped = await guidance();
    assert.equal(stopped.entries.length, 0);
    assert.equal(stopped.inactive_entries[0].content, content.trim());
    await loaded('.guidance-inactive > summary');
    await click('.guidance-inactive > summary');
    await click('[data-guidance-action="restore"]');
    await waitFor("document.activeElement.name === 'reason'");
    await fill('[name=reason]', '恢复已核对的说明。');
    await navigate(() => click('[data-guidance-form] button[type=submit]'));
    const restored = await guidance();
    assert.equal(restored.entries[0].content, content.trim());
    assert.equal(restored.inactive_entries.length, 0);
    assert.equal(restored.revisions.length, 3);

  });
}

test('RAC-2850 global Characters entry carries only its own CSS through real HTTP and section extraction', { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, 'empty'); if (!b) return;
  await b.setViewport(1024, 700);
  await b.navigate(() => b.command('Page.navigate', { url: b.origin + '/settings/appearance' }, b.sessionId));
  const load = async () => b.evaluate(`new Promise((resolve,reject)=>{document.getElementById('t393-global-entry')?.remove();const f=document.createElement('iframe');f.id='t393-global-entry';f.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:9999;background:white';f.onload=()=>resolve(true);f.onerror=reject;f.src='/settings/characters';document.body.append(f)})`);
  const entry = async <T = unknown>(expression: string): Promise<T> => {
    const tree = await b.command<{ frameTree: { childFrames: { frame: { id: string; url: string } }[] } }>('Page.getFrameTree', {}, b.sessionId);
    const frameId = tree.frameTree.childFrames.find(item => item.frame.url === b.origin + '/settings/characters')?.frame.id; assert.ok(frameId);
    const { executionContextId } = await b.command<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId, worldName: 'T393 entry DOM inspection' }, b.sessionId);
    const result = await b.command<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true }, b.sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  await load();
  assert.deepEqual(await entry("({path:location.pathname,settings:document.body.classList.contains('settings-page'),workbench:!!document.querySelector('[data-tab-workspace]'),style:document.querySelector('.characters-settings-entry').querySelectorAll(':scope > style').length})"),
    { path: '/settings/characters', settings: true, workbench: false, style: 1 });
  assert.equal(await entry("document.querySelector('.characters-hint').textContent.includes('还没有项目')"), true);
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-hint')).fontSize"), '12px');
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-hint')).lineHeight"), '19.2px');
  const directory = `${REVIEW_EVIDENCE}/pg070-current`; await mkdir(directory, { recursive: true });
  const shot = async (name: string) => { const image = await b.command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, b.sessionId); await writeFile(`${directory}/${name}.png`, Buffer.from(image.data, 'base64')); };
  await shot('characters-global-empty');
  const project = await createProject(b.web, "PG070 linked project");
  await load(); await b.setViewport(390, 500);
  assert.equal(await entry("document.querySelector('.characters-project-link').pathname"), '/projects/' + project.project_id + '/');
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-project-link')).display"), 'flex');
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-project-link')).minHeight"), '40px');
  const response = await fetch(b.origin + '/settings/characters'); assert.equal(response.status, 200); const html = await response.text();
  // The unchanged production extractor chooses settings-document; adopt that real HTTP node, including its child style.
  await entry(`(()=>{const parsed=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html'),node=parsed.querySelector('.settings-document');document.querySelector('.settings-content').replaceChildren(document.adoptNode(node));})()`);
  assert.equal(await entry("document.querySelector('.characters-settings-entry').querySelectorAll(':scope > style').length"), 1);
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-project-link')).display"), 'flex');
  assert.equal(await entry("getComputedStyle(document.querySelector('.characters-project-link')).minHeight"), '40px');
  assert.equal(await entry("document.documentElement.scrollWidth<=innerWidth+1"), true);
  assert.equal(await entry("document.querySelector('.characters-settings-entry style').textContent.includes('.characters-terminal')"), false);
  await shot('characters-global-extracted-narrow');
});

test("B27-AC01: Assistant rule scopes and the name and state of a capability switch", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { command, sessionId, navigate, origin, waitFor, evaluate, click } = b;
  const quiet = "[data-assistant-rule-quiet]", pause = "[data-assistant-rule-pause]";
  const failure = "input[data-assistant-rule-except=failed]";
  const row = "[data-assistant-capabilities] .assistant-capability";
  const toggle = row + " input[role=switch]";
  const switchDom = `document.querySelector('${toggle}')`;
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
    await waitFor(`document.querySelector('[data-assistant-rule-surfaces] input') && ${switchDom}`);
    await evaluate("document.fonts.ready.then(() => true)");
  };
  const switchAX = async () => {
    const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: toggle }, sessionId);
    const { nodes } = await command<{ nodes: { role?: { value: string }; name?: { value: string }; properties?: { name: string; value: { value: string } }[] }[] }>(
      "Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false }, sessionId);
    const entry = nodes.find(node => node.role?.value === "switch");
    assert.ok(entry, "Chrome exposes a switch");
    return [entry.name?.value, entry.properties?.find(property => property.name === "checked")?.value.value];
  };
  const readSwitch = async () => {
    const [name, checked] = await evaluate<[string, boolean]>(`[document.querySelector('${row} strong').textContent, ${switchDom}.checked]`);
    assert.deepEqual(await switchAX(), [name, String(checked)]);
    return { name, checked };
  };
  const directory = process.env.MOLIS_CONTENT_CAPTURE || `${REVIEW_EVIDENCE}/batch27-assistant-settings`;
  await mkdir(directory, { recursive: true });
  for (const [locale, labels] of [
    ["zh", ["在这些地方，助理这一轮失败时仍提醒我", "暂停期间，助理这一轮失败时仍提醒我"]],
    ["en", ["In these places, still notify me if an Assistant turn fails", "While paused, still notify me if an Assistant turn fails"]],
  ] as const) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
    await open();
    assert.deepEqual(await evaluate(`['${quiet} ${failure}', '${pause} ${failure}'].map(s => document.querySelector(s).labels[0].textContent.trim())`), labels);
    await readSwitch();
    for (const width of [1440, 1024, 390]) {
      await b.setViewport(width, 900);
      for (const theme of ["light", "dark"]) {
        await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
        for (const [area, selector] of [["rules", "[data-assistant-rules]"], ["memory", "[data-assistant-memory]"]]) {
          await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'start',behavior:'instant'})`);
          const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
          await writeFile(`${directory}/assistant-${area}-${locale}-${theme}-${width}.png`, Buffer.from(data, "base64"));
        }
        assert.equal(await evaluate(`(() => {
          const title = document.querySelector('#assistant-memory-title'), range = document.createRange();
          range.selectNodeContents(title);
          const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
          return title.checkVisibility() && lines.size === 1 && getComputedStyle(title).writingMode === 'horizontal-tb';
        })()`), true, `memory heading reads horizontally at ${width}px, ${locale}, ${theme}`);
      }
    }
  }
  await b.setViewport(1440, 900);
  const before = await readSwitch();
  await click(toggle);
  await waitFor(`${switchDom}?.checked === ${!before.checked} && !${switchDom}.disabled`);
  assert.deepEqual(await readSwitch(), { name: before.name, checked: !before.checked });
  await open();
  assert.deepEqual(await readSwitch(), { name: before.name, checked: !before.checked }, "state persists and the switch keeps its name");

  type Rule = { rule_id: string; kind: string; except: string[]; surfaces: string[]; until?: string };
  const readRules = async () => (await b.web.get<{ rules: Rule[] }>("/api/assistant/rules")).rules;
  const previousIds = new Set((await readRules()).map(rule => rule.rule_id));
  const page = quiet + " [data-assistant-rule-surfaces] input";
  const surface = await evaluate<string>(`document.querySelector('${page}').value`);
  await click(page);
  await click(quiet + " " + failure);
  await click(quiet + " [type=submit]");
  await waitFor(`document.querySelectorAll('[data-assistant-rules-list] li').length === ${previousIds.size + 1}`);
  const pausedAt = Date.now();
  await click(pause + " [type=submit]");
  await waitFor(`document.querySelectorAll('[data-assistant-rules-list] li').length === ${previousIds.size + 2}`);
  await open();
  await waitFor(`document.querySelectorAll('[data-assistant-rules-list] li').length === ${previousIds.size + 2}`);
  const rules = (await readRules()).filter(rule => !previousIds.has(rule.rule_id));
  const location = rules.find(rule => rule.kind === "quiet"), timed = rules.find(rule => rule.kind === "pause");
  assert.ok(location && timed);
  assert.deepEqual(location.surfaces, [surface]);
  assert.deepEqual(location.except, ["reminder", "connection"]);
  assert.equal(location.until ?? null, null);
  assert.deepEqual(timed.surfaces, []);
  assert.deepEqual(timed.except, ["failed", "connection"]);
  const pauseStart = Date.parse(timed.until ?? "") - 60 * 60_000;
  assert.ok(pausedAt <= pauseStart && pauseStart <= Date.now(), "the pause has its own one-hour expiry");
});
