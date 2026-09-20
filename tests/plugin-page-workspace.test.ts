import assert from 'node:assert/strict';
import test from 'node:test';
import * as pages from '../apps/workbench/src/plugin-page-workspace.js';
import { UiHost } from '@molis-ai/molis-work-ui-host';

test('installed app views mount through declared slots without adding to builtin catalog', () => {
  const ui = new UiHost();
  ui.register({descriptor:{contribution_id:'test.page',plugin_id:'io.test.app',kind:'primary-page',label:'Test',slots:[],
    surfaces:[{surface_id:'page',target_slot_id:'workbench.main',format:'declarative-html'}]},render:()=>'<p>我的疑点内容</p>'});
  const manifest = {plugin_id:'io.test.app',name:'Test <unsafe>',ui:{contributions:['test.page'],views:[
    {view_id:'suspicions',slot:'stage',title:'我的疑点',contribution_id:'test.page'},
    {view_id:'backlog',slot:'stage',title:'改进 Backlog',contribution_id:'test.page'}]}} as any;
  const result = pages.renderPluginPageWorkspace({ui,manifest,viewId:'suspicions',model:{},surface:'page',basePath:'/app',development:true});
  assert.match(result,/我的疑点内容/);
  assert.match(result,/view=backlog/);
  assert.match(result,/aria-current="page"/);
  assert.match(result,/开发预览/);
  assert.doesNotMatch(result,/Test <unsafe>/);
  const single = pages.renderPluginPageWorkspace({ui,manifest:{...manifest,ui:{...manifest.ui,views:[{view_id:'test',slot:'stage',title:manifest.name,contribution_id:'test.page'}]}},viewId:'test',model:{},surface:'page',basePath:'/app'});
  const sidebar = single.match(/<aside>([\s\S]*?)<\/aside>/)![1];
  assert.equal((sidebar.match(/<a /g)??[]).length,1);
  assert.doesNotMatch(sidebar,/<h1>/);
  assert.match(sidebar,/Test &lt;unsafe&gt;/);
  assert.throws(()=>pages.renderPluginPageWorkspace({ui,manifest,viewId:'other',model:{},surface:'page',basePath:'/app'}));
  ui.unregister('test.page');
  assert.throws(()=>pages.renderPluginPageWorkspace({ui,manifest,viewId:'suspicions',model:{},surface:'page',basePath:'/app'}));
});
