import type { AccountView, LoginMethodsView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { verifyAccountMethod } from "./account-verification.js";

const uiText = globalThis.t;
export interface AccountReply { handle: string; nextStep: string; challengeHandle: string; retryAfterSeconds: number; status?: string; browserStartUrl?: string; operationReady?: boolean }
export interface AccountUi {
  form: HTMLFormElement; dialog: HTMLDialogElement; message: HTMLElement;
  readText(text: string): string;
  node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K];
  field(label: string, name: string, type: string, autocomplete: string): HTMLInputElement;
  button(text: string, action: () => void | Promise<void>, parent?: HTMLElement): HTMLButtonElement;
  request<T = AccountReply>(path: string, body?: unknown, headers?: Record<string, string>, method?: "PATCH"): Promise<T>;
  perform(run: () => Promise<void>): Promise<void>;
}
const names = { EMAIL: "workbench.account-management.email", PHONE: "workbench.account-management.phone", GOOGLE: "Google", GITHUB: "GitHub" };
type MethodType = keyof typeof names;
const methodName = (type: MethodType) => type === "EMAIL" || type === "PHONE" ? uiText.text(names[type]) : names[type];
type Mutation = { kind: "bind" | "replace" | "unlink" | "password"; type?: MethodType; bindingId?: string; label?: string };
const verification = (type: MethodType, current = false) => type === "EMAIL" ? current ? "EMAIL_PASSWORD" : "EMAIL_CODE" : type === "PHONE" ? "PHONE_OTP" : type;
export function openAccountManagement(ui: AccountUi, user: UserView, back: () => Promise<void>) {
  const { form, dialog, message, node, field, button, request, perform } = ui;
  const handles = new Set<string>(); let active = true, disposeVerification: (() => void) | undefined;
  const current = () => active && dialog.open;
  const discard = () => { disposeVerification?.(); disposeVerification = undefined; for (const h of handles) void request('/auth/transactions/'+h+'/cancel',{}).catch(()=>{ /* Expiry also revokes abandoned proofs. */ }); handles.clear(); };
  const dispose = () => { active = false; discard(); form.onsubmit = null; dialog.removeEventListener('close',dispose); };
  dialog.addEventListener('close',dispose);
  const reset = (title: string) => { form.onsubmit = e => e.preventDefault(); form.replaceChildren(node('h3',uiText.text(title))); message.textContent=''; };
  const returnToAccount = async () => { dispose(); await back(); };
  async function keep(tx: AccountReply) { if (!current()) { await request('/auth/transactions/'+tx.handle+'/cancel',{}); return false; } handles.add(tx.handle); return true; }
  async function refresh() { const view=await request<AccountView>('/session'); if (view.state!=='AUTHENTICATED') throw new Error(uiText.text("workbench.account.session-expired-please-sign-again")); user=view.user; }
  function profile() {
    discard(); reset("workbench.account-management.profile");
    if(user.avatarUrl) { const image=node('img'); image.src=user.avatarUrl; image.width=72; image.height=72; image.alt=uiText.text("workbench.account-management.current-avatar"); image.referrerPolicy='no-referrer'; form.append(image); }
    const name=field('workbench.account.display-name','name','text','name'); name.value=user.displayName; name.maxLength=80;
    const avatar=field('workbench.account.avatar','avatar','file','off'); avatar.accept='image/png'; avatar.required=false;
    if(user.avatarUrl) button('workbench.account.remove-avatar',()=>perform(async()=>{await request('/profile',{avatarDataUrl:null,expectedVersion:user.version},{'Idempotency-Key':crypto.randomUUID()},'PATCH');await refresh();if(current()){profile();message.textContent=uiText.text("workbench.account-management.profile-saved");}}));
    const submit=button('workbench.account.save-profile',()=>{});submit.type='submit';submit.className='mw-btn mw-btn--primary';
    form.onsubmit=e=>{e.preventDefault();void perform(async()=>{
      let data: string|null|undefined; const file=avatar.files?.[0];
      if(file) {
        if(file.type!=='image/png'||file.size>135*1024){message.textContent=uiText.text("workbench.account-management.choose-png-image-no-larger-than-135-kb");return;}
        data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('Image'));reader.onerror=reject;reader.readAsDataURL(file);});
      }
      if(!current())return;
      await request('/profile',{displayName:name.value.trim(),expectedVersion:user.version,...(data!==undefined?{avatarDataUrl:data}:{})},{'Idempotency-Key':crypto.randomUUID()},'PATCH');
      await refresh();if(current()){profile();message.textContent=uiText.text("workbench.account-management.profile-saved");}
    });};
    button('workbench.account.login-security',()=>perform(methods));button('workbench.account.back-account',returnToAccount);
  }
  async function methods() {
    discard(); const methods=await request<LoginMethodsView>('/login-methods');if(!current())return;reset("workbench.account-management.sign-methods-security");
    for(const method of methods.loginMethods){const row=node('div','','account-method'); row.append(node('strong',methodName(method.type)),node('p',method.maskedLabel),node('p',uiText.text(method.usableForLogin?"workbench.account-management.available-sign":method.verified?"workbench.account-management.verified-unavailable-sign":"workbench.account-management.not-verified"),'mw-muted'));
      button('workbench.account.replace-method',()=>choose({kind:'replace',type:method.type,bindingId:method.bindingId,label:method.maskedLabel},methods),row);
      button('workbench.account.remove-method',()=>choose({kind:'unlink',type:method.type,bindingId:method.bindingId,label:method.maskedLabel},methods),row);form.append(row);}
    const additions=node('div','','account-modes');for(const type of ['EMAIL','PHONE','GOOGLE','GITHUB'] as const) button(({EMAIL:'workbench.account.link-email',PHONE:'workbench.account.link-phone',GOOGLE:'workbench.account.link-google',GITHUB:'workbench.account.link-github'} as const)[type],()=>choose({kind:'bind',type},methods),additions);form.append(additions);
    button('workbench.account.set-password',()=>choose({kind:'password'},methods));button('workbench.account.profile',profile);button('workbench.account.back-account',returnToAccount);
  }
  function choose(action: Mutation, methods: LoginMethodsView) {
    discard();reset("workbench.account-management.verify-current-account");
    const select=node('select','','mw-input');select.setAttribute('aria-label',uiText.text("workbench.account-management.verification-method"));
    for(const method of new Set(methods.loginMethods.filter(m=>m.usableForLogin).map(m=>verification(m.type,true)))){const option=node('option', method==='EMAIL_PASSWORD' ? uiText.text("workbench.account-management.email-password") : method==='PHONE_OTP' ? uiText.text("workbench.account-management.phone-code") : method==='EMAIL_CODE' ? uiText.text("workbench.account-management.email") : methodName(method));option.value=method;select.append(option);}form.append(select);
    const start=button('workbench.account.start-verification',()=>perform(async()=>{
      const operation={bind:'BIND_METHOD',replace:'REPLACE_METHOD',unlink:'UNLINK_METHOD',password:'CHANGE_PASSWORD'}[action.kind];
      const target=action.kind==='bind'?{method:action.type}:action.kind==='password'?{kind:'PASSWORD'}:{bindingId:action.bindingId};
      const tx=await request('/reauthentications',{method:select.value,operation,target});if(!await keep(tx))return;
      disposeVerification=verifyAccountMethod(ui,tx,select.value,()=>void verified(tx.handle,action,methods),()=>void perform(reopenMethods));
    }));start.disabled=!select.options.length; button('common.control.cancel',()=>perform(reopenMethods));
  }
  // A new verification binds to the exact reauthentication handle and original method revision.
  async function verified(reauth: string, action: Mutation, methods: LoginMethodsView) {
    disposeVerification?.();disposeVerification=undefined;
    if(!current())return;
    if(action.kind==='password'||action.kind==='unlink'){confirm(action,methods,reauth);return;}
    await perform(async()=>{
      const method=verification(action.type!), tx=await request('/auth/transactions',{purpose:action.kind==='bind'?'BIND':'REPLACE',method,reauthHandle:reauth,...(action.bindingId?{bindingId:action.bindingId}:{})});
      if(await keep(tx))disposeVerification=verifyAccountMethod(ui,tx,method,()=>{disposeVerification?.();disposeVerification=undefined;if(current())confirm(action,methods,reauth,tx.handle);},()=>void perform(reopenMethods));
    });
  }
  function confirm(action: Mutation, methods: LoginMethodsView, reauthHandle: string, identityHandle?: string) {
    reset(action.kind==='password'?"workbench.account-management.set-change-password":"workbench.account-management.confirm-sign-method-update");const key=crypto.randomUUID();
    if(action.kind==='password'){const password=field('workbench.account.new-password','password','password','new-password');password.minLength=12;const again=field('workbench.account.confirm-password','confirm','password','new-password');again.minLength=12;form.append(node('p',uiText.text("workbench.account-management.keeps-login-signs-out-all-other-products-devices"),'mw-muted'));}
    else form.append(node('p',action.kind==='unlink'?uiText.text("workbench.account-management.confirm-unbind-named", { name: action.label ?? "" }):uiText.text("workbench.account-management.verification-complete-confirm-sign-method-update")));
    const submit=button('workbench.account.confirm-save',()=>{});submit.type='submit';submit.className='mw-btn mw-btn--primary';
    form.onsubmit=e=>{e.preventDefault();const values=new FormData(form);void perform(async()=>{
      if(action.kind==='password'&&values.get('password')!==values.get('confirm')){message.textContent=uiText.text("workbench.account-management.passwords-do-not-match");return;}
      const path=action.kind==='password'?'/password/change':action.kind==='bind'?'/login-methods/bind':'/login-methods/'+encodeURIComponent(action.bindingId!)+'/'+action.kind;
      await request(path,{reauthHandle,expectedVersion:methods.version,...(identityHandle?{identityHandle}:{}),...(action.kind==='password'?{newPassword:String(values.get('password'))}:{})},{'Idempotency-Key':key});
      if(current()){form.reset();await reopenMethods();message.textContent=uiText.text("workbench.account-management.account-settings-saved");}
    });};button('common.control.cancel',()=>perform(reopenMethods));
  }
  const reopenMethods = methods;
  profile();return dispose;
}
