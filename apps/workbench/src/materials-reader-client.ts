/**
 * The reader of the project's folders (design A「就地预览」, specs/batch-06-shared-tools/materials-ui-contract §4), in the side
 * panel and in the main area:
 * a file listed by the platform's materials service opens in place with what the person can take from it. Drag a passage and
 * 「引用选区」 fixes exactly that text, or the same button lists the passages to choose with the arrow keys and Enter; 「固定快照」
 * fixes the whole file as it is now; 「加入任务」 puts the quote, the snapshot or the file as it is into the task's input. A file
 * longer than one read comes in windows, and 「继续读取」 reads the next. Reading is read-only: nothing is fixed until the person
 * asks, and each fix is read again by the service, which refuses a file that changed since it was shown.
 *
 * The factory takes its place's helpers and the attribute its controls are named by (`renderMaterialsTools`); `open` answers false for
 * a file it does not read, which the place then shows as before. A place that collects what is taken (the materials picker) passes
 * `take`, which gets `{ ref, title, hint }`; without it 「加入任务」 opens the Assistant with it.
 */
export function renderMaterialsTools(L: (text: string) => string, name: "side-materials" | "stage-materials"): string {
  return `<div class="side-materials-tools" data-${name}-tools role="toolbar" aria-label="${L("取用这份资料")}" hidden>
          <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-${name}="quote">${L("引用选区")}</button>
          <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-${name}="pin">${L("固定快照")}</button>
          <span class="side-materials-held" data-${name}-held hidden></span>
          <button class="mw-btn mw-btn--secondary mw-btn--sm side-materials-add" type="button" data-${name}="add">${L("加入任务")}</button>
          <p class="side-materials-problem" data-${name}-problem role="status" hidden></p>
        </div>`;
}

