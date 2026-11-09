import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
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
    const head = node('h2', uiText.text("workbench.account.molis-account")); head.id = 'account-title';
    const close = node('button', uiText.text("common.control.close"), 'mw-btn mw-btn--ghost'); close.type = 'button'; close.onclick = () => dialog.close();
    const modes = node('div', '', 'account-modes'), form = node('form', '', 'account-form'), message = node('p', '', 'account-message');
    message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
    const help=node('details','','mw-disclosure'), summary=node('summary',uiText.text("workbench.account.cant-use-sign-methods"));
    help.append(summary,
      node('p',uiText.text("workbench.account.if-method-still-works-sign-verify-identity-profile")),
      node('p',uiText.text("workbench.account.if-all-methods-lost-recover-original-method-through")),
      node('p',uiText.text("workbench.account.molis-does-not-currently-offer-manual-account-recovery")));
    dialog.append(head,close,modes,form,message,help); document.body.append(dialog); dialog.showModal();
    let mode = 'login', transaction: AuthReply | null = null, challenge: string | null = null, address = '', busy = false, generation = 0, retryAt = 0, timer: ReturnType<typeof setInterval> | undefined;
    let disposeManagement: (() => void) | undefined;
    let providerTimer: ReturnType<typeof setTimeout> | undefined, providerWindow: Window | null = null;
    const buttons: [HTMLButtonElement, string][] = [];
    const cancel = () => { clearTimeout(providerTimer); providerWindow?.close(); providerWindow=null; const old = transaction; transaction = null; challenge = null; generation++; if(old) void request('/auth/transactions/'+old.handle+'/cancel',{}).catch(() => { /* Local page is already closed; Host expiry also fences abandoned attempts. */ }); };
    const field = (label: string,name: string,type: string,autocomplete: string) => { const wrap=node('label', '', 'mw-field'); wrap.append(node('span',uiText.text(label))); const input=node('input','','mw-input'); input.name=name; input.type=type; input.setAttribute("autocomplete",autocomplete); input.required=true; if(type==='password') { input.minLength=mode==='login'?1:12; input.maxLength=128; } if(name==='code') { input.pattern='[0-9]{6}'; input.maxLength=6; input.inputMode='numeric'; } if(name==='address') { input.maxLength=mode==='phone'?11:254; if(mode==='phone') { input.pattern='1[3-9][0-9]{9}'; input.inputMode='tel'; } } wrap.append(input);form.append(wrap);return input; };
    const button = (text: string, action: () => void | Promise<void>, parent: HTMLElement = form) => { const b=node('button',uiText.text(text),'mw-btn mw-btn--secondary'); b.type='button'; b.onclick=action;parent.append(b);return b; };
    function draw() {
      clearInterval(timer);form.replaceChildren();
      buttons.forEach(([b,m])=>{b.disabled=busy;b.setAttribute('aria-pressed',String(m===mode));});
      if(mode==='provider') { form.append(node('p',uiText.text("workbench.account.complete-authorization-browser-view-updates-automatically"))); button("workbench.account.cancel-sign",()=>{cancel();mode='login';draw();});return; }
      if(challenge) { field("workbench.account.six-digit-code",'code','text','one-time-code'); const resend=button("workbench.account.resend-code",async()=>{ await perform(async()=>{await request('/auth/transactions/'+transaction!.handle+'/resend',{});retryAt=Date.now()+60000;}); }); const tick=()=>{resend.disabled=busy||Date.now()<retryAt;resend.textContent=Date.now()<retryAt?uiText.text("workbench.account.resend-code")+' ('+Math.ceil((retryAt-Date.now())/1000)+')':uiText.text("workbench.account.resend-code");};clearInterval(timer);timer=setInterval(tick,1000);tick(); }
      else if(transaction?.nextStep==='EMAIL_SIGNUP'||mode==='reset-ready') { field("workbench.account.new-password-least-12-characters",'password','password','new-password');field("workbench.account.confirm-new-password",'confirm','password','new-password'); }
      else { field(mode==='phone'?"workbench.account.china-mainland-phone-number-86":"workbench.account.email",'address',mode==='phone'?'tel':'email',mode==='phone'?'tel-national':'email');if(mode==='login') field("workbench.account.password",'password','password','current-password'); }
      if(mode==='phone') form.append(node('p',uiText.text("workbench.account.unregistered-phone-number-creates-account-after-verification"),'mw-muted'));
      const submit=node('button',uiText.text(challenge?"workbench.account.verify-continue":mode==='reset-ready'?"workbench.account.reset-password":mode==='signup'&&transaction?"workbench.account.create-account":mode==='login'?"workbench.account.sign":"workbench.account.send-code"),'mw-btn mw-btn--primary');submit.type='submit';submit.disabled=busy;form.append(submit);
      for(const [provider,label] of [['GOOGLE','使用 Google 登录'],['GITHUB','使用 GitHub 登录']]) button(label!,()=>startProvider(provider!));
      form.querySelector('input')?.focus();
    }
    const fail = (error: unknown) => { const failure = error as {code?: string; body?: {details?: {authCode?: string;retryAfterSeconds?: number}}}; const code=failure.body?.details?.authCode || failure.code; const wait=failure.body?.details?.retryAfterSeconds; const texts: Record<string, string>={INVALID_CREDENTIALS:uiText.text("workbench.account.email-password-code-incorrect-please-try-again"),CHALLENGE_EXPIRED:uiText.text("workbench.account.code-has-expired-request-new-code"),TRANSACTION_EXPIRED:uiText.text("workbench.account.verification-expired-please-start-again"),RATE_LIMITED:uiText.text("workbench.account.too-many-attempts-please-try-again-later"),IDENTITY_IN_USE:uiText.text("workbench.account.sign-method-belongs-another-account"),LAST_LOGIN_METHOD:uiText.text("workbench.account.keep-least-one-usable-sign-method-link-another"),VERSION_CONFLICT:uiText.text("workbench.account.account-state-changed-go-back-reload-before-continuing"),SESSION_EXPIRED:uiText.text("workbench.account.session-expired-please-sign-again"),REAUTH_REQUIRED:uiText.text("workbench.account.verify-current-account-again"),FORBIDDEN:uiText.text("workbench.account.do-not-have-permission-refresh-account-status"),TENANT_DISABLED:uiText.text("workbench.account.tenant-disabled-contact-platform-administrator"),OWNER_TRANSFER_REQUIRED:uiText.text("workbench.account.complete-ownership-transfer-before-leaving"),NOT_FOUND:uiText.text("workbench.account.record-unavailable-refresh-try-again"),CAPACITY_CONFLICT:uiText.text("workbench.account.capacity-changed-release-excess-assignments-refresh"),SUBSCRIPTION_INACTIVE:uiText.text("workbench.account.inactive-subscription-cannot-assign-reassign-seats"),'account.invalid_configuration':uiText.text("workbench.account.account-service-not-configured-local-features-remain-available")};message.textContent=texts[code || ""]||uiText.text("workbench.account.unable-complete-step-try-again-start-over");if(wait) { retryAt=Date.now()+wait*1000;message.textContent+=' '+Math.ceil(wait)+'s'; } };
    async function perform(run: () => Promise<void>) {if(busy)return;busy=true;message.textContent='';form.setAttribute('aria-busy','true');dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(b!==close)b.disabled=true;});try {await run();}catch(error){if(dialog.open)fail(error);}finally{busy=false;form.removeAttribute('aria-busy');if(dialog.open){buttons.forEach(([b])=>b.disabled=false);form.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});}}}
    function showAccount(account: Extract<AccountView, {state: "AUTHENTICATED" | "OFFLINE_CACHED"}>) {
      disposeManagement?.();disposeManagement=undefined;form.onsubmit=e=>e.preventDefault();
      transaction=null;challenge=null;clearInterval(timer);modes.replaceChildren();form.replaceChildren();
      form.append(node('p',account.user?.displayName||uiText.text("workbench.account.signed")));
      if(account.state==='AUTHENTICATED') {
        const ui={form,dialog,message,L,node,field,button,request,perform}, back=async()=>{const view=await request<AccountView>('/session');if(dialog.open&&(view.state==='AUTHENTICATED'||view.state==='OFFLINE_CACHED'))showAccount(view);};
        button("workbench.account.profile-security",()=>{disposeManagement=openAccountManagement(ui,account.user,back);});
        button("workbench.account.personal-tenant-spaces",()=>{disposeManagement=openAccountTenants(ui,account,back);});
      }
      if(account.state==='OFFLINE_CACHED')message.textContent=uiText.text("workbench.account.offline-account-status-cannot-be-confirmed");
      for(const [scope,label] of [['CURRENT_LOGIN','退出登录'],['ALL_MOLIS_PRODUCTS','退出所有产品和设备']]) button(label!,()=>perform(async()=>{const result=await request('/logout',{scope},{'Idempotency-Key':crypto.randomUUID()});form.replaceChildren();document.querySelectorAll('[data-unified-account-name]').forEach(el=>el.textContent=uiText.text("workbench.account.molis-account"));message.textContent=result.remoteRevocation==='CONFIRMED'?uiText.text("workbench.account.signed-out"):uiText.text("workbench.account.signed-out-locally-remote-revocation-not-yet-confirmed");button("workbench.account.back-sign",()=>{dialog.addEventListener('close',()=>trigger!.click(),{once:true});dialog.close();});}));
      document.querySelectorAll('[data-unified-account-name]').forEach(el=>el.textContent=account.user?.displayName||uiText.text("workbench.account.signed"));
    }
    const submitStep = (body: unknown) => request('/auth/transactions/'+transaction!.handle+'/submit',body);
    async function startProvider(provider: string) {
      const external=(globalThis as typeof globalThis & { molisWorkOpenExternalUrl?: (url: string) => Promise<void> }).molisWorkOpenExternalUrl;
      if(busy)return;cancel();const own=generation;
      const popup=external?null:window.open('about:blank','_blank');if(popup)popup.opener=null;
      if(!external&&!popup){message.textContent=uiText.text("workbench.account.allow-sign-window-open-try-again");return;}
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
          if(['CANCELLED','EXPIRED'].includes(status.status||'')||popup?.closed){cancel();mode='login';draw();message.textContent=uiText.text("workbench.account.sign-was-not-completed-please-start-again");return;}
          providerTimer=setTimeout(()=>void poll(),1000);
        }catch(error){if(own===generation){cancel();mode='login';draw();fail(error);}}};
        providerTimer=setTimeout(()=>void poll(),750);
      }catch(error){cancel();mode='login';draw();throw error;}});
    }

    async function finish() { let result=await submitStep({step:'COMPLETE'});if(result.account)showAccount(result.account as Extract<AccountView, {state: "AUTHENTICATED" | "OFFLINE_CACHED"}>);else {mode='reset-ready';draw();} }
    form.onsubmit = (event: SubmitEvent) => {event.preventDefault();const values=new FormData(form), own=generation;void perform(async()=>{
      const password=String(values.get('password')||'');
      if(values.has('confirm')&&password!==values.get('confirm')) {message.textContent=uiText.text("workbench.account.passwords-do-not-match");return;}
      if(mode==='reset-ready') {await request('/password/reset',{resetHandle:transaction!.handle,newPassword:password});transaction=null;mode='login';draw();message.textContent=uiText.text("workbench.account.password-reset-please-sign-again");return;}
      if(!transaction) {transaction=await request('/auth/transactions',{purpose:mode==='signup'?'EMAIL_SIGNUP':mode==='reset'?'PASSWORD_RESET':'LOGIN',method:mode==='phone'?'PHONE_OTP':mode==='login'?'EMAIL_PASSWORD':'EMAIL_CODE'});if(own!==generation){cancel();return;}}
      if(mode==='provider') { form.append(node('p',uiText.text("workbench.account.complete-authorization-browser-view-updates-automatically"))); button("workbench.account.cancel-sign",()=>{cancel();mode='login';draw();});return; }
      if(challenge) {const result=await submitStep({step:'VERIFY_CHALLENGE',challengeHandle:challenge,credential:String(values.get('code')||'')});challenge=null;transaction=result;if(own!==generation)return;if(result.nextStep==='PHONE_LOGIN'){transaction=await submitStep({step:'PHONE_LOGIN'});await finish();}else if(result.nextStep==='COMPLETE')await finish();else draw();return;}
      if(transaction!.nextStep==='EMAIL_SIGNUP') {transaction=await submitStep({step:'EMAIL_SIGNUP',email:address,password});await finish();return;}
      address=String(values.get('address')||'').trim();if(mode==='phone')address='+86'+address;
      if(mode==='login'){transaction=await submitStep({step:'PASSWORD_LOGIN',email:address,password});await finish();}
      else {const result=await submitStep({step:'REQUEST_CHALLENGE',address});challenge=result.challengeHandle;retryAt=Date.now()+result.retryAfterSeconds*1000;draw();message.textContent=uiText.text("workbench.account.code-request-accepted-check-sms-email-isolated-tests");}
    });};
    for(const [m,label] of [['login','邮箱登录'],['phone','手机验证码'],['signup','邮箱注册'],['reset','找回密码']]) {const b=button(label!,()=>{cancel();mode=m!;address='';retryAt=0;clearInterval(timer);message.textContent='';draw();},modes);buttons.push([b,m!]);}
    dialog.addEventListener('close',()=>{disposeManagement?.();cancel();clearInterval(timer);form.reset();dialog.remove();opened=null;(trigger.closest('details:not([open])')?.querySelector<HTMLElement>(':scope > summary') || trigger).focus();});
    draw();void perform(async()=>{const account=await request<AccountView>('/session');if(!dialog.open)return;if(account.state==='AUTHENTICATED'||account.state==='OFFLINE_CACHED'){showAccount(account);if(account.state==='AUTHENTICATED'&&document.visibilityState==='visible')await request('/activity',{eventId:crypto.randomUUID(),kind:'OPEN'});}else if(account.state==='EXPIRED')message.textContent=uiText.text("workbench.account.session-expired-please-sign-again");});
  });
})();
