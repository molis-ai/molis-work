import assert from "node:assert/strict";
import test from "node:test";
import { openWorkflowsBrowser as openEditor } from "./fixtures/workflows-browser.js";

type Editor = Awaited<ReturnType<typeof openEditor>>;
type SaveRequest = { id: string; body: { revision: number; title?: string; chain?: { stations: { plugin: string }[]; links: { body_template: string }[] } }; status: number; returned: boolean };

// A transport barrier holds the real Host response after its SQLite commit (or real CAS refusal).
// It does not substitute the Workflows action, route, Store or client: the page asks through molisWorkRequest, so the barrier
// wraps that helper in the frame and hands every real answer (or real refusal) back. The logs also expose each immutable body.
async function watchSaves(editor: Editor, { hold = false, refuse = false } = {}) {
  await editor.frame.evaluate(`(() => {
    const original = window.molisWorkRequest;
    window.__wfRequests = []; window.__wfReads = []; window.__wfHeld = false;
    let first = true;
    window.molisWorkRequest = Object.assign(async (url, init = {}) => {
      const target = new URL(String(url), "http://plugin.invalid");
      const id = target.pathname.split('/').at(-1);
      const owned = target.pathname.includes('/api/plugins/io.molis.work.native.workflows/workflows/') && [${JSON.stringify(editor.a.workflow_id)}, ${JSON.stringify(editor.b.workflow_id)}].includes(id);
      if (!owned || init.method !== 'POST') {
        const answer = await original(url, init);
        if (owned) window.__wfReads.push(id);
        return answer;
      }
      const body = JSON.parse(JSON.stringify(init.body));
      const current = { id, body, status: 0, returned: false }; window.__wfRequests.push(current);
      const intercept = first && id === ${JSON.stringify(editor.a.workflow_id)}; if (intercept) first = false;
      let failure = null, answer;
      try { answer = await original(url, ${refuse} && intercept ? { ...init, body: { ...init.body, revision: body.revision + 1000 } } : init); current.status = 200; current.result = answer; }
      catch (error) { failure = error; current.status = error.status; current.result = error.body; }
      if (${hold} && intercept) { window.__wfHeld = true; await new Promise(resolve => { window.__wfRelease = resolve; }); }
      requestAnimationFrame(() => requestAnimationFrame(() => { current.returned = true; }));
      if (failure) throw failure;
      return answer;
    }, original);
  })()`);
}

async function addTwo(editor: Editor) {
  // Both handlers run before the queue's first microtask: the first body must still contain only its own edit.
  await editor.frame.evaluate(`(() => {
    document.querySelector('[data-wf-action=append][data-wf-plugin=inbox]').click();
    document.querySelector('[data-wf-action=append][data-wf-plugin=pages]').click();
  })()`);
  await editor.frame.waitFor("window.__wfHeld === true");
}

for (const target of ["B", "directory"] as const) {
  test(`W2-18-WFSAVE-01/02: two A saves retain their snapshots and revisions after opening ${target}`, { timeout: 90_000 }, async t => {
    const editor = await openEditor(t);
    await watchSaves(editor, { hold: true });
    await addTwo(editor);
    if (target === "B") {
      await editor.frame.click(`[data-wf-open="${editor.b.workflow_id}"]`);
      await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.b.workflow_id}'`);
    } else {
      await editor.frame.click("[data-wf-action=back]");
      await editor.frame.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'list'");
    }
    await editor.frame.evaluate("window.__wfRelease()");
    // The original list defect reports an error and reopens A instead of sending the second save.
    await editor.frame.waitFor(`window.__wfRequests.filter(request => request.returned).length === 2
      || document.querySelector('.wf-editor')?.dataset.id === '${editor.a.workflow_id}'
      || document.querySelector('[data-wf-toast]')?.dataset.tone === 'error'`);
    const requests = await editor.frame.evaluate<SaveRequest[]>("window.__wfRequests");
    assert.equal(requests.length, 2, JSON.stringify(requests));
    assert.deepEqual(requests.map(request => request.id), [editor.a.workflow_id, editor.a.workflow_id]);
    assert.deepEqual(requests.map(request => request.body.chain?.stations.map(station => station.plugin)), [["feed", "inbox"], ["feed", "inbox", "pages"]]);
    assert.deepEqual(requests.map(request => request.body.revision), [editor.a.revision, editor.a.revision + 1]);
    assert.deepEqual(requests.map(request => request.status), [200, 200]);
    const savedA = editor.saved(editor.a.workflow_id);
    assert.deepEqual(savedA.stations.map(station => station.plugin), ["feed", "inbox", "pages"]);
    assert.equal(savedA.title, editor.a.title);
    assert.equal(savedA.revision, editor.a.revision + 2);
    assert.deepEqual(editor.saved(editor.b.workflow_id), editor.b, "B's persisted chain, title and revision must remain untouched");
    assert.equal(await editor.frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode"), target === "B" ? "workflow" : "list");
    if (target === "B") {
      assert.equal(await editor.frame.evaluate("document.querySelector('.wf-editor').dataset.id"), editor.b.workflow_id);
      assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-title]').value"), editor.b.title);
      assert.equal(await editor.frame.evaluate("JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext).object.version"), String(editor.b.revision));
      assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').dataset.state"), "saved");
    }
  });
}

