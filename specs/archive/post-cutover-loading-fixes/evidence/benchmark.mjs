import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
const {LocalProjectDatabase,GoalProjectApplication,seedDemoBoard,DEMO_BOARD_ID,buildMolisWorkWebView,cachedMolisWorkWebView}=await import('../../../apps/local-host/dist/index.js');
const {runWithMolisWorkHome}=await import('../../../packages/storage/dist/index.js');
const home=fs.mkdtempSync(join(tmpdir(),'molis-work-loading-benchmark-'));
process.env.MOLIS_WORK_SECRET_BACKEND='file';process.env.NODE_ENV='test';
delete process.env.MOLIS_WORK_GITHUB_TOKEN;delete process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN;
const dbFile=home+'/fixture.sqlite';if(!fs.existsSync(dbFile))seedDemoBoard(dbFile);
const db=new LocalProjectDatabase(dbFile);const app=new GoalProjectApplication(db);
try { await runWithMolisWorkHome(home,async()=>{
const rows=[];
for(const count of [30,100,250]){
 let total=db.snapshot(DEMO_BOARD_ID).goals.length;
 for(let i=total;i<count;i++)app.goals.commands.createGoal(DEMO_BOARD_ID,{goal_id:'loading-'+i,title:'加载验收目标 '+i,outcome:'完成一个独立可检查结果',why:'模拟项目增长后的工作列表',business_logic:'执行、记录依据、复核',definition_state:'accepted',decomposition_state:'closed_leaf',acceptance_criteria:[{criterion_id:'result-'+i,statement:'结果可检查',decision_method:'inspection',pass_condition:'结果已完成并记录'}]},{actor_id:'loading-qa',idempotency_key:'loading-create-'+i});
 const options={databasePath:dbFile,boardId:DEMO_BOARD_ID};
 const snapshotRead=db.snapshot.bind(db);let snapshots=0;db.snapshot=(id)=>{snapshots++;return snapshotRead(id)};
 const times=[];let view;
 for(let i=0;i<3;i++){const start=performance.now();view=buildMolisWorkWebView(db,app,options);times.push(performance.now()-start)}
 db.snapshot=snapshotRead;
 const cache=new Map();cachedMolisWorkWebView(cache,db,app,options);const start=performance.now();for(let i=0;i<20;i++)cachedMolisWorkWebView(cache,db,app,options);
 rows.push({goals:view.goals.length,events:view.events.length,coldViewMs:times.map(x=>Math.round(x)),snapshotReadsPerBuild:snapshots/3,warmViewMs:(performance.now()-start)/20,payloadBytes:Buffer.byteLength(JSON.stringify(view))});
 console.log(JSON.stringify(rows.at(-1)));
}
if (process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,2));
}); } finally { db.close(); fs.rmSync(home,{recursive:true,force:true}); }
