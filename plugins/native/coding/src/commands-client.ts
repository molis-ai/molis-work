/**
 * Doing things from the keyboard: a slash menu in the composer, a command palette, and shortcuts for the moves people
 * make most — switching sessions, starting one, opening results. The commands are the same everywhere, so learning one
 * surface teaches the others. Nothing here runs a round; sending stays the person's explicit act.
 */
export const CODING_COMMANDS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,input,commands,sessions,openSession,current}=ports;
  const mac=/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keyLabel=(keys)=>keys.replace(/Mod/g,mac?'⌘':'Ctrl').replace(/Alt/g,mac?'⌥':'Alt').replace(/Shift/g,mac?'⇧':'Shift').replace(/\\+/g,mac?'':'+');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  // Loose matching: every typed character in order, so "ctx" finds "上下文与用量 /usage" by its slash word too.
  const matches=(needle,...hay)=>{const word=needle.toLowerCase().trim();if(!word)return true;return hay.some(text=>{const value=String(text||'').toLowerCase();if(value.includes(word))return true;let at=0;for(const char of value){if(char===word[at])at++;if(at===word.length)return true;}return false;});};
  const run=async(command)=>{try{await command.run();}catch(error){ports.status(error.message,true);}};

  // The slash menu: "/" at the start of an empty composer lists commands; typing narrows them.
  const menu=q('[data-coding-slash-menu]');let items=[],active=0;
  const close=()=>{menu.hidden=true;menu.replaceChildren();input.removeAttribute('aria-activedescendant');items=[];};
  const draw=()=>{
    menu.replaceChildren();menu.hidden=false;menu.setAttribute('aria-label',mention?'工作区文件':'命令');
    items.forEach((item,index)=>{const option=el('div','coding-slash-item'+(mention?' is-file':''));option.id='coding-slash-'+index;option.setAttribute('role','option');option.setAttribute('aria-selected',String(index===active));
      if(mention&&typeof item==='object')option.append(el('span','coding-slash-label',item.name),el('span','coding-slash-hint',item.kind+' · 第 '+item.line+' 行'));
      else if(mention){const slash=item.lastIndexOf('/');option.append(el('span','coding-slash-label',item.slice(slash+1)),el('span','coding-slash-hint',slash>0?item.slice(0,slash):''));}
      else option.append(el('code','','/'+item.slug),el('span','coding-slash-label',item.label),el('span','coding-slash-hint',item.hint || ''));
      option.addEventListener('mousedown',event=>{event.preventDefault();pick(index);});menu.append(option);});
    if(mention && !items.length)menu.append(el('p','coding-slash-empty',mention.file!==undefined?(symbolsError || (symbols.has(symbolKey())?'这个文件里没有匹配的定义':'正在读取文件里的定义…')):(filesError || (files?'没有匹配的文件':'正在读取工作区文件…'))));
    input.setAttribute('aria-activedescendant',items.length?'coding-slash-'+active:'');menu.children[active]?.scrollIntoView({block:'nearest'});
  };
  // "@" at the start of a word names a workspace file; basename matches rank first, then the whole path.
  // Chinese punctuation mode types "、" for "/" and may type "＠" for "@"; both open the same menus.
  let mention=null,files=null,filesFor='',filesError='';
  // "@path#name" names one definition in a file: after "#", the menu lists that file's functions, classes and types.
  const symbols=new Map();let symbolsError='';
  const symbolKey=()=>ports.workspace()+'\u0000'+(mention?.file ?? '');
  const loadSymbols=async(file)=>{const key=ports.workspace()+'\u0000'+file;if(symbols.has(key) || !ports.symbols || !ports.workspace())return;symbols.set(key,null);symbolsError='';
    try{const value=await ports.symbols(ports.workspace(),file);symbols.set(key,value.symbols || []);if(value.unreadable)symbolsError='读不到这个文件';refresh();}catch(error){symbols.delete(key);symbolsError=error.message;refresh();}};
  const loadFiles=async()=>{const key=ports.workspace();if(!key){filesError='请先选择工作区';return;}if(filesFor===key && (files || !filesError))return;filesFor=key;files=null;filesError='';
    try{const value=await ports.files(key);if(filesFor===key){files=value.files;refresh();}}catch(error){if(filesFor===key){filesError=error.message;refresh();}}};
  const refresh=()=>{
    const before=input.value.slice(0,input.selectionStart ?? input.value.length),at=/(^|\\s)[@＠]([^\\s@＠]*)$/.exec(before);
    const hash=at?at[2].search(/[#＃]/):-1;
    if(at && hash>0){
      const file=at[2].slice(0,hash),word=at[2].slice(hash+1).toLowerCase();
      mention={start:before.length-at[2].length-1,query:at[2],file};void loadSymbols(file);
      items=(symbols.get(symbolKey()) || []).filter(symbol=>matches(word,symbol.name)).sort((a,b)=>Number(!a.name.toLowerCase().startsWith(word))-Number(!b.name.toLowerCase().startsWith(word)) || a.line-b.line).slice(0,12);
      active=Math.min(active,Math.max(items.length-1,0));draw();return;
    }
    if(at){
      mention={start:before.length-at[2].length-1,query:at[2]};void loadFiles();
      const word=at[2].toLowerCase(),base=(path)=>{const own=path.replace(/\\/$/,'');return own.slice(own.lastIndexOf('/')+1).toLowerCase();};
      items=(files || []).filter(path=>matches(word,path)).sort((a,b)=>Number(!base(a).startsWith(word))-Number(!base(b).startsWith(word)) || a.length-b.length).slice(0,12);
      active=Math.min(active,Math.max(items.length-1,0));draw();return;
    }
    mention=null;
    const typed=/^[\\/、](\\S*)$/.exec(input.value);if(!typed){close();return;}
    items=commands().filter(command=>command.enabled!==false && matches(typed[1],command.slash,command.label,...(command.keywords || []))).map(command=>({...command,slug:command.slash}));
    if(!items.length){close();return;}active=Math.min(active,items.length-1);draw();
  };
  const pick=(index)=>{const item=items[index];if(!item)return;
    if(mention){const text=typeof item==='object'?mention.file+'#'+item.name:item;const end=mention.start+1+mention.query.length,value=input.value.slice(0,mention.start)+'@'+text+' '+input.value.slice(end);input.value=value;const caret=mention.start+text.length+2;input.setSelectionRange(caret,caret);close();input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));close();void run(item);};
  input.setAttribute('aria-controls','coding-slash-menu');
  input.addEventListener('input',()=>{active=0;refresh();});
  input.addEventListener('click',()=>refresh());
  input.addEventListener('blur',()=>setTimeout(close,120));
  // Registered before the composer's own keys, so an open menu takes Enter, Tab and Esc (Esc never stops a round here).
  input.addEventListener('keydown',event=>{
    if(menu.hidden || event.isComposing || event.keyCode===229)return;
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){event.preventDefault();if(items.length){active=(active+(event.key==='ArrowDown'?1:items.length-1))%items.length;draw();}}
    else if((event.key==='Enter' || event.key==='Tab') && items.length){event.preventDefault();event.stopImmediatePropagation();pick(active);}
    else if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
  },true);

  // The palette: every command and every session, one list.
  const palette=q('[data-coding-palette]'),field=q('[data-coding-palette-input]'),list=q('[data-coding-palette-list]');let entries=[],selected=0,returnFocus=null;
  const drawPalette=()=>{
    const word=field.value;
    const all=[...commands().filter(command=>command.enabled!==false).map(command=>({kind:'命令',label:command.label,detail:'/'+command.slash,keys:command.keys,run:command.run,words:[command.slash,...(command.keywords || [])]})),
      ...sessions().filter(session=>session.session_id!==current()).map(session=>({kind:'会话',label:session.title,detail:session.state_label || '',run:()=>openSession(session.session_id,session.title),words:[]}))];
    entries=all.filter(entry=>matches(word,entry.label,entry.detail,...entry.words)).slice(0,60);selected=Math.min(selected,Math.max(entries.length-1,0));
    list.replaceChildren();
    if(!entries.length)list.append(el('li','coding-palette-empty','没有匹配的命令或会话'));
    entries.forEach((entry,index)=>{const item=el('li','coding-palette-item');item.id='coding-palette-'+index;item.setAttribute('role','option');item.setAttribute('aria-selected',String(index===selected));
      item.append(el('span','coding-palette-kind',entry.kind),el('span','coding-palette-label',entry.label),el('span','coding-palette-detail',entry.detail));if(entry.keys)item.append(el('kbd','mw-kbd',keyLabel(entry.keys)));
      item.addEventListener('mousedown',event=>{event.preventDefault();choose(index);});list.append(item);});
    field.setAttribute('aria-activedescendant',entries.length?'coding-palette-'+selected:'');list.children[selected]?.scrollIntoView({block:'nearest'});
  };
  const openPalette=()=>{if(palette.open)return;returnFocus=document.activeElement;field.value='';selected=0;drawPalette();palette.showModal();field.focus();};
  const closePalette=()=>{if(!palette.open)return;palette.close();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
  const choose=(index)=>{const entry=entries[index];if(!entry)return;palette.close();void run(entry);};
  field.addEventListener('input',()=>{selected=0;drawPalette();});
  field.addEventListener('keydown',event=>{
    if(event.isComposing || event.keyCode===229)return;
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){event.preventDefault();if(entries.length){selected=(selected+(event.key==='ArrowDown'?1:entries.length-1))%entries.length;drawPalette();}}
    else if(event.key==='Enter'){event.preventDefault();choose(selected);}
  });
  palette.addEventListener('cancel',event=>{event.preventDefault();closePalette();});
  palette.addEventListener('click',event=>{if(event.target===palette)closePalette();});

  // Shortcuts, chosen to stay clear of the browser's and the workbench's own (⌘K search, ⌘F find, tab switching).
  const editable=(target)=>target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const step=(delta)=>{const list=sessions(),at=list.findIndex(session=>session.session_id===current()),next=list[at<0?0:(at+delta+list.length)%list.length];if(next)void openSession(next.session_id,next.title);};
  document.addEventListener('keydown',event=>{
    if(!q('[data-coding-task]').isConnected || q('[data-coding-task]').closest('[hidden]'))return;
    const mod=event.metaKey || event.ctrlKey;
    if(mod && event.shiftKey && !event.altKey && event.key.toLowerCase()==='p'){event.preventDefault();palette.open?closePalette():openPalette();return;}
    if(palette.open || event.isComposing)return;
    if(mod && event.altKey && (event.key==='ArrowUp' || event.key==='ArrowDown')){event.preventDefault();step(event.key==='ArrowUp'?-1:1);return;}
    const byKeys=commands().find(command=>command.enabled!==false && command.keys && command.keys.startsWith('Mod+Alt+') && mod && event.altKey && event.code==='Key'+command.keys.slice(-1));
    if(byKeys){event.preventDefault();void run(byKeys);return;}
    if(event.key==='/' && !mod && !event.altKey && !editable(event.target) && !document.querySelector('dialog[open]')){event.preventDefault();input.focus();input.value='/';input.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  return {openPalette,closeMenu:close,keyLabel,shortcuts:()=>[['Mod+Shift+P','命令面板'],['Mod+Alt+↑ / ↓','上一个 / 下一个会话'],['/','在输入框打开命令'],['Mod+Enter','发送'],['Esc','停止这一轮']]};
}`;
