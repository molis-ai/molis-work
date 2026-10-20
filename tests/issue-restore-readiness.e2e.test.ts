import assert from 'node:assert/strict';
import test from 'node:test';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { issueModel } from './fixtures/issue-model.js';
import { issueView } from './fixtures/issue-browser.js';

test('list readiness does not mean its saved screenshot draft is ready to submit', {timeout:45_000}, async t => {
  const b=await openGoalBrowser(t,'empty',undefined,null);if(!b)return;
  const {requests}=await issueModel(t,b.homeDirectory,{question:'free-text'}),v=issueView(b);
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const original=caches.open.bind(caches); let release;
    const gate=new Promise(resolve=>{release=resolve}); window.releaseIssueCache=release;
    caches.open=async(...args)=>{await gate;return original(...args)};
  })()`},b.sessionId);
  await v.viewport(1280);await v.go('/plugins/issues');
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press('[data-issue-composer] [name=description]');await v.type('111');
  assert.equal(await v.ask("$('[data-issue-submit]').disabled"),true,'the image restore is still pending');
  await v.send();
  assert.equal(await v.ask("$('[data-issue-composer] textarea').value"),'111');
  assert.equal(requests.length,0,'sending while draft restoration is unfinished is intentionally ignored');
  await v.ask('(d.defaultView.releaseIssueCache(),true)');
  await v.until("!$('[data-issue-submit]').disabled");await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：')",20_000);
  assert.equal(requests.length,1,'waiting for the actual enabled control submits exactly once');
});
