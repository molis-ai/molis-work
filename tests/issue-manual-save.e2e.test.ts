import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { issueView, type IssueBrowser } from "./fixtures/issue-browser.js";

const description = "  切换页面后输入消失。\n原文保留。\n";
const title = "切换页面后输入消失";

async function manual(t: TestContext) {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  await issueModel(t, b.homeDirectory, { question: "free-text" });
  const v = await issueView(t, b);
  await v.viewport(1440); await v.go("/plugins/issues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press("[data-issue-composer] [name=description]"); await v.type(description); await v.paste();
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1 && !$('[data-issue-submit]').disabled");
  await v.send(); await v.until("$('[data-state=attention]')", 20_000);
  await v.press("[data-state=attention]"); await v.press("[data-issue-editor] [name=title]"); await v.type(title);
  await v.press("[data-issue-editor] [data-type=bug]");
  const image = await v.ask<string>("$('[data-issue-edit-shots] img').src");
  return { b, v, image };
}

function stored(b: IssueBrowser) {
  const db = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db"), { readOnly: true });
  try { return db.prepare("SELECT id, title, description, images_json, version FROM issues").all(); }
  finally { db.close(); }
}

async function recordIsIntact(b: IssueBrowser, v: Awaited<ReturnType<typeof issueView>>, image: string) {
  const records = stored(b);
  assert.equal(records.length, 1, "the real Issue database must contain exactly one record");
  const row = records[0]!;
  assert.equal(row.title, title); assert.equal(row.description, description); assert.equal(row.version, 1);
  assert.deepEqual(JSON.parse(String(row.images_json)), [{ name: "shot.png", data_url: image }]);
  const issue = await v.read(String(row.id));
  assert.equal(issue.description, description); assert.equal(issue.images[0]!.data_url, image);
  assert.equal(issue.entered_via, "manual");
  return String(row.id);
}

test("W2-18-ISSUE-01 ISSUE-15 ISSUE-37 repeated save clicks and shortcuts with a capture response held create one real record", { timeout: 90_000 }, async t => {
  const setup = await manual(t); if (!setup) return;
  const { b, v, image } = setup;
  // Only delay delivery: every request still reaches the real Host and SQLite.
  await v.ask(`(() => {
    const w = d.defaultView, fetch = w.fetch.bind(w); w.issueFlight = 0; w.issueCaptures = []; w.issueAnswers = [];
    w.issueGate = new Promise(resolve => { w.issueRelease = resolve; });
    w.fetch = async (url, init) => {
      w.issueFlight++;
      try {
        const capture = String(url).endsWith('/capture');
        if (capture) w.issueCaptures.push(JSON.parse(init.body).draft_id);
        const response = await fetch(url, init);
        if (capture) { w.issueAnswers.push(await response.clone().json()); await w.issueGate; }
        return response;
      } finally { w.issueFlight--; }
    }; return true;
  })()`);
  const point = await v.point("[data-issue-save]");
  await v.press("[data-issue-save]"); await v.until("d.defaultView.issueAnswers.length === 1");
  assert.equal(stored(b).length, 1, "first write committed while its answer is held");
  // Hit the same button again even when the editor is inert: do not make the test depend on disabled styling.
  for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, b.sessionId);
  // A submit event can also arrive without a clickable button (e.g. requestSubmit): the save itself must be guarded.
  await v.ask("($('[data-issue-editor]').requestSubmit(), true)");
  await v.send(); await v.send();
  await v.ask("(d.defaultView.issueRelease(), true)");
  await v.until("$('[data-issue-detail]').hidden && d.defaultView.issueFlight === 0");
  const id = await recordIsIntact(b, v, image);
  assert.equal(await v.ask("d.defaultView.issueCaptures.length"), 1, "repeated submission must not dispatch additional captures");
  assert.deepEqual(await v.ask("d.defaultView.issueCaptures"), [id]);
});

for (const [recovery, receipt] of [["retry", "lost"], ["reload", "lost"], ["retry", "malformed"]] as const) {
  test(`RAC-139 W2-18-ISSUE-02 ISSUE-15 ISSUE-37 ${recovery} checks the same record after a committed capture has a ${receipt} receipt`, { timeout: 90_000 }, async t => {
    const setup = await manual(t); if (!setup) return;
    const { b, v, image } = setup;
    await v.ask(`(() => {
      const w = d.defaultView, fetch = w.fetch.bind(w); w.issueCaptures = [];
      w.fetch = async (url, init) => {
        const capture = String(url).endsWith('/capture');
        if (capture) w.issueCaptures.push(JSON.parse(init.body).draft_id);
        const response = await fetch(url, init);
        if (capture && w.issueCaptures.length === 1) {
          await response.clone().json();
          if (${JSON.stringify(receipt)} === 'malformed') return new w.Response('{broken', { status: 200 });
          throw new TypeError('receipt lost after commit');
        }
        return response;
      }; return true;
    })()`);
    await v.press("[data-issue-save]"); await v.until("$('[data-issue-toast] span').textContent.includes('可能已经生效')");
    const id = await recordIsIntact(b, v, image);
    assert.equal(await v.ask("$('[data-issue-editor] [name=description]').value"), description);
    assert.equal(await v.ask("$('[data-issue-edit-shots] img').src"), image);
    // The pending identity is durable before the write is dispatched, not reconstructed from a title match.
    const pendingId = await v.ask("JSON.parse(localStorage.getItem('molis:issue-unsent'))[0].id");
    if (recovery === "retry") {
      // The Runtime no longer holds the saved draft: its persistent row still settles the request.
      await v.api("/api/plugins/io.molis.work.issues/cancel-capture", { draft_id: id });
      await v.press("[data-issue-save]"); await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
      assert.equal(await recordIsIntact(b, v, image), id);
      assert.deepEqual(await v.ask("d.defaultView.issueCaptures"), [id], "checking an existing record must not capture again");
    } else {
      await v.go("/plugins/issues");
      await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true' && $('[data-issue-list] .issues-row')");
      assert.equal(await v.ask("d.querySelectorAll('[data-state]').length"), 0, "reload reconciles the pending request with the saved row");
    }
    assert.equal(await recordIsIntact(b, v, image), id);
    assert.equal(pendingId, id, "the pending request keeps the actual captured identity");
    assert.deepEqual(await v.ask("JSON.parse(localStorage.getItem('molis:issue-unsent'))"), []);
    await v.press(`[data-issue-id="${id}"]`);
    await v.until("!$('[data-issue-view]').hidden && $('[data-issue-text]').textContent === " + JSON.stringify(description));
    assert.equal(await v.ask("$('[data-issue-view-shots] img').src"), image);
  });
}

