import type { SidePanelPrimitives } from "./side-panel.js";

/**
 * The 电脑 tab of the side panel (specs/computer-use). The Assistant operates desktop apps through the local Host's
 * computer helper; this tab shows the live picture of the app it is looking at — only that app's window, password
 * fields covered — with a click marker, the current app and what this step is doing, and stop / pause / take over /
 * hand back. It is kept apart from the 浏览器 tab on purpose: two different trust levels. The person watches here and
 * acts on the real apps themselves after taking over; the picture is one-way.
 */
export function renderSideComputer({ L, icon }: SidePanelPrimitives): string {
  const control = (action: string, label: string, glyph: Parameters<SidePanelPrimitives["icon"]>[0]) =>
    `<button class="side-computer-btn" type="button" data-computer-action="${action}" hidden>${icon(glyph)}<span>${label}</span></button>`;
  return `<div class="side-computer" data-computer>
      <div class="side-computer-approval" data-computer-approval hidden role="alertdialog" aria-live="assertive" aria-label="${L("助理请你确认")}"></div>
      <div class="side-computer-view" data-computer-view role="application" aria-roledescription="${L("电脑画面")}" aria-label="${L("电脑画面")}">
        <canvas data-computer-canvas aria-hidden="true"></canvas>
        <span class="side-computer-marker" data-computer-marker hidden aria-hidden="true"></span>
        <div class="side-computer-cover" data-computer-cover>
          <div class="side-computer-cover-copy" data-computer-cover-copy>
            <p class="side-computer-cover-title">${L("助理还没有开始操作电脑")}</p>
            <p>${L("让助理去操作电脑上的应用时，这里会实时显示它正在看的那个应用，每一步先问你。")}</p>
          </div>
        </div>
      </div>
      <div class="side-computer-strip" data-computer-strip hidden role="status" aria-live="polite">
        <div class="side-computer-doing"><span class="side-computer-app" data-computer-app></span><span class="side-computer-activity" data-computer-activity></span></div>
        <div class="side-computer-controls">
          ${control("pause", L("暂停"), "pause")}${control("handback", L("交还助理"), "play")}${control("takeover", L("接手"), "switch")}${control("shelf", L("放进 Shelf"), "archive")}${control("stop", L("停止"), "x")}
        </div>
      </div>
      <div class="side-computer-status" data-computer-status hidden></div>
      <p class="side-computer-live" data-computer-live role="status" aria-live="polite"></p>
    </div>`;
}

export const SIDE_COMPUTER_STYLES = String.raw`
.side-computer{position:relative;display:flex;flex-direction:column;flex:1;min-height:0}
.side-computer-view{position:relative;flex:1;min-height:0;display:grid;place-items:center;background:var(--sunken,#111);overflow:hidden}
.side-computer-view canvas{max-width:100%;max-height:100%;object-fit:contain;image-rendering:auto}
.side-computer-marker{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid var(--accent,#4c8dff);background:color-mix(in srgb,var(--accent,#4c8dff) 25%,transparent);pointer-events:none;animation:side-computer-ping var(--dur-move) var(--ease-quint)}
@keyframes side-computer-ping{from{transform:scale(1.8);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){.side-computer-marker{animation:none}}
.side-computer-cover{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;background:var(--paper);color:var(--muted)}
.side-computer-cover[hidden]{display:none}
.side-computer-cover-title{font:var(--font-title-s,600 15px/1.3 system-ui);color:var(--ink);margin:0 0 6px}
.side-computer-strip{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-top:1px solid var(--line)}
.side-computer-doing{display:flex;flex-direction:column;gap:2px;min-width:0}
.side-computer-app{font:var(--font-label,600 12px/1.2 system-ui);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-computer-activity{font:var(--font-body-s,13px/1.3 system-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-computer-controls{display:flex;gap:4px;flex:none}
.side-computer-btn{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;font:var(--font-label,600 12px/1 system-ui)}
.side-computer-btn[hidden]{display:none}
.side-computer-btn[data-computer-action="stop"]{color:var(--danger,#d23)}
.side-computer-status{flex:none;padding:12px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px;font:var(--font-body-s,13px/1.45 system-ui);color:var(--ink);overflow:auto}
.side-computer-status[hidden]{display:none}
.side-computer-status h3{font:var(--font-title-s,600 14px/1.3 system-ui);margin:0}
.side-computer-status .side-computer-perm{display:flex;align-items:center;justify-content:space-between;gap:8px}
.side-computer-status button{height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer}
.side-computer-status button.primary{background:var(--accent,#4c8dff);border-color:var(--accent,#4c8dff);color:#fff}
.side-computer-approval{position:absolute;left:10px;right:10px;top:10px;z-index:3;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:var(--sheet-shadow);display:flex;flex-direction:column;gap:10px}
.side-computer-approval[hidden]{display:none}
.side-computer-approval .side-computer-approval-row{display:flex;gap:6px;flex-wrap:wrap}
.side-computer-approval button{flex:1;min-width:96px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer}
.side-computer-approval button.primary{background:var(--accent,#4c8dff);border-color:var(--accent,#4c8dff);color:#fff}
.side-computer-approval button.ghost{flex:none;width:100%}
.side-computer-live{flex:none;margin:0;padding:6px 10px;font:var(--font-body-s,12px/1.3 system-ui);color:var(--muted);min-height:1.3em}
`;

