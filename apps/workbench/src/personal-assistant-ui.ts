/** Embedded Home surface. The host owns navigation, request authority and result routing. */
export function renderPersonalAssistantPanel(): string {
  return `<section class="personal-assistant" data-personal-assistant aria-label="工作助理">
    <header><h2>值得留意的一件事</h2><button type="button" class="mw-btn mw-btn--ghost" data-pa="preferences">助理偏好</button></header>
    <button type="button" class="mw-btn mw-btn--ghost" data-pa="reload">刷新建议</button>
    <div data-pa-notice role="status" aria-live="polite"></div>
    <div data-pa-content><p>正在读取已保存的建议…</p></div>
    <details class="pa-history"><summary>稍后与已处理</summary><div data-pa-history></div></details>
    <form data-pa-preferences hidden><h3>助理偏好</h3><p>只影响助理的建议。来源授权和角色在原设置中管理。</p>
      <label><input type="checkbox" name="enabled"> 接收主动建议</label>
      <label>工作方式<textarea name="instructions" maxlength="2000" placeholder="例如：先给依据，建议尽量简短。"></textarea></label>
      <fieldset><legend>接收哪些建议</legend><label><input type="checkbox" name="requirement_change"> 需求变化</label><label><input type="checkbox" name="follow_up"> 需要跟进</label><label><input type="checkbox" name="risk"> 项目风险</label></fieldset>
      <label>暂时安静到<input type="datetime-local" name="quiet_until"></label>
      <label>每次最多展示<select name="max_visible"><option value="1">1 条</option><option value="3">3 条</option><option value="5">5 条</option></select></label>
      <p data-pa-character></p><div class="pa-controls"><button class="mw-btn mw-btn--primary">保存偏好</button><button type="button" class="mw-btn mw-btn--ghost" data-pa="preferences">收起</button></div>
    </form>
  </section>`;
}
export const PERSONAL_ASSISTANT_STYLES = `
.personal-assistant{color:var(--ink,#222326);font:13px/1.6 var(--font-sans,Inter,"PingFang SC",sans-serif);max-width:760px;padding:24px;background:var(--paper,#fff);border:1px solid var(--hairline,#e2e4e7);border-radius:12px}
.personal-assistant *{box-sizing:border-box}.personal-assistant header,.pa-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.personal-assistant header{justify-content:space-between;margin-bottom:20px}.personal-assistant h2{font-size:16px;font-weight:500;margin:0}.personal-assistant h3{font-size:20px;line-height:1.4;letter-spacing:-.02em;font-weight:500;margin:8px 0 12px;overflow-wrap:anywhere}.personal-assistant p{margin:8px 0 14px;max-width:70ch}.personal-assistant [data-pa-notice]:not(:empty){padding:10px 0;color:var(--ink-soft,#3c3f44)}.personal-assistant [role=alert]{color:var(--red,#b03d45)}
.personal-assistant .pa-identity{color:var(--muted,#6b6f76);font-size:12px}.pa-evidence{margin:18px 0}.pa-evidence summary,.pa-history summary{cursor:pointer;text-underline-offset:3px}.pa-evidence blockquote{margin:8px 0 16px;padding:0;color:var(--ink-soft,#3c3f44);overflow-wrap:anywhere}.pa-evidence li{margin-top:12px}.pa-evidence ul{padding-left:20px}.pa-evidence cite{font-style:normal;font-weight:500}.pa-controls{margin-top:20px}.pa-history{border-top:1px solid var(--hairline,#e2e4e7);margin-top:24px;padding-top:16px}.pa-history article{padding:12px 0;border-bottom:1px solid var(--hairline,#e2e4e7)}.personal-assistant label{display:block;margin:12px 0}.personal-assistant input[type=checkbox]{accent-color:var(--accent,#5e6ad2);margin-right:8px}.personal-assistant textarea,.personal-assistant input[type=datetime-local],.personal-assistant select{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--hairline,#d0d6e0);border-radius:8px;background:var(--paper,#fff);color:inherit;font:inherit;caret-color:var(--accent,#5e6ad2)}.personal-assistant textarea{min-height:84px;resize:vertical}.personal-assistant textarea::placeholder{color:var(--muted,#6b6f76)}.personal-assistant fieldset{border:0;padding:0;margin:16px 0}.personal-assistant [data-pa-preferences]{margin-top:24px;border-top:1px solid var(--hairline,#e2e4e7);padding-top:20px}.personal-assistant :focus-visible{outline:2px solid var(--accent,#5e6ad2);outline-offset:3px}.personal-assistant ::selection{background:var(--accent-soft,#eef0fb)}.personal-assistant [hidden]{display:none!important}.personal-assistant button:disabled{opacity:.55;cursor:wait}.personal-assistant .pa-empty{padding:12px 0 20px;color:var(--ink-soft,#3c3f44)}
@media(max-width:560px){.personal-assistant{padding:18px 16px;border-radius:10px}.personal-assistant header{align-items:flex-start}.personal-assistant h3{font-size:18px}.personal-assistant button{min-height:44px}.pa-controls{gap:6px}.pa-evidence ul{padding-left:16px}.personal-assistant summary{min-height:44px;padding-block:10px;line-height:24px}}
`;
export const PERSONAL_ASSISTANT_CLIENT_SCRIPT = `(host) => {
 const {root,api}=host, esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 let state=null,busy=false,editing=null,editText='';
 const notice=(message,error=false)=>{const el=root.querySelector('[data-pa-notice]');el.textContent=message;el.setAttribute('role',error?'alert':'status');};
 const labels={ready:'待确认',snoozed:'稍后提醒',dismissed:'已忽略',expired:'材料已变化',executing:'正在核对执行结果',needs_check:'需要核对',completed:'已完成'};
 function render(){
  if(!state)return;
  const rows=state.suggestions;
  root.querySelector('[data-pa-content]').innerHTML=rows.length?rows.map(row=>'<article data-suggestion="'+esc(row.id)+'"><h3>'+esc(row.title)+'</h3><p>'+esc(row.reason)+'</p><p class="pa-identity">'+esc(row.character_title||'Molis 助理')+'</p><details class="pa-evidence"><summary>查看 '+row.evidence.length+' 处依据</summary><ul>'+row.evidence.map(e=>{const m=row.materials.find(m=>m.key===e.material_key);return '<li><cite>'+esc(m?.context.title)+'</cite><blockquote>“'+esc(e.quote)+'”</blockquote><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-pa="source" data-material="'+esc(e.material_key)+'">打开原材料</button></li>';}).join('')+'</ul></details><div class="pa-controls"><button type="button" class="mw-btn mw-btn--primary" data-pa="execute">确认 · '+esc(row.offer.title)+'</button><button type="button" class="mw-btn mw-btn--secondary" data-pa="edit">调整要求</button><button type="button" class="mw-btn mw-btn--ghost" data-pa="snooze">一小时后</button><button type="button" class="mw-btn mw-btn--ghost" data-pa="dismiss">忽略这次</button></div>'+(editing===row.id?'<form data-pa-edit><label>希望怎样调整<textarea name="instructions" maxlength="2000" required placeholder="例如：先整理新增要求，保留原稿。">'+esc(editText)+'</textarea></label><button class="mw-btn mw-btn--secondary">重新判断</button></form>':'')+'</article>').join(''):'<div class="pa-empty">'+(state.quiet?'助理已安静下来。你可以继续当前工作，或在偏好里恢复。':'暂时没有需要你处理的建议。新的相关变化出现时，助理会带着依据来。')+'</div>';
  root.querySelector('[data-pa-history]').innerHTML=state.history.length?state.history.map(row=>'<article data-suggestion="'+esc(row.id)+'"><strong>'+esc(row.title)+'</strong><p>'+esc(labels[row.status])+(row.remind_at?' · '+esc(new Date(row.remind_at).toLocaleString()):'')+'</p>'+(row.issue?'<p>'+esc(row.issue)+'</p>':'')+(row.status==='completed'&&row.has_result?'<button type="button" class="mw-btn mw-btn--secondary" data-pa="result">查看执行成果</button>':['executing','needs_check'].includes(row.status)?'<button type="button" class="mw-btn mw-btn--secondary" data-pa="recover">核对原请求</button>':'')+'</article>').join(''):'<p>还没有处理记录。忽略只针对这次材料，不会改变你的长期偏好。</p>';
  root.querySelectorAll('button').forEach(b=>b.disabled=busy);
 }
 async function refresh(){state=await api('state','GET');render();}
 function populate(){const f=root.querySelector('[data-pa-preferences]'),p=state.preferences;f.elements.enabled.checked=p.enabled;f.elements.instructions.value=p.instructions;for(const key of ['requirement_change','follow_up','risk'])f.elements[key].checked=!p.disabled_categories.includes(key);f.elements.max_visible.value=p.max_visible;f.elements.quiet_until.value=p.quiet_until?new Date(Date.parse(p.quiet_until)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';root.querySelector('[data-pa-character]').textContent=p.character?'使用已选角色的固定版本；在 Character 中管理角色。':'当前使用 Molis 助理。你可以在 Character 中选择角色。';}
 async function perform(fn){if(busy)return;busy=true;render();try{await fn();await refresh();}catch(e){notice(e.message||'暂时无法完成，输入已保留，请重试。',true);}finally{busy=false;render();}}
 root.addEventListener('click',async event=>{const button=event.target.closest('[data-pa]');if(!button||busy)return;const action=button.dataset.pa;
  if(action==='reload'){await perform(refresh);return;}
  if(!state){await perform(refresh);return;}
  if(action==='preferences'){const form=root.querySelector('[data-pa-preferences]');form.hidden=!form.hidden;if(!form.hidden)populate();return;}
  const row=[...state.suggestions,...state.history].find(r=>r.id===button.closest('[data-suggestion]')?.dataset.suggestion);if(!row)return;
  if(action==='edit'){editText='';editing=editing===row.id?null:row.id;render();root.querySelector('[data-pa-edit] textarea')?.focus();return;}
  if(action==='source'){const m=row.materials.find(m=>m.key===button.dataset.material);await host.openSubject?.(m.context.subject);return;}
  if(action==='result'){await perform(async()=>{const latest=await api('recover','POST',{id:row.id});if(latest.result)await host.openResult?.(latest.result,row.subject);else notice(latest.issue);});return;}
  await perform(async()=>{if(action==='execute'){const result=await api('execute','POST',{id:row.id,revision:row.revision});notice(result.status==='completed'?'动作已完成，可以查看成果。':result.issue);}
   if(action==='recover'){const result=await api('recover','POST',{id:row.id});notice(result.status==='completed'?'已找到原请求保存的成果。':result.issue);}
   if(action==='dismiss'||action==='snooze'){await api('feedback','POST',{id:row.id,revision:row.revision,choice:action,remind_at:action==='snooze'?new Date(Date.now()+3600000).toISOString():undefined});notice(action==='dismiss'?'已忽略这次，不会再次提醒；长期偏好没有改变。':'已放到一小时后。');}
  });
 });
 root.addEventListener('input',event=>{if(event.target.matches('[data-pa-edit] textarea'))editText=event.target.value;});
 root.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;if(busy||!state)return;
  if(form.matches('[data-pa-preferences]')){const p=state.preferences,quiet=form.elements.quiet_until.value;const patch={...p,enabled:form.elements.enabled.checked,instructions:form.elements.instructions.value,disabled_categories:['requirement_change','follow_up','risk'].filter(k=>!form.elements[k].checked),max_visible:Number(form.elements.max_visible.value),quiet_until:quiet?new Date(quiet).toISOString():null};await perform(async()=>{await api('preferences','POST',{revision:p.revision,preferences:patch});form.hidden=true;notice('偏好已保存，随时可以修改。');});}
  if(form.matches('[data-pa-edit]')){const row=state.suggestions.find(r=>r.id===editing),instructions=form.elements.instructions.value;if(!row)return;await perform(async()=>{const result=await api('evaluate','POST',{changes:row.materials.filter(m=>m.role==='change').map(m=>m.context.subject),project_materials:row.materials.filter(m=>m.role==='project').map(m=>m.context.subject),instructions});if(result.outcome==='suggested'){await api('feedback','POST',{id:row.id,revision:row.revision,choice:'dismiss'});editing=null;}notice(result.message,result.outcome==='needs_review');});}
 });
 refresh().catch(e=>notice(e.message||'建议读取失败，请重试。',true));return {refresh,async evaluate(context){await perform(async()=>{notice('正在关联新内容与当前项目材料…');const result=await api('evaluate','POST',context);notice(result.message,result.outcome==='needs_review');});}};
}`;
