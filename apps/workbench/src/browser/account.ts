import { openAccountManagement } from "./account-management.js";
import { openAccountTenants } from "./account-tenants.js";
import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { AccountView } from "@molis-ai/molis-work-contracts/services/account";
interface AuthReply { handle: string; nextStep: string; challengeHandle: string; retryAfterSeconds: number; account?: AccountView; remoteRevocation?: string; status?: string; browserStartUrl?: string }
;(() => {
  const L = (text: string) => globalThis.L?.(text) || text;
  const request = <T = AuthReply>(path: string, body?: unknown, headers?: Record<string, string>, method?: "PATCH") => globalThis.molisWorkRequest('/api/account' + path, { control: true, ...(method ? { method } : {}), ...(body === undefined ? {} : { body }), ...(headers ? { headers } : {}) }).then(reply => (reply as { data: T }).data);
  let opened: HTMLDialogElement | null = null;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = "") => { const el = document.createElement(tag); if(text) el.textContent = text; if(cls) el.className = cls; return el; };
  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-unified-account-link]') : null;
    if(!trigger) return;
    event.preventDefault(); if(opened) { opened.focus(); return; }
    const dialog = node('dialog', '', 'mw-dialog account-dialog'); opened = dialog;
    dialog.setAttribute('aria-labelledby','account-title');
    const head = node('h2', L('Molis 账号')); head.id = 'account-title';
    const close = node('button', L('关闭'), 'mw-btn mw-btn--ghost'); close.type = 'button'; close.onclick = () => dialog.close();
    const modes = node('div', '', 'account-modes'), form = node('form', '', 'account-form'), message = node('p', '', 'account-message');
    message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
    const help=node('details','','mw-disclosure'), summary=node('summary',L('无法使用登录方式？'));
    help.append(summary,
      node('p',L('还有可用方式：用它登录，在“个人资料与安全”验证身份后绑定或换绑。仅忘记邮箱密码，可在登录页选择“找回密码”。')),
      node('p',L('全部方式都已丢失：先向邮箱服务商、手机运营商或 Google、GitHub 找回原登录方式，再回来登录。')),
      node('p',L('Molis 暂不提供人工账号恢复。新注册账号不会自动继承原账号的资料和内容。')));
    dialog.append(head,close,modes,form,message,help); document.body.append(dialog); dialog.showModal();
    let mode = 'login', transaction: AuthReply | null = null, challenge: string | null = null, address = '', busy = false, generation = 0, retryAt = 0, timer: ReturnType<typeof setInterval> | undefined;
    let disposeManagement: (() => void) | undefined;
    let providerTimer: ReturnType<typeof setTimeout> | undefined, providerWindow: Window | null = null;
    const buttons: [HTMLButtonElement, string][] = [];
    const cancel = () => { clearTimeout(providerTimer); providerWindow?.close(); providerWindow=null; const old = transaction; transaction = null; challenge = null; generation++; if(old) void request('/auth/transactions/'+old.handle+'/cancel',{}).catch(() => { /* Local page is already closed; Host expiry also fences abandoned attempts. */ }); };
    const field = (label: string,name: string,type: string,autocomplete: string) => { const wrap=node('label', '', 'mw-field'); wrap.append(node('span',L(label))); const input=node('input','','mw-input'); input.name=name; input.type=type; input.setAttribute("autocomplete",autocomplete); input.required=true; if(type==='password') { input.minLength=mode==='login'?1:12; input.maxLength=128; } if(name==='code') { input.pattern='[0-9]{6}'; input.maxLength=6; input.inputMode='numeric'; } if(name==='address') { input.maxLength=mode==='phone'?11:254; if(mode==='phone') { input.pattern='1[3-9][0-9]{9}'; input.inputMode='tel'; } } wrap.append(input);form.append(wrap);return input; };
    const button = (text: string, action: () => void | Promise<void>, parent: HTMLElement = form) => { const b=node('button',L(text),'mw-btn mw-btn--secondary'); b.type='button'; b.onclick=action;parent.append(b);return b; };
    function draw() {
      clearInterval(timer);form.replaceChildren();
      buttons.forEach(([b,m])=>{b.disabled=busy;b.setAttribute('aria-pressed',String(m===mode));});
      if(mode==='provider') { form.append(node('p',L('请在浏览器中完成授权，完成后此处会自动更新。'))); button('取消登录',()=>{cancel();mode='login';draw();});return; }
      if(challenge) { field('六位验证码','code','text','one-time-code'); const resend=button('重新发送',async()=>{ await perform(async()=>{await request('/auth/transactions/'+transaction!.handle+'/resend',{});retryAt=Date.now()+60000;}); }); const tick=()=>{resend.disabled=busy||Date.now()<retryAt;resend.textContent=Date.now()<retryAt?L('重新发送')+' ('+Math.ceil((retryAt-Date.now())/1000)+')':L('重新发送');};clearInterval(timer);timer=setInterval(tick,1000);tick(); }
      else if(transaction?.nextStep==='EMAIL_SIGNUP'||mode==='reset-ready') { field('新密码（至少 12 位）','password','password','new-password');field('再次输入新密码','confirm','password','new-password'); }
      else { field(mode==='phone'?'中国大陆手机号（+86）':'邮箱','address',mode==='phone'?'tel':'email',mode==='phone'?'tel-national':'email');if(mode==='login') field('密码','password','password','current-password'); }
      if(mode==='phone') form.append(node('p',L('未注册手机号验证后将自动注册。'),'mw-muted'));
      const submit=node('button',L(challenge?'验证并继续':mode==='reset-ready'?'重设密码':mode==='signup'&&transaction?'完成注册':mode==='login'?'登录':'发送验证码'),'mw-btn mw-btn--primary');submit.type='submit';submit.disabled=busy;form.append(submit);
      for(const [provider,label] of [['GOOGLE','使用 Google 登录'],['GITHUB','使用 GitHub 登录']]) button(label!,()=>startProvider(provider!));
      form.querySelector('input')?.focus();
    }
    const fail = (error: unknown) => { const failure = error as {code?: string; body?: {details?: {authCode?: string;retryAfterSeconds?: number}}}; const code=failure.body?.details?.authCode || failure.code; const wait=failure.body?.details?.retryAfterSeconds; const texts: Record<string, string>={INVALID_CREDENTIALS:L('邮箱、密码或验证码不正确，请重试。'),CHALLENGE_EXPIRED:L('验证码已过期，请重新发送。'),TRANSACTION_EXPIRED:L('验证已过期，请重新开始。'),RATE_LIMITED:L('操作较频繁，请稍后重试。'),IDENTITY_IN_USE:L('该登录方式已被其他账号使用。'),LAST_LOGIN_METHOD:L('至少保留一种可用登录方式，请先绑定其他方式。'),VERSION_CONFLICT:L('账号状态已变化，请返回并重新读取后操作。'),SESSION_EXPIRED:L('登录已过期，请重新登录。'),REAUTH_REQUIRED:L('请重新验证当前账号。'),FORBIDDEN:L('没有权限完成此操作，请刷新账号状态。'),TENANT_DISABLED:L('租户已停用，请联系平台管理人员。'),OWNER_TRANSFER_REQUIRED:L('请先完成所有权交接，再退出租户。'),NOT_FOUND:L('该记录已不可用，请刷新后重试。'),CAPACITY_CONFLICT:L('席位容量或分配已变化，请先回收超额分配并刷新后操作。'),SUBSCRIPTION_INACTIVE:L('该订阅当前未生效，不能分配或换绑席位。'),'account.invalid_configuration':L('账号服务尚未配置，本地功能仍可使用。')};message.textContent=texts[code || ""]||L('暂时无法完成，请重试或重新开始。');if(wait) { retryAt=Date.now()+wait*1000;message.textContent+=' '+Math.ceil(wait)+'s'; } };
    async function perform(run: () => Promise<void>) {if(busy)return;busy=true;message.textContent='';form.setAttribute('aria-busy','true');dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(b!==close)b.disabled=true;});try {await run();}catch(error){if(dialog.open)fail(error);}finally{busy=false;form.removeAttribute('aria-busy');if(dialog.open){buttons.forEach(([b])=>b.disabled=false);form.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});}}}
    function showAccount(account: Extract<AccountView, {state: "AUTHENTICATED" | "OFFLINE_CACHED"}>) {
      disposeManagement?.();disposeManagement=undefined;form.onsubmit=e=>e.preventDefault();
      transaction=null;challenge=null;clearInterval(timer);modes.replaceChildren();form.replaceChildren();
      form.append(node('p',account.user?.displayName||L('已登录')));
      if(account.state==='AUTHENTICATED') {
        const ui={form,dialog,message,L,node,field,button,request,perform}, back=async()=>{const view=await request<AccountView>('/session');if(dialog.open&&(view.state==='AUTHENTICATED'||view.state==='OFFLINE_CACHED'))showAccount(view);};
        button('个人资料与安全',()=>{disposeManagement=openAccountManagement(ui,account.user,back);});
        button('个人与租户',()=>{disposeManagement=openAccountTenants(ui,account,back);});
      }
      if(account.state==='OFFLINE_CACHED')message.textContent=L('当前离线，账号状态暂不可确认。');
      for(const [scope,label] of [['CURRENT_LOGIN','退出登录'],['ALL_MOLIS_PRODUCTS','退出所有产品和设备']]) button(label!,()=>perform(async()=>{const result=await request('/logout',{scope},{'Idempotency-Key':crypto.randomUUID()});form.replaceChildren();document.querySelectorAll('[data-unified-account-name]').forEach(el=>el.textContent=L('Molis 账号'));message.textContent=result.remoteRevocation==='CONFIRMED'?L('已退出登录。'):L('本机已退出，远端撤销尚未确认。');button('返回登录',()=>{dialog.addEventListener('close',()=>trigger!.click(),{once:true});dialog.close();});}));
      document.querySelectorAll('[data-unified-account-name]').forEach(el=>el.textContent=account.user?.displayName||L('已登录'));
    }
    const submitStep = (body: unknown) => request('/auth/transactions/'+transaction!.handle+'/submit',body);
    async function startProvider(provider: string) {
      const external=(globalThis as typeof globalThis & { molisWorkOpenExternalUrl?: (url: string) => Promise<void> }).molisWorkOpenExternalUrl;
      if(busy)return;cancel();const own=generation;
      const popup=external?null:window.open('about:blank','_blank');if(popup)popup.opener=null;
      if(!external&&!popup){message.textContent=L('请允许打开登录窗口后重试。');return;}
      providerWindow=popup;
      await perform(async()=>{try {
        transaction=await request('/auth/transactions',{purpose:'LOGIN',method:provider});if(own!==generation){cancel();return;}
        const result=await request('/auth/transactions/'+transaction!.handle+'/submit',{step:'START_PROVIDER'});
        if(own!==generation){cancel();return;}if(!result.browserStartUrl)throw Error('Provider URL missing');
        if(external)await external(result.browserStartUrl);else popup!.location.replace(result.browserStartUrl);
        mode='provider';draw();
        const poll=async()=>{if(own!==generation||!dialog.open)return;try {
          const status=await request('/auth/transactions/'+transaction!.handle);
          if(own!==generation)return;
          if(status.status==='CONSUMED'){const account=await request<AccountView>('/session');if(own!==generation)return;if(account.state!=='AUTHENTICATED')throw Error('Session missing');showAccount(account);providerWindow?.close();providerWindow=null;return;}
          if(['CANCELLED','EXPIRED'].includes(status.status||'')||popup?.closed){cancel();mode='login';draw();message.textContent=L('登录未完成，请重新开始。');return;}
          providerTimer=setTimeout(()=>void poll(),1000);
        }catch(error){if(own===generation){cancel();mode='login';draw();fail(error);}}};
        providerTimer=setTimeout(()=>void poll(),750);
      }catch(error){cancel();mode='login';draw();throw error;}});
    }

    async function finish() { let result=await submitStep({step:'COMPLETE'});if(result.account)showAccount(result.account as Extract<AccountView, {state: "AUTHENTICATED" | "OFFLINE_CACHED"}>);else {mode='reset-ready';draw();} }
    form.onsubmit = (event: SubmitEvent) => {event.preventDefault();const values=new FormData(form), own=generation;void perform(async()=>{
      const password=String(values.get('password')||'');
      if(values.has('confirm')&&password!==values.get('confirm')) {message.textContent=L('两次输入的密码不一致。');return;}
      if(mode==='reset-ready') {await request('/password/reset',{resetHandle:transaction!.handle,newPassword:password});transaction=null;mode='login';draw();message.textContent=L('密码已重设，请重新登录。');return;}
      if(!transaction) {transaction=await request('/auth/transactions',{purpose:mode==='signup'?'EMAIL_SIGNUP':mode==='reset'?'PASSWORD_RESET':'LOGIN',method:mode==='phone'?'PHONE_OTP':mode==='login'?'EMAIL_PASSWORD':'EMAIL_CODE'});if(own!==generation){cancel();return;}}
      if(mode==='provider') { form.append(node('p',L('请在浏览器中完成授权，完成后此处会自动更新。'))); button('取消登录',()=>{cancel();mode='login';draw();});return; }
      if(challenge) {const result=await submitStep({step:'VERIFY_CHALLENGE',challengeHandle:challenge,credential:String(values.get('code')||'')});challenge=null;transaction=result;if(own!==generation)return;if(result.nextStep==='PHONE_LOGIN'){transaction=await submitStep({step:'PHONE_LOGIN'});await finish();}else if(result.nextStep==='COMPLETE')await finish();else draw();return;}
      if(transaction!.nextStep==='EMAIL_SIGNUP') {transaction=await submitStep({step:'EMAIL_SIGNUP',email:address,password});await finish();return;}
      address=String(values.get('address')||'').trim();if(mode==='phone')address='+86'+address;
      if(mode==='login'){transaction=await submitStep({step:'PASSWORD_LOGIN',email:address,password});await finish();}
      else {const result=await submitStep({step:'REQUEST_CHALLENGE',address});challenge=result.challengeHandle;retryAt=Date.now()+result.retryAfterSeconds*1000;draw();message.textContent=L('验证码已受理，请查看短信或邮件；隔离测试使用 mock 投递。');}
    });};
    for(const [m,label] of [['login','邮箱登录'],['phone','手机验证码'],['signup','邮箱注册'],['reset','找回密码']]) {const b=button(label!,()=>{cancel();mode=m!;address='';retryAt=0;clearInterval(timer);message.textContent='';draw();},modes);buttons.push([b,m!]);}
    dialog.addEventListener('close',()=>{disposeManagement?.();cancel();clearInterval(timer);form.reset();dialog.remove();opened=null;(trigger.closest('details:not([open])')?.querySelector<HTMLElement>(':scope > summary') || trigger).focus();});
    draw();void perform(async()=>{const account=await request<AccountView>('/session');if(!dialog.open)return;if(account.state==='AUTHENTICATED'||account.state==='OFFLINE_CACHED'){showAccount(account);if(account.state==='AUTHENTICATED'&&document.visibilityState==='visible')await request('/activity',{eventId:crypto.randomUUID(),kind:'OPEN'});}else if(account.state==='EXPIRED')message.textContent=L('登录已过期，请重新登录。');});
  });
})();
