import { webPageScope } from "./web-sessions.js";
import { createPersonalPageHttp } from './personal-page-http.js';
import { AccountRefreshPages } from './account-refresh-pages.js';
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { personalCloudConfig, PersonalAuth, type PersonalAccountLease } from "./personal-auth.js";
import { sendLocalWebJson } from "./web-http.js";
import { PersonalWebSessions, type AccountNavigation, type WebAccountSession, WEB_ACCOUNT_COOKIE } from './personal-web-sessions.js';

/** Only real local work surfaces can be resumed; never redirect to a caller's origin. */
export function personalReturnPath(raw:string|null, desktop=false):string {
  const fallback=desktop?'/?desktop=1':'/';
  if(!raw || raw.length>4096 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw))return fallback;
  const url=new URL(raw,'http://local.invalid');
  if(url.origin!=='http://local.invalid' || !(/^\/$|^\/projects(?:\/|$)|^\/settings(?:\/|$)|^\/onboarding$/.test(url.pathname)))return fallback;
  if(desktop)url.searchParams.set('desktop','1');
  return url.pathname+url.search+url.hash;
}

interface NativeTicket {auth:PersonalAuth;lease:PersonalAccountLease;expires:number}

/** Configuration and credential access stay with the account HTTP owner; callers cache the successful Auth. */
function loadPersonalAuth():{auth:PersonalAuth|null;error:string} {
  let config;
  try{config=personalCloudConfig();}
  catch{return {auth:null,error:'账号服务配置不完整，请检查配置。'};}
  try{return {auth:config?new PersonalAuth(config,createFileSecretStore()):null,error:''};}
  catch{return {auth:null,error:'客户端安全凭据存储不可用，请检查本机凭据存储权限。'};}
}

/** Ticket use is single shot, including a refused attempt; it never borrows a later account lease. */
function consumeNativeTicket(tickets:Map<string,NativeTicket>,auth:PersonalAuth|null,key:string):PersonalAuth|null {
  const ticket=tickets.get(key);tickets.delete(key);
  try{ticket?.lease.assertCurrent();}catch{return null;}
  return ticket&&ticket.expires>=Date.now()&&ticket.auth===auth&&auth?.identity()?auth:null;
}
function issueNativeTicket(tickets:Map<string,NativeTicket>,service:PersonalAuth):string|undefined {
  for(const [key,value] of tickets)if(value.expires<Date.now())tickets.delete(key);
  if(tickets.size>=32)return undefined;
  const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,{auth:service,lease:service.accountLease(),expires:Date.now()+30000});return ticket;
}

/** Native WebView attachment owns the existing cached web session and its one-shot tickets, never Auth identity. */
function createNativeWebAttachment(webSessions:PersonalWebSessions) {
  let current:WebAccountSession|null=null;
  const tickets=new Map<string,NativeTicket>();
  const session=(service:PersonalAuth)=>{
    if(!current||!webSessions.get(webSessions.cookie(current,false)))current=webSessions.adopt(service);
    return current;
  };
  return {
    session,
    owns(candidate:WebAccountSession|null){return candidate!==null&&candidate===current;},
    issue:(service:PersonalAuth)=>issueNativeTicket(tickets,service),
    clear(){tickets.clear();},
    handle(request:IncomingMessage,response:ServerResponse,url:URL,origin:string,auth:PersonalAuth|null):boolean {
      if(request.method!=='POST'||url.pathname!=='/api/personal/native-attach')return false;
      const service=consumeNativeTicket(tickets,auth,url.searchParams.get('ticket')??'');
      if(!service){sendLocalWebJson(response,401,{error:'客户端登录凭据已失效。'});return true;}
      response.setHeader('Set-Cookie',webSessions.cookie(session(service),origin.startsWith('https:')));
      sendLocalWebJson(response,200,{attached:true});return true;
    },
  };
}

/** A browser status request retains its original lease even if its shared session object is rotated during an await. */
function browserStatusFence(desktop:boolean,session:WebAccountSession|null,response:ServerResponse,configured:boolean) {
  const authenticated=!desktop&&!!session?.authenticated,lease=session?.lease,expires=session?.expires??0;
  return ()=>{
    if(!authenticated)return true;
    try{if(lease&&expires>Date.now()){lease.assertCurrent();return true;}}catch{ /* The request's original browser lease was revoked. */ }
    sendLocalWebJson(response,200,{configured,identity:null,syncEnabled:false,accountChanged:true,ready:false,switching:false});return false;
  };
}

