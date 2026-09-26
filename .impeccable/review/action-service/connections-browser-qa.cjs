const assert=require('node:assert/strict');
const {chromium}=require('/Users/yijunwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.argv[2],project=process.argv[3];
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 for(const [name,width,height] of [['desktop',1440,950],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/settings/functions?project='+project+'&desktop=1');
  await page.locator('[data-connector-detail="typesafe"]').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).pathname,'/capabilities/connections');
  assert.equal(new URL(page.url()).searchParams.get('project'),project);
  const panel=page.locator('[data-connector-detail="typesafe"]');
  const account='本地验收账号 '+name;
  await panel.locator('[data-connector-new-name]').fill(account);
  await panel.locator('[data-connector-token="typesafe"]').fill('fixture-token-'+name);
  const created=page.waitForResponse(r=>r.url().endsWith('/api/settings/connectors/connections')&&r.request().method()==='POST');
  await panel.locator('[data-connector-auth="typesafe"] button[type="submit"]').click();
  const response=await created;assert.equal(response.status(),201,await response.text());
  const connection=(await response.json()).connection;
  await page.waitForFunction(id=>[...document.querySelectorAll('[data-functions-connection] option')].some(o=>o.value===id),connection.connection_id);
  await panel.locator('[data-functions-settings] [role=combobox]').click();
  await panel.locator('[role=option][data-value="'+connection.connection_id+'"]').click();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/functions/settings')&&r.request().method()==='POST');
  await panel.locator('[data-functions-key-save]').click();assert.equal((await saved).status(),200);
  await page.reload();await panel.waitFor({state:'visible'});
  assert.equal(await panel.locator('[data-functions-connection]').inputValue(),connection.connection_id);
  assert.equal(await page.locator('h1:visible').count(),1);
  await panel.locator('[data-functions-settings]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'.impeccable/review/action-service/connections-selection-'+name+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  const cleared=page.waitForResponse(r=>r.url().endsWith('/api/functions/settings')&&r.request().method()==='POST');
  await panel.locator('[data-functions-key-clear]').click();assert.equal((await cleared).status(),200);
  await page.waitForFunction(()=>document.querySelector('[data-functions-connection]').value==='');
  assert.match(await panel.locator('[data-functions-settings] [role=combobox]').innerText(),/选择连接/);
  await page.reload();assert.equal(await panel.locator('[data-functions-connection]').inputValue(),'');
  assert.ok(await panel.locator('[data-connection-row="'+connection.connection_id+'"]').count());
  await panel.locator('[data-connectors-back]').click();assert.equal(await panel.isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();console.log(name,'passed: legacy setting link → TypeSafe → add fixture account → select → reload → clear selection, account preserved');
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
