const assert = require('node:assert/strict');
const {chromium} = require('/Users/yijunwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.argv[2], project = process.argv[3];
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  for (const [name,width,height] of [['desktop',1440,950],['mobile',390,844]]) {
   const page = await browser.newPage({viewport:{width,height}}), errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/projects/'+project+'/');
   await page.waitForFunction(id=>localStorage.getItem('molis-work-tab-workspace:'+id),project);
   await page.evaluate(id=>{const key='molis-work-tab-workspace:'+id,state=JSON.parse(localStorage.getItem(key));const pane=state.panes[0];pane.tabs.push({id:'retired-functions',plugin:'functions',kind:'item',itemId:'old-rule',title:'Old rule'});pane.activeTabId='retired-functions';pane.viewPlugin='functions';localStorage.setItem(key,JSON.stringify(state));},project);
   await page.reload();
   await page.waitForFunction(id=>{const state=JSON.parse(localStorage.getItem('molis-work-tab-workspace:'+id));return state.panes.every(pane=>pane.viewPlugin!=='functions'&&pane.tabs.every(tab=>tab.plugin!=='functions'));},project);
   await page.goto(origin+'/capabilities/library?project='+project);
   await page.getByRole('link',{name:'编辑判断规则',exact:true}).click();
   await page.locator('[data-function-id]').first().waitFor();
   await page.locator('[data-functions-new]').click();
   const create = page.waitForResponse(r=>r.url().endsWith('/api/functions')&&r.request().method()==='POST');
   await page.locator('[data-functions-create-form] button[value="choice"]').click();
   const record=(await (await create).json()).function;
   await page.locator('[data-functions-name]').fill('浏览器验收规则 '+name);
   await page.locator('[data-functions-step="fn"]').click();
   await page.locator('[data-functions-instructions]').fill('材料明确提出需要跟进时选择 yes，否则选择 no。');
   await page.locator('[data-choice-description]').nth(0).fill('The material needs follow-up');
   await page.locator('[data-choice-description]').nth(1).fill('No follow-up needed');
   await page.screenshot({path:'.impeccable/review/action-service/rules-edit-'+name+'.png',fullPage:true});
   await page.locator('[data-functions-step="use"]').click();
   await page.locator('[data-functions-preview-input]').fill('请跟进这条验收材料。');
   const trial=page.waitForResponse(r=>r.url().endsWith('/'+record.id+'/preview'));
   await page.locator('[data-functions-preview]').click();
   const trialResponse=await trial; assert.equal(trialResponse.status(),200,await trialResponse.text());
   const publish=page.waitForResponse(r=>r.url().endsWith('/'+record.id+'/publish'));
   await page.locator('[data-functions-publish]').click();
   const publishedResponse=await publish; assert.equal(publishedResponse.status(),200,await publishedResponse.text());
   const published=(await publishedResponse.json()).function;
   await page.screenshot({path:'.impeccable/review/action-service/rules-published-'+name+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   await page.reload(); await page.locator('[data-functions-editor-title]').filter({hasText:'浏览器验收规则 '+name}).waitFor();
   await page.locator('[data-functions-back]').click(); assert.equal(new URL(page.url()).searchParams.has('rule'),false);
   await page.goto(origin+'/capabilities/library?q='+encodeURIComponent(published.function_key)+'&project='+project);
   await page.locator('.capability-row').filter({hasText:'浏览器验收规则 '+name}).waitFor();
   await page.goto(origin+'/capabilities/rules?rule=missing-rule');
   await page.locator('[data-functions-list-note]').filter({hasText:'函数不存在'}).waitFor({state:'visible'});
   await page.screenshot({path:'.impeccable/review/action-service/rules-missing-'+name+'.png',fullPage:true});
   assert.deepEqual(errors,[]); await page.close();
   console.log(name,'passed: library → create → autosave → trial → publish → reload → discover; missing ID visible; no horizontal overflow');
  }
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
