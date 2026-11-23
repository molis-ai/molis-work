/** Installing a published version: the studio hands its signed package to the shell's install sheet and shows where the installation stands. A part of the studio page's client script (`agent-studio.ts` joins the parts in order). */
export const STUDIO_CLIENT_INSTALL = String.raw` const installStage=$('[data-as-install-stage]'),installNote=$('[data-as-install-note]'),installPlace=$('[data-as-install-place]');
 let sheet=null,installShown='';
 function installed(b){const latest=versions[0];if(!b?.design||!latest?.distribution)return null;
  return (state.installations||[]).find(i=>i.pluginId===b.design.contract.pluginId&&i.scope===latest.distribution.runtime_scope&&versions.some(v=>v.distribution?.publisher_key_id===i.publisher))||null;}
 const sheetKey=b=>{const latest=versions[0];return b&&latest?.distribution?b.id+':'+latest.version:'';};
 const installWord=(latest,inst)=>inst&&inst.version<latest.version?globalThis.t.text("plugin-builder.agent-studio.upgrade-v-version",{version:latest.version}):globalThis.t.text(latest.distribution.runtime_scope==='home'?"plugin-builder.agent-studio.install-personal-space":"plugin-builder.agent-studio.install-project");
 const stateChip=inst=>'<span class="as-chip ok" data-mw-state="ready">'+globalThis.t.text("plugin-builder.agent-studio.installed-v-version",{version:inst.version})+'</span>'+(inst.state==='running'?'':' <span class="as-chip bad" data-mw-state="'+({disabled:"disabled",quarantined:"quarantined",crashed:"failed",failed:"failed",installed:"ready"}[inst.state]||"unavailable")+'">'+esc(inst.state)+'</span>');
 const openLink=(b,inst)=>inst.surface&&inst.state==='running'?'<a class="as-button as-primary" href="'+esc(host.plugin(inst.pluginId))+'" data-as-open-plugin="'+esc(inst.surface)+'">'+globalThis.t.text("plugin-builder.agent-studio.open-plugin")+'</a>':'';
 const shareHtml=latest=>'<p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.import-signed-package-into-another-space-existing-installation")+' '+globalThis.t.text("plugin-builder.agent-studio.publisher-fingerprint")+' <code>'+esc(latest.distribution.publisher_key_id)+'</code></p>';
 const downloadButton=latest=>'<button type="button" class="as-button" data-as-download="'+latest.version+'">'+icon('download')+globalThis.t.text("plugin-builder.agent-studio.download-signed-package")+'</button>';
 const settingsButton='<button type="button" class="as-button" data-as-plugin-settings>'+globalThis.t.text("plugin-builder.agent-studio.open-plugin-settings")+'</button>';
 function installHtml(b){const latest=versions[0];if(!latest)return '';
  if(!latest.distribution)return '<div class="as-install"><p class="as-small">'+globalThis.t.text("plugin-builder.agent-studio.publish-again-to-install")+'</p></div>';
  const inst=installed(b),behind=!inst||inst.version<latest.version;
  return '<div class="as-install"><p class="as-small">'+(inst?stateChip(inst):globalThis.t.text("plugin-builder.agent-studio.v-version-published-molis-work-asks-before-installing",{version:latest.version}))+'</p>'+(inst?.error?'<p class="as-small" role="alert">'+esc(inst.error)+'</p>':'')
   +'<div class="as-actions">'+(behind?'<button type="button" class="as-button as-primary" data-as-tab="install">'+icon(inst?'refresh':'download')+esc(installWord(latest,inst))+'</button>':'')+(inst?openLink(b,inst):'')+(inst?settingsButton:'')+downloadButton(latest)+'</div>'+shareHtml(latest)+'</div>';}
 function closeSheet(){const open=sheet;sheet=null;open?.abort.abort();}
 function openSheet(){const b=current,latest=versions[0],key=sheetKey(b);if(!key)return;closeSheet();
  const mine=sheet={key,abort:new AbortController(),outcome:host.packageInstall?'':'unavailable'};schedule();if(mine.outcome)return;
  void (async()=>{const bundle=await api('/builds/'+b.id+'/download?version='+latest.version,'GET',undefined,mine.abort.signal);if(sheet!==mine)return;
   const outcome=await host.packageInstall(installPlace,{bundle},{signal:mine.abort.signal});if(sheet!==mine)return;
   mine.outcome=outcome.status;if(outcome.status==='installed')await refreshState();else mine.abort.abort();
   schedule();})().catch(e=>{if(sheet!==mine)return;mine.outcome='unavailable';mine.abort.abort();schedule();});}
 function renderInstall(){const b=current,latest=versions[0],on=tab==='install'&&!!latest?.distribution;installStage.hidden=!on;
  if(sheet&&sheet.key!==sheetKey(b))closeSheet();
  if(!on)return;
  const inst=installed(b),behind=!inst||inst.version<latest.version;
  if(!sheet&&behind)openSheet();
  let html='';
  if(sheet?.outcome==='unavailable')html='<p role="alert">'+globalThis.t.text("plugin-builder.agent-studio.install-confirmation-cannot-open-here-import-in-settings")+'</p><div class="as-actions">'+downloadButton(latest)+settingsButton+'</div>';
  else if(sheet?.outcome==='cancelled'||sheet?.outcome==='failed')html='<p>'+globalThis.t.text(sheet.outcome==='failed'?"plugin-builder.agent-studio.did-not-install-ask-for-fix-or-try-again":"plugin-builder.agent-studio.not-installed-yet-install-when-ready")+'</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-install-open>'+icon(sheet.outcome==='failed'?'refresh':'download')+esc(sheet.outcome==='failed'?globalThis.t.text("plugin-builder.agent-studio.try-again"):installWord(latest,inst))+'</button></div>';
  else if(!sheet&&inst)html='<p>'+stateChip(inst)+'</p>'+(inst.error?'<p class="as-small" role="alert">'+esc(inst.error)+'</p>':'')+'<p class="as-small as-muted">'+globalThis.t.text("plugin-builder.agent-studio.manage-permissions-turn-off-uninstall-in-plugin-settings")+'</p><div class="as-actions">'+openLink(b,inst)+settingsButton+'</div>';
  if(html!==installShown){installShown=html;installNote.innerHTML=html;}installNote.hidden=!html;}
 function ask(title,text,buttons){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='mw-dialog as-dialog';
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3><p class="as-small">'+esc(text)+'</p><div class="as-actions">'+buttons.map(([value,label,primary])=>'<button value="'+esc(value)+'" class="as-button'+(primary?' as-primary':'')+'">'+esc(label)+'</button>').join('')+'</div></form>';
  settle(d,resolve);});}
 function settle(d,resolve){const stop=lifetime.own(()=>{d.close();d.remove();resolve('');});root.append(d);d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const value=e.submitter?.value||'';d.close();d.remove();resolve(value);stop();});
  d.addEventListener('cancel',e=>{e.preventDefault();d.close();d.remove();resolve('');stop();});d.showModal();}
 lifetime.own(()=>closeSheet());
`;
