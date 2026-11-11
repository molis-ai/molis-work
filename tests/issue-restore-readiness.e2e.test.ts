import assert from 'node:assert/strict';
import test from 'node:test';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { issueModel } from './fixtures/issue-model.js';
import { issueView } from './fixtures/issue-browser.js';

test('list readiness does not mean its saved screenshot draft is ready to submit', {timeout:45_000}, async t => {
  let model!:Awaited<ReturnType<typeof issueModel>>;
  const b=await openGoalBrowser(t,'empty',undefined,undefined,undefined,undefined,{
    prepareHome:async home=>{model=await issueModel(t,home,{question:'free-text'});},
  });if(!b)return;
  const v=await issueView(t,b);
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    // The trusted parent of the plugin frame owns CacheStorage. Share one barrier across its same-origin documents.
    let owner; try { owner=window.top;void owner.location.href; } catch { return; }
    const gate=owner.issueDraftGate??=new Promise(resolve=>{owner.releaseIssueDraft=resolve});
    const open=caches.open.bind(caches);
    caches.open=async name=>{
      if(name.startsWith('molis-account-cache:')&&name.includes(':molis-plugin-page:')&&name.endsWith(':drafts')){owner.issueDraftWaiting=true;await gate;}
      return open(name);
    };
  })()`},b.sessionId);
  await v.viewport(1280);await v.go('/plugins/issues');
  await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await b.waitFor('window.issueDraftWaiting === true');
  await v.press('[data-issue-composer] [name=description]');await v.type('111');
  assert.equal(await v.ask("$('[data-issue-submit]').disabled"),true,'the image restore is still pending');
  await v.send();
  assert.equal(await v.ask("$('[data-issue-composer] textarea').value"),'111');
  assert.equal(model.namings.length,0,'sending while draft restoration is unfinished is intentionally ignored');
  await b.evaluate('(window.releaseIssueDraft(),true)');
  await v.until("!$('[data-issue-submit]').disabled");await v.send();
  await v.until("$('[data-state=attention]')?.textContent.includes('需要补充：')",20_000);
  assert.equal(model.namings.length,1,'waiting for the actual enabled control submits exactly once');
});
