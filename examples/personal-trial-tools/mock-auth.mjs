/** Explicit local trial identity. Never deploy this substitute as an account service. */
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export function createTrialAuthServer({webOrigin,stateFile}) {
  const web=new URL(webOrigin);
  if(web.hostname!=='127.0.0.1'||web.protocol!=='http:'||web.origin!==webOrigin)throw new Error('Trial requires an explicit loopback web origin');
  const clients=['molis-work-personal-trial','molis-work-personal-trial-desktop'];
  const transactions=new Map(),codes=new Map();
  let saved={format:1,tokens:[]};
  if(existsSync(stateFile)){
    saved=JSON.parse(readFileSync(stateFile,'utf8'));
    if(saved.format!==1||!Array.isArray(saved.tokens)||saved.tokens.length>32)throw new Error('Invalid trial identity state; originals retained');
  }
  const persist=()=>{mkdirSync(dirname(stateFile),{recursive:true});writeFileSync(stateFile+'.tmp',JSON.stringify(saved),{mode:0o600});renameSync(stateFile+'.tmp',stateFile);};
  const random=()=>randomBytes(32).toString('base64url');
  const issue=clientId=>{
    const row={clientId,access:random(),refresh:random()};saved.tokens.push(row);saved.tokens=saved.tokens.slice(-32);persist();
    return {access_token:row.access,refresh_token:row.refresh,expires_in:3600};
  };
  return createServer(async(req,res)=>{
    const json=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    try{
      const origin='http://'+req.headers.host,url=new URL(req.url,origin);
      if(url.hostname!=='127.0.0.1'){json(403,{error:'loopback only'});return;}
      if(req.method==='POST'&&url.pathname==='/api/v1/auth/transactions'){
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000){json(413,{error:'trial request too large'});return;}}
        const value=JSON.parse(raw);
        if(!clients.includes(value.clientId)||value.redirectUri!==webOrigin+'/account/callback'||value.codeChallengeMethod!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(value.codeChallenge)||typeof value.state!=='string'||value.state.length>200){json(400,{error:'invalid trial transaction'});return;}
        for(const [key,item] of transactions)if(item.expires<Date.now())transactions.delete(key);
        if(transactions.size>=32){json(429,{error:'too many trial logins'});return;}
        const id=random();transactions.set(id,{...value,expires:Date.now()+600000});json(200,{data:{loginUrl:origin+'/login?transaction='+id}});return;
      }
      if(req.method==='GET'&&(url.pathname==='/'||(url.pathname==='/login'&&!url.searchParams.has('transaction')))){
        const pending=[...transactions].filter(([,value])=>value.expires>Date.now());
        const link=pending.length===1?'/login?transaction='+pending[0][0]:webOrigin+'/';
        const label=pending.length===1?'继续本机模拟登录':'先返回工作台点击登录';
        res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
        res.end('<!doctype html><meta charset="utf-8"><title>本机模拟用户</title><main style="max-width:36rem;margin:15vh auto;font:18px system-ui;padding:24px"><h1>个人试用用户（本机模拟）</h1><p>这是本机试用账号，不连接真实账号或云端。</p><a href="'+link+'">'+label+'</a></main>');return;
      }
      if(req.method==='GET'&&url.pathname==='/login'){
        const id=url.searchParams.get('transaction'),value=transactions.get(id);transactions.delete(id);
        if(!value||value.expires<Date.now()){json(400,{error:'trial login expired'});return;}
        for(const [key,item] of codes)if(item.expires<Date.now())codes.delete(key);
        if(codes.size>=32){json(429,{error:'too many pending trial proofs'});return;}
        const code=random();codes.set(code,value);const callback=new URL(value.redirectUri);callback.searchParams.set('code',code);callback.searchParams.set('state',value.state);
        res.writeHead(303,{location:callback.href,'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
      }
      if(req.method==='POST'&&url.pathname==='/oauth2/token'){
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000){json(413,{error:'trial request too large'});return;}}
        const body=new URLSearchParams(raw),client=body.get('client_id');
        if(!clients.includes(client)){json(401,{error:'unknown trial client'});return;}
        if(body.get('grant_type')==='authorization_code'){
          const value=codes.get(body.get('code'));codes.delete(body.get('code'));
          if(!value||value.expires<Date.now()||value.clientId!==client||value.redirectUri!==body.get('redirect_uri')||createHash('sha256').update(body.get('code_verifier')??'').digest('base64url')!==value.codeChallenge){json(401,{error:'invalid trial proof'});return;}
        }else if(body.get('grant_type')==='refresh_token'){
          const index=saved.tokens.findIndex(row=>row.clientId===client&&row.refresh===body.get('refresh_token'));
          if(index<0){json(401,{error:'invalid trial refresh'});return;}saved.tokens.splice(index,1);
        }else{json(400,{error:'unsupported trial grant'});return;}
        json(200,issue(client));return;
      }
      if(req.method==='GET'&&url.pathname==='/api/v1/users/me'){
        const row=saved.tokens.find(item=>req.headers.authorization==='Bearer '+item.access);
        if(!row){json(401,{error:'trial login required'});return;}
        json(200,{data:{userId:'local-personal-trial-user',displayName:'个人试用用户（本机模拟）',emails:[],applicationId:'work',clientId:row.clientId}});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/v1/sessions/current/logout'){
        saved.tokens=saved.tokens.filter(item=>req.headers.authorization!=='Bearer '+item.access);persist();json(200,{});return;
      }
      json(404,{error:'local trial identity only'});
    }catch{json(400,{error:'invalid trial request'});}
  });
}
