/** The page's root and lifetime, its requests to the studio's routes, and the two embedded modes (a trial's preview and an installed plugin's page), which end here. A part of the studio page's client script (`agent-studio-client.ts` joins the parts in order). */
export const STUDIO_CLIENT_TRANSPORT = String.raw` const selector=host.mode==='preview'?'[data-studio-preview]':host.mode==='installed'?'[data-installed-plugin]':'[data-agent-studio]';
 const root=host.root?(host.root.matches?.(selector)?host.root:host.root.querySelector(selector)):document.querySelector(selector);
 if(!root)return;
 const page=host.page;const lifetime=host.mountPluginClient(root);if(!lifetime)return;
 const Q=n=>globalThis.t.text("plugin-builder.agent-studio.name",{name:n});

 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>'<svg aria-hidden="true"><use href="#icon-'+n+'"/></svg>';
 const headers=m=>m==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||{'content-type':'application/json'});
 async function request(url,method='GET',body,signal,fallback=globalThis.t.text("plugin-builder.agent-studio.operation-failed-content-preserved")){
  const r=await lifetime.fetch(url,{method,signal,cache:'no-store',headers:headers(method),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({}));lifetime.assertCurrent(signal);if(!r.ok)throw Object.assign(new Error(v?.error||fallback),{status:r.status,code:v?.code,text:v?.text,detail:v?.detail});return v;
 }
 const api=(path,...args)=>request(host.api(path),...args);
 let pending=0;globalThis.__molisPluginPending=0;
 const pendingCall=async run=>{globalThis.__molisPluginPending=++pending;try{return await run()}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
 const pluginCall=id=>(componentId,binding,payload)=>pendingCall(async()=>(await api('/builds/'+id+'/call','POST',{componentId,binding,payload,...(host.acceptance?{acceptance:host.acceptance}:{})})).value);
 if(host.mode==='preview'){
  const readings=new Map(),plugin=host.components({root,call:pluginCall(host.build),onRead:(id,result)=>readings.set(id,result)});
  lifetime.own(()=>plugin.destroy());
  globalThis.__molisPluginRead=async componentId=>{const result=readings.get(componentId);if(!result)throw new Error(globalThis.t.text("common.generated.preview-no-result"));if('error'in result)throw new Error(result.error);return structuredClone(result.value)};
  if(host.acceptance){const refresh=async componentId=>{lifetime.assertCurrent();await plugin.refresh(componentId)};globalThis.__molisPluginRefresh=refresh;lifetime.own(()=>{if(globalThis.__molisPluginRefresh===refresh)delete globalThis.__molisPluginRefresh});}
  if(!host.view){root.textContent=globalThis.t.text("common.generated.preview-no-design");return;}
  plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 if(host.mode==='installed'){
  if(parent!==window)root.dataset.framed='';
  const call=(componentId,binding,payload)=>pendingCall(async()=>{
    const submit=binding==='submit',url=submit?host.route('/api/host/plugin-page-actions'):host.call;
    const body=submit?{mode:'component_submit',component_id:componentId,payload}:{componentId,binding,payload};
    const value=await request(url,'POST',body,undefined,globalThis.t.text("common.generated.input-preserved"));
    return submit?value:value.value;
  });
  const plugin=host.components({root,call,mountSurfaceSlot:host.mountSurfaceSlot});lifetime.own(()=>plugin.destroy());
  const ready=plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  lifetime.listen(host.root||root,'molis-work:select-item',event=>{
    const {panel,itemId,intent}=event.detail||{};if(intent!=='open')return;
    if(typeof panel==='string'||typeof itemId==='string')event.preventDefault();
    const unavailable=()=>{if(lifetime.alive){const note=document.createElement('p');note.dataset.pcOpenFailed='';note.setAttribute('role','alert');note.textContent=globalThis.t.text("plugin-builder.agent-studio.record-or-form-unavailable");root.prepend(note);}};
    void ready.then(async()=>{if(!lifetime.alive)return;root.querySelector('[data-pc-open-failed]')?.remove();
      const opened=typeof panel==='string'?plugin.openInput(panel):typeof itemId==='string'?await plugin.openRecord(itemId):true;
      if(!opened)unavailable();
    }).catch(unavailable);
  });
  return;
 }
`;