export const MATERIALS_READER_CLIENT_SCRIPT = String.raw`const materialsReader=({name,L,esc,body,tools,held,problem,post,renderFile,take})=>{
    let state=null;
    // Each place names its own controls (the side panel's, the main area's), so two readers on one page never answer each other.
    const sel=(value)=>value==null?'[data-'+name+']':'[data-'+name+'="'+value+'"]';
    // What went wrong with the last thing asked, on its own line: the toolbar keeps its buttons.
    const say=(error)=>{problem.hidden=!error;problem.replaceChildren();if(error)molisWorkRequest.show(problem,error);};
    const lineOf=(text,at)=>text.slice(0,at).split('\n').length;
    // Where a quote is in the file, in the words the person reads: lines when the whole file is here, else how long it is.
    const labelOf=(start,end)=>{
      if(state.whole){const a=lineOf(state.text,start),b=lineOf(state.text,Math.max(start,end-1));return a===b?L('第 {n} 行',{n:a}):L('第 {a}–{b} 行',{a,b});}
      return L('节选 · {n} 字',{n:end-start});
    };
    const paintHeld=()=>{
      const item=state?.quote||state?.pinned;
      held.hidden=!item;
      const drop=esc(L('不用这一项'));
      held.innerHTML=item?'<span>'+esc(item.label)+'</span><button class="side-files-tool" type="button" data-'+name+'="drop" aria-label="'+drop+'" title="'+drop+'">×</button>':'';
      const pin=tools.querySelector(sel('pin'));
      if(pin){pin.disabled=!state||!state.whole;pin.title=state&&!state.whole?L('长文件只能固定选区'):'';}
    };
    // Each window is its own block, so a selection's place in the file is counted from where that block starts.
    const paintText=()=>{
      const markdown=state.whole&&/markdown/.test(state.media_type);
      if(markdown)renderFile({...state.file,truncated:false});
      else body.innerHTML=state.windows.map((part,index)=>'<pre class="side-materials-text" data-'+name+'-window="'+index+'">'+esc(part.text)+'</pre>').join('');
      if(state.next)body.insertAdjacentHTML('beforeend','<p class="side-materials-more"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-'+name+'="next">'+esc(L('继续读取'))+'</button></p>');
    };
    const subjectParts=(id)=>{const at=id.indexOf(':');return at<1?null:{workspace_id:id.slice(0,at),path:id.slice(at+1).split('/')};};
    // A long file: its first window, read through the materials service as the person, without fixing or remembering anything.
    const readWindow=async(cursor)=>{
      const result=await post('/api/materials/read',{ref:{subject:state.subject,pin:{mode:'current',read_revision:state.revision||'size:0'}},mode:'text',...(cursor?{cursor}:{})});
      const part=result.window;
      return {text:result.text||'',start:part?.start||0,cursor:part?.cursor||null,next:part?.next_cursor||null,revision:result.read_revision};
    };
    const open=async({item,file,isCurrent})=>{
      const subject=item?.subject||file?.subject;
      const where=subject?.kind==='workspace_file'?subjectParts(subject.id):null;
      if(!where||file.encoding!=='utf8'||file.revision==='unreadable'){close();return false;}
      state={subject,...where,title:file.title||item?.title||'',media_type:file.media_type,file,whole:true,text:file.data,revision:file.revision,windows:[{text:file.data,start:0,cursor:null}],next:null,quote:null,pinned:null};
      // What the panel showed in place of a long file is a sentence; the file itself is read on in windows.
      if(/^size:/.test(file.revision)){
        try{
          const first=await readWindow(null);if(!isCurrent())return true;
          Object.assign(state,{whole:!first.cursor,text:first.text,revision:first.revision,windows:[{text:first.text,start:first.start,cursor:first.cursor}],next:first.next});
        }catch{if(isCurrent())close();return false;}
      }
      tools.hidden=false;paintText();paintHeld();return true;
    };
    const unlist=()=>tools.querySelector('[data-'+name+'-passages]')?.remove();
    const close=()=>{state=null;say(null);tools.hidden=true;held.hidden=true;held.innerHTML='';unlist();};
    const next=async(button)=>{
      if(!state?.next)return;button.disabled=true;
      try{
        const part=await readWindow(state.next);
        state.windows.push({text:part.text,start:part.start,cursor:part.cursor});state.next=part.next;paintText();
      }catch(error){button.disabled=false;say(error);}
    };
    // The selection's exact place in the file: inside one window it is counted from that window's start; on a rendered page it is
    // the selected words found once in the file. Anything else is chosen from the passages instead.
    const selected=()=>{
      const selection=getSelection();if(!selection||selection.isCollapsed||!body.contains(selection.anchorNode))return null;
      const block=(node)=>(node.nodeType===1?node:node.parentElement)?.closest('[data-'+name+'-window]');
      const first=block(selection.anchorNode),last=block(selection.focusNode);
      if(first&&first===last){
        const part=state.windows[Number(first.getAttribute('data-'+name+'-window'))],range=selection.getRangeAt(0),count=(container,offset)=>{const r=document.createRange();r.setStart(first,0);r.setEnd(container,offset);return r.toString().length;};
        const a=count(range.startContainer,range.startOffset),b=count(range.endContainer,range.endOffset);
        return b>a?{start:part.start+a,end:part.start+b,cursor:part.cursor}:null;
      }
      if(first||last)return 'split';
      const words=selection.toString();if(!words.trim())return null;
      const at=state.text.indexOf(words);
      return at>=0&&state.text.indexOf(words,at+1)<0?{start:at,end:at+words.length,cursor:null}:null;
    };
    const passages=()=>{
      const list=[];
      for(const part of state.windows){const re=/[^\n]+(?:\n[^\n]+)*/g;let match;while((match=re.exec(part.text)))if(match[0].trim())list.push({start:part.start+match.index,end:part.start+match.index+match[0].length,cursor:part.cursor,text:match[0]});}
      return list;
    };
    const fix=async(range,button)=>{
      const input={workspace_id:state.workspace_id,path:state.path,...(range.cursor?{cursor:range.cursor}:{fingerprint:state.revision}),...(range.end!==undefined?{start:range.start,end:range.end}:{})};
      button.disabled=true;
      try{return await post('/api/materials/capture',input);}
      catch(error){say(error);return null;}
      finally{button.disabled=false;}
    };
    const quote=async(range,button)=>{
      const label=labelOf(range.start,range.end),fixed=await fix(range,button);
      if(fixed&&state){state.quote={ref:fixed.ref,label:L('选区')+' · '+label,title:state.title+' · '+label};paintHeld();}
    };
    const choosePassage=(button)=>{
      unlist();
      const list=passages().slice(0,200);if(!list.length)return;
      const box=document.createElement('ul');box.className='side-materials-passages';box.setAttribute('role','listbox');box.setAttribute('aria-label',L('选一段'));box.setAttribute('data-'+name+'-passages','');box.tabIndex=0;
      list.forEach((item,index)=>{const row=document.createElement('li');row.setAttribute('role','option');row.id=name+'-passage-'+index;row.textContent=item.text.slice(0,120);row.dataset.index=String(index);box.append(row);});
      let at=0;const mark=()=>{box.querySelectorAll('[role=option]').forEach((row,index)=>row.setAttribute('aria-selected',String(index===at)));box.setAttribute('aria-activedescendant',name+'-passage-'+at);box.children[at]?.scrollIntoView({block:'nearest'});};
      const done=(item)=>{box.remove();button.focus();if(item)void quote(item,button);};
      box.addEventListener('keydown',event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();at=Math.max(0,Math.min(list.length-1,at+(event.key==='ArrowDown'?1:-1)));mark();}
        else if(event.key==='Enter'){event.preventDefault();done(list[at]);}
        else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();done(null);}
      });
      box.addEventListener('click',event=>{const row=event.target.closest?.('[role=option]');if(row)done(list[Number(row.dataset.index)]);});
      tools.append(box);mark();box.focus();
    };
    const add=()=>{
      if(!state)return;
      const item=state.quote||state.pinned||{ref:{subject:state.subject,pin:{mode:'current',read_revision:state.revision}},title:state.title};
      // A quote's title already says where it is; a snapshot says so in its hint.
      if(take){take({ref:item.ref,title:item.title||state.title,hint:item.title&&item.title!==state.title?'':item.label||''});return;}
      document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{source:{surface:'materials',title:L('项目资料')},materials:[{title:item.title||state.title,ref:item.ref}]}}));
    };
    const act=async(action,button)=>{
      if(!state)return;
      say(null);
      if(action==='next'){await next(button);return;}
      if(action==='drop'){state.quote=null;state.pinned=null;paintHeld();return;}
      if(action==='quote'){const range=selected();if(range==='split'){say(new Error(L('选区跨了两段，请在一段里选')));return;}if(range)await quote(range,button);else choosePassage(button);return;}
      if(action==='pin'){const fixed=await fix({start:0},button);if(fixed&&state){state.pinned={ref:fixed.ref,label:L('固定快照'),title:state.title};state.quote=null;paintHeld();}return;}
      if(action==='add')add();
    };
    // Pressing 引用选区 must not move focus off the text: where the text sits in a focused box (the picker), that clears the selection.
    tools.addEventListener('mousedown',event=>{if(event.target?.closest?.(sel('quote')))event.preventDefault();});
    for(const container of [tools,held,body])container.addEventListener('click',event=>{const button=event.target?.closest?.(sel());if(button)void act(button.getAttribute('data-'+name),button);});
    return {open,close,say};
  };`.replace(/^[ \t]*\/\/.*\n/gm, "").replace(/^[ \t]+/gm, "");
