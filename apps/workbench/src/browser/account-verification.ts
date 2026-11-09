import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AccountReply, AccountUi } from "./account-management.js";
/** Same verification form for current and new identities; no central proof reaches the browser. */
export function verifyAccountMethod(ui: AccountUi, transaction: AccountReply, method: string, onComplete: () => void, onCancel?: () => void) {
  const {form,dialog,message,node,field,button,request,perform}=ui;
  let active=true,challenge='',retryAt=0, timer: ReturnType<typeof setInterval>|undefined, pollTimer: ReturnType<typeof setTimeout>|undefined, completeTimer: ReturnType<typeof setTimeout>|undefined, popup: Window|null=null;
  const current=()=>active&&dialog.open;
  const step=(body:unknown)=>request('/auth/transactions/'+transaction.handle+'/submit',body);
  const dispose=()=>{active=false;clearInterval(timer);clearTimeout(pollTimer);clearTimeout(completeTimer);popup?.close();form.onsubmit=null;};
  const done=()=>{if(current())completeTimer=setTimeout(()=>{if(current())onComplete();},0);};
  async function advance(result: AccountReply){
    if(!current())return;form.reset();
    if(result.challengeHandle){challenge=result.challengeHandle;retryAt=Date.now()+result.retryAfterSeconds*1000;draw();return;}
    if(result.nextStep==='COMPLETE'){const completed=await step({step:'COMPLETE'});if(!completed.operationReady)throw Error('Verification missing');done();}
  }
  function draw(){
    clearInterval(timer);form.replaceChildren(node('h3',uiText.text("workbench.account-verification.verify-sign-method")));form.onsubmit=e=>e.preventDefault();
    if(method==='GOOGLE'||method==='GITHUB'){
      button('打开授权窗口',async()=>{
        const external=(globalThis as typeof globalThis & {molisWorkOpenExternalUrl?:(url:string)=>Promise<void>}).molisWorkOpenExternalUrl;
        popup=external?null:window.open('about:blank','_blank');if(popup)popup.opener=null;
        if(!external&&!popup){message.textContent=uiText.text("workbench.account-verification.allow-sign-window-open-try-again");return;}
        await perform(async()=>{
          const result=await step({step:'START_PROVIDER'});if(!current())return;
          if(!result.browserStartUrl)throw Error('Provider missing');
          if(external)await external(result.browserStartUrl);else popup!.location.replace(result.browserStartUrl);
          form.replaceChildren(node('p',uiText.text("workbench.account-verification.complete-authorization-browser-view-updates-automatically")));cancelButton();
          const poll=async()=>{if(!current())return;try{
            const status=await request('/auth/transactions/'+transaction.handle);if(!current())return;
            if(status.status==='CONSUMED'){popup?.close();done();return;}
            if(['CANCELLED','EXPIRED'].includes(status.status||'')||popup?.closed){message.textContent=uiText.text("workbench.account-verification.verification-incomplete-cancel-start-again");return;}
            pollTimer=setTimeout(()=>void poll(),1000);
          }catch{if(current())message.textContent=uiText.text("workbench.account-verification.verification-incomplete-cancel-start-again");}};
          pollTimer=setTimeout(()=>void poll(),750);
        });
      });cancelButton();return;
    }
    if(challenge){field('六位验证码','code','text','one-time-code');const resend=button('重新发送',()=>perform(async()=>{await request('/auth/transactions/'+transaction.handle+'/resend',{});retryAt=Date.now()+60000;}));
      const tick=()=>{resend.disabled=Date.now()<retryAt||form.hasAttribute('aria-busy');resend.textContent=uiText.text("workbench.account-verification.resend-code")+(Date.now()<retryAt?' ('+Math.ceil((retryAt-Date.now())/1000)+')':'');};timer=setInterval(tick,1000);tick();
    }else{const address=field(method==='PHONE_OTP'?'中国大陆手机号（+86）':'邮箱','address',method==='PHONE_OTP'?'tel':'email',method==='PHONE_OTP'?'tel-national':'email');if(method==='PHONE_OTP'){address.pattern='1[3-9][0-9]{9}';address.maxLength=11;}
      if(method==='EMAIL_PASSWORD'){const password=field('当前密码','password','password','current-password');password.minLength=1;}}
    const submit=button(challenge?'验证并继续':method==='EMAIL_PASSWORD'?'确认身份':'发送验证码',()=>{});submit.type='submit';submit.className='mw-btn mw-btn--primary';
    form.onsubmit=e=>{e.preventDefault();const values=new FormData(form);void perform(async()=>{
      const body=challenge?{step:'VERIFY_CHALLENGE',challengeHandle:challenge,credential:String(values.get('code'))}:method==='EMAIL_PASSWORD'?{step:'PASSWORD_LOGIN',email:String(values.get('address')).trim(),password:String(values.get('password'))}:{step:'REQUEST_CHALLENGE',address:(method==='PHONE_OTP'?'+86':'')+String(values.get('address')).trim()};
      await advance(await step(body));
    });};cancelButton();form.querySelector('input')?.focus();
  }
  function cancelButton(){if(onCancel)button('取消',onCancel);}
  draw();return dispose;
}
