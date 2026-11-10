import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SidePanelPrimitives } from "./side-panel.js";

/**
 * The 电脑 tab of the side panel (specs/computer-use). The Assistant operates desktop apps through the local Host's
 * computer helper; this tab shows the live picture of the app it is looking at — only that app's window, password
 * fields covered — with a click marker, the current app and what this step is doing, and stop / pause / take over /
 * hand back. It is kept apart from the 浏览器 tab on purpose: two different trust levels. The person watches here and
 * acts on the real apps themselves after taking over; the picture is one-way.
 */
export function renderSideComputer({ icon }: SidePanelPrimitives): string {
  const control = (action: string, label: string, glyph: Parameters<SidePanelPrimitives["icon"]>[0]) =>
    `<button class="side-computer-btn" type="button" data-computer-action="${action}" hidden>${icon(glyph)}<span>${label}</span></button>`;
  return `<div class="side-computer" data-computer>
      <div class="side-computer-approval" data-computer-approval hidden role="alertdialog" aria-live="assertive" aria-label="${uiText("workbench.side-panel-computer.assistant-asks-confirm")}"></div>
      <div class="side-computer-view" data-computer-view role="application" aria-roledescription="${uiText("workbench.side-panel-computer.computer-screen")}" aria-label="${uiText("workbench.side-panel-computer.computer-screen")}">
        <canvas data-computer-canvas aria-hidden="true"></canvas>
        <span class="side-computer-marker" data-computer-marker hidden aria-hidden="true"></span>
        <div class="side-computer-cover" data-computer-cover>
          <div class="side-computer-cover-copy" data-computer-cover-copy>
            <p class="side-computer-cover-title">${uiText("workbench.side-panel-computer.assistant-has-not-started-using-computer-yet")}</p>
            <p>${uiText("workbench.side-panel-computer.when-ask-assistant-use-app-computer-shows-app")}</p>
          </div>
        </div>
      </div>
      <div class="side-computer-strip" data-computer-strip hidden role="status" aria-live="polite">
        <div class="side-computer-doing"><span class="side-computer-app" data-computer-app></span><span class="side-computer-activity" data-computer-activity></span></div>
        <div class="side-computer-controls">
          ${control("pause", uiText.text("workbench.side-panel-computer.pause"), "pause")}${control("handback", uiText.text("workbench.side-panel-computer.hand-back-assistant"), "play")}${control("takeover", uiText.text("workbench.side-panel-computer.take-over"), "switch")}${control("shelf", uiText.text("workbench.side-panel-computer.add-shelf"), "archive")}${control("stop", uiText.text("workbench.side-panel-computer.stop"), "x")}
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
  const readText=globalThis.t.text;
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
    socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'auth',token:document.querySelector('meta[name="molis-work-page-session"]')?.content||''})));
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
    const box=(h,p)=>'<h3>'+esc(globalThis.t.text(h))+'</h3><p>'+esc(p)+'</p>';
    if(!state.enabled){
      statusHtml=box("workbench.side-panel-computer.assistants-use-computer-off",globalThis.t.text("workbench.side-panel-computer.needs-system-permissions-affects-whole-computer-so-off"));
    }else if(state.helper?.state==='unsupported'){
      statusHtml=box("workbench.side-panel-computer.unavailable",globalThis.t.text(problem?.message||"workbench.side-panel-computer.using-computer-needs-mac-os-14-later"));
    }else if(state.helper?.state==='missing'){
      statusHtml=box("workbench.side-panel-computer.computer-helper-missing",globalThis.t.text(problem?.message||"workbench.side-panel-computer.install-has-no-computer-helper"));
    }else if(perms&&missing.length){
      const names={accessibility:globalThis.t.text("workbench.side-panel-computer.accessibility"),screen_recording:globalThis.t.text("workbench.side-panel-computer.screen-recording"),input_monitoring:globalThis.t.text("workbench.side-panel-computer.input-monitoring")};
      statusHtml=box("workbench.side-panel-computer.system-permissions-needed",globalThis.t.text("workbench.side-panel-computer.system-settings-privacy-security-turn-these-molis-work"))+missing.map(k=>'<div class="side-computer-perm"><span>'+esc(names[k]||k)+'</span><button type="button" data-computer-grant="'+esc(k)+'" class="primary">'+esc(globalThis.t.text("workbench.side-panel-computer.grant"))+'</button></div>').join('');
    }else if(problem){
      statusHtml=box("workbench.side-panel-computer.computer-helper-unavailable-right-now",problem.message);
    }else if(state.presence?.locked||state.presence?.away){
      statusHtml='<p>'+esc(state.presence.reason?globalThis.t.text("workbench.side-panel-computer.reason-assistant-not-using-computer-right-now",{reason:state.presence.reason}):globalThis.t.text("workbench.side-panel-computer.assistant-not-using-computer-right-now"))+'</p>';
    }
    statusBox.innerHTML=statusHtml;statusBox.hidden=!statusHtml;
    // The doing strip and controls.
    const acting=mode==='assistant'||mode==='paused'||mode==='taken-over';
    strip.hidden=!acting;
    if(acting){
      appEl.textContent=state.target?('『'+state.target.name+'』'):(state.control?.activity?.app||'');
      const paused=mode==='paused'?globalThis.t.text("workbench.side-panel-computer.paused-why",{why:state.control?.paused_reason==='person-input'?globalThis.t.text("workbench.side-panel-computer.moved-mouse-keyboard"):globalThis.t.text("workbench.side-panel-computer.paused")}):mode==='taken-over'?globalThis.t.text("workbench.side-panel-computer.have-taken-over"):'';
      activityEl.textContent=paused||state.control?.activity?.summary||globalThis.t.text("workbench.side-panel-computer.using-computer");
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
    approval.innerHTML='<h2>'+esc(globalThis.t.text("workbench.side-panel-computer.assistant-asks-confirm"))+'</h2><p>'+esc(doc.summary||'')+'</p><dl>'+fields.map(f=>'<dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd>').join('')+'</dl>'+(held
      ?'<p>'+esc(globalThis.t.text("workbench.side-panel-computer.while-have-paused-taken-over-step-will-not"))+'</p><div class="side-computer-approval-row">'+btn('reject',globalThis.t.text("workbench.side-panel-computer.dont-allow"),'ghost')+'</div>'
      :'<div class="side-computer-approval-row">'+btn('approve',globalThis.t.text("workbench.side-panel-computer.allow-once"),'primary')+btn('reject',globalThis.t.text("workbench.side-panel-computer.dont-allow"),'')+'</div>'+(roundAllow?'<div class="side-computer-approval-row">'+btn('approve-round',globalThis.t.text("workbench.side-panel-computer.allow-acting-app-turn",{app:roundAllow.label}),'ghost')+'</div>':''));
    approval.hidden=false;
    if(!visible())document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'computer'}}));
  };
  const btn=(action,label,cls)=>'<button type="button" data-computer-review="'+action+'" class="'+(cls||'')+'">'+esc(label)+'</button>';
  const decide=async(decision,remember)=>{
    const id=reviewing;if(!id)return;
    const body={review_id:id,decision};if(remember)body.remember=remember;
    try{await molisWorkRequest(routePrefix+'/api/agent/reviews/decide',{body,fallback:globalThis.t.text("workbench.side-panel-computer.answer-was-not-sent")});}catch(error){sayError(error);}
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
      const record=result.record;if(!record)throw new Error(globalThis.t.text("workbench.side-panel-computer.could-not-add-shelf"));
      const outcome=record.outcome==='completed'?globalThis.t.text("common.control.done"):record.outcome==='failed'?globalThis.t.text("workbench.side-panel-computer.failed"):record.outcome==='stopped'?globalThis.t.text("workbench.side-panel-computer.stopped"):globalThis.t.text("workbench.side-panel-computer.progress");
      const lines=[record.goal?globalThis.t.text("workbench.side-panel-computer.goal-goal",{goal:record.goal}):'',globalThis.t.text("workbench.side-panel-computer.result-outcome",{outcome}),record.conclusion?record.conclusion:'',
        '',globalThis.t.text("workbench.side-panel-computer.steps-n",{n:record.steps.length}),...record.steps.slice(-40).map(step=>'- '+(step.app?('『'+step.app.name+'』'):'')+step.summary)].filter(Boolean);
      const title=(record.goal?record.goal.slice(0,40):globalThis.t.text("workbench.side-panel-computer.computer-operation"))+'（'+globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: record.started_at, style: "datetime" } })+'）';
      await env.request(env.routePrefix+'/api/computer/records/'+encodeURIComponent(id)+'/shelf',{body:{title,text:lines.join('\n')},fallback:globalThis.t.text("workbench.side-panel-computer.could-not-add-shelf")});
      env.say(globalThis.t.text("workbench.side-panel-computer.added-shelf"));
    }catch(error){env.sayError(error,globalThis.t.text("workbench.side-panel-computer.could-not-add-shelf"));}
  };
  const putOnShelf=()=>putComputerRecordOnShelf({request:molisWorkRequest,routePrefix,say,sayError,readText,state});
  root.addEventListener('click',event=>{
    const review=event.target.closest('[data-computer-review]');
    if(review){if(review.dataset.computerReview==='approve')decide('approve');else if(review.dataset.computerReview==='approve-round')decide('approve','app-this-round');else decide('reject');return;}
    const act=event.target.closest('[data-computer-action]');if(act){control(act.dataset.computerAction);return;}
    const grant=event.target.closest('[data-computer-grant]');
    if(grant){molisWorkRequest(routePrefix+'/api/computer/permissions',{body:{kind:grant.dataset.computerGrant}}).then(()=>say(globalThis.t.text("workbench.side-panel-computer.opened-system-settings-grant-there-come-back-here"))).catch(sayError);return;}
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
