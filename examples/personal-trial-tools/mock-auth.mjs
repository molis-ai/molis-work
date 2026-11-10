/** Explicit disposable V2 peer. This substitute never talks to real accounts. */
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const random=()=>randomBytes(32).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest('base64url');
export function trialAccountConfig(authOrigin,productOrigin,applicationId='work',clientId='molis-work-personal-trial'){
 return {environmentId:'unified-local',environmentKind:'LOCAL',authOrigin,productOrigin,applicationId,clientId,policyProfile:'unified-account-v2',redirectAllowlist:[productOrigin+'/account/callback'],providerMode:'MOCK',deliveryMode:'MOCK'};
}
export function createTrialAuthPeer({configuration,user=()=> 'local-personal-trial-user',stateFile,waits={}}){
 const transactions=new Map(),codes=new Map(),tokens=new Map();
 if(stateFile&&existsSync(stateFile)){const saved=JSON.parse(readFileSync(stateFile,'utf8'));if(saved.format!==2||!Array.isArray(saved.tokens)||saved.tokens.length>256)throw Error('Invalid V2 trial state');for(const pair of saved.tokens)tokens.set(...pair);}
 const persist=()=>{if(!stateFile)return;mkdirSync(dirname(stateFile),{recursive:true});writeFileSync(stateFile+'.tmp',JSON.stringify({format:2,tokens:[...tokens]}),{mode:0o600});renameSync(stateFile+'.tmp',stateFile);};
 const json=(data,status=200)=>Response.json(status===200?{data,requestId:"request_"+random()}:{error:{code:data},requestId:"request_"+random()},{status});
 const fetcher=async(input,init={})=>{
  const url=new URL(String(input)),config=configuration(),headers=new Headers(init.headers),body=init.body?JSON.parse(String(init.body)):{};
  const path=url.pathname,method=init.method??'GET',credential=headers.get('authorization')?.replace(/^Bearer /,''),active=tokens.get(credential);
  if(path==='/api/v2/auth/transactions'||path==='/api/v2/users/me/reauthentications'){
   if(body.clientId!==config.clientId||body.redirectUri!==config.redirectAllowlist[0])return json('INVALID_CLIENT',400);
   if(path.includes('/users/me/')&&!active)return json('SESSION_EXPIRED',401);
   const id="tx_"+random(),t={...body,id,userId:active?.user.userId??user(),expiresAt:new Date(Date.now()+600000).toISOString(),status:'PENDING',nextStep:body.method==='EMAIL_PASSWORD'?'PASSWORD_LOGIN':'REQUEST_CHALLENGE',reauth:path.includes('/users/me/')};
   transactions.set(id,t);return json({transactionId:id,status:t.status,nextStep:t.nextStep,expiresAt:t.expiresAt});
  }
  const tx=/^\/api\/v2\/auth\/transactions\/([^/]+)(?:\/(.*))?$/.exec(path);
  if(tx){const t=transactions.get(tx[1]);if(!t||digest(headers.get('x-auth-initiator-proof')??'')!==t.initiatorChallenge)return json('FORBIDDEN',403);
   const action=tx[2];if(!action&&method==='GET')return json({transactionId:t.id,status:t.status,nextStep:t.nextStep,expiresAt:t.expiresAt});
   if(t.status==='CONSUMED')return json('TRANSACTION_EXPIRED',409);
   if(action==='password'){if(t.reauth&&!String(body.email).startsWith(t.userId+'@'))return json('INVALID_CREDENTIALS',401);t.status='VERIFIED';t.nextStep='COMPLETE';return json({status:'VERIFIED',nextStep:'COMPLETE'});}
   if(action==='complete'){if(t.status!=='VERIFIED')return json('FORBIDDEN',403);t.status='CONSUMED';t.nextStep='NONE';if(t.reauth)return json({kind:'OPERATION_PROOF',operationProof:random(),expiresAt:t.expiresAt});const code=random();codes.set(code,t);return json({kind:'LOGIN_CODE',code,state:t.state,expiresAt:t.expiresAt});}
   return json('NOT_FOUND',404);
  }
  if(path==='/api/v2/auth/token'){
   let t;
   if(body.grantType==='authorization_code'){t=codes.get(body.code);codes.delete(body.code);if(!t||body.clientId!==t.clientId||body.redirectUri!==t.redirectUri||digest(body.codeVerifier??'')!==t.codeChallenge)return json('INVALID_CREDENTIALS',401);}
   else {const pair=[...tokens].find(([,v])=>v.refreshToken===body.refreshToken);if(!pair)return json('SESSION_EXPIRED',401);t={userId:pair[1].user.userId,session:pair[1].session};tokens.delete(pair[0]);}
   await waits.token?.(t.userId);
   const now=Date.now(),session=t.session??{loginSessionId:"login_"+random(),applicationId:config.applicationId,clientId:config.clientId,authenticatedAt:new Date(now-1000).toISOString(),lastActiveAt:new Date(now-1000).toISOString(),idleExpiresAt:new Date(now+30*86400000).toISOString(),absoluteExpiresAt:new Date(now+90*86400000).toISOString(),sessionRevision:0};
   const result={accessToken:random(),refreshToken:random(),tokenType:'Bearer',accessExpiresAt:new Date(now+900000).toISOString(),session};tokens.set(result.accessToken,{...result,user:{issuer:config.authOrigin,userId:t.userId,displayName:t.userId,email:null,avatarUrl:null,version:0}});persist();return json(result);
  }
  if(path==='/api/v2/sessions/current/logout'||path==='/api/v2/sessions/logout-all'){
   const target=active??[...tokens.values()].find(t=>t.refreshToken===body.refreshProof?.refreshToken);if(!target)return json('SESSION_EXPIRED',401);
   for(const [key,t] of tokens)if(path.endsWith('logout-all')?t.user.userId===target.user.userId:t.session.loginSessionId===target.session.loginSessionId)tokens.delete(key);persist();return json({revokedScope:path.endsWith('logout-all')?'ALL_MOLIS_PRODUCTS':'CURRENT_LOGIN',status:'REVOKED',...(path.endsWith('logout-all')?{}:{loginSessionId:target.session.loginSessionId})});
  }
  if(!active)return json('SESSION_EXPIRED',401);
  if(path==='/api/v2/users/me'){await waits.identity?.(active.user.userId);return json({user:active.user,session:active.session,loginMethods:[],passwordEnabled:false,platformCapabilities:[]});}
  if(path==='/api/v2/sessions/current')return json(active.session);
  if(path==='/api/v2/sessions/current/activity')return json(active.session);
  return json('NOT_FOUND',404);
 };
 return {fetch:fetcher};
}
export function createTrialAuthServer({webOrigin,stateFile}){
 const web=new URL(webOrigin);if(web.hostname!=='127.0.0.1'||web.protocol!=='http:'||web.origin!==webOrigin)throw Error('Trial requires an explicit loopback web origin');
 let origin='';const peer=createTrialAuthPeer({configuration:()=>trialAccountConfig(origin,webOrigin),stateFile});
 const server=createServer(async(req,res)=>{try{if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}const chunks=[];for await(const chunk of req)chunks.push(chunk);const reply=await peer.fetch(origin+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks).toString():undefined});res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));}catch{res.writeHead(400).end();}});
 server.on('listening',()=>{origin='http://127.0.0.1:'+server.address().port;});return server;
}