export const SIDE_COMPUTER_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded'))return;
  const root=document.querySelector('[data-computer]');
  if(!root)return;
  const L=globalThis.L||((text)=>text);
  const $=(selector)=>root.querySelector(selector);
  const view=$('[data-computer-view]'),canvas=$('[data-computer-canvas]'),cover=$('[data-computer-cover]'),marker=$('[data-computer-marker]');
  const strip=$('[data-computer-strip]'),appEl=$('[data-computer-app]'),activityEl=$('[data-computer-activity]'),controls=root.querySelectorAll('[data-computer-action]');
  const statusBox=$('[data-computer-status]'),live=$('[data-computer-live]'),approval=$('[data-computer-approval]');
  const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const ctx=canvas.getContext('2d');
  const projectId=document.body.dataset.projectId||'';
  const routePrefix=document.body.dataset.routePrefix||(projectId?'/projects/'+encodeURIComponent(projectId):'');
  let socket=null,ready=false,state=null,shown=false,panelOpen=false,retry=0,retryTimer=null,pending=null,drawing=false,lastMode='idle',lastWork=null,reviewTimer=null,reviewing=null,reviewMode=null;
  const say=(text)=>{if(live)live.textContent=text||'';};
  const sayError=(error)=>{if(live)molisWorkRequest.show(live,error);};
  const sendRaw=(message)=>{if(socket&&socket.readyState===1&&ready)socket.send(JSON.stringify(message));};
  const visible=()=>shown&&panelOpen&&document.visibilityState==='visible';
  const connect=()=>{
    if(socket)return;clearTimeout(retryTimer);
    socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/computer');
    socket.binaryType='arraybuffer';
    socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'auth',token:document.querySelector('meta[name="molis-work-control-token"]')?.content||''})));
    socket.addEventListener('message',event=>{
      if(event.data instanceof ArrayBuffer){pending=event.data;if(!drawing)draw();return;}
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='ready'){ready=true;retry=0;sendRaw({type:'watch'});sendRaw({type:'visible',visible:visible()});return;}
      if(message.type==='state'){state=message.state;render();follow();return;}
      if(message.type==='error')say(message.message);
    });
    socket.addEventListener('close',()=>{socket=null;ready=false;retryTimer=setTimeout(connect,Math.min(15000,500*2**retry++));});
  };
  const draw=async()=>{
    if(!pending){drawing=false;return;}drawing=true;const data=pending;pending=null;
    try{const bmp=await createImageBitmap(new Blob([data],{type:'image/png'}));canvas.width=bmp.width;canvas.height=bmp.height;ctx.drawImage(bmp,0,0);bmp.close?.();cover.hidden=true;}catch{/* a dropped frame is fine; the next one redraws */}
    draw();
  };
  const placeMarker=(point)=>{
    if(!point||!canvas.width){marker.hidden=true;return;}
    const rect=canvas.getBoundingClientRect(),vrect=view.getBoundingClientRect();
    marker.style.left=(rect.left-vrect.left+point.x/canvas.width*rect.width)+'px';
    marker.style.top=(rect.top-vrect.top+point.y/canvas.height*rect.height)+'px';
    marker.hidden=false;
  };
  const render=()=>{
    if(!state)return;
    const mode=state.control?.mode||'idle';
    // The status panel: off, unsupported, missing permissions, or nothing in the way.
    const problem=state.helper?.problem,perms=state.permissions,missing=perms?Object.keys(perms).filter(k=>!perms[k]):[];
    let statusHtml='';
    const box=(h,p)=>'<h3>'+esc(L(h))+'</h3><p>'+esc(p)+'</p>';
    if(!state.enabled){
      statusHtml=box('助理使用电脑：已关闭',L('它需要系统授权、会影响整台电脑，所以默认关闭。要用它，先在助理设置里打开「允许助理使用电脑」。'));
    }else if(state.helper?.state==='unsupported'){
      statusHtml=box('不可用',L(problem?.message||'操作电脑只支持 macOS 14 及以上。'));
    }else if(state.helper?.state==='missing'){
      statusHtml=box('缺少电脑助手',L(problem?.message||'这次安装里没有电脑助手。'));
    }else if(perms&&missing.length){
      const names={accessibility:L('辅助功能'),screen_recording:L('屏幕录制'),input_monitoring:L('输入监控')};
      statusHtml=box('需要系统授权',L('请在「系统设置 › 隐私与安全性」里给「Molis Work Computer Helper」打开这几项，然后回到这里。'))+missing.map(k=>'<div class="side-computer-perm"><span>'+esc(names[k]||k)+'</span><button type="button" data-computer-grant="'+esc(k)+'" class="primary">'+esc(L('去授权'))+'</button></div>').join('');
    }else if(problem){
      statusHtml=box('电脑助手暂时不可用',L(problem.message));
    }else if(state.presence?.locked||state.presence?.away){
      statusHtml='<p>'+esc(state.presence.reason?L('{reason}，助理暂时不操作电脑。',{reason:L(state.presence.reason)}):L('助理暂时不操作电脑。'))+'</p>';
    }
    statusBox.innerHTML=statusHtml;statusBox.hidden=!statusHtml;
    // The doing strip and controls.
    const acting=mode==='assistant'||mode==='paused'||mode==='taken-over';
    strip.hidden=!acting;
    if(acting){
      appEl.textContent=state.target?('『'+state.target.name+'』'):(state.control?.activity?.app||'');
      const paused=mode==='paused'?L('已暂停（{why}）',{why:state.control?.paused_reason==='person-input'?L('你动了鼠标键盘'):L('你暂停了')}):mode==='taken-over'?L('你已接手'):'';
      activityEl.textContent=paused||state.control?.activity?.summary||L('正在操作电脑');
      placeMarker(mode==='assistant'?state.control?.activity?.point:null);
    }else marker.hidden=true;
    const show={pause:mode==='assistant',handback:mode==='paused'||mode==='taken-over',takeover:mode==='assistant'||mode==='paused',shelf:!!state.record_id,stop:acting};
    controls.forEach(btn=>btn.hidden=!show[btn.dataset.computerAction]);
    cover.hidden=canvas.width>0&&acting;
  };
  const follow=()=>{
    const mode=state?.control?.mode||'idle',work=state?.control?.work_id||null;
    if((mode==='assistant')&&(lastMode!=='assistant'||work!==lastWork)&&!visible())document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'computer'}}));
    lastMode=mode;lastWork=work;
    if(!reviewTimer&&(mode!=='idle'))void pollReviews();
  };
  const pollReviews=async()=>{
    clearTimeout(reviewTimer);reviewTimer=null;
    let rows=[];
    try{
      // Only the round holding the computer, so another project's round never shows its card here.
      const holder=state?.control?.work_id;
      const result=await molisWorkRequest(routePrefix+'/api/agent/reviews?status=pending'+(holder?'&run_session_id='+encodeURIComponent(holder):''));
      rows=(result.reviews||[]).filter(row=>row.request?.document?.tool==='surface-act'&&(row.request.document.fields||[]).some(f=>f.label==='应用')&&(!row.receipt||row.receipt.status==='pending'));
    }catch{/* a failed poll is retried on the next tick below */}
    renderApproval(rows[0]||null);
    if(rows.length||(state?.control?.mode&&state.control.mode!=='idle'))reviewTimer=setTimeout(pollReviews,1500);
  };
  const renderApproval=(row)=>{
    if(!row){approval.hidden=true;approval.innerHTML='';reviewing=null;reviewMode=null;return;}
    const held=state?.control?.mode==='taken-over'||state?.control?.mode==='paused';
    if(reviewing===row.request.review_id&&reviewMode===held)return;
    reviewing=row.request.review_id;reviewMode=held;
    const doc=row.request.document||{},fields=doc.fields||[],roundAllow=doc.round_allow;
    approval.innerHTML='<h2>'+esc(L('助理请你确认'))+'</h2><p>'+esc(doc.summary||'')+'</p><dl>'+fields.map(f=>'<dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd>').join('')+'</dl>'+(held
      ?'<p>'+esc(L('你暂停或接手期间，这一步不会执行。交还后助理会先重新查看，再决定要不要做。'))+'</p><div class="side-computer-approval-row">'+btn('reject',L('不允许'),'ghost')+'</div>'
      :'<div class="side-computer-approval-row">'+btn('approve',L('允许这一次'),'primary')+btn('reject',L('不允许'),'')+'</div>'+(roundAllow?'<div class="side-computer-approval-row">'+btn('approve-round',L('本轮内允许在『{app}』里操作',{app:roundAllow.label}),'ghost')+'</div>':''));
    approval.hidden=false;
    if(!visible())document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'computer'}}));
  };
  const btn=(action,label,cls)=>'<button type="button" data-computer-review="'+action+'" class="'+(cls||'')+'">'+esc(label)+'</button>';
  const decide=async(decision,remember)=>{
    const id=reviewing;if(!id)return;
    const body={review_id:id,decision};if(remember)body.remember=remember;
    try{await molisWorkRequest(routePrefix+'/api/agent/reviews/decide',{body,fallback:L('确认没有提交')});}catch(error){sayError(error);}
    approval.hidden=true;reviewing=null;void pollReviews();
  };
  const control=async(action)=>{
    if(action==='stop'){
      const work=state?.control?.work_id;
      sendRaw({type:'stop'});
      if(work)await molisWorkRequest(routePrefix+'/api/assistant/works/'+encodeURIComponent(work)+'/control',{body:{kind:'stop'}}).catch(sayError);
      return;
    }
    if(action==='shelf'){await putOnShelf();return;}
    sendRaw({type:action});
  };
  // Put the current round's record on the Shelf (specs/computer-use §5): the goal, the result and a short step summary as text,
  // in the person's words; the Host adds the latest screenshot and reaches Shelf through its public actions (PG-057). The record itself stays the 成果.
  const putComputerRecordOnShelf=async(env)=>{
    const id=env.state?.record_id;if(!id)return;
    try{
      const result=await env.request(env.routePrefix+'/api/computer/records/'+encodeURIComponent(id));
      const record=result.record;if(!record)throw new Error(env.L('没能放进 Shelf。'));
      const outcome=record.outcome==='completed'?env.L('完成'):record.outcome==='failed'?env.L('失败'):record.outcome==='stopped'?env.L('已停止'):env.L('进行中');
      const lines=[record.goal?env.L('目标：{goal}',{goal:record.goal}):'',env.L('结果：{outcome}',{outcome}),record.conclusion?env.L(record.conclusion):'',
        '',env.L('步骤（{n} 步）：',{n:record.steps.length}),...record.steps.slice(-40).map(step=>'- '+(step.app?('『'+step.app.name+'』'):'')+step.summary)].filter(Boolean);
      const title=(record.goal?record.goal.slice(0,40):env.L('电脑操作'))+'（'+new Date(record.started_at).toLocaleString()+'）';
      await env.request(env.routePrefix+'/api/computer/records/'+encodeURIComponent(id)+'/shelf',{body:{title,text:lines.join('\n')},fallback:env.L('没能放进 Shelf。')});
      env.say(env.L('已放进 Shelf。'));
    }catch(error){env.sayError(error,env.L('没能放进 Shelf。'));}
  };
  const putOnShelf=()=>putComputerRecordOnShelf({request:molisWorkRequest,routePrefix,say,sayError,L,state});
  root.addEventListener('click',event=>{
    const review=event.target.closest('[data-computer-review]');
    if(review){if(review.dataset.computerReview==='approve')decide('approve');else if(review.dataset.computerReview==='approve-round')decide('approve','app-this-round');else decide('reject');return;}
    const act=event.target.closest('[data-computer-action]');if(act){control(act.dataset.computerAction);return;}
    const grant=event.target.closest('[data-computer-grant]');
    if(grant){molisWorkRequest(routePrefix+'/api/computer/permissions',{body:{kind:grant.dataset.computerGrant}}).then(()=>say(L('已打开系统设置，请在那里授权后回到这里。'))).catch(sayError);return;}
  });
  document.addEventListener('visibilitychange',()=>sendRaw({type:'visible',visible:visible()}));
  connect();
  document.addEventListener('molis:side-shown',event=>{
    panelOpen=event.detail?.open!==false;
    const now=event.detail?.tab==='computer'&&panelOpen;
    if(now&&!shown){shown=true;connect();}else shown=now&&shown;
    sendRaw({type:'visible',visible:visible()});
  });
})();`;
