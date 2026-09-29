import { icon as i, escape as e, button as b, iconButton as ib, applyPreferences, toast } from './shared.js';

const copy={
 zh:{titles:['语言','外观','你的第一个项目','选择顺手的 Runtime','AI，在你需要的时候','只提醒重要的事','找到舒服的密度','一切就绪。'],desc:['用你最熟悉的语言开始。之后随时可以更改。','跟随这台 Mac，或选择自己喜欢的样子。','一个项目，收拢目标、资料和正在发生的工作。','从熟悉的工具继续。真正的连接稍后再确认。','使用之前，先看清上下文，再由你决定。','需要你做决定时再提醒，其余进展安静留下。','预览一下，哪种节奏更适合你的工作？','你的工作空间，已经有了自己的样子。'],next:'继续',back:'上一步',finish:'进入工作空间',exit:'返回工作台',step:'步骤',later:'稍后设置',system:'跟随系统',light:'浅色',dark:'深色',project:'项目名称',ask:'每次使用前询问',noai:'暂不使用 AI',important:'仅重要事项',none:'暂不开启',comfortable:'舒适',compact:'紧凑',done:['一个清楚的方向','熟悉的工作方式','留给内容的空间'],doneDesc:['目标、资料与进展，在同一个地方。','选择已保留，连接由你确认。','按你的节奏，随时继续。'],demo:'设计预览 · 设置仅保存在此浏览器',play:'播放演示',pause:'暂停演示',restart:'重新体验',sample:'效果预览',projectError:'给项目起一个名字，再继续。'},
 en:{titles:['Language','Appearance','Your first project','Your familiar runtime','AI, when you need it','Only what matters','Find your rhythm',"You’re all set."],desc:['Start in your own language. Change it any time in Settings.','Follow your Mac, or make it your own.','Bring your goals, sources and work into one place.','Keep your familiar tools. Confirm the connection later.','See the context first. You decide what happens next.','A gentle nudge when a decision needs you.','A little more room, or everything a little closer?','A workspace that already feels a little more like you.'],next:'Continue',back:'Back',finish:'Open workspace',exit:'Back to workspace',step:'Step',later:'Set up later',system:'Follow System',light:'Light',dark:'Dark',project:'Project name',ask:'Ask before each use',noai:'Not now',important:'Important only',none:'Not now',comfortable:'Comfortable',compact:'Compact',done:['A clear direction','A familiar way to work','Room for what matters'],doneDesc:['Goals, sources and progress, together.','Your choice is saved. Connect when ready.','Your work, at your own pace.'],demo:'Design preview · Settings stay in this browser',play:'Play demo',pause:'Pause demo',restart:'Start again',sample:'Live preview',projectError:'Give your project a name to continue.'},
 ja:{titles:['言語','外観','最初のプロジェクト','使い慣れた Runtime','必要なときに、AI を','大切なことだけ通知','心地よい表示密度','準備ができました。'],desc:['使い慣れた言語で始めましょう。設定でいつでも変更できます。','Mac に合わせるか、好きな外観を選べます。','目標、資料、進捗をひとつの場所に。','使い慣れたツールを選択。接続はあとで確認します。','使う前に文脈を確認し、次の操作を決めましょう。','判断が必要なときだけ、お知らせします。','ゆったりとした表示とコンパクトな表示を比べてみましょう。','あなたらしいワークスペースの完成です。'],next:'続ける',back:'戻る',finish:'ワークスペースを開く',exit:'ワークスペースに戻る',step:'ステップ',later:'あとで設定',system:'システムに合わせる',light:'ライト',dark:'ダーク',project:'プロジェクト名',ask:'使用前に確認する',noai:'今は使用しない',important:'重要な通知のみ',none:'今は有効にしない',comfortable:'ゆったり',compact:'コンパクト',done:['明確な方向へ','使い慣れた方法で','大切なことに集中'],doneDesc:['目標、資料、進捗をまとめて。','選択を保存しました。接続はあとで。','自分のペースで仕事を続けられます。'],demo:'デザインプレビュー · 設定はこのブラウザ内のみ',play:'デモを再生',pause:'デモを一時停止',restart:'最初から',sample:'プレビュー',projectError:'プロジェクト名を入力してください。'}
};
export function mountOnboarding(root,state,save,exit){
 let step=Math.max(0,Math.min(7,Number(state.onboardingStep)||0));let playing=false;let timer=null;let disposed=false;let transitionId=0;
 const controller=new AbortController();const {signal}=controller;
 const c=()=>copy[state.language]||copy.zh;
 const option=(field,value,label)=>`<button class="ob-option" data-choice="${field}" data-value="${value}" aria-pressed="${state[field]===value}"><span>${label}</span><span class="ob-option-check">${i('check')}</span></button>`;
 function options(){const t=c();switch(step){
  case 0:return `<div class="ob-options ob-languages" aria-label="${t.titles[0]}">${option('language','en','English')}${option('language','zh','简体中文')}${option('language','ja','日本語')}</div>`;
  case 1:return `<div class="ob-options" aria-label="${t.titles[1]}">${option('theme','system',t.system)}${option('theme','light',t.light)}${option('theme','dark',t.dark)}</div>`;
  case 2:return `<div class="ob-project-field"><label for="ob-project">${t.project}</label><input id="ob-project" maxlength="48" value="${e(state.project)}" autocomplete="off"><p id="ob-error" class="ob-error" role="alert" hidden></p></div>`;
  case 3:return `<div class="ob-options ob-runtime-options" aria-label="Runtime">${option('runtime','Codex',`${i('code')}Codex`)}${option('runtime','Claude Code',`${i('terminal')}Claude Code`)}${option('runtime','later',t.later)}</div>`;
  case 4:return `<div class="ob-options wide" aria-label="${t.titles[4]}">${option('ai','ask',t.ask)}${option('ai','off',t.noai)}</div><div class="ob-note">${i('shield')}${state.language==='en'?'This preview never sends your data.':state.language==='ja'?'このプレビューはデータを送信しません。':'此预览不会连接模型或发送数据。'}</div>`;
  case 5:return `<div class="ob-options wide" aria-label="${t.titles[5]}">${option('notifications','important',t.important)}${option('notifications','off',t.none)}</div>`;
  case 6:return `<div class="ob-options wide" aria-label="${t.titles[6]}">${option('density','comfortable',t.comfortable)}${option('density','compact',t.compact)}</div>`;
  default:return '';
 }}
 function miniWindow(content,cls=''){return `<div class="mini-window ${cls}"><div class="mini-titlebar"><div class="mini-dots"><span></span><span></span><span></span></div><span>Molis Work</span></div>${content}</div>`;}
 function miniRows(){return ['产品体验升级','信息流阅读体验','项目上下文整理'].map((title,n)=>`<div class="mini-goal-row"><span class="mini-glyph g${n}">${i(n===0?'target':n===1?'book':'folder')}</span><span><strong>${title}</strong><small>${n===0?'让每一次操作，都自然一点。':n===1?'把注意力留给内容。':'从手边已有的资料开始。'}</small></span>${i(n===0?'check':'circle')}</div>`).join('');}
 function preview(){const t=c();switch(step){
  case 0:return `<div class="greeting-scene"><div class="greeting-word" lang="${state.language}">${state.language==='en'?'Hello.':state.language==='ja'?'こんにちは':'你好。'}</div><span class="greeting-caption">Molis Work</span></div>`;
  case 1:return miniWindow(`<div class="mini-app"><div class="mini-app-content"><div class="mini-headline"></div>${miniRows()}</div><div class="mini-workbench-bar"><span>${i('grid')}</span><span>${i('home')}</span><div>${i('target')}<span>问 Assistant…</span>${i('send')}</div><span>${i('message')}</span></div></div>`,'appearance-preview');
  case 2:return `<div class="project-scene"><div class="project-folder">${i('folder-open')}<strong id="project-preview-name">${e(state.project)||'Molis Work'}</strong><small>${state.language==='en'?'Your own space':'属于你的工作空间'}</small></div><div class="floating-document doc-one">${i('target')}<span>目标</span><div></div><div></div></div><div class="floating-document doc-two">${i('note')}<span>资料</span><div></div><div></div></div><div class="floating-document doc-three">${i('activity')}<span>进展</span><div></div><div></div></div></div>`;
  case 3:return `<div class="runtime-scene"><div class="runtime-source"><span class="runtime-m">m</span><strong>Molis Work</strong><small>${state.language==='en'?'Your project context':'你的项目上下文'}</small></div><div class="runtime-bridge"><span></span><span></span><span></span>${i('arrow')}</div><div class="runtime-target">${i(state.runtime==='Claude Code'?'terminal':state.runtime==='later'?'plus':'code')}<strong>${state.runtime==='later'?t.later:e(state.runtime)}</strong><small>${state.language==='en'?'Connect when ready':'接入前由你确认'}</small></div><div class="runtime-context"><span></span><span></span><span></span></div></div>`;
  case 4:return `<div class="privacy-scene" data-enabled="${state.ai==='ask'}"><div class="privacy-document"><strong>${state.language==='en'?'Project context':'项目上下文'}</strong><span></span><span class="private-line"></span><span></span><span class="private-line short"></span><span></span><span></span></div><div class="privacy-path">${i('lock')}<span></span></div><div class="privacy-ai">${i('sparkles')}</div><div class="privacy-caption">${i(state.ai==='ask'?'shield':'lock')}<span>${state.ai==='ask'?(state.language==='en'?'Only with your permission':'每次使用前，先由你确认'):(state.language==='en'?'Your context stays here':'上下文留在这里')}</span></div></div>`;
  case 5:return `<div class="notification-scene" data-enabled="${state.notifications==='important'}"><div class="notification-backplate"></div><div class="notification-stack"><div class="mini-notification first"><span class="notification-mark">m</span><div><span>Molis Work<time>现在</time></span><strong>${state.language==='en'?'A decision needs you':'有一件事，想听听你的判断'}</strong><p>${state.language==='en'?'Product experience · Ready to review':'产品体验升级 · 高保真原型待体验'}</p></div></div><div class="mini-notification second"><span class="notification-mark">m</span><div><span>Molis Work<time>10:16</time></span><strong>${state.language==='en'?'A little progress':'又向前走了一小步'}</strong><p>${state.language==='en'?'A new progress note was saved':'新的工作进展已记录'}</p></div></div></div><div class="mini-dock"><span>${i('folder')}</span><span>${i('calendar')}</span><span class="dock-m">m<em>1</em></span><span>${i('sparkles')}</span></div><p class="notification-muted">${state.language==='en'?'Quiet for now. Everything stays in your workspace.':'保持安静，进展仍会留在工作空间。'}</p></div>`;
  case 6:return miniWindow(`<div class="density-preview" data-density="${state.density}"><h3>${state.language==='en'?'Your goals':'你的目标'}<span>3</span></h3>${miniRows()}</div>`,'density-window');
  default:return '';
 }}
 function stageMarkup(){const t=c();if(step===7)return `<section class="ob-complete"><div class="complete-mark"><span>m</span><b>${i('check')}</b></div><h1 id="ob-title" tabindex="-1">${t.titles[7]}</h1><p>${t.desc[7]}</p><div class="complete-list">${['target','terminal','rows'].map((ico,n)=>`<div>${i(ico)}<span><strong>${t.done[n]}</strong><small>${t.doneDesc[n]}</small></span></div>`).join('')}</div><button class="btn primary ob-enter" data-ob="finish">${t.finish}${i('arrow')}</button></section>`;
 return `<section class="ob-question"><h1 id="ob-title" tabindex="-1">${t.titles[step]}</h1><p>${t.desc[step]}</p><div id="ob-options-area">${options()}</div></section><div class="ob-preview" aria-label="${t.sample}" id="ob-preview">${preview()}</div>`;}
 function draw(){
  const t=c();root.innerHTML=`<div class="onboarding-stage"><header class="ob-outside-header"><a href="#home" class="ob-brand">${i('brand')}<span>Molis Work</span></a><a href="#home" class="ob-return">${t.exit}${i('arrow')}</a></header><main id="main" class="onboarding-window" data-step="${step}" aria-labelledby="ob-title"><div class="ob-windowbar"><div class="window-dots" aria-hidden="true"><span></span><span></span><span></span></div><span>Molis Work</span>${ib(t.exit,'ob-exit','x','data-ob="exit"')}</div><div class="ob-content ${step===7?'is-complete':''}" id="ob-content">${stageMarkup()}</div><footer class="ob-footer"><nav class="ob-progress" aria-label="${t.step}">${t.titles.map((name,n)=>`<button data-ob-step="${n}" class="${n<step?'complete':''}" ${n===step?'aria-current="step"':''} aria-label="${t.step} ${n+1}: ${name}" title="${name}"><span></span></button>`).join('')}</nav><div class="ob-footer-actions">${step>0?`<button class="ob-back" data-ob="back">${t.back}</button>`:''}${step<7?`<button class="btn primary ob-continue" data-ob="next">${t.next}<span class="return-key">↵</span></button>`:''}</div></footer></main><footer class="ob-outside-footer"><span>${t.demo}</span><div><button data-ob="restart">${i('refresh')}${t.restart}</button><button data-ob="autoplay" aria-pressed="${playing}">${i(playing?'pause':'play')}${playing?t.pause:t.play}</button></div></footer></div>`;
  applyPreferences(state);
 }
 async function go(next){
  if(next<0||next>7)return;
  if(step===2&&!state.project.trim()&&next>2){const err=root.querySelector('#ob-error');if(err){err.hidden=false;err.textContent=c().projectError;}root.querySelector('#ob-project')?.focus();stopAuto();return;}
  const id=++transitionId;const content=root.querySelector('#ob-content');const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(content&&!reduced){try{await content.animate([{opacity:1,transform:'translateX(0)',filter:'blur(0px)'},{opacity:0,transform:`translateX(${next>step?-15:15}px)`,filter:'blur(3px)'}],{duration:140,easing:'ease-in',fill:'forwards'}).finished;}catch{}}
  if(disposed||id!==transitionId)return;
  const forward=next>step;step=next;state.onboardingStep=step;save();draw();
  const newContent=root.querySelector('#ob-content');
  if(!reduced)newContent.animate([{opacity:0,transform:`translateX(${forward?22:-22}px)`,filter:'blur(4px)'},{opacity:1,transform:'translateX(0)',filter:'blur(0px)'}],{duration:480,easing:'cubic-bezier(.22,1,.36,1)'});
  root.querySelector('#ob-title')?.focus({preventScroll:true});
 }
 function stopAuto(){playing=false;clearTimeout(timer);timer=null;const btn=root.querySelector('[data-ob=autoplay]');if(btn){btn.innerHTML=`${i('play')}${c().play}`;btn.setAttribute('aria-pressed','false');}}
 function schedule(){timer=setTimeout(async()=>{if(!playing||disposed)return;if(step>=7){stopAuto();return;}await go(step+1);if(playing)schedule();},3700);}
 function finish(){if(!state.project.trim()){step=2;draw();return;}state.onboardingDone=true;state.onboardingStep=0;save();stopAuto();exit();toast('设置已保存在原型中，欢迎回来');}
 root.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.choice){
   const field=target.dataset.choice;state[field]=target.dataset.value;save();
   if(field==='language'){draw();root.querySelector(`[data-value="${state.language}"]`)?.focus();}
   else{root.querySelector('#ob-options-area').innerHTML=options();const previewElement=root.querySelector('#ob-preview');
    if(field==='theme'){applyPreferences(state);}else if(field==='density'){const d=previewElement.querySelector('.density-preview');if(d)d.dataset.density=state.density;applyPreferences(state);}else{previewElement.innerHTML=preview();previewElement.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:320,easing:'cubic-bezier(.22,1,.36,1)'});}
    root.querySelector(`[data-choice="${field}"][data-value="${state[field]}"]`)?.focus({preventScroll:true});
   }
   return;
  }
  if(target.dataset.obStep!==undefined){stopAuto();go(Number(target.dataset.obStep));return;}
  switch(target.dataset.ob){
   case 'next':stopAuto();go(step+1);break;
   case 'back':stopAuto();go(step-1);break;
   case 'finish':finish();break;
   case 'exit':stopAuto();exit();break;
   case 'restart':stopAuto();go(0);break;
   case 'autoplay':if(playing){stopAuto();}else{playing=true;if(step===7){go(0).then(schedule);}else schedule();target.innerHTML=`${i('pause')}${c().pause}`;target.setAttribute('aria-pressed','true');}break;
  }
 },{signal});
 root.addEventListener('input',event=>{if(event.target.id==='ob-project'){state.project=event.target.value;save();root.querySelector('#project-preview-name').textContent=state.project||'Molis Work';root.querySelector('#ob-error').hidden=true;}},{signal});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){stopAuto();exit();return;}
  if(event.key==='Enter'&&(event.target.id==='ob-project'||event.target.id==='ob-title'||event.target===document.body)){event.preventDefault();stopAuto();if(step===7)finish();else go(step+1);}
 },{signal});
 draw();
 return()=>{disposed=true;transitionId++;stopAuto();controller.abort();};
}
