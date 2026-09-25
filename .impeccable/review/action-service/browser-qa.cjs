const assert=require('node:assert/strict');
const {chromium}=require('/Users/yijunwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.argv[2]; const project=process.argv[3];
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const errors=[];
for(const [name,width,height] of [['desktop',1440,950],['mobile',390,844]].filter(row=>!process.argv[4]||row[0]===process.argv[4])){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/projects/'+project+'/');
 if(width<760) await page.locator('.workspace-chrome [data-directory-show]').click();
 await page.getByRole('link',{name:'打开能力服务',exact:true}).click();
 assert.ok(page.url().includes('/capabilities/library?project='));
 await page.locator('.capability-row').filter({hasText:'入箱下一步（本地验收规则）'}).click();
 await page.getByText('合同兼容',{exact:true}).waitFor();
 await page.getByRole('heading',{name:'已用在哪'}).waitFor();
 await page.screenshot({path:'.impeccable/review/action-service/live-library-'+name+'.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 if(width<760) await page.getByRole('link',{name:'返回能力列表',exact:true}).click();
 await page.locator('input[name=q]').fill('not-a-capability');await page.getByRole('button',{name:'更新列表'}).click();
 await page.getByText('没有符合条件的能力',{exact:true}).waitFor();
 await page.goto(origin+'/capabilities/library?action=missing&version=1');
 await page.getByRole('heading',{name:'能力已不可访问'}).waitFor();
 assert.ok(await page.getByText('引用的能力或版本已不可访问，请检查插件状态、权限或重新选择。').isVisible());
 await page.goto(origin+'/capabilities/connections?project='+project);
 await page.locator('[data-connector-open="typesafe"]').click();
 await page.screenshot({path:'.impeccable/review/action-service/live-connections-'+name+'.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 await page.goto(origin+'/capabilities/access?project='+project);
 const toggle=page.locator('[data-mcp-tool="molis_work_v1_functions_list"]');const before=await toggle.isChecked();
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/settings/mcp')&&r.request().method()==='POST');await toggle.setChecked(!before);assert.equal((await saved).status(),200);
 await page.reload();assert.equal(await toggle.isChecked(),!before);
 await page.screenshot({path:'.impeccable/review/action-service/live-access-'+name+'.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 await page.getByRole('link',{name:'调用记录',exact:true}).click();await page.getByText('review.inbox.next · v1',{exact:true}).waitFor();
 await page.screenshot({path:'.impeccable/review/action-service/live-history-'+name+'.png',fullPage:true});
 console.log(name,'passed: island → library → binding details; search empty; stale reference; connection detail; MCP toggle survives reload; actual scene history');
 await page.close();
}
assert.deepEqual(errors,[]);console.log('No browser JavaScript errors.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