interface PersonalAccountEnvironment {
  ready(retry?:boolean):Promise<void>;
  status():{ready:boolean;switching:boolean;error?:string;viewScope?:string};
}

async function respondPersonalStatus({desktop,session,response,service,setupError,url,refreshPages,environment,nativeAttachment,navigation,setMode,controlToken}:{
  desktop:boolean;session:WebAccountSession|null;response:ServerResponse;service:PersonalAuth|null;setupError:string;url:URL;
  refreshPages:AccountRefreshPages;environment?:PersonalAccountEnvironment;nativeAttachment:ReturnType<typeof createNativeWebAttachment>;
  navigation:AccountNavigation|null;setMode:(mode:'account')=>void;controlToken:string;
}):Promise<void> {
  const statusCurrent=browserStatusFence(desktop,session,response,!!service);
  if(desktop && setupError){sendLocalWebJson(response,503,{error:setupError});return;}
  const generation=service?.accountGeneration();
  let offline=false;
  let identity:ReturnType<PersonalAuth['identity']>=null;
  try {
    identity=!desktop&&!session?.authenticated?null:await service?.currentIdentity()??null;
  }catch{
    offline=true;
    identity=desktop||session?.authenticated?service?.identity()??null:null;
  }
  if(!statusCurrent())return;
  const lease=identity&&service?service.accountLease():null;
  const page=url.searchParams.get('page');
  if(lease&&page)refreshPages.register(page,lease);
  if(lease)try{await environment?.ready();}catch{ /* The environment status retains the cleanup or initialization failure. */ }
  if(!statusCurrent())return;
  if(lease&&(lease.signal.aborted||generation!==service?.accountGeneration())){
    sendLocalWebJson(response,200,{configured:!!service,identity:null,syncEnabled:false,accountChanged:true,ready:false,switching:false});return;
  }
  const status:ReturnType<PersonalAccountEnvironment['status']>=lease?(environment?.status()??{ready:true,switching:false}):{ready:false,switching:false};
  // The native lease already proves this local account. A failed upstream check must not strand its WebView with a stale cookie.
  const nativeSession=desktop&&lease&&service&&status.ready?nativeAttachment.session(service):null;
  const browserSessionTicket=nativeSession&&service?nativeAttachment.issue(service):undefined;
  const completed=!offline&&status.ready&&!!navigation?.complete&&navigation.expires>Date.now()&&url.searchParams.get('attempt')===navigation.id;
  if(completed&&desktop)setMode('account');
  sendLocalWebJson(response,200,{
    configured:!!service,identity,syncEnabled:false,...(offline?{offline:true}:{}),
    accountGeneration:service?.accountGeneration(),loginPending:service?.loginPending()??false,
    preparation:lease?refreshPages.snapshot(lease):null,...status,
    space:(nativeSession??session)?.space??'local',viewScope:status.viewScope??controlToken.split(".")[1]??webPageScope(controlToken),
    ...(browserSessionTicket?{browserSessionTicket}:{}),
    ...(completed?{loginCompleted:true,returnTo:navigation!.returnTo}:{}),
  });
}

