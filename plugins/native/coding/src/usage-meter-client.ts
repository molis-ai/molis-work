/**
 * How full the context is and what the session has used, next to the send button, like the context ring in Cursor or
 * Claude Code's /context and /cost. The figures are the Host's: the latest call's whole prompt against the window the
 * round was packed for, and the session's recorded usage. A figure that is not known says so instead of reading as 0.
 * The budget is the person's own line; reaching it is reported and never stops a round.
 */
export const CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {q,api,current,status,refresh}=ports;
  const root=q('[data-coding-meter]'),toggle=q('[data-coding-meter-toggle]'),panel=q('[data-coding-meter-panel]'),fill=q('[data-coding-meter-fill]'),label=q('[data-coding-meter-label]');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const n=(value)=>Number(value).toLocaleString('zh-CN');
  const short=(value)=>new Intl.NumberFormat(document.documentElement.lang||'zh-CN',{notation:'compact',maximumFractionDigits:1}).format(value);
  const RING=2*Math.PI*8;
  let view=null,owner='',warned='';
  const contextOf=(run)=>{const windowTokens=run?.frozen?.model_context?.window_tokens,used=run?.usage?.context?.tokens;
    return {windowTokens,used,share:windowTokens && used!==undefined?used/windowTokens:null,coverage:run?.usage?.context?.coverage};};
  const spentOf=(data)=>data.usage_total?data.usage_total.tokens.input+data.usage_total.tokens.output:0;
  const open=(on)=>{panel.hidden=!on;toggle.setAttribute('aria-expanded',String(on));if(on){draw();panel.querySelector('button,input')?.focus({preventScroll:true});}};
  lifetime.listen(toggle,'click',()=>open(panel.hidden));
  lifetime.listen(panel,'keydown',event=>{if(event.key==='Escape'){event.stopPropagation();open(false);toggle.focus();}});
  lifetime.listen(document,'pointerdown',event=>{if(!panel.hidden && !root.contains(event.target))open(false);});
  const section=(title)=>{const node=el('section');node.append(el('h3','',title));panel.append(node);return node;};
  const draw=()=>{
    if(!view)return;
    const {data,run}=view,context=contextOf(run),total=data.usage_total,budget=data.budget,spent=spentOf(data);
    panel.replaceChildren();
    const box=section(L('coding.meter.context'));
    if(context.used===undefined)box.append(el('p','coding-meter-note',L('coding.meter.no-count')));
    else{
      const bar=el('div','coding-meter-bar'),level=el('span');level.style.width=(context.share===null?0:Math.min(100,context.share*100))+'%';bar.append(level);
      bar.dataset.tone=context.share>=0.85?'attention':context.share>=0.6?'notice':'';
      box.append(el('p','coding-meter-figure',(context.coverage==='reported'?'':L('coding.meter.about'))+n(context.used)+(context.windowTokens?' / '+n(context.windowTokens):'')+' tokens'+(context.share===null?'':' · '+Math.round(context.share*100)+'%')),bar,
        el('p','coding-meter-note',L(context.coverage==='reported'?'coding.meter.prompt-reported':context.coverage==='partial'?'coding.meter.prompt-partial':'coding.meter.prompt-estimated',{number:data.run_count})+(context.windowTokens?'':L('coding.meter.no-window'))));
    }
    const next=data.next_history || {history:'session'};
    box.append(el('p','',next.history==='digest'?L('coding.meter.next-digest',{reason:next.reason}):L('coding.meter.next-full')));
    if(data.run_count){const compact=el('button','mw-btn mw-btn--ghost',data.compact_requested?L('coding.meter.compact-cancel'):L('coding.meter.compact'));compact.type='button';
      lifetime.listen(compact,'click',async()=>{compact.disabled=true;try{await api('/sessions/'+encodeURIComponent(current())+'/compact','POST',{on:!data.compact_requested});await refresh();status(data.compact_requested?L('coding.meter.compact-cancelled'):L('coding.meter.compact-set'));}catch(error){if(!lifetime.alive)return;status(error.message,true);}finally{compact.disabled=false;}});
      box.append(compact);}
    if(total){
      const usage=section(L('coding.meter.usage')),list=el('dl'),row=(key,value)=>list.append(el('dt','',key),el('dd','',value));
      row(L('coding.meter.rounds'),n(total.rounds));row(L('coding.usage-line.input'),n(total.tokens.input)+' tokens');row(L('coding.usage-line.output'),n(total.tokens.output)+' tokens');
      if(total.tokens.cached_input!==undefined)row(L('coding.usage-line.cached_input'),n(total.tokens.cached_input)+' tokens');
      if(total.digests)row(L('coding.meter.digests'),L('coding.meter.digests-value',{calls:total.digests.calls,tokens:n(total.digests.tokens.input+total.digests.tokens.output)}));
      row(L('coding.usage-line.cost_usd'),total.cost_usd!==undefined?'$'+total.cost_usd.toFixed(4):L('coding.meter.cost-unknown'));
      usage.append(list);
      if(total.uncertain_rounds)usage.append(el('p','coding-meter-note',L('coding.meter.uncertain',{count:total.uncertain_rounds})));
      if(total.digests && total.cost_usd!==undefined)usage.append(el('p','coding-meter-note',L('coding.meter.digest-cost')));
      const limit=section(L('coding.meter.budget')),form=el('form','coding-meter-budget'),input=el('input','mw-input'),save=el('button','mw-btn mw-btn--secondary',L('coding.meter.save'));
      input.type='number';input.min='0.1';input.step='any';input.inputMode='decimal';input.placeholder=L('coding.meter.no-budget');input.value=budget?String(budget.tokens/1e4):'';input.setAttribute('aria-label',L('coding.meter.budget-label'));save.type='submit';
      form.append(input,el('span','',L('coding.meter.budget-unit')),save);
      lifetime.listen(form,'submit',async event=>{event.preventDefault();const value=input.value.trim(),tokens=value?Math.round(Number(value)*1e4):null;
        if(value && !(tokens>=1000)){status(L('coding.meter.budget-min'),true);return;}
        save.disabled=true;try{await api('/sessions/'+encodeURIComponent(current()),'PATCH',{budget:tokens===null?null:{tokens}});warned='';status(tokens?L('coding.meter.budget-saved'):L('coding.meter.budget-cleared'));await refresh();}catch(error){if(!lifetime.alive)return;status(error.message,true);}finally{save.disabled=false;}});
      limit.append(form,el('p','coding-meter-note',budget?L('coding.meter.budget-used',{spent:short(spent),budget:short(budget.tokens),percent:Math.round(spent/budget.tokens*100)}):L('coding.meter.budget-how')));
    }
  };
  return {render(data,run){
    if(owner!==current()){owner=current();warned='';open(false);}
    view={data,run};root.hidden=!run;if(!run)return;
    const context=contextOf(run),budget=data.budget,spent=spentOf(data),over=budget && spent>=budget.tokens,near=budget && spent>=budget.tokens*0.8;
    const share=context.share===null?null:Math.min(1,context.share);
    fill.style.strokeDasharray=(share===null?0:share*RING)+' '+RING;
    root.dataset.tone=over?'attention':data.next_history?.history==='digest'?'notice':share>=0.85?'attention':'';
    label.textContent=over?L('coding.meter.over'):share===null?L('coding.meter.context'):Math.round(share*100)+'%';
    toggle.setAttribute('aria-label',L('coding.meter.toggle',{state:share===null?L('coding.meter.share-unknown'):L('coding.meter.share',{percent:Math.round(share*100)})})+(data.next_history?.history==='digest'?L('coding.meter.toggle-digest'):'')+(over?L('coding.meter.toggle-over'):''));
    // Crossing the budget is said once, where the person is looking; the round carries on.
    const mark=over?'over':near?'near':'';
    if(mark && warned!==mark){warned=mark;status(L(over?'coding.meter.over-status':'coding.meter.near-status',{spent:short(spent),budget:short(budget.tokens)}));}
    if(!panel.hidden)draw();
  }};
}`;
