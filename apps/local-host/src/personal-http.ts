import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { personalCloudConfig, PersonalAuth } from "./personal-auth.js";
import { sendLocalWebJson } from "./web-http.js";
import { PersonalWebSessions, type AccountNavigation, type WebAccountSession } from './personal-web-sessions.js';

/** Only real local work surfaces can be resumed; never redirect to a caller's origin. */
export function personalReturnPath(raw:string|null, desktop=false):string {
  const fallback=desktop?'/?desktop=1':'/';
  if(!raw || raw.length>4096 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw))return fallback;
  const url=new URL(raw,'http://local.invalid');
  if(url.origin!=='http://local.invalid' || !(/^\/$|^\/projects(?:\/|$)|^\/settings(?:\/|$)|^\/onboarding$/.test(url.pathname)))return fallback;
  if(desktop)url.searchParams.set('desktop','1');
  return url.pathname+url.search+url.hash;
}

/** Construct lazily in the server's Home scope; no credentials/configuration means no network. */
export function createPersonalAccountHttp(isNativeRequest: (request:IncomingMessage)=>boolean = ()=>false) {
  let auth:PersonalAuth|null=null;
  let setupError='';
  const webSessions=new PersonalWebSessions();
  let desktopNavigation:AccountNavigation|null=null;
  let nativeBrowser:WebAccountSession|null=null;
  const tickets=new Map<string,{auth:PersonalAuth;expires:number}>();
  function nativeSession(service:PersonalAuth):WebAccountSession {
    if(!nativeBrowser || !webSessions.get(webSessions.cookie(nativeBrowser,false)))nativeBrowser=webSessions.adopt(service);
    return nativeBrowser;
  }
  function getAuth():PersonalAuth|null {
    if(auth)return auth;
    setupError='';
    let config;
    try{config=personalCloudConfig();}
    catch{setupError='账号服务配置不完整，请检查配置。';return null;}
    try{if(config)auth=new PersonalAuth(config,createFileSecretStore());}
    catch{setupError='客户端安全凭据存储不可用，请检查本机凭据存储权限。Web 登录不受此影响。';}
    return auth;
  }
  async function handle(request:IncomingMessage,response:ServerResponse,url:URL,origin:string,_controlToken:string,_desktopScript:string):Promise<boolean> {
    const callback=url.pathname==='/account/callback';
    // A UI query/header is not proof of native identity. The external browser
    // callback instead proves the single-use PKCE state of a native login.
    const desktop=callback ? !!auth?.callbackState() && auth.callbackState()===url.searchParams.get('state') : isNativeRequest(request);
    const home=personalReturnPath(url.searchParams.get('returnTo'),desktop || url.searchParams.get('desktop')==='1');
    const setMode=(value:'local'|'account')=>response.setHeader('Set-Cookie',`molis-work-mode=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    if(request.method==='GET' && url.pathname==='/')return false;
    // Compatibility only: old bookmarks must not bring back an extra account page.
    if(request.method==='GET' && ['/welcome','/account'].includes(url.pathname)){
      response.writeHead(303,{Location:home,'Cache-Control':'no-store'});response.end();return true;
    }
    if(!['/welcome','/account','/account/callback','/api/personal/status','/api/personal/local','/api/personal/login','/api/personal/switch','/api/personal/logout','/api/personal/space','/api/personal/native-attach'].includes(url.pathname))return false;
    response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');
    if(request.method==='POST' && url.pathname==='/api/personal/native-attach'){
      const key=url.searchParams.get('ticket')??'',ticket=tickets.get(key);tickets.delete(key);
      if(!ticket || ticket.expires<Date.now() || ticket.auth!==auth || !auth?.identity()){
        sendLocalWebJson(response,401,{error:'客户端登录凭据已失效。'});return true;
      }
      response.setHeader('Set-Cookie',webSessions.cookie(nativeSession(ticket.auth),origin.startsWith('https:')));
      sendLocalWebJson(response,200,{attached:true});return true;
    }
    if(request.method==='POST' && url.pathname==='/api/personal/local'){
      const current=desktop&&auth?nativeSession(auth):webSessions.get(request.headers.cookie);if(current)current.space='local';
      setMode('local');sendLocalWebJson(response,200,{redirectTo:home});return true;
    }
    let config;try{config=personalCloudConfig();}catch{ /* Session cleanup is best effort; no authenticated response is returned. */ }
    const configured=!!config;
    let session=desktop?null:webSessions.get(request.headers.cookie);
    const setSessionCookie=()=>response.setHeader('Set-Cookie',webSessions.cookie(session,origin.startsWith('https:')));
    if(!desktop && !session && config && request.method==='POST' && ['/api/personal/login','/api/personal/switch'].includes(url.pathname)){
      try{session=webSessions.create(config);setSessionCookie();}
      catch{sendLocalWebJson(response,503,{error:'登录会话暂时不可用，请稍后重试。'});return true;}
    }
    if(request.method==='GET' && url.pathname==='/api/personal/status' && !desktop && !session){
      sendLocalWebJson(response,200,{configured,identity:null,syncEnabled:false});return true;
    }
    const service=desktop?getAuth():session?.auth??null;
    let navigation=desktop?desktopNavigation:session?.navigation??null;
    try{
      if(request.method==='GET' && url.pathname==='/api/personal/status') {
        if(desktop && setupError){sendLocalWebJson(response,503,{error:setupError});return true;}
        try {
          const identity=await service?.currentIdentity()??null;
          let browserSessionTicket:string|undefined;
          if(desktop && identity && service){
            for(const [key,value] of tickets)if(value.expires<Date.now())tickets.delete(key);
            if(tickets.size<32){browserSessionTicket=randomBytes(32).toString('base64url');tickets.set(browserSessionTicket,{auth:service,expires:Date.now()+30000});}
          }
          const completed=!!identity && !!navigation?.complete && navigation.expires>Date.now() && url.searchParams.get('attempt')===navigation.id;
          if(completed && desktop)setMode('account');
          sendLocalWebJson(response,200,{configured:!!service,identity,syncEnabled:false,space:(desktop&&service?nativeSession(service):session)?.space??'local',viewToken:_controlToken,...(browserSessionTicket?{browserSessionTicket}:{}),...(completed?{loginCompleted:true,returnTo:navigation!.returnTo}:{})});
        }catch{
          sendLocalWebJson(response,200,{configured:!!service,identity:service?.identity()??null,syncEnabled:false,offline:true,space:session?.space??'local',viewToken:_controlToken});
        }
        return true;
      }
      if(!service){sendLocalWebJson(response,configured?401:503,{error:desktop?setupError:'登录会话已失效，请重新登录。'});return true;}
      if(request.method==='POST' && url.pathname==='/api/personal/space') {
        const kind=url.searchParams.get('kind');
        if(kind!=='local' && kind!=='personal'){sendLocalWebJson(response,400,{error:'仅支持本地空间和个人空间。'});return true;}
        if(!service.identity()){sendLocalWebJson(response,401,{error:'请先登录。'});return true;}
        const current=desktop?nativeSession(service):session!;
        current.space=kind==='personal'?'account':'local';
        sendLocalWebJson(response,200,{redirectTo:'/'});return true;
      }
      if(request.method==='GET' && url.pathname==='/account/callback') {
        if(url.searchParams.get('error')==='access_denied'){
          service.cancel(url.searchParams.get('state')??'');
          response.writeHead(303,{Location:navigation?.returnTo??'/'});response.end();return true;
        }
        const destination=navigation;
        await service.complete(url.searchParams.get('code')??'',url.searchParams.get('state')??'');
        if(destination && (desktop?desktopNavigation:session?.navigation)===destination)destination.complete=true;
        if(session){webSessions.rotate(session);setSessionCookie();}else setMode('account');
        response.writeHead(303,{Location:session?.space==='account'?'/':destination?.returnTo??'/'});response.end();return true;
      }
      if(request.method==='POST' && ['/api/personal/login','/api/personal/switch'].includes(url.pathname)) {
        const attempt={id:randomUUID(),returnTo:home,complete:false,expires:Date.now()+600000};
        navigation=attempt;if(session)session.navigation=attempt;else desktopNavigation=attempt;
        // Switching must not silently restore Auth's existing browser session.
        // Keep the current account until a replacement has successfully authenticated.
        const loginUrl=await service.begin(`${origin}/account/callback`,desktop,url.pathname==='/api/personal/switch');
        sendLocalWebJson(response,200,{loginUrl,loginAttempt:attempt.id});return true;
      }
      if(request.method==='POST' && url.pathname==='/api/personal/logout') {
        navigation=null;if(desktop)desktopNavigation=null;
        const remoteRevoked=await service.logout();
        if(session){webSessions.remove(session);session=null;setSessionCookie();}else setMode('local');
        sendLocalWebJson(response,200,{signedOut:true,remoteRevoked,redirectTo:home});return true;
      }
      sendLocalWebJson(response,405,{error:'不支持此操作。'});
    }catch{
      // Keep the user at a useful local surface, without echoing codes or upstream responses.
      if(url.pathname==='/account/callback'){
        response.writeHead(400,{'content-type':'text/html; charset=utf-8'});
        response.end('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><p>登录未完成或请求已失效，请返回工作台的账号菜单重试。</p><a href="/">返回 molis-work</a>');
      }else sendLocalWebJson(response,503,{error:'暂时无法连接账号服务，请稍后重试。本地工作不受影响。'});
    }
    return true;
  }
  return Object.assign(handle, {
    context(request:IncomingMessage){
      const current=isNativeRequest(request)?(auth?nativeSession(auth):null):webSessions.get(request.headers.cookie);
      return current?.auth.identity()?current:null;
    },
    close(){webSessions.close();auth?.suspend();desktopNavigation=null;tickets.clear();},
  });
}
