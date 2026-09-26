/** Isolated QA only. No personal Home, model, Connector or public network. */
import { mkdir, writeFile, access, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../../apps/local-host/src/project-host.js";
import { LocalProjectDatabase } from "../../apps/local-host/src/project-database.js";
import { GoalProjectApplication } from "../../apps/local-host/src/goal-project-application.js";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, startServer, memberClientId, CONTINUITY_ACTIONS, createImDomain } from "../src/index.js";
import type { ActionFactory } from "../src/index.js";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "../../packages/im-ui/src/index.js";
const directory=resolve(process.argv[2] ?? (()=>{throw Error("Pass an explicit isolated QA directory");})());
await mkdir(directory,{recursive:true,mode:0o700});
const databasePath=join(directory,'project.sqlite'),projectId='continuity-qa',boardId='continuity-qa-board';
const db=new LocalProjectDatabase(databasePath),app=new GoalProjectApplication(db);
app.initializeBoard({board_id:boardId,title:'设备接续 · 隔离实操',actor_id:'desktop',idempotency_key:'init'});
app.goalEvents.createIntent({board_id:boardId,goal_id:'mobile-handoff',title:'让工作在手机上继续',outcome:'查看桌面成果，记录下一步，再回桌面接续。',actor_id:'desktop',idempotency_key:'goal'});
app.artifacts.commands.registerVersion({board_id:boardId,artifact_id:'handoff-guide',version:2,actor_id:'desktop',artifact_type_id:'io.test.document',schema_version:1,
  producer:{plugin_id:'io.test.writer',plugin_version:'1.0.0',binding_signature:'qa-writer'},content:{kind:'inline',payload:'跨设备接续操作说明\n\n桌面整理固定成果 → 手机核对并留下下一步 → 桌面继续。\n\n这是隔离项目中的真实保存，不读取私人账号。'},metadata:{title:'跨设备接续 · 操作说明'},scope:'team_project',team_share_authorized:true});
db.close();
const host=new MolisWorkLocalHost({homeDirectory:directory,completeText:null});
const ref=molisWorkHostProjectReference({projectId,boardId,databasePath});
const factory:ActionFactory=({memberId,projectId,validate,signal})=>{
  const client=host.actionClient(ref);
  return {caller:{actor_id:memberClientId(memberId),project_id:projectId,audience:'user',actor_kind:'user',permissions:['goals:read','goals:write','artifacts:read'],allowed_actions:CONTINUITY_ACTIONS,validate_authority:validate,signal},
    client:{discover:caller=>client.discover(caller),invoke:async(caller,action,input)=>{
      const result=await client.invoke(caller,action,input);
      if(action.capability_id==='goals.progress.record'){
        const fault=join(directory,'lose-next-response');let lose=false;
        try{await access(fault);lose=true;}catch{}
        if(lose){await unlink(fault);throw Object.assign(new Error('QA response lost after real commit'),{code:'actions.delivery_unknown'});}
      }return result;
    }}};
};
const storage=openServerDatabase(join(directory,'server')),identity=new Identity(storage.db),events=new ServerEvents(storage.db),continuity=new ContinuityService(storage.db,identity,events,factory);
const owner=(storage.db.prepare('SELECT id,display_name FROM mw_members ORDER BY rowid LIMIT 1').get() as {id:string;display_name:string}|undefined) ?? identity.createMember('一骏 · 隔离实操');
continuity.registerProject({id:projectId,title:'设备接续 · 隔离实操',goal_ids:['mobile-handoff'],artifacts:[{artifact_id:'handoff-guide',version:2}]},owner.id);
await writeFile(join(directory,'connect.json'),JSON.stringify(identity.code('bootstrap',owner.id)),{mode:0o600});
const running=await startServer({identity,continuity,events,im:createImDomain({db:storage.db,identity,events}),imAssets:{html:renderImPage({embedded:false}),css:IM_STYLES,script:IM_CLIENT_SCRIPT},port:4189});
console.log(`${running.origin}/continuity\nPairing code in ${join(directory,'connect.json')}`);
const close=async()=>{await running.close();storage.close();await host.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);
