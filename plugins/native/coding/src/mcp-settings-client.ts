export const CODING_MCP_SETTINGS_CLIENT_SCRIPT = `(() => {
  const bindings=new WeakMap();
  const bind=scope=>{
    const root=scope.querySelector('[data-coding-mcp-settings]');if(!root)return;if(bindings.has(root)){bindings.get(root)();return;}
    const q=selector=>root.querySelector(selector),form=q('[data-mcp-config]'),field=name=>form.elements.namedItem(name);
    const prefix=root.dataset.prefix+'api/plugins/io.molis.work.coding';let servers=[],workspaces=[],authConnections=[],editing=null;
    const pending=new Map(),status=text=>{q('[data-mcp-status]').textContent=text;};
    const api=async(path,body)=>{const response=await fetch(prefix+path,{method:body?'POST':'GET',cache:'no-store',...(body?{headers:molisWorkControlHeaders(),body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error || 'MCP 操作失败');return result;};
    const transport=()=>{q('[data-mcp-stdio]').hidden=field('transport').value!=='stdio';q('[data-mcp-http]').hidden=field('transport').value!=='http';};
    const reset=()=>{editing=null;form.reset();q('[data-mcp-form-title]').textContent='添加 MCP 服务';transport();};
    const edit=server=>{
      editing={id:server.id,version:server.version};q('[data-mcp-form-title]').textContent='编辑 '+server.label;
      field('label').value=server.label;field('transport').value=server.transport;field('enabled').checked=server.enabled;field('timeout').value=server.timeout_ms;
      field('executable').value=server.executable || '';field('argv').value=JSON.stringify(server.argv || []);field('endpoint').value=server.endpoint || '';
      field('auth').value=server.auth_connection_id?'connection':server.credential==='present'?'keep-existing':'none';
      field('auth_connection_id').value=server.auth_connection_id||'';
      field('workspace').value=workspaces.find(item=>item.canonical_path===server.directory?.canonical_path)?.workspace_id || '';
      transport();field('label').focus();
    };
    const render=()=>{
      const list=q('[data-mcp-servers]'),key=JSON.stringify([servers,[...pending]]);if(list.dataset.key===key)return;list.dataset.key=key;
      const opened=new Set([...list.querySelectorAll('details[open]')].map(item=>item.dataset.server));list.replaceChildren();
      for(const server of servers){
        const row=document.createElement('details');row.dataset.server=server.id;row.open=opened.has(server.id);
        const heading=document.createElement('summary');heading.textContent=server.label+' · '+(server.enabled?({connected:'已连接',disconnected:'未连接',unavailable:'连接不可用','not-reattached':'需要重新连接'}[server.health] || server.health):'已停用');row.append(heading);
        const info=document.createElement('p');info.textContent=server.transport==='stdio'?server.executable+' '+JSON.stringify(server.argv):server.endpoint;row.append(info);
        const error=document.createElement('p');error.textContent=server.error || '';error.setAttribute('role','status');row.append(error);
        const tools=document.createElement('ul');for(const tool of server.tools){const item=document.createElement('li');item.textContent=tool.tool+'：'+tool.description;tools.append(item);}row.append(tools);const resources=document.createElement('ul');for(const uri of server.resources || []){const item=document.createElement('li');item.textContent='资料：'+uri;resources.append(item);}row.append(resources);
        const actions=document.createElement('div');actions.className='mw-form__actions';row.append(actions);
        const busy=pending.get(server.id) || server.busy;
        const add=(label,action)=>{const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--secondary';button.textContent=label;button.setAttribute('aria-label',label+' '+server.label);button.addEventListener('click',()=>void action());actions.append(button);};
        if(!busy){
          add('编辑',()=>edit(server));
          if(server.enabled && server.health!=='connected')add('连接',()=>control(server,'connect'));
          if(server.health==='connected')add('断开',()=>control(server,'disconnect'));
          add('移除配置',()=>control(server,'remove'));
        }else if(busy==='connect')add('取消连接',()=>control(server,'cancel'));
        const note=document.createElement('p');note.textContent=busy?'正在处理：'+({connect:'连接',disconnect:'断开',remove:'移除配置',save:'保存'}[busy] || busy):'';row.append(note);list.append(row);
      }
      if(!servers.length)list.textContent='当前项目没有 MCP 配置。';
    };
    const refresh=async()=>{
      const result=await api('/state');servers=result.mcp || [];workspaces=result.workspaces;
      const authResponse=await fetch('/api/settings/connectors/connections?service_id=mcp-bearer',{cache:'no-store'});
      if(authResponse.ok){const data=await authResponse.json();authConnections=data.connections||[];const auth=field('auth_connection_id'),current=auth.value;auth.innerHTML='<option value="">选择连接</option>'+authConnections.filter(item=>item.state==='connected').map(item=>'<option value="'+item.connection_id+'">'+item.display_name.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</option>').join('');auth.value=current;}
      const select=field('workspace'),key=JSON.stringify(workspaces),previous=select.value;
      if(select.dataset.options!==key){select.replaceChildren(...workspaces.map(item=>{const option=document.createElement('option');option.value=item.workspace_id;option.textContent=item.canonical_path;return option;}));select.dataset.options=key;if(workspaces.some(item=>item.workspace_id===previous))select.value=previous;}
      render();
    };
    const control=async(server,action)=>{
      if(pending.has(server.id) && action!=='cancel')return;
      if(action!=='cancel')pending.set(server.id,action);render();status('正在'+({connect:'连接',disconnect:'断开',cancel:'取消连接',remove:'移除配置'}[action])+'…');
      try{await api('/mcp/'+encodeURIComponent(server.id)+'/control',{action});status(action==='connect'?'MCP 已连接；在会话中选择本轮工具或资料后才会提供给模型。':action==='remove'?'配置已移除；历史执行记录保留。':'操作已确认。');}
      catch(error){status(error.message);}finally{if(action!=='cancel')pending.delete(server.id);await refresh().catch(error=>status(error.message));render();}
    };
    form.addEventListener('submit',async event=>{
      event.preventDefault();const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;
      try{
        const body={...(editing?{id:editing.id}:{}),expected_version:editing?.version ?? 0,label:field('label').value,transport:field('transport').value,enabled:field('enabled').checked,timeout_ms:Number(field('timeout').value)};
        if(body.transport==='stdio'){body.workspace_id=field('workspace').value;body.executable=field('executable').value;try{body.argv=JSON.parse(field('argv').value);}catch{throw new Error('参数必须填写 JSON 数组，例如 ["server.mjs"]');}}
        else{body.endpoint=field('endpoint').value;body.auth={kind:field('auth').value,...(field('auth').value==='connection'?{connection_id:field('auth_connection_id').value}:{})};}
        await api('/mcp',body);reset();await refresh();status('MCP 配置已保存，尚未连接；展开服务可连接。');
      }catch(error){status(error.message);}finally{submit.disabled=false;}
    });
    field('transport').addEventListener('change',transport);q('[data-mcp-reset]').addEventListener('click',reset);
    let poll=null;
    const resume=()=>{
      void refresh().then(()=>status('MCP 配置已读取。')).catch(error=>status('MCP 状态暂不可读：'+error.message));
      if(poll!==null)return;poll=setInterval(()=>{if(!root.isConnected){clearInterval(poll);poll=null;return;}void refresh().catch(error=>status('MCP 状态暂不可读：'+error.message));},3000);
    };
    bindings.set(root,resume);resume();
  };
  bind(document);document.addEventListener('molis-work:settings-embed',event=>bind(event.detail.root));
})();`;