test("W2-18-ISSUE-02 ISSUE-15 an uncommitted capture is checked before an explicit retry reuses its identity", { timeout: 90_000 }, async t => {
  const setup = await manual(t); if (!setup) return;
  const { b, v, image } = setup;
  await v.ask(`(() => {
    const w = d.defaultView, fetch = w.fetch.bind(w); w.issueCalls = [];
    w.fetch = (url, init) => {
      w.issueCalls.push({ path: String(url), body: init?.body && JSON.parse(init.body) });
      if (String(url).endsWith('/capture') && w.issueCalls.filter(call => call.path.endsWith('/capture')).length === 1)
        return Promise.reject(new TypeError('request never reached Host'));
      return fetch(url, init);
    }; return true;
  })()`);
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-toast] span').textContent.includes('可能已经生效')");
  assert.equal(stored(b).length, 0);
  const id = await v.ask<string>("JSON.parse(localStorage.getItem('molis:issue-unsent'))[0].id");
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-detail]').hidden && !$('[data-state]')");
  assert.equal(await recordIsIntact(b, v, image), id);
  const calls = await v.ask<Array<{ path: string; body?: { draft_id: string } }>>("d.defaultView.issueCalls");
  const captures = calls.map((call, index) => ({ ...call, index })).filter(call => call.path.endsWith('/capture'));
  assert.deepEqual(captures.map(call => call.body!.draft_id), [id, id]);
  assert.ok(calls.slice(captures[0]!.index + 1, captures[1]!.index).some(call => call.path.endsWith('read?id=' + id)), "retry reads the previous identity before any new capture");
});


test("RAC-139 background naming with a malformed receipt reads the committed record instead of keeping a failed draft", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  const { namings } = await issueModel(t, b.homeDirectory);
  const v = await issueView(t, b);
  await v.viewport(1440); await v.go("/plugins/issues");
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press("[data-issue-composer] [name=description]"); await v.type(description); await v.paste();
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 1 && !$('[data-issue-submit]').disabled");
  const image = await v.ask<string>("$('[data-issue-thumbs] img').src");
  await v.ask(`(() => {
    const w = d.defaultView, fetch = w.fetch.bind(w); w.issueCalls = []; w.issueNamed = null;
    w.fetch = async (url, init) => {
      w.issueCalls.push({ path: String(url), body: init?.body && JSON.parse(init.body) });
      const response = await fetch(url, init);
      if (String(url).endsWith('/name-draft')) {
        w.issueNamed = await response.clone().json();
        return new w.Response('{broken', { status: 200 });
      }
      return response;
    }; return true;
  })()`);
  await v.send();
  await v.until("d.defaultView.issueNamed && !$('[data-state]') && $('[data-issue-list] .issues-row')", 30_000);
  const records = stored(b);
  assert.equal(records.length, 1);
  const id = String(records[0]!.id);
  assert.equal(records[0]!.description, description);
  assert.deepEqual(JSON.parse(String(records[0]!.images_json)), [{ name: "shot.png", data_url: image }]);
  const issue = await v.read(id);
  assert.equal(issue.entered_via, "assistant");
  assert.equal(namings.length, 1);
  assert.deepEqual(await v.ask("JSON.parse(localStorage.getItem('molis:issue-unsent'))"), []);
  const calls = await v.ask<Array<{ path: string; body?: { draft_id: string } }>>("d.defaultView.issueCalls");
  const naming = calls.findIndex(call => call.path.endsWith('/name-draft'));
  assert.equal(calls[naming]!.body!.draft_id, id);
  assert.ok(calls.slice(naming + 1).some(call => call.path.endsWith('read?id=' + id)), "malformed JSON must trigger a read of the actual saved identity");
  assert.equal(calls.filter(call => call.path.endsWith('/name-draft')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/capture')).length, 0, "recovery must not issue another capture");
  assert.match(await v.ask<string>("$('[data-issue-toast] span').textContent"), /已记录：/);
});
