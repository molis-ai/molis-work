/**
 * The running plan, in the conversation: every step of the round's own graph with its reported state, and — while
 * the round is live — the person's controls to skip, insert, reorder or unblock. Each control is one SDK graph
 * operation through the Host; the card never infers a step's state from the model's prose.
 *
 * A supplement the AI says is a new task (D2, stage 3d-3) is not a step: it shows under the steps as the AI's words,
 * dashed, until the person adds it with 「加进计划」, the same insert a person makes, pointing at that supplement. A step
 * added that way links back to its receipt (`from`, the same button as the TaskBoard's). A step's state is said in the
 * receipt's own words (`word`, `host.receipts.step`), so the card and the receipt never name one state two ways (3d-4).
 */
export const CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {api,current,status,refresh,openStep,from,stepOf,skipped,settled,word}=ports;
  const svg=(name)=>'<svg aria-hidden="true"><use href="#icon-'+name+'"></use></svg>';
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const MARK={succeeded:'done',running:'running',failed:'failed',blocked:'blocked',cancelled:'cancelled',ready:'ready','not-started':'waiting'};
  const amend=async(card,runId,version,amendment)=>{
    const id=current();card.dataset.busy='true';
    try{
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/plan-amendments','POST',{amendment,expected_version:version});
      // A round that has ended hears of the change when the plan continues; only a live round is told right away.
      if(card.dataset.live!=='true')status(result?.board?.terminal?L('coding.board.saved-done'):L('coding.board.saved-continue'));
      else status(result.steered?L('coding.board.steered'):L('coding.board.steer-failed',{reason:result.steer_error||L('coding.common.unknown-reason')}),!result.steered);
      delete card.dataset.editing;
    }catch(error){if(!lifetime.alive)return;status(error.message,true);}
    finally{delete card.dataset.busy;card.dataset.signature='';if(id===current())await refresh();}
  };
  // One inline form at a time, placed under the step it acts on.
  const form=(card,row,fields,submit,label)=>{
    card.querySelector('.coding-plan-form')?.remove();card.dataset.editing='true';
    const box=el('form','coding-plan-form'),inputs=fields.map(([name,placeholder,max,value])=>{const input=el('input','mw-input');input.name=name;input.placeholder=placeholder;input.maxLength=max;input.required=true;input.value=value||'';box.append(input);return input;});
    const actions=el('div','coding-plan-form-actions'),cancel=el('button','mw-btn mw-btn--ghost',L('coding.board.cancel')),ok=el('button','mw-btn mw-btn--primary',label);cancel.type='button';ok.type='submit';actions.append(cancel,ok);box.append(actions);
    lifetime.listen(cancel,'click',()=>{box.remove();delete card.dataset.editing;});
    lifetime.listen(box,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();box.remove();delete card.dataset.editing;}});
    lifetime.listen(box,'submit',event=>{event.preventDefault();if(inputs.some(input=>!input.value.trim()))return;ok.disabled=true;void submit(inputs.map(input=>input.value.trim()));});
    row.after(box);inputs[0].focus();
  };
  return {render(run,entry,live,latest=false){
    const board=entry?.board;if(!board)return null;
    let card=document.querySelector('[data-coding-plan-progress="'+CSS.escape(run.ref.run_id)+'"]');
    if(!card){card=el('section','coding-plan-progress');card.dataset.codingPlanProgress=run.ref.run_id;card.setAttribute('aria-label',L('coding.plan.progress'));}
    // What the AI says should be a new task, while no step points at it yet.
    const taken=board.nodes.flatMap(node=>(node.origins||[]).map(one=>one.input_id)),offers=(run.turns||[]).filter(turn=>turn.steer?.model_claim?.treatment==='new-task'&&!taken.includes(turn.steer.id));
    const signature=JSON.stringify([board.version,board.terminal,live,latest,run.phase,entry.verdicts,offers.map(turn=>turn.steer.id)]);
    // Never rebuild under the person's hands: an open form keeps the card as it is until they finish.
    if(card.dataset.editing==='true'||card.dataset.busy==='true'||card.dataset.signature===signature)return card;
    card.dataset.signature=signature;card.replaceChildren();
    const total=board.nodes.filter(node=>!skipped(node)).length,done=board.nodes.filter(node=>node.state==='succeeded').length;
    const head=el('header','coding-plan-head');head.innerHTML=svg('list');
    head.append(el('strong','',entry.plan?.content.title||L('coding.plan.this-turn')),el('span','coding-plan-count',L('coding.board.steps-done',{done,total})),el('span','coding-plan-revision',entry.revision?L('coding.board.plan-revision',{revision:entry.revision}):''));
    card.append(head);
    // Rows in the TaskBoard's grammar: state, prerequisites, when it last moved and who is doing it.
    // The latest round's unfinished graph stays open to change after the round ends: a blocked step is decided, a
    // step skipped or added, and "继续计划" carries on from the graph as changed.
    const editable=(live||latest)&&!board.terminal,list=el('ul','coding-board-tree coding-board--compact coding-plan-steps');card.dataset.live=String(Boolean(live));
    const TONE={succeeded:'done',running:'progress',failed:'blocked',blocked:'blocked',cancelled:'quiet',ready:'ready','not-started':'idle'};
    const pad=(n)=>String(n).padStart(2,'0'),clock=(ms)=>{const date=new Date(ms);return pad(date.getHours())+':'+pad(date.getMinutes());};
    const role=({builder:'构建者',writer:'改写者',writers:'并行写入',coordinator:'协作',reader:'阅读者',planner:'规划者',reviewer:'评审者'})[run.frozen?.role_id],who=run.frozen?.character?.title||(role?L(role):'Agent');
    let hueValue=0;for(const char of who)hueValue=(hueValue*31+char.codePointAt(0))%360;
    const change=(amendment)=>amend(card,run.ref.run_id,board.version,amendment);
    // A new step, after a step or for a supplement the AI says is a new task (its words as the title to start from).
    const insert=(row,after,label,value,origin)=>form(card,row,[['title',L('coding.board.insert-title'),120,value],['acceptance',L('coding.board.insert-acceptance'),300]],([title,acceptance])=>change({kind:'insert',after,title,acceptance,origin}),label);
    board.nodes.forEach((node,index)=>{
      const step=stepOf(entry.plan,node),row=el('li','coding-board-item coding-plan-step');row.dataset.state=skipped(node)?'skipped':node.state;row.dataset.step=node.id;if(node.inserted)row.dataset.inserted='true';
      const line=el('div','coding-board-entry'),lead=el('span','coding-board-lead'),main=el('button','coding-board-node coding-plan-title');main.type='button';
      const note=node.reports.at(-1)?.note;main.title=(step.acceptance?L('coding.board.acceptance',{acceptance:step.acceptance}):'')+(note?'\\n'+L('coding.board.last-report',{report:note}):'')||L('coding.plan.open-step');
      main.append(el('span','coding-board-key',node.inserted?L('coding.board.inserted'):'S'+(index+1)),(name=>(name.dataset.insertedLabel=L('coding.plan.you-inserted'),name))(el('strong','',step.title)));lifetime.listen(main,'click',()=>openStep(run.ref.run_id,node.id));
      lead.append(el('span','coding-board-guide'),main);
      const source=from(node);if(source)lead.append(source);
      const verdict=entry.verdicts?.[node.id],decided=verdict&&verdict.board_version===board.version?verdict.status:null;
      const state=el('span','coding-board-state coding-plan-state');state.dataset.tone=decided==='accepted'?'accepted':decided==='needs-work'?'attention':skipped(node)?'quiet':TONE[node.state]||'idle';
      state.dataset.mwState=decided==='accepted'?'done':decided==='needs-work'?'blocked':skipped(node)?'cancelled':node.state==='running'?(node.owner?.kind==='person'?'doing':['starting','running','compacting'].includes(run.phase)?'running':({paused:'paused',pausing:'paused','awaiting-input':'answer','awaiting-review':'approval'})[run.phase]||'doing'):MARK[node.state]||'idle';
      const yours=node.owner?.kind==='person'&&['succeeded','failed'].includes(node.state);
      state.append(el('span','',decided==='accepted'?L('coding.board.state.accepted'):decided==='needs-work'?L('coding.board.state.needs-work'):skipped(node)?L('coding.plan.you-skipped'):yours?(node.state==='succeeded'?L('coding.board.state.you-done'):L('coding.board.state.you-failed')):word(node.state)));if(decided)state.dataset.verdict=decided;
      const deps=(node.depends_on||[]).map(id=>board.nodes.find(other=>other.id===id)).filter(Boolean),waiting=deps.filter(dep=>!settled(dep)),stuck=waiting.filter(dep=>['failed','blocked'].includes(dep.state));
      const chip=el('span','coding-board-deps '+(!deps.length?'is-empty':stuck.length?'is-blocked':waiting.length?'is-waiting':'is-ready'));
      if(deps.length){chip.textContent=L('coding.board.deps',{count:deps.length})+' · '+(stuck.length?L('coding.board.deps-blocked',{count:stuck.length}):waiting.length?L('coding.board.deps-waiting',{count:waiting.length}):L('coding.board.deps-ready'));chip.title=deps.map(dep=>stepOf(entry.plan,dep).title).join('\\n');}
      // Who holds the step on the graph: this session (its executor), a subtask, you, or no one; the page says each kind with a page
      // word, and keeps a subtask's title (the person's own words, quoted in 「」).
      const holder=node.owner,holderText=(value)=>{
        if(value.kind==='subtask')return value.title?L('coding.board.holder-subtask',{title:value.title}):L('coding.board.subtask');
        return value.kind==='session'?L('coding.board.this-session'):value.kind==='person'?L('coding.board.you'):value.kind==='none'?L('coding.board.unclaimed'):L('coding.board.holder-other');
      },name=!holder||holder.kind==='session'?who:holderText(holder);
      const meta=el('span','coding-board-meta'),time=el('time','coding-board-time'+(node.reports.length?'':' is-empty'),node.reports.length?clock(node.reports.at(-1).at_ms):''),avatar=el('span','coding-board-avatar'+(holder?.kind==='none'?' is-unknown':''),holder?.kind==='none'?'':Array.from(name)[0]);
      if(holder?.kind==='none')avatar.innerHTML=svg('user');else{let h=0;for(const char of name)h=(h*31+char.codePointAt(0))%360;avatar.style.setProperty('--board-avatar-hue',String(holder&&holder.kind!=='session'?h:hueValue));}
      avatar.title=L('coding.board.holder',{holder:holder?(holder.kind==='session'?L('coding.board.this-session')+' · '+who:holderText(holder)):who})+(holder?.expired?' · '+L('coding.board.expired'):'');avatar.setAttribute('aria-label',avatar.title);meta.append(time,avatar);
      line.append(lead,state,chip,meta);row.append(line);
      if(editable){
        const tools=el('span','coding-board-tools coding-plan-tools'),tool=(label,icon,action)=>{const button=el('button','mw-btn mw-btn--ghost mw-btn--icon-only');button.type='button';button.title=label;button.setAttribute('aria-label',label+'：'+step.title);button.innerHTML=svg(icon);lifetime.listen(button,'click',action);tools.append(button);};
        const waiting=node.state==='not-started'||node.state==='ready';
        if(waiting&&index>0&&['not-started','ready'].includes(board.nodes[index-1].state))tool(L('coding.board.move-up'),'chevron-up',()=>void change({kind:'move',node:node.id,direction:'up'}));
        if(waiting&&['not-started','ready'].includes(board.nodes[index+1]?.state))tool(L('coding.board.move-down'),'chevron-down',()=>void change({kind:'move',node:node.id,direction:'down'}));
        if(node.state==='blocked')tool(L('coding.board.decide'),'edit',()=>form(card,row,[['note',L('coding.plan.decide-note'),500]],([note])=>change({kind:'unblock',node:node.id,note}),L('coding.board.decide-ok')));
        if(waiting||node.state==='blocked'||node.state==='failed')tool(node.state==='failed'?L('coding.board.pass-over'):L('coding.board.skip'),'minus',()=>form(card,row,[['reason',L('coding.board.skip-reason'),300]],([reason])=>change({kind:'skip',node:node.id,reason}),L('coding.board.skip')));
        if(!['cancelled'].includes(node.state))tool(L('coding.board.insert'),'plus',()=>insert(row,node.id,L('coding.board.insert-ok')));
        const open=!['succeeded','failed','cancelled'].includes(node.state),kind=node.owner?.kind;
        if(open&&kind!=='person')tool(L('coding.board.mine'),'user',()=>void change({kind:'assign',node:node.id,to:'me'}));
        if(open&&kind&&kind!=='session')tool(kind==='none'?L('coding.board.give-session'):L('coding.board.return-session'),'undo',()=>void change({kind:'assign',node:node.id,to:'session'}));
        if(open&&kind==='person'&&node.state!=='not-started'){
          tool(L('coding.board.mark-done'),'check',()=>form(card,row,[['note',L('coding.board.mark-done-note'),500]],([note])=>change({kind:'resolve',node:node.id,state:'succeeded',note}),L('coding.board.mark-done-ok')));
          tool(L('coding.board.mark-failed'),'x',()=>form(card,row,[['note',L('coding.board.mark-failed-note'),500]],([note])=>change({kind:'resolve',node:node.id,state:'failed',note}),L('coding.board.mark-failed')));
        }
        line.append(tools);
      }
      list.append(row);
    });
    if(editable)for(const turn of offers){
      const row=el('li','coding-plan-offer'),add=el('button','mw-btn mw-btn--ghost',L('coding.plan.add-to-plan'));row.append(el('small','',L('coding.plan.offer')),el('q','',turn.text),add);list.append(row);
      lifetime.listen(add,'click',()=>insert(row,board.nodes.at(-1).id,L('coding.plan.add-to-plan'),turn.text.slice(0,120),turn.steer.id));
    }
    card.append(list);
    card.append(el('p','coding-plan-foot',editable?(live?L('coding.plan.foot.live'):L('coding.plan.foot.ended')):L('coding.plan.foot.fixed')));
    return card;
  }};
}`;

/** The plan card's layout (in Coding's stylesheet, at its place there). */
export const CODING_PLAN_PROGRESS_STYLES = `/* Running plan: the round's own step graph under the task, with the person's controls while it runs. */
.coding-plan-progress { max-width:76ch; margin:0 auto 24px; padding:12px 16px; border:1px solid var(--line); border-radius:12px; background:var(--paper); font-size:13px; animation:craft-rise var(--dur-move) var(--ease-quint); }
.coding-plan-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; color:var(--ink); }
.coding-plan-head svg { width:14px; height:14px; color:var(--muted); flex:none; }
.coding-plan-head strong { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.coding-plan-count { flex:none; font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.coding-plan-revision { flex:none; font-size:11px; color:var(--faint); }
/* The plan card in the conversation uses the TaskBoard's rows, without the progress column. */
.coding-plan-steps { margin:4px 0 0; }
.coding-board--compact .coding-board-entry { grid-template-columns:minmax(0,1fr) 7.5rem 7rem auto; padding:0 8px; }
.coding-plan-step[data-state=running] .coding-board-node strong { font-weight:500; }
.coding-plan-step:is([data-state=skipped],[data-state=cancelled]) .coding-board-node strong { color:var(--faint); text-decoration:line-through; }
.coding-plan-step[data-inserted=true] .coding-board-node strong::after { content:attr(data-inserted-label); margin-left:8px; padding:0 8px; border-radius:999px; background:color-mix(in srgb,var(--blue) 12%,transparent); color:var(--blue); font-size:11px; text-decoration:none; }
.coding-plan-offer { display:flex; align-items:center; gap:8px; margin:4px 0; padding:4px 8px; border:1px dashed var(--line); border-radius:8px; }
.coding-plan-form { display:grid; gap:8px; margin:4px 0 8px 32px; padding:8px; border:1px solid var(--line); border-radius:8px; }
.coding-plan-form .mw-input { height:30px; font-size:13px; }
.coding-plan-form-actions { display:flex; justify-content:flex-end; gap:8px; }
.coding-plan-form-actions .mw-btn { height:26px; min-height:26px; font-size:12px; }
.coding-plan-foot { margin:8px 0 0; font-size:12px; color:var(--faint); }`;