test("W2-18-WFSAVE-02: title and link debounces belong to A when B opens before either timer", { timeout: 90_000 }, async t => {
  const editor = await openEditor(t);
  await editor.web.post(`/projects/${editor.projectId}/api/plugins/io.molis.work.native.workflows/workflows/${editor.a.workflow_id}`, {
    revision: editor.a.revision, chain: { stations: [{ plugin: "feed" }, { plugin: "inbox" }],
      links: [{ kind: "function", title_template: "", body_template: "{正文}", instructions: "" }] },
  });
  await editor.frame.click("[data-wf-action=back]");
  await editor.frame.click(`[data-wf-open="${editor.a.workflow_id}"]`);
  await editor.frame.waitFor("document.querySelector('[data-wf-action=link][data-link=\"0\"]')");
  await editor.frame.click('[data-wf-action=link][data-link="0"]');
  await editor.frame.waitFor("document.querySelector('[data-wf-link-field=body_template]')");
  await watchSaves(editor);
  await editor.frame.evaluate(`(() => {
    const body = document.querySelector('[data-wf-link-field=body_template]');
    body.value = '{正文} · A 的新交接'; body.dispatchEvent(new Event('input', { bubbles: true }));
    const title = document.querySelector('[data-wf-title]');
    title.value = 'A 的新名称'; title.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-wf-open="${editor.b.workflow_id}"]').click();
  })()`);
  await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.b.workflow_id}' && window.__wfRequests.filter(request => request.returned).length >= 2`);
  const requests = await editor.frame.evaluate<SaveRequest[]>("window.__wfRequests");
  assert.ok(requests.every(request => request.id === editor.a.workflow_id), JSON.stringify(requests));
  assert.equal(editor.saved(editor.a.workflow_id).title, "A 的新名称");
  assert.equal(editor.saved(editor.a.workflow_id).links[0]!.body_template, "{正文} · A 的新交接");
  assert.deepEqual(editor.saved(editor.b.workflow_id), editor.b);
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-title]').value"), editor.b.title);
});

