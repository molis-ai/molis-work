const assert = require('node:assert/strict');
const {chromium} = require('/Users/yijunwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.argv[2], project=process.argv[3];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  for(const [name,width,height] of [['desktop',1440,950],['mobile',390,844]]) {
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${origin}/projects/${project}/?openPlugin=workflows`);
   if(width<760) await page.locator('.workspace-chrome [data-directory-show]').click();
   await page.locator('[data-work-surface-open="workflows"]').click();
   const root=page.locator('[data-workflows]').filter({visible:true});
   await root.locator('[data-wf-action="new"]').click();
   await root.locator('[data-wf-title]').fill('目录接线验收 '+name);
   const saved=()=>page.waitForResponse(r=>r.url().includes('/api/workflows/')&&r.request().method()==='POST');
   let save=saved(); await root.locator('[data-wf-plugin="feed"]').click(); assert.equal((await save).status(),200);
   save=saved(); await root.locator('[data-wf-plugin="pages"]').click(); assert.equal((await save).status(),200);
   await root.locator('[data-wf-action="link"]').first().click();
   save=saved(); await root.locator('[data-wf-action="kind"][data-kind="function"]').click(); assert.equal((await save).status(),200);
   save=saved(); await root.locator('[data-wf-link-field="body_template"]').fill('验收内容：\n{正文}'); assert.equal((await save).status(),200);
   await page.keyboard.press('Escape');
   await page.screenshot({path:`.impeccable/review/action-service/workflow-config-${name}.png`,fullPage:true,animations:"disabled"});
   await root.locator('[data-wf-action="start"]').click();
   await root.locator('[data-wf-dialog-submit]').click();
   await root.locator('[data-wf-action="continue"]').waitFor();
   const next=page.waitForResponse(r=>r.url().endsWith('/continue')&&r.request().method()==='POST');
   await root.locator('[data-wf-action="continue"]').click();
   const response=await next; assert.equal(response.status(),200,await response.text());
   const run=(await response.json()).instance; assert.equal(run.status,'done');
   assert.equal(run.steps[0].handoff.output.body,'验收内容：\n核对新增能力的可用条件。');
   await root.locator('[data-wf-run-bar]').filter({hasText:'已走完'}).waitFor();
   await root.frameLocator('[data-wf-frame][title^=Pages]').locator('body').filter({hasText:'验收内容：'}).waitFor();
   await page.screenshot({path:`.impeccable/review/action-service/workflow-done-${name}.png`,fullPage:true,animations:"disabled"});
   await page.reload();
   await root.locator('[data-wf-run-bar]').filter({hasText:'已走完'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   if(process.argv[4]) {
    await root.locator('[data-wf-action="back-to-flow"]').click();
    await root.locator('[data-wf-action="back"]').click();
    await root.locator('[data-wf-open="'+process.argv[4]+'"]').click();
    await root.locator('.wf-station__warning[aria-label*=v999]').waitFor();
    assert.equal(await root.locator('[data-wf-action="start"]').isDisabled(),true);
    await page.screenshot({path:`.impeccable/review/action-service/workflow-unavailable-${name}.png`,fullPage:true,animations:"disabled"});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   }
   assert.deepEqual(errors,[]);
   await page.close(); console.log(name,'passed: automatic directory → template → real Feed to Pages handoff → reload');
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
