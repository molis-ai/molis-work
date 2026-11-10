import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("FSS-35 an open Coding session keeps its draft and checkpoint seconds through both language changes", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { prepareHome: seedConfiguredModels }); if (!browser?.projectId) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  const original = { checkpoint_id: "cp-original", label: "原始检查点 <raw>", created_at: "2026-11-09T18:24:09.000Z", rewound_at: "2026-11-09T18:24:49.000Z",
    origin_run_id: "original-run", directory: { canonical_path: "/tmp/原始路径" } };
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.codingLanguageRequests = []; window.codingLanguageReplies = []; const fetchOriginal = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(String(input?.url || input), location.href).pathname;
      if (path.includes('/api/plugins/io.molis.work.coding/')) codingLanguageRequests.push([init?.method || 'GET', path]);
      const response = await fetchOriginal(input, init);
      if (path.includes('/api/plugins/io.molis.work.coding/')) {
        const detail = await response.clone().json().catch(() => ({}));
        codingLanguageReplies.push([path, response.status, detail.code || null, detail.models?.length ?? null]);
      }
      return path.endsWith('/checkpoints') && response.ok ? Response.json({checkpoints:[${JSON.stringify(original)}]}) : response;
    };
  ` }, browser.sessionId);
  const next = `/projects/${browser.projectId}/?openPlugin=coding`;
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/locale?lang=en&next=" + encodeURIComponent(next) }, browser.sessionId));
  await child.waitFor("document.querySelector('[data-coding-new]') && typeof t === 'function'");
  await child.click("[data-coding-new]");
  try { await child.waitFor("document.querySelector('[data-coding-checkpoints-list] time') && !document.querySelector('[data-coding-task]').disabled"); }
  catch (error) {
    t.diagnostic(JSON.stringify({ requests: await browser.evaluate("codingLanguageRequests"), replies: await browser.evaluate("codingLanguageReplies"), view: await child.evaluate(`[document.querySelector('[data-coding-status]')?.textContent,
      document.querySelector('[data-coding-checkpoints-status]')?.textContent, document.querySelector('[data-coding-workbench]').dataset.codingDetail]`) }));
    throw error;
  }
  await child.click("[data-coding-results-open]");
  const changeBundle = readFileSync(new URL("../plugins/native/coding/dist/changeset-bundle.js", import.meta.url), "utf8");
  await child.evaluate(`(async () => {
    window.codingLanguageRoot = document.querySelector('[data-coding-workbench]');
    const q = selector => codingLanguageRoot.querySelector(selector), lifetime = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(codingLanguageRoot);
    const changes = (${changeBundle})({lifetime,translate:globalThis.t.text,root:codingLanguageRoot,q,turns:q('[data-coding-turns]'),current:()=>'fixture-session',
      closeReport:()=>{},returnToTask:()=>{},onRunOpen:()=>{},appendDraft:async()=>{},focusDraft:()=>{},status:()=>{},
      api:async()=>({view_mode:'write',html:'',patch:'',reference:{artifact_id:'original-fixed',version:2},saved_at:Date.UTC(2026,10,9,18,24,37),
        output:null,net_groups:[],change:{files:[]}})});
    window.changeFixture = changes;
    window.checkpoint = q('[data-coding-checkpoints-list] section'); window.checkpointFold = checkpoint.closest('details'); checkpointFold.open = true;
    window.codingDraft = q('[data-coding-task]'); codingDraft.value = '尚未发送的草稿'; codingDraft.dispatchEvent(new Event('input', {bubbles:true}));
    codingDraft.focus(); codingDraft.setSelectionRange(1, 4, 'backward');
    window.codingInvalidations = 0;
    codingLanguageRoot.addEventListener('molis-work:select-item', event => { if (event.detail?.invalidate) codingInvalidations++; });
  })()`);
  await child.waitFor("document.querySelector('[data-coding-draft-status]').textContent === t.text('coding.composer.draft-saved')");
  assert.equal(await child.evaluate("document.activeElement===codingDraft"), true, "the wide view keeps the draft visible beside the review panel");
  await browser.evaluate("codingLanguageRequests.length = 0");
  const dates = "[checkpoint.querySelector('time').textContent, checkpoint.querySelector('.coding-checkpoint-done').textContent]";
  const accessibleName = async () => {
    const tree = await child.frameCommand<{ nodes: Array<{ role?: { value?: string }; name?: { value?: string } }> }>("Accessibility.getFullAXTree", { frameId: await child.frameId() });
    return tree.nodes.find(node => node.role?.value === "button" && node.name?.value?.endsWith(" " + original.checkpoint_id))?.name?.value;
  };
  const initial = await child.evaluate<string[]>(dates);
  assert.match(initial[0]!, /:\d\d:09\s(?:AM|PM)/u);
  assert.match(initial[1]!, /^Rolled back to here at .*:\d\d:49\s(?:AM|PM)/u);
  assert.equal(await accessibleName(), `Preview the rollback again ${original.label} ${original.checkpoint_id}`);
  const languages = [["zh", "zh-CN"], ["en", "en"]] as const;
  const switchLanguage = async (tag: "zh" | "en", locale: "zh-CN" | "en") => {
    const count = await child.evaluate<number>("codingInvalidations");
    await browser.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
      link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
    await child.waitFor(`document.documentElement.lang === '${locale}' && codingInvalidations > ${count}`);
  };
  for (const [tag, locale] of languages) {
    await switchLanguage(tag, locale);
    const words = await child.evaluate<string[]>(dates);
    if (tag === "en") assert.deepEqual(words, initial);
    else { assert.match(words[0]!, /:\d\d:09/u); assert.notEqual(words[0], initial[0]); assert.match(words[1]!, /^已于 .*:\d\d:49/u); }
    assert.equal(await accessibleName(), `${tag === "en" ? "Preview the rollback again" : "再次预览回退"} ${original.label} ${original.checkpoint_id}`);
    assert.deepEqual(await child.evaluate(`[codingLanguageRoot.dataset.codingDetail, codingDraft===document.querySelector('[data-coding-task]'),
      document.activeElement===codingDraft, codingDraft.value, codingDraft.selectionStart, codingDraft.selectionEnd, codingDraft.selectionDirection,
      checkpoint===document.querySelector('[data-coding-checkpoints-list] section'), checkpointFold.open, checkpoint.querySelector('p').textContent,
      checkpoint.querySelector('small [translate=no]').textContent]`),
      ["true", true, true, "尚未发送的草稿", 1, 4, "backward", true, true, original.label, original.directory.canonical_path]);
  }
  await child.evaluate(`(async () => { await changeFixture.openFixed('fixture-round'); window.fixedChange = document.querySelector('[data-coding-change-fixed]'); })()`);
  const fixed = await child.evaluate<string>("fixedChange.title");
  assert.match(fixed, /^Fixed at .*:\d\d:37\s(?:AM|PM)/u);
  for (const [tag, locale] of languages) {
    await switchLanguage(tag, locale);
    const title = await child.evaluate<string>("fixedChange.title");
    if (tag === "en") assert.equal(title, fixed); else assert.match(title, /^固定于 .*:\d\d:37/u);
    assert.deepEqual(await child.evaluate("[fixedChange===document.querySelector('[data-coding-change-fixed]'), fixedChange.getClientRects().length > 0]"), [true, true]);
  }
  assert.deepEqual(await browser.evaluate(`codingLanguageRequests.filter(([method, path]) => method !== 'GET' || path.endsWith('/checkpoints'))`), []);
});

// MERGEFIX-01: exercise the extracted index through the shipped Coding client and the Host's real lifetime.
test('Coding results index follows section visibility, jumps with focus, and releases observers on unmount', { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, 'seeded', undefined, undefined, undefined, undefined, { prepareHome: seedConfiguredModels }); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "coding");
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=coding` }, sessionId));
  await waitFor("document.querySelector('[data-coding-model] option')");
  await evaluate(`(() => {
    window.indexRoot=document.querySelector('[data-coding-workbench]');
    window.indexTools=indexRoot.querySelector('[data-coding-tools]');
    window.indexNav=indexRoot.querySelector('[data-coding-results-index]');
    indexRoot.dataset.codingDetail='true';indexRoot.dataset.codingResults='true';
    for(const [id,title] of [['first','Index first'],['second','Index second']]){
      const section=document.createElement('section');section.dataset.indexFixture=id;section.setAttribute('aria-label',title);
      section.textContent=title;indexTools.append(section);
    }
  })()`);
  await waitFor("[...indexNav.children].some(chip=>chip.textContent==='Index second')");
  for (const width of [1440, 1024, 390]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await evaluate("[...indexNav.children].find(chip=>chip.textContent==='Index second').setAttribute('data-index-fixture-jump','')");
      await click('[data-index-fixture-jump]');
      assert.equal(await evaluate("document.activeElement?.dataset.indexFixture"), 'second', `jump focuses its section at ${width}/${theme}`);
      assert.equal(await evaluate("indexRoot.querySelector('[data-coding-results-open]').getAttribute('aria-expanded')"), 'true');
    }
  }
  await evaluate("indexTools.querySelector('[data-index-fixture=second]').hidden=true");
  await waitFor("![...indexNav.children].some(chip=>chip.textContent==='Index second')");
  await evaluate("indexTools.dataset.companionOpen='true'");
  await waitFor('indexNav.hidden && indexNav.children.length===0');
  await evaluate("indexTools.removeAttribute('data-companion-open')");
  await waitFor("[...indexNav.children].some(chip=>chip.textContent==='Index first')");
  await evaluate("indexRoot.dataset.codingResults='false'");
  await waitFor("indexNav.hidden && indexRoot.querySelector('[data-coding-results-open]').getAttribute('aria-expanded')==='false'");
  await evaluate('indexRoot.remove()');
  await pause(150);
  await evaluate("indexRoot.dataset.codingResults='true'");
  await pause(150);
  assert.equal(await evaluate("indexRoot.querySelector('[data-coding-results-open]').getAttribute('aria-expanded')"), 'false', 'detached observers no longer run');
});

