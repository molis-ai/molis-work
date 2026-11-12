(()=>{var X={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"},d=e=>String(e??"").replace(/[&<>"']/g,t=>X[t]);function u(...e){return e.filter(Boolean).join(" ")}function w(e){return e?Object.entries(e).filter(([,t])=>t!=null&&t!==!1).map(([t,n])=>n===!0?` ${t}`:` ${t}="${d(String(n))}"`).join(""):""}function V(e,t,n){let s=Math.PI*2,l=a=>Math.max(0,Math.min(1,a)),r=a=>(a=l(a),a*a*(3-2*a)),m=(a,h,M)=>Math.exp(-Math.pow((a-h)/M,2)),p=n===void 0?e==="interrupted"?5:6:n<=0?0:n>=1?12:Math.max(1,Math.min(11,Math.round(n*12))),b=[];for(let a=0;a<12;a++){let h=-Math.PI/2+a*s/12,M=(t/2.8%1*12-a+12)%12,o=.18,f=0,z=9.2,P=1,E=1,N=e==="done"?"success":e==="answer"||e==="verify"?"attention":e==="failed"?"danger":"neutral";if(e==="running"&&(o=.1+.9*Math.exp(-Math.pow(M/2.76,2))),e==="idle"&&(o=.22),e==="connected"&&(o=.64),e==="done"&&(o=.1+.81*r((t-a*.09)/.3)),e==="waiting"){let i=t%3.3,c=m(i,.34,.2)+.4*m(i,.81,.18);o=a===0||a===6?.1+.9*(.24+l(c*(a===6?.7:1))*.6):.1}if(e==="answer"){let i=t%4.2,c=m(i,.3,.15)+.7*m(i,.72,.16);o=a===0||a===1||a===11?.33+.55*c:.17}if(e==="paused"&&(f=.92*(1-Math.pow(1-l(t/1.55),3)),o=.56+((a===0||a===6?.76-.25*m(t%5.8,3.8,.42):.2)-.56)*r(t/1.3)),e==="blocked"){let i=t%4.2;f=.78*(r(i/.35)-r((i-.65)/.6)),o=a>=1&&a<=3?.88:.22,a===3&&(o+=.1*m(i,.62,.14))}if(e==="failed"){let i=t%5.4,c=r((i-4.3)/1.1);f=-.68*r(i/.3)+.17*r((i-.32)/.24)+.51*c,o=.86-.63*r((i-.3)/.55)+.63*c}if(e==="retrying"){let i=t%4.6,c=r(i/.8)-r((i-.85)/1.3);f=-.72*c+s*r((i-.85)/1.55),z-=.75*c,E-=.28*c,P+=.14*c,o=.14+.72*Math.exp(-Math.pow(M/4.08,2))}if(e==="syncing"&&(o=.38+.5*(.5+.5*Math.sin(h-t*.8))),e==="interrupted"){f=.42*r(t/.25)-.21*r((t-.3)/.18);let i=t%4.8,c=m(i,.32,.12)+.6*m(i,.65,.12);o=a<p?.68:.48+(a===p?.32*c:0),N=a<p?"neutral":"interruption"}if(e==="partial"&&(o=a<p?.8:.43+.23*(.5+.5*Math.sin(t*s/5)),N=a<p?"success":"attention"),e==="verify"&&(o=.57+.18*m(t%5.6,1.4,.9)),e==="stale"&&(o=a>=6&&a<=9?.44:.25),e==="unsaved"&&(o=a===11||a===0||a===1?.72:.24),e==="unread"&&(o=a===0?.95:.32),e==="read"&&(o=.26),e==="archived"&&(o=a>=5&&a<=7?.5:.22),e==="trashed"&&(o=.13),e==="disconnected"){let i=t%4.6,c=1+2*r((i-.15)/.8),$=Math.min(a,12-a);o=.14+.48*Math.exp(-Math.pow(($-c)/.68,2))*(1-r((i-3.3)/1))}let B=0,j=[];for(let i=0;i<9;i++){let c=h+(i/8-.5)*Math.PI/12+f,$=z*Math.cos(c)*P,y=z*Math.sin(c)*E,A=0;if(e==="syncing"){let k=t/5.2,q=Math.floor(k),F=Math.PI*(q+r((k-q-.16)/.66)),S=Math.sin(F),L=$*(1-.12*S*S)+y*.13*S,G=y*Math.cos(F)+9.2*.38*Math.sin(2*c)*S;A=y*S,$=L*Math.cos(-.24)-G*Math.sin(-.24),y=L*Math.sin(-.24)+G*Math.cos(-.24)}if(e==="retrying"){let k=t%4.6;$+=.7*Math.sin(c*2)*(r(k/.8)-r((k-.85)/1.3))}j.push([$,y,A]),B+=A/9}b.push({points:j,alpha:l(N==="neutral"?.3+.7*o:.65+.35*o),z:B,tone:N})}return b}function D(e){return e.map((t,n)=>`${n?"L":"M"}${(t[0]+12).toFixed(3)},${(t[1]+12).toFixed(3)}`).join("")}var H=[{key:"idle",label:"\u672A\u5F00\u59CB",states:["idle"]},{key:"connected",label:"\u5DF2\u5C31\u7EEA",states:["ready","connected"]},{key:"running",label:"\u8FDB\u884C / \u6267\u884C",states:["doing","starting","running","generating","saving","indexing"]},{key:"done",label:"\u5B8C\u6210 / \u5DF2\u4FDD\u5B58",states:["done","saved","round-ended","staged"]},{key:"waiting",label:"\u6392\u961F / \u7B49\u5F85",states:["queued","waiting"]},{key:"answer",label:"\u7B49\u4F60\u5904\u7406",states:["answer","approval","reauth"]},{key:"paused",label:"\u6682\u505C / \u505C\u6B62",states:["paused","stopped","cancelled","disabled"]},{key:"blocked",label:"\u65E0\u6CD5\u7EE7\u7EED",states:["blocked","unavailable","quarantined"]},{key:"syncing",label:"\u540C\u6B65\u4E2D",states:["syncing"]},{key:"retrying",label:"\u91CD\u8BD5\u4E2D",states:["retrying"]},{key:"failed",label:"\u5931\u8D25",states:["failed"]},{key:"partial",label:"\u90E8\u5206\u5B8C\u6210",states:["partial"]},{key:"interrupted",label:"\u5DF2\u4E2D\u65AD",states:["interrupted"]},{key:"verify",label:"\u9700\u8981\u6838\u5BF9",states:["verify","conflict"]},{key:"stale",label:"\u5DF2\u8FC7\u65F6",states:["stale"]},{key:"disconnected",label:"\u5DF2\u65AD\u5F00",states:["disconnected"]},{key:"unsaved",label:"\u5F85\u6574\u7406 / \u5199\u5165",states:["unsaved","draft","unstaged","untracked"]},{key:"unread",label:"\u672A\u8BFB",states:["unread"]},{key:"read",label:"\u5DF2\u8BFB",states:["read"]},{key:"archived",label:"\u5DF2\u6536\u5B58",states:["archived","material"]},{key:"trashed",label:"\u56DE\u6536\u7AD9",states:["trashed"]}];var T={"status-todo":"idle","status-progress":"doing","status-waiting":"waiting","status-needs-you":"answer","status-blocked":"blocked","status-done":"done","status-cancelled":"cancelled"};function K(e){return H.find(t=>t.states.some(n=>n===e)).key}var ee={done:"M8.5 12l2.3 2.3 4.7-4.6",read:"M9 12l2 2 4-4",verify:"M12 8.8v3.4M12 14.8h.01",archived:"M8.5 9h7v2h-7zM9.3 11v4h5.4v-4M11 12.8h2",trashed:"M9 10h6M10 10v5h4v-5M11 8.5h2"};function _(e){let t=K(e.state),n=Number.isFinite(e.progress)?Math.min(1,Math.max(0,e.progress)):void 0,s=Number.isFinite(e.size)?Math.min(96,Math.max(12,e.size)):void 0,l=V(t,e.state==="doing"?.75:3,n),r=Math.max(1.75,33.6/(s??13)).toFixed(3),m=l.map(p=>`<path d="${D(p.points)}" opacity="${p.alpha.toFixed(3)}" data-ring-tone="${p.tone}"></path>`).join("");return`<svg class="${u("mw-state-ring",e.className)}" data-mw-state="${e.state}" data-ring-family="${t}"${n===void 0?"":` data-ring-progress="${n}"`} viewBox="0 0 24 24"${s===void 0?"":` width="${s}" height="${s}"`} style="${s===void 0?"":`--ring-size:${s}px;`}--ring-stroke:${r}"${e.label?` role="img" aria-label="${d(e.label)}"`:' aria-hidden="true"'}><g data-ring-segments>${m}</g><path data-ring-core d="${ee[t]||""}"></path></svg>`}function Y(e){return String(e??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function x(e,t=""){return e in T?_({state:T[e],className:t}):`<svg${t?` class="${Y(t)}"`:""} aria-hidden="true"><use href="#icon-${Y(e)}"></use></svg>`}function g(e){let t=e.variant??"primary",n=e.size??"sm",s=!!(e.disabled||e.loading),l=d(e.label),r=e.icon?x(e.icon):"",m=e.key&&!e.iconOnly?`<kbd class="mw-btn__key" aria-hidden="true">${d(e.key)}</kbd>`:"",p=e.loading?`<span class="mw-spinner" data-slot="button-loading-indicator" data-ring-mounted aria-hidden="true">${_({state:"running"})}</span>`:"",b=e.iconOnly?`<span class="mw-sr-only">${l}</span>`:`<span data-slot="button-label">${l}</span>`,a=!s&&e.href&&/^\/(?!\/)/u.test(e.href)&&!/[\\\u0000-\u0020\u007f]/u.test(e.href)?e.href:null,h=a?"a":"button";return`<${h} ${a?`href="${d(a)}"`:`type="${e.type??"button"}"`} class="${u("mw-btn",`mw-btn--${t}`,`mw-btn--${n}`,e.iconOnly&&"mw-btn--icon-only",e.className)}" data-slot="button"${e.loading?" data-loading":""}${s?" disabled":""}${e.iconOnly?` aria-label="${l}"`:""}${w(e.attrs)}>${p}${r}${b}${m}</${h}>`}function W(e){return`<span class="${u("mw-status",e.tone&&`mw-status--${e.tone}`,e.plain&&"mw-status--plain",e.className)}" data-slot="status">${e.state?_({state:e.state}):e.icon?x(e.icon):""}<span${w(e.labelAttrs)}>${d(e.label)}</span></span>`}function U(e={}){return`<select class="${u("mw-select",e.size&&`mw-select--${e.size}`,e.className)}" data-slot="select"${e.invalid?' aria-invalid="true"':""}${w({id:e.id,name:e.name,required:e.required,disabled:e.disabled,"aria-describedby":e.describedBy,...e.attrs})}>${e.optionsHtml??""}</select>`}var te={sending:{tone:"progress",ring:"starting"},running:{tone:"progress",ring:"running"},failed:{tone:"blocked",ring:"failed"},unknown:{tone:"attention",ring:"verify"},disabled:{tone:"hold",ring:"unavailable"}};function ae(e,t){let n=t.resetLabel?`<button type="button" data-tag-remove aria-label="${d(t.resetLabel)}" title="${d(t.resetLabel)}">${x("x")}</button>`:"",s=d(t.label),l=t.open?`<button type="button" data-composer-receiver>${s}</button>`:`<span>${s}</span>`;return`<div class="mw-composer__to"><span class="mw-composer__to-label">${d(e.to)}</span><span class="mw-tag">${t.icon?x(t.icon):""}${l}${n}</span></div>`}function re(e,t){if(!e)return"";let n=t?te[t]:void 0,s=e.ring??n?.ring;return`<div class="mw-composer__status" role="status">${W({label:e.caption,tone:e.tone??n?.tone??"quiet",...s?{state:s}:{}})}<span>${d(e.text)}</span>${e.action?g({label:e.action,variant:"link",attrs:{"data-composer-status-action":e.actionId??""}}):""}</div>`}function ne(e,t){let n={"data-composer-control":e.id},s=t||e.disabled===!0;if(e.kind==="select"){let r=e.options.map(m=>`<option value="${d(m.value)}"${m.value===e.value?" selected":""}${m.disabled?" disabled":""}>${d(m.label)}</option>`).join("");return U({disabled:s,optionsHtml:r,attrs:{...n,"aria-label":e.label,title:e.label}})}let l=e.kind==="button"&&e.title?{title:e.title}:{};return g({label:e.label,variant:"ghost",size:"sm",disabled:s,attrs:{...n,...l,...e.kind==="toggle"?{"aria-pressed":e.on?"true":"false"}:{}}})}function se(e,t){let n=e.add===!1?"":`<div class="mw-compose__anchor">${g({label:e.labels.add,variant:"ghost",size:"icon",icon:"plus",iconOnly:!0,disabled:t,attrs:{title:e.labels.add,"data-composer-add":"","aria-haspopup":"menu","aria-expanded":"false"}})}<div class="mw-compose__menu" data-compose-menu hidden></div></div>`,s=e.controls?.length?`<div class="mw-composer__more">${g({label:e.labels.more,variant:"ghost",size:"icon",icon:"more",iconOnly:!0,disabled:t,attrs:{title:e.labels.more,"data-composer-more":"","aria-expanded":"false"}})}</div><div class="mw-composer__controls" data-composer-controls>${e.controls.map(r=>ne(r,t)).join("")}</div>`:"",l=e.kind==="ai"&&e.receiver?ae(e.labels,e.receiver):"";return`<div class="mw-composer__start">${n}${l}${s}</div>`}function ie(e,t,n){let s=t==="sending"||t==="unknown"||t==="disabled",l=t!=="running";if(e.kind==="ai"&&!s&&(t==="running"||e.idleDelivery||e.delivery&&e.delivery!=="next-boundary")){let{labels:r}=e,m=g({label:r.delivery,variant:"primary",size:"icon",icon:"chevron-down",iconOnly:!0,attrs:{title:r.delivery,"data-compose-menu-toggle":"","aria-expanded":"false","aria-haspopup":"menu"}}),p=e.delivery??"next-boundary",b=l&&p==="next-boundary"?{name:r.send,title:r.sendTitle}:r.modes[p];return`<div class="mw-btn-group" role="group" aria-label="${d(r.deliveryGroup)}">${g({label:b.name,variant:"primary",size:"sm",disabled:n,attrs:{title:b.title,"data-composer-send":""}})}<div class="mw-compose__anchor">${m}<div class="mw-compose__menu" data-compose-menu hidden></div></div></div>`}return g({label:e.labels.send,variant:"primary",size:"icon",icon:"send",iconOnly:!0,loading:t==="sending",disabled:n||s,attrs:{title:e.labels.sendTitle,"data-composer-send":""}})}function oe(e,t){let n=e.voice?g({label:e.voice,variant:"ghost",size:"icon",icon:"mic",iconOnly:!0,attrs:{title:e.voice,"aria-disabled":"true","data-composer-voice":""}}):"",s=e.kind==="ai"&&t==="running",l=s&&e.pause?g({label:e.pause.label,variant:"ghost",size:"sm",disabled:e.pause.busy===!0,attrs:{title:e.pause.title,"data-composer-pause":""}}):"",r=s?g({label:e.labels.stop,variant:"danger-outline",size:"sm",attrs:{title:e.labels.stopTitle,"data-composer-stop":""}}):"";return`<div class="mw-composer__end">${n}${l}${r}${ie(e,t,!e.text?.trim())}</div>`}function Z(e){let t=e.disabled?"disabled":e.state,n=t==="disabled",s=e.disabled?{caption:e.disabled.caption,text:e.disabled.reason}:e.status,l=`<textarea class="mw-composer__input" data-fit rows="1" aria-label="${d(e.labels.input)}"${e.placeholder?` placeholder="${d(e.placeholder)}"`:""}${n?" disabled":""}>${d(e.text??"")}</textarea>`,r=!e.text&&!s&&!t;return`<div class="mw-composer" data-slot="composer"${t?` data-state="${t}"`:""}${r?" data-rest":""}${w(e.attrs)}><div class="mw-composer__box"><div class="mw-composer__text">${l}</div>${re(s,t)}<div class="mw-composer__foot">${se(e,n)}${oe(e,t)}</div></div></div>`}var R="border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper)",v="var(--r-control)",I=(e="")=>`:root body .mw-btn-group > .mw-btn${e}:not(#mw-joined), :root body .mw-btn-group > *${e} > .mw-btn:not(#mw-joined)`,le=`
  .mw-items { display: grid; grid-template-columns: minmax(0, 1fr); width: min(480px, 100%); margin: 0; padding: 6px; list-style: none; ${R}; }
  .mw-item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 6px 6px 10px; border-radius: var(--r-row); transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-item:is(:hover, :focus-within) { background: var(--nav-hover); }
  /* An item is one line: its name, then where it lives in muted words, cut first when room runs out. */
  .mw-item > span:nth-child(2) { display: flex; align-items: baseline; gap: 8px; flex: 1 1 auto; min-width: 0; }
  .mw-item strong { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .mw-item small { flex: 1 1 0; min-width: 0; margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .mw-item__end { display: flex; align-items: center; gap: 8px; flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }`,de=`
  .mw-mark { display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: var(--sk-r-slot, var(--r-control)); background: var(--sk-raised, var(--paper)); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); }
  .mw-mark svg { width: 16px; height: 16px; }`,J=`${de}
  .mw-btn-group { display: inline-flex; gap: 1px; }
  ${I()} { border-radius: 0; }
  ${I(":first-child")} { border-start-start-radius: ${v}; border-end-start-radius: ${v}; }
  ${I(":last-child")} { border-start-end-radius: ${v}; border-end-end-radius: ${v}; }
  .mw-btn-group > :focus-visible, .mw-btn-group > * > :focus-visible { position: relative; z-index: 1; }
  .mw-btn-group .mw-compose__menu { left: auto; right: 0; }
  .mw-tag { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 3px 0 8px; border: 0; border-radius: var(--r-tag); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); color: var(--ink); font: inherit; font-size: 12px; font-weight: var(--weight-control, 500); white-space: nowrap; }
  .mw-tag button { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: var(--r-tag); background: none; color: var(--muted); cursor: pointer; }
  .mw-tag button:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-tag button:focus-visible { outline: var(--focus-stroke); outline-offset: 0; }
  .mw-tag svg { width: 12px; height: 12px; }
  .mw-uploads { display: grid; gap: 2px; width: min(440px, 100%); margin: 0; padding: 0; list-style: none; }
  .mw-upload { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 4px 6px 8px; border-radius: var(--r-row); }
  .mw-upload > span:nth-child(2) { display: grid; gap: 6px; flex: 1; min-width: 0; font-size: 13px; color: var(--ink); }
  .mw-upload small { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .mw-upload small.is-failed { color: var(--red); }`,je=`
  .mw-btn-group__count { display: inline-flex; align-items: center; padding: 0 12px; border-radius: 0 ${v} ${v} 0; background: var(--sk-b2-bg, var(--control-fill)); box-shadow: inset 0 0 0 1px var(--sk-b2-edge, transparent); color: var(--ink-soft); font-size: 13px; font-variant-numeric: tabular-nums; }
  /* Tray's keys carry their own edge: a secondary group shares one line between keys instead of a seam. */
  :root[data-skin="tray"] .mw-btn-group > :not(:first-child):is(.mw-btn--secondary, .mw-btn-group__count),
  :root[data-skin="tray"] .mw-btn-group > :not(:first-child) > .mw-btn--secondary { margin-left: -2px; }
  .mw-tag--add { gap: 4px; padding: 0 8px 0 6px; background: none; box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); cursor: pointer; }
  .mw-tag--add:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-tag--add:focus-visible { outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: 1px; }
  .mw-catalog .mw-popover .mw-catalog__row { flex-wrap: nowrap; }
  .mw-catalog .mw-popover .mw-input { flex: 1; min-width: 220px; }


  .mw-tags.mw-input-group { flex-wrap: wrap; gap: 6px; width: min(420px, 100%); height: auto; padding-block: 4px; cursor: text; }
  :root body .mw-tags.mw-input-group:not(#mw-joined) { border-radius: min(${v}, 18px); }
  .mw-tags .mw-input { flex: 1 0 96px; width: auto; min-height: 24px; }
  .mw-tags__suggest { display: flex; flex-wrap: wrap; gap: 8px; }

  .mw-drop { display: grid; justify-items: center; gap: 4px; width: min(440px, 100%); padding: 28px 20px; border: 1px dashed var(--line-strong); border-radius: var(--r-card); background: color-mix(in srgb, var(--ink) 2%, transparent); text-align: center; transition: border-color var(--dur-hover, 130ms) var(--ease-quint), background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-drop .mw-mark { margin-bottom: 8px; transition: transform var(--dur-move, 250ms) var(--ease-quint), color var(--dur-hover, 130ms); }
  .mw-drop p { margin: 0; font-size: 13px; color: var(--ink); }
  .mw-drop p + p { font-size: 12px; color: var(--muted); }
  .mw-drop .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-drop[data-dropping] { border-style: solid; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent); }
  .mw-drop[data-dropping] .mw-mark { background: var(--accent); box-shadow: none; color: var(--on-accent); transform: translateY(-3px); }
  .mw-drop[data-drop-refused] { border-color: var(--red); background: color-mix(in srgb, var(--red) 5%, transparent); }
  .mw-drop[data-drop-refused] .mw-mark { color: var(--red); }
  .mw-drop--compact { grid-template-columns: auto minmax(0, 1fr); justify-items: start; gap: 0 12px; width: min(280px, 100%); padding: 12px 14px; text-align: left; }
  .mw-drop--compact .mw-mark { grid-row: span 2; margin: 0; }
  .mw-drop--compact[data-dropping] .mw-mark { transform: none; }

  .mw-stats { width: min(880px, 100%); container-type: inline-size; }
  .mw-stats > div { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  @container (max-width: 720px) { .mw-stats > div { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (max-width: 400px) { .mw-stats > div { grid-template-columns: minmax(0, 1fr); } }
  .mw-stat { display: grid; align-content: start; gap: 4px; padding: 16px; ${R}; }
  .mw-stat > p { margin: 0; font-size: 12px; color: var(--muted); }
  .mw-stat strong { font-size: 24px; line-height: 32px; font-weight: var(--weight-title, 600); color: var(--ink); letter-spacing: -.01em; }
  .mw-stat strong small { margin-left: 4px; font-size: 13px; font-weight: var(--weight-control, 500); letter-spacing: 0; color: var(--muted); }
  .mw-stat__delta { display: flex; align-items: center; gap: 6px; min-height: 20px; font-size: 12px; color: var(--muted); }
  .mw-stat__delta .mw-badge { gap: 2px; padding: 0 6px 0 4px; font-variant-numeric: tabular-nums; }
  .mw-stat__delta svg { width: 12px; height: 12px; }
  .mw-stat svg.mw-stat__trend { display: block; width: 100%; height: 36px; margin-top: 12px; overflow: visible; }
  .mw-stat__trend :is(polyline, line) { fill: none; stroke: var(--line-strong); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .mw-stat__trend polyline + polyline { stroke: var(--accent); }
  /* The latest point: a zero-length stroke stays round however the line is stretched; the first draws the surface ring. */
  .mw-stat__trend line { stroke: var(--paper); stroke-width: 10; }
  .mw-stat__trend line + line { stroke: var(--accent); stroke-width: 6; }
  .mw-stat .mw-progress { margin-top: 16px; }

${le}
  .mw-setting > div:first-child { display: grid; gap: 2px; flex: 1 1 auto; min-width: 0; }
  .mw-setting strong { overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .mw-setting p { margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; }
  .mw-settings { display: grid; width: min(560px, 100%); ${R}; }
  .mw-setting { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; min-height: 60px; padding: 12px 16px; }
  .mw-setting + .mw-setting { box-shadow: inset 0 1px 0 var(--line); }
  .mw-setting > div:first-child { flex-basis: 220px; }
  .mw-setting > div:last-child { display: flex; align-items: center; gap: 8px; margin-left: auto; }
  .mw-setting .mw-select { width: auto; min-width: 140px; }

  .mw-dt { display: grid; width: min(880px, 100%); overflow: hidden; ${R}; }
  .mw-dt--small { width: min(420px, 100%); }
  .mw-dt__bar { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 10px 12px; transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-dt__bar > div { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
  .mw-dt__bar .mw-input-group { flex: 0 1 240px; }
  .mw-dt__bar > div > span, .mw-dt__foot { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .mw-dt__bar > div > span:last-child { margin-left: auto; }
  .mw-dt__bar > div > strong { margin-right: 4px; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-dt:not([data-picked]) .mw-dt__bulk, .mw-dt[data-picked] .mw-dt__bar > div:not(.mw-dt__bulk) { display: none; }
  .mw-dt[data-picked] .mw-dt__bar { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .mw-dt__scroll { overflow-x: auto; }
  .mw-dt table { width: 100%; min-width: 600px; border-collapse: collapse; font-size: 13px; }
  .mw-dt--small table { min-width: 0; }
  .mw-dt th { height: 36px; padding: 0 12px; background: color-mix(in srgb, var(--ink) 2.5%, transparent); box-shadow: inset 0 1px 0 var(--line), inset 0 -1px 0 var(--line); color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); text-align: left; white-space: nowrap; }
  .mw-dt td { height: 44px; padding: 0 12px; color: var(--ink-soft); white-space: nowrap; }
  .mw-dt tbody tr + tr td { box-shadow: inset 0 1px 0 var(--line); }
  .mw-dt tbody tr { transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-dt tbody tr:is(:hover, :focus-within) { background: var(--nav-hover); }
  .mw-dt tbody tr[aria-selected="true"] { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .mw-dt__scroll:first-child th { box-shadow: inset 0 -1px 0 var(--line); }
  .mw-dt:not(.mw-dt--small) :is(th, td):first-child { width: 20px; padding-right: 0; }
  .mw-dt :is(th, td):last-child:not(:first-child, :nth-child(2)) { width: 32px; padding-left: 0; }
  .mw-dt .is-num { text-align: right; font-variant-numeric: tabular-nums; }
  .mw-dt td > div { display: flex; align-items: center; gap: 12px; }
  .mw-dt td > div > span:last-child { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .mw-dt td strong { color: var(--ink); font-weight: var(--weight-control, 500); }
  .mw-dt td small { color: var(--muted); font-size: 12px; }
  .mw-dt th button { display: inline-flex; align-items: center; gap: 4px; height: 26px; margin: 0 -6px; padding: 0 6px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; cursor: pointer; }
  .mw-dt th button:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-dt th button:focus-visible { outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: -1px; }
  .mw-dt th button svg { width: 12px; height: 12px; }
  .mw-dt th[aria-sort="ascending"] button svg { transform: rotate(180deg); }
  .mw-dt th:not([aria-sort$="ending"]) button svg { display: none; }
  .mw-dt th[aria-sort$="ending"] { color: var(--ink); }
  .mw-dt .mw-skeleton { height: 10px; }
  .mw-dt__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 0 8px 0 16px; box-shadow: inset 0 1px 0 var(--line); }
  .mw-dt__empty { display: grid; justify-items: center; gap: 12px; padding: 36px 20px 40px; box-shadow: inset 0 1px 0 var(--line); text-align: center; }
  .mw-dt__empty p { margin: 0; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
`;var Q=`${J}
  .mw-composer { position: relative; display: grid; gap: 6px; width: min(640px, 100%); min-width: 0; container: mw-composer / inline-size; }
  /* Who it goes to: a soft tag beside \uFF0B in the bottom bar (user 2026-11-10, one input), its glyph and name; "\u53D1\u7ED9\uFF1A" is spoken, not drawn. */
  .mw-composer__to { display: flex; align-items: center; flex: 0 1 auto; min-width: 0; }
  .mw-composer__to-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .mw-composer__to .mw-tag { gap: 6px; min-width: 0; max-width: min(100%, 220px); height: 30px; padding: 0 8px 0 7px; border-radius: 8px; background: var(--surface-soft, var(--wash)); box-shadow: none; font-size: 13px; }
  .mw-composer__to .mw-tag > svg { flex: none; width: 14px; height: 14px; color: var(--ink-soft); }
  .mw-composer__to [data-composer-receiver] { display: block; width: auto; height: auto; min-width: 28px; min-height: 28px; padding: 0; color: inherit; font: inherit; overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__to .mw-tag > span { overflow: hidden; text-overflow: ellipsis; }
  /* The receiver's reset (start a new one instead) is a real target, 28px, in the tag's own place: the margins take back what the row would grow by. */
  .mw-composer__to [data-tag-remove] { width: 28px; height: 28px; margin: -2px -5px -2px -3px; }
  /* The scene controls (and \u66F4\u591A in a narrow box) stand at the end of the bar, beside send; \uFF0B and who it goes to lead. */
  .mw-composer__start > :is(.mw-composer__more, .mw-composer__controls) { margin-inline-start: auto; }
  .mw-composer__box { display: grid; min-width: 0; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); transition: box-shadow var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  .mw-composer__box:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-composer__box[data-dropping] { box-shadow: 0 0 0 2px var(--accent), var(--lift-1); }
  /* While it eases between one row and rows, what is already laid out for the end stays inside it (the menus hang from the composer). */
  .mw-composer__box[data-settling] { overflow: clip; }
  .mw-composer__files { width: auto; padding: 6px 6px 0; }
  /* A read picture shows itself in its row's mark; a row being read is quieter until it is. */
  .mw-composer__files .mw-mark { overflow: hidden; }
  .mw-composer__thumb { width: 100%; height: 100%; object-fit: cover; }
  .mw-upload.is-reading .mw-mark { color: var(--muted); }
  .mw-composer__restore { margin: 0; padding: 8px 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__restore .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-composer__text { display: flex; padding: 10px 12px 0; }
  /* The page sheets style every bare textarea (a border and a field's fill); the field here is the box itself, so one id-weight
     \`:not\` takes those off, as the button group's joined corners do. */
  .mw-composer__text > .mw-composer__input:not(#mw-composer) { flex: 1; min-width: 0; min-height: 2lh; padding: 0; border: 0; border-radius: 0; outline: 0; background: transparent; box-shadow: none; color: var(--ink); font: inherit; font-size: 13px; line-height: 20px; }
  .mw-composer__input::placeholder { color: var(--muted); }
  .mw-composer__status { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 8px 12px 0; color: var(--ink-soft); font-size: 12px; line-height: 18px; text-wrap: pretty; }
  .mw-composer__status > .mw-status { flex: none; }
  .mw-composer__status > span:not(.mw-status) { flex: 1; min-width: 0; }
  .mw-composer__status .mw-btn--link { flex: none; min-height: 0; padding: 0; }
  /* The foot is no wider than its box: what does not fit is shortened inside it (the longest setting first), never pushed out. */
  .mw-composer__foot { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 44px; padding: 6px 8px 8px; }
  .mw-composer__start, .mw-composer__end, .mw-composer__controls { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .mw-composer__start { flex: 1; }
  /* A scene control is as wide as its choice and gives way when the bar is crowded, the longest first; a short one stays whole. */
  .mw-composer__controls .mw-select-picker { flex: 0 1 auto; width: auto; min-width: 4.5rem; max-width: 15rem; }
  .mw-composer__controls .mw-select-picker__trigger { width: 100%; min-width: 0; }
  /* The bar is one size: its own touch rule (600px and below, or a finger) sizes all of it, so a page's wider narrow rule (760px) does not enlarge its settings alone beside a desktop \uFF0B and send. */
  @media (min-width: 601px) and (pointer: fine) { .mw-composer__controls .mw-select { min-height: var(--control-h, 32px); font-size: 13px; } }
  .mw-composer__end { flex: none; }
  .mw-composer__more { display: none; }
  .mw-composer .mw-compose__anchor { position: static; }
  .mw-composer .mw-compose__menu { top: auto; right: 0; bottom: calc(100% + 6px); left: auto; width: min(340px, 100%); }
  .mw-composer__start .mw-compose__menu { right: auto; left: 0; }
  .mw-composer .mw-compose__menu .mw-menu { width: 100%; min-width: 0; max-height: min(440px, 60vh, var(--mw-composer-menu-room, 60vh)); overflow-y: auto; animation-name: craft-rise-from-bar; }
  /* A refusal still explains itself: only the disabled name and icon are faint, never the reason beneath. */
  .mw-composer .mw-menu__item:disabled:has(.mw-menu__desc) { opacity: 1; }
  .mw-composer__query { padding: 4px 4px 6px; }
  .mw-composer__query > .mw-input { width: 100%; }
  .mw-composer__line { margin: 0; padding: 6px 10px; color: var(--muted); font-size: 12px; line-height: 18px; }
  .mw-composer[data-state="failed"] .mw-composer__box { box-shadow: 0 0 0 1px color-mix(in srgb, var(--red) 45%, transparent), var(--lift-1); }
  .mw-composer[data-state="disabled"] .mw-composer__box { background: var(--wash); box-shadow: 0 0 0 1px var(--line); }
  .mw-composer[data-state="disabled"] .mw-composer__input:not(#mw-composer) { color: var(--muted); cursor: not-allowed; }
  /* In a narrow box the explanation is the part that must be read: it flows as one paragraph that starts beside the mark and
     wraps under it, with the action following its last words, instead of a thin column squeezed between the two. */
  @container mw-composer (max-width: 480px) {
    .mw-composer__status { display: block; }
    .mw-composer__status > .mw-status { margin-right: 8px; vertical-align: 1px; }
    .mw-composer__status .mw-btn--link { margin-left: 8px; vertical-align: baseline; }
    .mw-composer__more { display: block; }
    .mw-composer__controls { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 5; display: none; flex-wrap: wrap; max-width: 100%; padding: 6px; border-radius: var(--r-card, 12px); background: var(--popover, var(--paper)); box-shadow: var(--lift-3); animation: craft-rise-from-bar var(--dur-move, 250ms) var(--ease-quint); }
    .mw-composer__more:has(> [aria-expanded="true"]) + .mw-composer__controls { display: flex; }
  }
  @media (prefers-reduced-motion: reduce) { .mw-composer__box { transition: none; } .mw-composer__controls { animation: none; } }
  @media (max-width: 600px), (pointer: coarse) {
    .mw-composer__text > .mw-composer__input:not(#mw-composer) { font-size: 16px; line-height: 22px; }
    .mw-composer__foot .mw-btn--sm, .mw-composer__foot .mw-btn--icon { min-height: 44px; }
    .mw-composer__foot .mw-btn--icon-only { width: 44px; min-width: 44px; }
    .mw-composer__status .mw-btn--link, .mw-composer__restore .mw-btn--link { min-height: 44px; min-width: 44px; }
    .mw-composer__to { gap: 12px; }
    .mw-composer__to .mw-tag:has([data-composer-receiver]) { height: 44px; padding: 0; gap: 0; }
    .mw-composer__to [data-composer-receiver] { min-height: 44px; min-width: 44px; padding-inline: 8px; }
    .mw-composer__to .mw-tag:has([data-composer-receiver]) [data-tag-remove] { flex: none; margin: 0; }
    .mw-composer__to [data-tag-remove] { width: 44px; height: 44px; margin: -10px -13px -10px -11px; }
  }
  @media (max-width: 600px), (max-height: 560px) {${O(".mw-composer[data-rest]")}
  }
  @media (max-width: 600px), (max-height: 560px) and (pointer: coarse) {${C(".mw-composer[data-rest]")}
  }`;function O(e){return`
    ${e} > .mw-composer__box { grid-template-columns: auto auto minmax(0, 1fr) auto auto; align-items: center; padding: 2px; }
    ${e} :is(.mw-composer__foot, .mw-composer__start) { display: contents; }
    ${e} .mw-compose__anchor { grid-area: 1 / 1; }
    ${e} .mw-composer__to { grid-area: 1 / 2; padding-inline-start: 2px; }
    ${e} .mw-composer__to .mw-tag { max-width: 160px; }
    ${e} .mw-composer__text { grid-area: 1 / 3; padding: 0 6px 0 8px; }
    ${e} :is(.mw-composer__more, .mw-composer__controls) { grid-area: 1 / 4; margin: 0; }
    ${e} .mw-composer__end { grid-area: 1 / 5; margin-inline-end: 4px; }
    ${e} .mw-composer__text > .mw-composer__input:not(#mw-composer) { box-sizing: border-box; height: 32px; min-height: 32px; max-height: 32px; padding-block: 6px; overflow: hidden; resize: none; }
    ${e} .mw-composer__input::placeholder { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }`}function C(e){return`
    ${e} .mw-composer__text > .mw-composer__input:not(#mw-composer) { height: 44px; min-height: 44px; max-height: 44px; padding-block: 11px; font-size: 16px; line-height: 22px; }`}window.voicePreviewParts={renderComposer:Z,COMPOSER_STYLES:Q,composerRestRules:O,composerRestTouch:C};})();
