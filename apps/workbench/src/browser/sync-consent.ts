import type { SyncDevicePreference } from '@molis-ai/molis-work-contracts/modules/sync-replication';

/** Consent belongs to the local Host, not browser storage or the cloud policy. */
export function createSyncConsent() {
  let checking=false,epoch=0,currentSpace='',dialog:HTMLDialogElement|null=null;
  const L=globalThis.L||((text:string)=>text);
  const update=async(space:string)=>{
    if(space!==currentSpace){epoch++;currentSpace=space;dialog?.close();dialog?.remove();dialog=null;}
    if(space!=='account'||checking||dialog||document.hidden||document.querySelector('dialog[open]'))return;
    checking=true;const generation=epoch;
    try{
      const state=await molisWorkRequest<{available:boolean;device:SyncDevicePreference}>('/api/sync');
      if(generation!==epoch||!state.available||state.device.automatic!==null)return;
      const sheet=document.createElement('dialog');dialog=sheet;
      sheet.className='mw-dialog mw-dialog--form';sheet.dataset.syncConsent='';sheet.setAttribute('aria-labelledby','sync-consent-title');
      const shell=document.createElement('div');shell.className='mw-form mw-dialog__shell';
      const header=document.createElement('header');header.className='mw-form__header';
      const title=document.createElement('h2');title.id='sync-consent-title';title.textContent=L('在这台设备上同步？');header.append(title);
      const body=document.createElement('div');body.className='mw-form__body';
      const text=document.createElement('p');text.textContent=L('自动同步个人空间的已选内容。本地空间不上传，也可以稍后手动同步。');
      const error=document.createElement('p');error.className='settings-form-error';error.setAttribute('role','alert');error.hidden=true;body.append(text,error);
      const footer=document.createElement('footer');footer.className='mw-form__footer';
      const buttons:HTMLButtonElement[]=[];
      const choose=async(automatic:boolean)=>{
        if(buttons.some(button=>button.disabled))return;
        buttons.forEach(button=>button.disabled=true);error.hidden=true;
        try{
          await molisWorkRequest('/api/sync/device',{method:'PUT',body:{automatic}});
          if(generation===epoch){sheet.close();sheet.remove();dialog=null;}
        }catch(failure){if(sheet.isConnected){error.textContent=failure instanceof Error?failure.message:L('同步暂时不可用');error.hidden=false;}}
        finally{buttons.forEach(button=>button.disabled=false);}
      };
      for(const [automatic,label] of [[true,'开启自动同步'],[false,'暂不启用']] as const){
        const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--'+(automatic?'primary':'secondary');button.textContent=L(label);
        button.addEventListener('click',()=>void choose(automatic));buttons.push(button);footer.append(button);
      }
      sheet.addEventListener('cancel',event=>{event.preventDefault();void choose(false);});
      shell.append(header,body,footer);sheet.append(shell);document.body.append(sheet);sheet.showModal();buttons[1].focus();
    }catch{ /* The sync settings page offers diagnostics and retry; account use stays available. */ }
    finally{checking=false;}
  };
  return {update};
}
