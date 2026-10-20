/** Local-only trial launcher. Requires a separately installed, explicitly marked trial Home. */
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createTrialAuthServer} from './mock-auth.mjs';

const index=process.argv.indexOf('--home');
if(index<0||!process.argv[index+1])throw new Error('Use --home with the independently installed personal trial directory');
const home=resolve(process.argv[index+1]);
const marker=JSON.parse(readFileSync(join(home,'personal-trial.json'),'utf8'));
const installation=JSON.parse(readFileSync(join(home,'config','installation.json'),'utf8'));
if(marker.format!==1||marker.mockUser!==true||marker.home!==home||marker.contentDigest!==installation.content_digest)throw new Error('Trial installation identity or content digest changed; review the install before starting');
const webOrigin='http://127.0.0.1:43217',authOrigin='http://127.0.0.1:43218';
const auth=createTrialAuthServer({webOrigin,stateFile:join(home,'config','trial-auth-state.json')});
await new Promise((resolve,reject)=>{auth.once('error',reject);auth.listen(43218,'127.0.0.1',resolve);});
const env={...process.env,MOLIS_WORK_HOME:home,MOLIS_WORK_AUTH_ORIGIN:authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:'molis-work-personal-trial',MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID:'molis-work-personal-trial-desktop',MOLIS_WORK_SECRET_BACKEND:'file'};
for(const name of ['MOLIS_WORK_SYNC_ORIGIN','MOLIS_WORK_SYNC_LOCAL','MOLIS_WORK_CLOUD_ORIGIN'])delete env[name];
const child=spawn(join(home,'bin','molis-work-web'),['--home',home,'--port','43217'],{env,stdio:'inherit'});
const stop=()=>{child.kill('SIGTERM');auth.close();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
child.once('error',error=>{process.stderr.write(error.message+'\n');auth.close();process.exitCode=1;});
child.once('exit',code=>{auth.close();process.exitCode=code??1;});
process.stdout.write('个人试用用户（本机模拟） · 不连接真实云端\n');
process.stdout.write('试用地址：'+webOrigin+' · 按 Ctrl+C 停止；重新运行可继续使用原内容。\n');
