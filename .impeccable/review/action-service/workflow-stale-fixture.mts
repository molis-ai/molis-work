// Seed an old persisted reference in the isolated browser fixture to simulate a removed action version.
import { basename } from 'node:path';
import { openWorkflowsStore, parseChain, manualLink } from '@molis-ai/molis-work-plugin-workflows';
import { feedContentActions, feedManifest } from '@molis-ai/molis-work-plugin-feed';
import { pagesContentActions, pagesManifest } from '@molis-ai/molis-work-plugin-pages';
const [home, project] = process.argv.slice(2);
if (!home || !project || !basename(home).startsWith('capabilities-browser-')) throw new Error('Use only the isolated capability browser fixture');
const store = openWorkflowsStore(home);
try {
 const binding=(manifest, definitions)=>({provider_id:manifest.plugin_id,actions:Object.fromEntries(Object.entries(definitions).map(([role,definition])=>[role,{capability_id:definition.capability_id,version:definition.version}]))});
 const feed=binding(feedManifest,feedContentActions); feed.actions.read.version=999;
 const flow=store.create({project_id:project,title:'验收 · 已失效的旧能力引用',chain:parseChain({stations:[{plugin:'feed',content:feed},{plugin:'pages',content:binding(pagesManifest,pagesContentActions)}],links:[manualLink()]})});
 console.log(flow.workflow_id);
} finally {store.close();}
