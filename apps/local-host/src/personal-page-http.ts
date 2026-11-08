import type {IncomingMessage,ServerResponse} from 'node:http';
import type {PersonalAuth} from './personal-auth.js';
import type {AccountRefreshPages} from './account-refresh-pages.js';
import {sendLocalWebJson} from './web-http.js';

/** The account owner's existing page cohort over HTTP; owns only its open event responses. */
export function createPersonalPageHttp(refreshPages:AccountRefreshPages) {
  const streams=new Set<ServerResponse>();
  function handle(request:IncomingMessage,response:ServerResponse,url:URL,service:PersonalAuth,authenticated:boolean):boolean {
    if(url.pathname!=='/api/personal/prepare'&&url.pathname!=='/api/personal/events')return false;
    if(!service.identity()||!authenticated){sendLocalWebJson(response,401,{error:'请先连接当前账号。'});return true;}
    const lease=service.accountLease(),page=url.searchParams.get('page')??'',id=url.searchParams.get('id')??'';
    if(request.method==='GET'&&url.pathname==='/api/personal/events'){
      refreshPages.register(page,lease);
      response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive'});
      const send=(event:unknown)=>{if(!response.writableEnded)response.write('data: '+JSON.stringify(event)+'\n\n');if(event&&typeof event==='object'&&'type' in event&&event.type==='revoked')response.end();};
      streams.add(response);const unsubscribe=refreshPages.subscribe(page,send);
      send({type:'preparation',preparation:refreshPages.snapshot(lease)});
      response.once('close',()=>{streams.delete(response);unsubscribe();});return true;
    }
    if(request.method!=='POST'){sendLocalWebJson(response,405,{error:'不支持此操作。'});return true;}
    const action=url.searchParams.get('action');
    let preparation;
    if(action==='start'){
      const intent=url.searchParams.get('intent');if(intent!=='switch'&&intent!=='logout'){sendLocalWebJson(response,400,{error:'准备操作无效。'});return true;}
      preparation=refreshPages.start(page,lease,intent);
    }else if(action==='ack')preparation=refreshPages.acknowledge(page,lease,id);
    else if(action==='cancel')refreshPages.cancel(page,lease,id);
    else if(action==='leave')refreshPages.leave(page,lease);
    else if(action==='status')preparation=refreshPages.snapshot(lease);
    else{sendLocalWebJson(response,400,{error:'准备操作无效。'});return true;}
    sendLocalWebJson(response,200,preparation??{ready:false,preparation:null});return true;
  }
  return Object.assign(handle,{close(){for(const stream of streams)stream.end();streams.clear();}});
}
