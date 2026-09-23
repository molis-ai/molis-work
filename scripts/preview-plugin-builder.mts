/** Local example preview: real PluginPlatform/SQLite, intentionally no model credentials. */
import {createServer} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {escapeHtml} from '@molis-ai/molis-work-design-system';
import {agentHostCapabilities} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import {LocalProjectDatabase} from '../apps/local-host/src/project-database.js';
import {seedDemoBoard,DEMO_BOARD_ID} from '../apps/local-host/src/demo-seed.js';
import {handleBuilderHttp,releaseBuilderSurface} from '../apps/local-host/src/plugin-builder-surface.js';
import {authorizeLocalWebRequest,sendLocalWebJson,type LocalMutationState} from '../apps/local-host/src/web-http.js';
const directory=mkdtempSync(join(tmpdir(),'molis-builder-preview-'));
const databasePath=join(directory,'project.db');seedDemoBoard(databasePath);
const store=new LocalProjectDatabase(databasePath),token=randomUUID()+randomUUID(),mutations=new Map<string,LocalMutationState>();
const ports={store,boardId:DEMO_BOARD_ID,actorId:'preview-user',homeDirectory:directory,goalTitle:()=>undefined,escapeHtml,translate:(value:string)=>value,
 capabilities:{async invoke<Input,Output>(definition:{capability_id:string},_args:Input):Promise<Output>{
  if([agentHostCapabilities.listRuntimes.capability_id,projectsCapabilities.listWorkspaces.capability_id].includes(definition.capability_id))return [] as Output;
  throw new Error('此独立预览未连接模型。请在正式项目中配置模型后使用 Prologue 构建。');
 }},execution:{async ready(){},async models(){return[];}}};
const server=createServer((request,response)=>{const url=new URL(request.url??'/','http://'+request.headers.host);if(!authorizeLocalWebRequest(request,response,url,token,mutations))return;
 void handleBuilderHttp(request,response,url,ports,token).then(handled=>{if(!handled)sendLocalWebJson(response,404,{error:'请打开 /plugin-builder'});}).catch(error=>sendLocalWebJson(response,500,{error:String(error)}));});
server.listen(0,'127.0.0.1',()=>{const address=server.address();if(address&&typeof address==='object')console.log('Plugin Builder example preview: http://127.0.0.1:'+address.port+'/plugin-builder');});
const stop=()=>server.close(()=>{void releaseBuilderSurface(store,DEMO_BOARD_ID).then(()=>{store.close();process.exit(0);});});process.on('SIGTERM',stop);process.on('SIGINT',stop);
