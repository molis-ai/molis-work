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
  assert.throws(()=>pages.renderPluginPageWorkspace({ui,manifest,viewId:'other',model:{},surface:'page',basePath:'/app'}));
  ui.unregister('test.page');
  assert.throws(()=>pages.renderPluginPageWorkspace({ui,manifest,viewId:'suspicions',model:{},surface:'page',basePath:'/app'}));
});
