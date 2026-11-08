import type { AccountView, LoginMethodsView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { verifyAccountMethod } from "./account-verification.js";
export interface AccountReply { handle: string; nextStep: string; challengeHandle: string; retryAfterSeconds: number; status?: string; browserStartUrl?: string; operationReady?: boolean }
export interface AccountUi {
  form: HTMLFormElement; dialog: HTMLDialogElement; message: HTMLElement;
  L(text: string): string;
  node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K];
  field(label: string, name: string, type: string, autocomplete: string): HTMLInputElement;
  button(text: string, action: () => void | Promise<void>, parent?: HTMLElement): HTMLButtonElement;
  request<T = AccountReply>(path: string, body?: unknown, headers?: Record<string, string>, method?: "PATCH"): Promise<T>;
  perform(run: () => Promise<void>): Promise<void>;
}
const names = { EMAIL: "邮箱", PHONE: "手机", GOOGLE: "Google", GITHUB: "GitHub" };
type MethodType = keyof typeof names;
type Mutation = { kind: "bind" | "replace" | "unlink" | "password"; type?: MethodType; bindingId?: string; label?: string };
const verification = (type: MethodType, current = false) => type === "EMAIL" ? current ? "EMAIL_PASSWORD" : "EMAIL_CODE" : type === "PHONE" ? "PHONE_OTP" : type;
export function openAccountManagement(ui: AccountUi, user: UserView, back: () => Promise<void>) {
  const { form, dialog, message, L, node, field, button, request, perform } = ui;
  const handles = new Set<string>(); let active = true, disposeVerification: (() => void) | undefined;
  const current = () => active && dialog.open;
  const discard = () => { disposeVerification?.(); disposeVerification = undefined; for (const h of handles) void request('/auth/transactions/'+h+'/cancel',{}).catch(()=>{ /* Expiry also revokes abandoned proofs. */ }); handles.clear(); };
  const dispose = () => { active = false; discard(); form.onsubmit = null; dialog.removeEventListener('close',dispose); };
  dialog.addEventListener('close',dispose);
  const reset = (title: string) => { form.onsubmit = e => e.preventDefault(); form.replaceChildren(node('h3',L(title))); message.textContent=''; };
  const returnToAccount = async () => { dispose(); await back(); };
  async function keep(tx: AccountReply) { if (!current()) { await request('/auth/transactions/'+tx.handle+'/cancel',{}); return false; } handles.add(tx.handle); return true; }
  async function refresh() { const view=await request<AccountView>('/session'); if (view.state!=='AUTHENTICATED') throw Error('Session expired'); user=view.user; }
  function profile() {
    discard(); reset('个人资料');
    if(user.avatarUrl) { const image=node('img'); image.src=user.avatarUrl; image.width=72; image.height=72; image.alt=L('当前头像'); image.referrerPolicy='no-referrer'; form.append(image); }
    const name=field('昵称','name','text','name'); name.value=user.displayName; name.maxLength=80;
    const avatar=field('头像（PNG，最多 135 KB）','avatar','file','off'); avatar.accept='image/png'; avatar.required=false;
    if(user.avatarUrl) button('移除头像',()=>perform(async()=>{await request('/profile',{avatarDataUrl:null,expectedVersion:user.version},{'Idempotency-Key':crypto.randomUUID()},'PATCH');await refresh();if(current()){profile();message.textContent=L('资料已保存。');}}));
    const submit=button('保存资料',()=>{});submit.type='submit';submit.className='mw-btn mw-btn--primary';
    form.onsubmit=e=>{e.preventDefault();void perform(async()=>{
      let data: string|null|undefined; const file=avatar.files?.[0];
      if(file) {
        if(file.type!=='image/png'||file.size>135*1024){message.textContent=L('请选择不超过 135 KB 的 PNG 图片。');return;}
        data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('Image'));reader.onerror=reject;reader.readAsDataURL(file);});
      }
      if(!current())return;
      await request('/profile',{displayName:name.value.trim(),expectedVersion:user.version,...(data!==undefined?{avatarDataUrl:data}:{})},{'Idempotency-Key':crypto.randomUUID()},'PATCH');
      await refresh();if(current()){profile();message.textContent=L('资料已保存。');}
    });};
    button('登录方式与安全',()=>perform(methods));button('返回账号',returnToAccount);
  }
  async function methods() {
    discard(); const methods=await request<LoginMethodsView>('/login-methods');if(!current())return;reset('登录方式与安全');
    for(const method of methods.loginMethods){const row=node('div','','account-method'); row.append(node('strong',L(names[method.type])),node('p',method.maskedLabel),node('p',L(method.usableForLogin?'可用于登录':method.verified?'已验证，暂不可用于登录':'尚未验证'),'mw-muted'));
      button('换绑',()=>choose({kind:'replace',type:method.type,bindingId:method.bindingId,label:method.maskedLabel},methods),row);
      button('解绑',()=>choose({kind:'unlink',type:method.type,bindingId:method.bindingId,label:method.maskedLabel},methods),row);form.append(row);}
    const additions=node('div','','account-modes');for(const type of ['EMAIL','PHONE','GOOGLE','GITHUB'] as const) button(({EMAIL:'绑定邮箱',PHONE:'绑定手机',GOOGLE:'绑定Google',GITHUB:'绑定GitHub'} as const)[type],()=>choose({kind:'bind',type},methods),additions);form.append(additions);
    button('设置或修改密码',()=>choose({kind:'password'},methods));button('个人资料',profile);button('返回账号',returnToAccount);
  }
  function choose(action: Mutation, methods: LoginMethodsView) {
    discard();reset('验证当前账号');
    const select=node('select','','mw-input');select.setAttribute('aria-label',L('验证方式'));
    for(const method of new Set(methods.loginMethods.filter(m=>m.usableForLogin).map(m=>verification(m.type,true)))){const option=node('option',L(method==='EMAIL_PASSWORD'?'邮箱密码':method==='PHONE_OTP'?'手机验证码':method==='GOOGLE'?'Google':'GitHub'));option.value=method;select.append(option);}form.append(select);
    const start=button('开始验证',()=>perform(async()=>{
      const operation={bind:'BIND_METHOD',replace:'REPLACE_METHOD',unlink:'UNLINK_METHOD',password:'CHANGE_PASSWORD'}[action.kind];
      const target=action.kind==='bind'?{method:action.type}:action.kind==='password'?{kind:'PASSWORD'}:{bindingId:action.bindingId};
      const tx=await request('/reauthentications',{method:select.value,operation,target});if(!await keep(tx))return;
      disposeVerification=verifyAccountMethod(ui,tx,select.value,()=>void verified(tx.handle,action,methods),()=>void perform(reopenMethods));
    }));start.disabled=!select.options.length; button('取消',()=>perform(reopenMethods));
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
    reset(action.kind==='password'?'设置或修改密码':'确认更新登录方式');const key=crypto.randomUUID();
    if(action.kind==='password'){const password=field('新密码（至少 12 位）','password','password','new-password');password.minLength=12;const again=field('再次输入新密码','confirm','password','new-password');again.minLength=12;form.append(node('p',L('修改后保留当前登录，退出其他所有产品和设备。'),'mw-muted'));}
    else form.append(node('p',action.kind==='unlink'?L('确认解绑')+' '+action.label+'？':L('验证已完成，确认更新登录方式。')));
    const submit=button('确认保存',()=>{});submit.type='submit';submit.className='mw-btn mw-btn--primary';
    form.onsubmit=e=>{e.preventDefault();const values=new FormData(form);void perform(async()=>{
      if(action.kind==='password'&&values.get('password')!==values.get('confirm')){message.textContent=L('两次输入的密码不一致。');return;}
      const path=action.kind==='password'?'/password/change':action.kind==='bind'?'/login-methods/bind':'/login-methods/'+encodeURIComponent(action.bindingId!)+'/'+action.kind;
      await request(path,{reauthHandle,expectedVersion:methods.version,...(identityHandle?{identityHandle}:{}),...(action.kind==='password'?{newPassword:String(values.get('password'))}:{})},{'Idempotency-Key':key});
      if(current()){form.reset();await reopenMethods();message.textContent=L('账号设置已保存。');}
    });};button('取消',()=>perform(reopenMethods));
  }
  const reopenMethods = methods;
  profile();return dispose;
}