/** Construct lazily in the server's Home scope; no credentials/configuration means no network. */
export function createPersonalAccountHttp(isNativeRequest: (request:IncomingMessage)=>boolean = ()=>false, environment?:PersonalAccountEnvironment) {
  let auth:PersonalAuth|null=null;
  let setupError='';
  const webSessions=new PersonalWebSessions();
  const refreshPages=new AccountRefreshPages(30_000,()=>auth?.cancelLogin());
  const pageHttp=createPersonalPageHttp(refreshPages);
  let desktopNavigation:AccountNavigation|null=null;
  let pendingNavigation:AccountNavigation|null=null;
  let pendingNative=false,pendingAttachOnly=false;
  const nativeAttachment=createNativeWebAttachment(webSessions);
  function getAuth():PersonalAuth|null {
    if(auth)return auth;
    const loaded=loadPersonalAuth();setupError=loaded.error;return auth=loaded.auth;
  }
  async function handle(request:IncomingMessage,response:ServerResponse,url:URL,origin:string,_controlToken:string,_desktopScript:string):Promise<boolean> {
    const callback=url.pathname==='/account/callback';
    // A UI query/header is not proof of native identity. The external browser
    // callback instead proves the single-use PKCE state of a native login.
    const desktop=callback ? pendingNative && !!auth?.callbackState() && auth.callbackState()===url.searchParams.get('state') : isNativeRequest(request);
    const home=personalReturnPath(url.searchParams.get('returnTo'),desktop || url.searchParams.get('desktop')==='1');
    const setMode=(value:'local'|'account')=>response.setHeader('Set-Cookie',`molis-work-mode=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    if(request.method==='GET' && url.pathname==='/')return false;
    // Compatibility only: old bookmarks must not bring back an extra account page.
    if(request.method==='GET' && ['/welcome','/account'].includes(url.pathname)){
      response.writeHead(303,{Location:home,'Cache-Control':'no-store'});response.end();return true;
    }
    if(!['/welcome','/account','/account/callback','/api/personal/status','/api/personal/local','/api/personal/login','/api/personal/switch','/api/personal/logout','/api/personal/space','/api/personal/native-attach','/api/personal/login-cancel','/api/personal/prepare','/api/personal/events'].includes(url.pathname))return false;
    response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');
    if(nativeAttachment.handle(request,response,url,origin,auth))return true;
    if(request.method==='POST' && url.pathname==='/api/personal/local'){
      sendLocalWebJson(response,400,{error:'此安装使用当前登录账号，不能切换匿名工作区。'});return true;
    }
    let config;try{config=personalCloudConfig();}catch{ /* Session cleanup is best effort; no authenticated response is returned. */ }
    const configured=!!config;
    let session=desktop?null:webSessions.get(request.headers.cookie);
    const setSessionCookie=()=>response.setHeader('Set-Cookie',webSessions.cookie(session,origin.startsWith('https:')));
    if(!desktop && !session && config && request.method==='POST' && ['/api/personal/login','/api/personal/switch'].includes(url.pathname)){
      try{const shared=getAuth();if(!shared)throw new Error('LOGIN_REQUIRED');session=webSessions.adopt(shared,false);setSessionCookie();}
      catch{sendLocalWebJson(response,503,{error:'登录会话暂时不可用，请稍后重试。'});return true;}
    }
    if(request.method==='GET' && url.pathname==='/api/personal/status' && !desktop && !session){
      sendLocalWebJson(response,200,{configured,identity:null,syncEnabled:false,accountChanged:request.headers.cookie?.split(';').some(part=>part.trim().startsWith(WEB_ACCOUNT_COOKIE+'='))??false,accountGeneration:auth?.accountGeneration(),ready:false,switching:false});return true;
    }
    const service=desktop?getAuth():session?.auth??null;
    let navigation=desktop?desktopNavigation:session?.navigation??null;
    const pendingState=service?.callbackState();
    const ownedCallback=callback&&!!pendingState&&pendingState===url.searchParams.get('state');
    try{
      if(request.method==='GET' && url.pathname==='/api/personal/status') {
        await respondPersonalStatus({desktop,session,response,service,setupError,url,refreshPages,environment,nativeAttachment,navigation,setMode,controlToken:_controlToken});
        return true;
      }
      if(!service){sendLocalWebJson(response,configured?401:503,{error:desktop?setupError:'登录会话已失效，请重新登录。'});return true;}
      if(!desktop&&!session?.authenticated&&!['/account/callback','/api/personal/login','/api/personal/switch','/api/personal/login-cancel'].includes(url.pathname)){
        sendLocalWebJson(response,401,{error:'请先连接当前账号。'});return true;
      }
      if(request.method==='POST'&&url.pathname==='/api/personal/login-cancel'){
        if(!navigation||navigation.complete||navigation.id!==url.searchParams.get('attempt')||navigation!==pendingNavigation&&(pendingNavigation!==null||service.loginPending())){sendLocalWebJson(response,409,{error:'此登录请求已失效，不能取消其他页面的登录。'});return true;}
        service.cancelLogin();pendingNavigation=null;
        if(service.identity()&&(desktop||session?.authenticated)){const lease=service.accountLease(),preparation=refreshPages.snapshot(lease);if(preparation)refreshPages.cancel(preparation.ownerPageId,lease,preparation.id);}
        sendLocalWebJson(response,200,{cancelled:true});return true;
      }
      if(pageHttp(request,response,url,service,desktop||!!session?.authenticated))return true;
      if(request.method==='POST' && url.pathname==='/api/personal/space') {
        const kind=url.searchParams.get('kind');
        if(kind!=='personal'){sendLocalWebJson(response,400,{error:'此安装只使用当前登录账号的工作区。'});return true;}
        if(!service.identity()||!desktop&&!session?.authenticated){sendLocalWebJson(response,401,{error:'请先登录。'});return true;}
        await environment?.ready(true);
        const current=desktop?nativeAttachment.session(service):session!;current.space='account';
        sendLocalWebJson(response,200,{redirectTo:'/'});return true;
      }
      if(request.method==='GET' && url.pathname==='/account/callback') {
        if(url.searchParams.get('error')==='access_denied'){
          service.cancel(url.searchParams.get('state')??'');
          if(service.identity()){const lease=service.accountLease(),preparation=refreshPages.snapshot(lease);if(preparation)refreshPages.cancel(preparation.ownerPageId,lease,preparation.id);}
          response.writeHead(303,{Location:navigation?.returnTo??'/'});response.end();return true;
        }
        const destination=navigation;
        await service.complete(url.searchParams.get('code')??'',url.searchParams.get('state')??'',pendingAttachOnly);
        if(destination && (desktop?desktopNavigation:session?.navigation)===destination)destination.complete=true;
        pendingNavigation=null;
        if(session){webSessions.rotate(session);setSessionCookie();}else setMode('account');
        await environment?.ready(true);
        response.writeHead(303,{Location:session?.space==='account'?'/':destination?.returnTo??'/'});response.end();return true;
      }
      if(request.method==='POST' && ['/api/personal/login','/api/personal/switch'].includes(url.pathname)) {
        if(service.loginPending()||(!desktop&&!session?.authenticated&&!!service.identity()&&refreshPages.snapshot(service.accountLease()))){sendLocalWebJson(response,409,{error:'已有账号操作正在进行，请在原页面完成或取消。'});return true;}
        if(service.identity()&&(desktop||session?.authenticated))refreshPages.requirePrepared(url.searchParams.get('page')??'',service.accountLease(),url.searchParams.get('preparation')??'', 'switch');
        const attempt={id:randomUUID(),returnTo:home,complete:false,expires:Date.now()+600000};
        pendingNavigation=attempt;navigation=attempt;if(session)session.navigation=attempt;else desktopNavigation=attempt;
        // Switching must not silently restore Auth's existing browser session.
        // Keep the current account until a replacement has successfully authenticated.
        pendingNative=desktop;pendingAttachOnly=!desktop&&!session?.authenticated&&!!service.identity();
        const loginUrl=await service.begin(`${origin}/account/callback`,desktop,url.pathname==='/api/personal/switch');
        sendLocalWebJson(response,200,{loginUrl,loginAttempt:attempt.id});return true;
      }
      if(request.method==='POST' && url.pathname==='/api/personal/logout') {
        refreshPages.requirePrepared(url.searchParams.get('page')??'',service.accountLease(),url.searchParams.get('preparation')??'','logout');
        navigation=null;if(desktop)desktopNavigation=null;
        const remoteRevoked=await service.logout();
        nativeAttachment.clear();pendingNavigation=null;await environment?.ready(true);
        if(session){webSessions.remove(session);session=null;setSessionCookie();}else setMode('local');
        sendLocalWebJson(response,200,{signedOut:true,remoteRevoked,redirectTo:home});return true;
      }
      sendLocalWebJson(response,405,{error:'不支持此操作。'});
    }catch{
      const failedLogin=(ownedCallback||['/api/personal/login','/api/personal/switch'].includes(url.pathname))&&navigation!==null&&navigation===pendingNavigation;
      if(failedLogin)service?.cancelLogin();
      if(failedLogin&&service?.identity()&&(desktop||session?.authenticated)){
        const lease=service.accountLease(),preparation=refreshPages.snapshot(lease);if(preparation)refreshPages.cancel(preparation.ownerPageId,lease,preparation.id);
      }
      // Keep the user at a useful local surface, without echoing codes or upstream responses.
      if(url.pathname==='/account/callback'){
        response.writeHead(400,{'content-type':'text/html; charset=utf-8'});
        response.end('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><p>登录未完成或请求已失效，请返回工作台的账号菜单重试。</p><a href="/">返回 molis-work</a>');
      }else sendLocalWebJson(response,503,{error:'暂时无法连接账号服务，请稍后重试。本地工作不受影响。'});
    }
    return true;
  }
  return Object.assign(handle, {
    preparing(){const service=getAuth();return !!service?.identity()&&!!refreshPages.snapshot(service.accountLease());},
    current(){const service=getAuth();return service?.identity()?nativeAttachment.session(service):null;},
    context(request:IncomingMessage,nativeOnly=false){
      const current=isNativeRequest(request)?(auth?nativeAttachment.session(auth):null):webSessions.get(request.headers.cookie);
      return current?.authenticated&&current.auth.identity()&&(!nativeOnly||nativeAttachment.owns(current))?current:null;
    },
    close(){pageHttp.close();refreshPages.close();webSessions.close();auth?.suspend();desktopNavigation=null;nativeAttachment.clear();},
  });
}