test("W2-18-WFSAVE-02: a real CAS failure retains A's latest edits across B, reopen and browser reload, then explicit retry saves A", { timeout: 90_000 }, async t => {
  const editor = await openEditor(t);
  await watchSaves(editor, { hold: true, refuse: true });
  await addTwo(editor);
  await editor.frame.click(`[data-wf-open="${editor.b.workflow_id}"]`);
  await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.b.workflow_id}'`);
  await editor.frame.evaluate("window.__wfRelease()");
  await editor.frame.waitFor(`window.__wfRequests[0].returned && window.__wfReads.includes('${editor.a.workflow_id}')`);
  const refused = await editor.frame.evaluate<{ status: number; result: { code: string; error: string } }>("window.__wfRequests[0]");
  assert.equal(refused.status, 409);
  assert.equal(refused.result.code, "workflows.conflict");
  assert.ok(refused.result.error, "the original Host refusal remains observable");
  assert.equal(await editor.frame.evaluate("document.querySelector('.wf-editor').dataset.id"), editor.b.workflow_id, "a late failure cannot reopen A");
  assert.deepEqual(editor.saved(editor.a.workflow_id), editor.a, "a refused write does not change the Store");
  assert.deepEqual(editor.saved(editor.b.workflow_id), editor.b);
  assert.equal(await editor.frame.evaluate("window.__wfRequests.length"), 1, "a failed owner's queued edits pause without automatic replay");
  await editor.frame.evaluate(`(() => {
    const title = document.querySelector('[data-wf-title]'); title.value = 'B 仍可独立编辑';
    title.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await editor.frame.waitFor(`window.__wfRequests.some(request => request.id === '${editor.b.workflow_id}' && request.returned)
    && document.querySelector('[data-wf-save-state]').dataset.state === 'saved'`);
  const savedB = editor.saved(editor.b.workflow_id);
  assert.equal(savedB.title, "B 仍可独立编辑");
  assert.equal(savedB.revision, editor.b.revision + 1);
  assert.deepEqual(savedB.stations, editor.b.stations);
  assert.deepEqual(savedB.links, editor.b.links);
  await editor.frame.click(`[data-wf-open="${editor.a.workflow_id}"]`);
  await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.a.workflow_id}'`);
  assert.equal(await editor.frame.evaluate("document.querySelectorAll('[data-wf-chain] [data-wf-station]').length"), 3);
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').dataset.state"), "error");
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').dataset.mwState"), "failed", "RING-07: a refused save never displays the saved mark");
  assert.equal(await editor.frame.evaluate("JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext).unsaved"), true);
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-action=start]').disabled"), true, "an unsaved draft cannot start the older stored chain");
  // The Host now owns the unsaved-input prompt for an opaque editor; this journey explicitly chooses to reload.
  const leaving: string[] = [], answers: Promise<unknown>[] = [];
  const stopLeaving = editor.on("Page.javascriptDialogOpening", params => {
    leaving.push(String(params.type)); answers.push(editor.command("Page.handleJavaScriptDialog", { accept: true }, editor.sessionId));
  });
  try { await editor.reloadPage(); await Promise.all(answers); } finally { stopLeaving(); }
  assert.ok(leaving.every(type => type === "beforeunload"));
  // The Host's DOM is ready before the reloaded opaque editor has an execution context.
  await editor.click("[data-plugin-strip] [data-plugin-id=workflows]");
  await editor.surfaceReady("workflows");
  await editor.frame.waitFor(`document.querySelector('[data-wf-open="${editor.a.workflow_id}"]')`);
  if (await editor.frame.evaluate("document.querySelector('.wf-editor')?.dataset.id") !== editor.a.workflow_id) await editor.frame.click(`[data-wf-open="${editor.a.workflow_id}"]`);
  await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.a.workflow_id}' && document.querySelector('[data-wf-action=retry-save]')`);
  assert.equal(await editor.frame.evaluate("document.querySelectorAll('[data-wf-chain] [data-wf-station]').length"), 3, "the original A edits survive the page reload");
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').title"), refused.result.error, "the original save error survives reload with its draft");
  assert.deepEqual(editor.saved(editor.a.workflow_id), editor.a, "opening a retained draft never replays it");
  // SYS-15-U6: the real retry is committed, but its receipt has not reached the isolated editor yet.
  await watchSaves(editor, {hold: true});
  await editor.frame.click("[data-wf-action=retry-save]");
  await editor.frame.waitFor("window.__wfHeld");
  assert.notEqual(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').dataset.mwState"), "saved");
  await editor.frame.evaluate("window.__wfRelease()");
  await editor.frame.waitFor("document.querySelector('[data-wf-save-state]').dataset.state === 'saved'");
  assert.equal(await editor.frame.evaluate("document.querySelector('[data-wf-save-state]').dataset.mwState"), "saved", "RING-07: explicit retry restores the saved mark only after success");
  assert.deepEqual(editor.saved(editor.a.workflow_id).stations.map(station => station.plugin), ["feed", "inbox", "pages"]);
  assert.equal(editor.saved(editor.a.workflow_id).revision, editor.a.revision + 1);
  assert.deepEqual(editor.saved(editor.b.workflow_id), savedB);
  assert.equal(await editor.frame.evaluate("[...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index)).filter(key => key.startsWith('molis-workflows:') && key.endsWith(':drafts')).every(key => JSON.parse(sessionStorage.getItem(key)).length === 0)"), true);
});

test("W2-18-WFSAVE-02: removing A's station cannot mutate B after its exit animation awaits", { timeout: 90_000 }, async t => {
  const editor = await openEditor(t);
  await watchSaves(editor);
  await editor.frame.evaluate(`(() => {
    const station = document.querySelector('[data-wf-station="0"]');
    const animate = station.animate.bind(station); const timeout = window.setTimeout.bind(window);
    station.animate = (...args) => { const animation = animate(...args); animation.pause(); window.__wfFinishRemoval = () => animation.finish(); return animation; };
    window.matchMedia = () => ({ matches: false });
    window.setTimeout = (callback, ms, ...args) => { if (ms === 180) return 0; return timeout(callback, ms, ...args); };
    document.querySelector('[data-wf-action=remove][data-index="0"]').click();
    document.querySelector('[data-wf-open="${editor.b.workflow_id}"]').click();
  })()`);
  await editor.frame.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${editor.b.workflow_id}'`);
  await editor.frame.evaluate(`(async () => {
    window.__wfFinishRemoval();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  assert.equal(await editor.frame.evaluate("window.__wfRequests.length"), 0, "the obsolete removal does not save the later workflow");
  assert.deepEqual(editor.saved(editor.a.workflow_id), editor.a);
  assert.deepEqual(editor.saved(editor.b.workflow_id), editor.b);
  assert.equal(await editor.frame.evaluate("document.querySelector('.wf-editor').dataset.id"), editor.b.workflow_id);
  assert.equal(await editor.frame.evaluate("document.querySelectorAll('[data-wf-chain] [data-wf-station]').length"), 2);
});