// W2-18-CODING-LIFETIME-01: the original global effect listener must be gone after detach/remount.
test("Coding stops hidden polling and releases every client listener before the same DOM is mounted again", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { prepareHome: seedConfiguredModels }); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)));
    window.codingRequests=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input);if(path.includes('/api/plugins/io.molis.work.coding/'))codingRequests.push({path,method:init?.method||'GET'});return originalFetch(input,init);};
  ` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("codingRequests.some(request=>request.path.endsWith('/state'))");
  await child.waitFor("document.querySelector('[data-coding-model] option')");
  await child.evaluate("window.codingRoot=document.querySelector('[data-coding-workbench]');window.codingParent=codingRoot.parentElement;window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)))");
  // SYS-15-L1: hiding preserves the actual browsing context, while its polling stops.
  await evaluate("window.originalCodingFrame=document.querySelector('iframe[data-plugin-frame=coding]')");
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor("document.body.dataset.desktopSurface === 'inbox'");
  await pause(100);
  const hiddenReads = await evaluate<number>("codingRequests.length");
  await pause(5500);
  assert.equal(await evaluate("codingRequests.length"), hiddenReads, "hidden Coding does not keep state or review polling alive");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.body.dataset.desktopSurface === 'coding'");
  assert.equal(await evaluate("document.querySelector('iframe[data-plugin-frame=coding]') === originalCodingFrame"), true, "the same isolated page is restored");
  await child.waitFor("!document.body.hidden");
  await waitFor(`codingRequests.length > ${hiddenReads}`);
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const detachedReads = await evaluate<number>("codingRequests.length"); await pause(1200);
  assert.equal(await evaluate("codingRequests.length"), detachedReads);
  // The host stands in for the frame host: `returns` is a required member of the page host (UiPluginClientHost, specs/draft-and-return
  // §2.4); with no trip open, arrived() answers null.
  await child.evaluate(`(() => {
    codingParent.append(codingRoot);
    const mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    const pluginId='io.molis.work.coding';
    window.remountCoding=()=>(${CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT})({root:codingRoot,mountPluginClient:mount,translate:globalThis.t.text,pluginId,pluginRoute:path=>codingRoot.dataset.codingPrefix+'/api/plugins/'+pluginId+path,
      confirm:async()=>true,interaction:()=>{throw new Error('no card is drawn in this test');},receipts:{},workspaces:{add:async()=>({workspace_id:'none'}),select:async()=>{}},clients:{},reviews:{show:async()=>{}},openItem:()=>{},
      returns:{arrived:async()=>null,go:async()=>{throw new Error('no settings are opened in this test');}}});
    remountCoding();remountCoding();
  })()`);
  await waitFor(`codingRequests.length > ${detachedReads}`);
  await child.click('[data-coding-new]');
  await waitFor("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length===1");
  await child.waitFor("document.querySelector('[data-coding-session]')");
  await pause(100);
  assert.equal(await evaluate("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length"), 1, "one user click creates one session after remount");
  const id = await child.evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  // FIX79-LIFETIME: create() already selects the detail; return through the real visible directory control.
  // That control only exists in the narrow layout (container molis-coding ≤ 760px); the default 800px window
  // gives a ~772px container, so pin a narrow window instead of depending on the browser's default size.
  await command("Emulation.setDeviceMetricsOverride", { width: 720, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await child.waitFor("document.querySelector('[data-coding-directory-back]').getClientRects().length > 0");
  await child.click('[data-coding-directory-back]');
  await child.waitFor("codingRoot.dataset.codingDetail === 'false'");
  await child.click(`[data-coding-session="${id}"]`);
  await waitFor(`codingRequests.some(request=>request.path.includes('/sessions/${id}?window=6'))`);
  await evaluate("window.effectReads=codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(250);
  assert.equal(await evaluate(`codingRequests.slice(effectReads).filter(request=>request.path.includes('/sessions/${id}?window=1')).length`), 1, "only the live instance responds to the effect");
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const absent = await evaluate<number>("codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(200);
  assert.equal(await evaluate("codingRequests.length"), absent, "no old closure performs a request after detach");
  assert.deepEqual(await evaluate("lifecycleErrors"), []);
  assert.deepEqual(await child.evaluate("lifecycleErrors"), []);
});
