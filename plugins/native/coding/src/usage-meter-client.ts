/**
 * How full the context is and what the session has used, next to the send button, like the context ring in Cursor or
 * Claude Code's /context and /cost. The figures are the Host's: the latest call's whole prompt against the window the
 * round was packed for, and the session's recorded usage. A figure that is not known says so instead of reading as 0.
 * The budget is the person's own line; reaching it is reported and never stops a round.
 */
export const CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,current,status,refresh}=ports;
  const root=q('[data-coding-meter]'),toggle=q('[data-coding-meter-toggle]'),panel=q('[data-coding-meter-panel]'),fill=q('[data-coding-meter-fill]'),label=q('[data-coding-meter-label]');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const n=(value)=>Number(value).toLocaleString('zh-CN');
  const short=(value)=>value>=1e8?(value/1e8).toFixed(1)+' 亿':value>=1e4?(value/1e4).toFixed(value>=1e6?0:1)+' 万':String(value);
  const RING=2*Math.PI*8;
  let view=null,owner='',warned='';
  const contextOf=(run)=>{const windowTokens=run?.frozen?.model_context?.window_tokens,used=run?.usage?.context?.tokens;
    return {windowTokens,used,share:windowTokens && used!==undefined?used/windowTokens:null,coverage:run?.usage?.context?.coverage};};
  const spentOf=(data)=>data.usage_total?data.usage_total.tokens.input+data.usage_total.tokens.output:0;
  const open=(on)=>{panel.hidden=!on;toggle.setAttribute('aria-expanded',String(on));if(on){draw();panel.querySelector('button,input')?.focus({preventScroll:true});}};
  toggle.addEventListener('click',()=>open(panel.hidden));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();open(false);toggle.focus();}});
  document.addEventListener('pointerdown',event=>{if(!panel.hidden && !root.contains(event.target))open(false);});
  const section=(title)=>{const node=el('section');node.append(el('h3','',title));panel.append(node);return node;};
  const draw=()=>{
    if(!view)return;
    const {data,run}=view,context=contextOf(run),total=data.usage_total,budget=data.budget,spent=spentOf(data);
    panel.replaceChildren();
    const box=section('上下文');
    if(context.used===undefined)box.append(el('p','coding-meter-note','这一轮还没有模型调用的计数。'));
    else{
      const bar=el('div','coding-meter-bar'),level=el('span');level.style.width=(context.share===null?0:Math.min(100,context.share*100))+'%';bar.append(level);
      bar.dataset.tone=context.share>=0.85?'attention':context.share>=0.6?'notice':'';
      box.append(el('p','coding-meter-figure',(context.coverage==='reported'?'':'约 ')+n(context.used)+(context.windowTokens?' / '+n(context.windowTokens):'')+' tokens'+(context.share===null?'':' · '+Math.round(context.share*100)+'%')),bar,
        el('p','coding-meter-note','第 '+data.run_count+' 轮最近一次模型调用的完整提示'+(context.coverage==='reported'?'，按服务方计数。':context.coverage==='partial'?'；服务方没有报全缓存部分，实际可能略多。':'，含估算。')+(context.windowTokens?'':'这一轮开始时还没有记录窗口大小，下一轮起会显示占比。')));
    }
    const next=data.next_history || {history:'session'};
    box.append(el('p','',next.history==='digest'?'下一轮会把前面的对话整理成摘要带入（'+next.reason+'），工具输出的原文不再带入。':'下一轮会完整带入前面的对话；上下文用到 60% 以上时自动整理。'));
    if(data.run_count){const compact=el('button','mw-btn mw-btn--ghost',data.compact_requested?'取消下一轮的整理':'下一轮整理上下文');compact.type='button';
      compact.addEventListener('click',async()=>{compact.disabled=true;try{await api('/sessions/'+encodeURIComponent(current())+'/compact','POST',{on:!data.compact_requested});await refresh();status(data.compact_requested?'已取消：下一轮照常带入前面的对话。':'下一轮会把前面的对话整理成摘要带入。');}catch(error){status(error.message,true);}finally{compact.disabled=false;}});
      box.append(compact);}
    if(total){
      const usage=section('本会话用量'),list=el('dl'),row=(key,value)=>list.append(el('dt','',key),el('dd','',value));
      row('轮次',n(total.rounds));row('输入',n(total.tokens.input)+' tokens');row('输出',n(total.tokens.output)+' tokens');
      if(total.tokens.cached_input!==undefined)row('缓存读取',n(total.tokens.cached_input)+' tokens');
      row('费用',total.cost_usd!==undefined?'$'+total.cost_usd.toFixed(4):'未知：服务方没有返回价格');
      usage.append(list);
      if(total.uncertain_rounds)usage.append(el('p','coding-meter-note',total.uncertain_rounds+' 轮的用量不完整或含估算，合计只算已知部分。'));
      const limit=section('预算'),form=el('form','coding-meter-budget'),input=el('input','mw-input'),save=el('button','mw-btn mw-btn--secondary','保存');
      input.type='number';input.min='0.1';input.step='any';input.inputMode='decimal';input.placeholder='不设';input.value=budget?String(budget.tokens/1e4):'';input.setAttribute('aria-label','本会话预算，单位万 tokens');save.type='submit';
      form.append(input,el('span','','万 tokens'),save);
      form.addEventListener('submit',async event=>{event.preventDefault();const value=input.value.trim(),tokens=value?Math.round(Number(value)*1e4):null;
        if(value && !(tokens>=1000)){status('预算至少 0.1 万 tokens。',true);return;}
        save.disabled=true;try{await api('/sessions/'+encodeURIComponent(current()),'PATCH',{budget:tokens===null?null:{tokens}});warned='';status(tokens?'预算已保存。达到后只提示，不会停下。':'已取消这个会话的预算。');await refresh();}catch(error){status(error.message,true);}finally{save.disabled=false;}});
      limit.append(form,el('p','coding-meter-note',budget?'已用 '+short(spent)+' / '+short(budget.tokens)+' tokens（'+Math.round(spent/budget.tokens*100)+'%）。达到后只提示，不会停下。':'按输入加输出的 token 计。达到后只提示，不会停下。'));
    }
  };
  return {render(data,run){
    if(owner!==current()){owner=current();warned='';open(false);}
    view={data,run};root.hidden=!run;if(!run)return;
    const context=contextOf(run),budget=data.budget,spent=spentOf(data),over=budget && spent>=budget.tokens,near=budget && spent>=budget.tokens*0.8;
    const share=context.share===null?null:Math.min(1,context.share);
    fill.style.strokeDasharray=(share===null?0:share*RING)+' '+RING;
    root.dataset.tone=over?'attention':data.next_history?.history==='digest'?'notice':share>=0.85?'attention':'';
    label.textContent=over?'超预算':share===null?'上下文':Math.round(share*100)+'%';
    toggle.setAttribute('aria-label','上下文与用量：'+(share===null?'上下文用量未知':'上下文已用 '+Math.round(share*100)+'%')+(data.next_history?.history==='digest'?'，下一轮会整理':'')+(over?'，已超过预算':''));
    // Crossing the budget is said once, where the person is looking; the round carries on.
    const mark=over?'over':near?'near':'';
    if(mark && warned!==mark){warned=mark;status(over?'本会话用量已达到你设的预算（'+short(spent)+' / '+short(budget.tokens)+' tokens）。按你的设置只提示，不会停下；可以在上下文与用量里调整。':'本会话用量已到预算的 80%（'+short(spent)+' / '+short(budget.tokens)+' tokens）。');}
    if(!panel.hidden)draw();
  }};
}`;
