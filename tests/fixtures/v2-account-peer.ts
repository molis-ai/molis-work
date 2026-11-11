import {createServer} from 'node:http';
import {createTrialAuthPeer,trialAccountConfig} from '../../examples/personal-trial-tools/mock-auth.mjs';
/** Only the remote Auth peer is substituted; local account admission remains real. */
export function v2AccountPeer(user:()=>string=()=> 'alice',beforeIdentity?:()=>Promise<void>){
 let productOrigin='http://127.0.0.1:4173';
 const peer=createTrialAuthPeer({configuration:()=>trialAccountConfig(origin(),productOrigin,'work','web-test'),user,waits:{identity:beforeIdentity}});
 const server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const r=await peer.fetch(origin()+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks).toString():undefined});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({requestId:'synthetic-failure',error:{code:'AUTH_UNAVAILABLE'}}));}});
 function origin(){const address=server.address();if(!address||typeof address!=='object')throw Error('Peer not listening');return 'http://127.0.0.1:'+address.port;}
 return {server,configure(value:string){productOrigin=value;return JSON.stringify(trialAccountConfig(origin(),value,'work','web-test'));}};
}
