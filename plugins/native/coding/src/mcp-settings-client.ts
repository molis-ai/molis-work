export const CODING_MCP_SETTINGS_CLIENT_SCRIPT = `(() => {
  const L=globalThis.L||(key=>key);
  const bindings=new WeakMap();
  const bind=scope=>{
    const root=scope.querySelector('[data-coding-mcp-settings]');if(!root)return;if(bindings.has(root)){bindings.get(root)();return;}
    const q=selector=>root.querySelector(selector),form=q('[data-mcp-config]'),field=name=>form.elements.namedItem(name);
    const prefix=root.dataset.prefix+'api/plugins/io.molis.work.coding';let servers=[],workspaces=[],authConnections=[],editing=null;
    const ACTIONS={connect:L('coding.mcp-config.connect'),disconnect:L('coding.mcp-config.disconnect'),remove:L('coding.mcp-config.remove'),cancel:L('coding.mcp-config.cancel'),save:L('coding.meter.save')};
    const pending=new Map(),status=text=>{q('[data-mcp-status]').textContent=text;};
    const api=async(path,body)=>{const response=await fetch(prefix+path,{method:body?'POST':'GET',cache:'no-store',...(body?{headers:molisWorkControlHeaders(),body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok){const error=new Error(result.error || L('coding.mcp-config.failed'));error.code=result.code;throw error;}return result;};
    const transport=()=>{q('[data-mcp-stdio]').hidden=field('transport').value!=='stdio';q('[data-mcp-http]').hidden=field('transport').value!=='http';};
    const reset=()=>{editing=null;form.reset();q('[data-mcp-form-title]').textContent=L('coding.mcp-config.add');transport();};
    const edit=server=>{
      editing={id:server.id,version:server.version};q('[data-mcp-form-title]').textContent=L('coding.mcp-config.edit-title',{name:server.label});
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
        const heading=document.createElement('summary');heading.textContent=server.label+' · '+(server.enabled?({connected:L('coding.mcp-config.health.connected'),disconnected:L('coding.mcp-config.health.disconnected'),unavailable:L('coding.mcp-config.health.unavailable'),'not-reattached':L('coding.mcp-config.health.not-reattached')}[server.health] || server.health):L('coding.mcp-config.disabled'));row.append(heading);
        const info=document.createElement('p');info.textContent=server.transport==='stdio'?server.executable+' '+JSON.stringify(server.argv):server.endpoint;row.append(info);
        const error=document.createElement('p');error.textContent=server.error || '';error.setAttribute('role','status');row.append(error);
        const tools=document.createElement('ul');for(const tool of server.tools){const item=document.createElement('li');item.textContent=tool.tool+L('coding.timeline.colon')+tool.description;tools.append(item);}row.append(tools);const resources=document.createElement('ul');for(const uri of server.resources || []){const item=document.createElement('li');item.textContent=L('coding.mcp-config.resource',{uri});resources.append(item);}row.append(resources);
        const actions=document.createElement('div');actions.className='mw-form__actions';row.append(actions);
        const busy=pending.get(server.id) || server.busy;
        const add=(label,action)=>{const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--secondary';button.textContent=label;button.setAttribute('aria-label',L('coding.mcp-config.action-label',{action:label,name:server.label}));button.addEventListener('click',()=>void action());actions.append(button);};
        if(!busy){
          add(L('coding.mcp-config.edit'),()=>edit(server));
          if(server.enabled && server.health!=='connected')add(ACTIONS.connect,()=>control(server,'connect'));
          if(server.health==='connected')add(ACTIONS.disconnect,()=>control(server,'disconnect'));
          add(ACTIONS.remove,()=>control(server,'remove'));
        }else if(busy==='connect')add(ACTIONS.cancel,()=>control(server,'cancel'));
        const note=document.createElement('p');note.textContent=busy?L('coding.mcp-config.busy',{action:ACTIONS[busy] || busy}):'';row.append(note);list.append(row);
      }
      if(!servers.length)list.textContent=L('coding.mcp-config.none');
    };
    const refresh=async()=>{
      const result=await api('/state');servers=result.mcp || [];workspaces=result.workspaces;
      const authResponse=await fetch('/api/settings/connectors/connections',{cache:'no-store'});
      if(authResponse.ok){const data=await authResponse.json();authConnections=(data.connections||[]).filter(item=>item.service_id==='mcp-bearer'||(item.auth_method==='mcp'&&item.agent_available!==false));const auth=field('auth_connection_id'),current=auth.value;auth.innerHTML='<option value="">'+L('coding.mcp-config.choose-connection')+'</option>'+authConnections.filter(item=>item.state==='connected').map(item=>'<option value="'+item.connection_id+'">'+item.display_name.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</option>').join('');auth.value=current;}
      const select=field('workspace'),key=JSON.stringify(workspaces),previous=select.value;
      if(select.dataset.options!==key){select.replaceChildren(...workspaces.map(item=>{const option=document.createElement('option');option.value=item.workspace_id;option.textContent=item.canonical_path;return option;}));select.dataset.options=key;if(workspaces.some(item=>item.workspace_id===previous))select.value=previous;}
      render();
    };
    const control=async(server,action)=>{
      if(pending.has(server.id) && action!=='cancel')return;
      if(action!=='cancel')pending.set(server.id,action);render();status(({connect:L('coding.mcp-config.doing.connect'),disconnect:L('coding.mcp-config.doing.disconnect'),cancel:L('coding.mcp-config.doing.cancel'),remove:L('coding.mcp-config.doing.remove')})[action]);
      try{await api('/mcp/'+encodeURIComponent(server.id)+'/control',{action});status(action==='connect'?L('coding.mcp-config.connected'):action==='remove'?L('coding.mcp-config.removed'):L('coding.mcp-config.confirmed'));}
      catch(error){status(error.message);}finally{if(action!=='cancel')pending.delete(server.id);await refresh().catch(error=>status(error.message));render();}
    };
    form.addEventListener('submit',async event=>{
      event.preventDefault();const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;
      try{
        const body={...(editing?{id:editing.id}:{}),expected_version:editing?.version ?? 0,label:field('label').value,transport:field('transport').value,enabled:field('enabled').checked,timeout_ms:Number(field('timeout').value)};
        if(body.transport==='stdio'){body.workspace_id=field('workspace').value;body.executable=field('executable').value;try{body.argv=JSON.parse(field('argv').value);}catch{throw new Error(L('coding.mcp-config.argv-json'));}}
        else{body.endpoint=field('endpoint').value;body.auth={kind:field('auth').value,...(field('auth').value==='connection'?{connection_id:field('auth_connection_id').value}:{})};}
        await api('/mcp',body);reset();await refresh();status(L('coding.mcp-config.saved'));
      }catch(error){status(error.message);}finally{submit.disabled=false;}
    });
    field('auth_connection_id').addEventListener('change',()=>{
      const selected=authConnections.find(item=>item.connection_id===field('auth_connection_id').value);
      if(selected?.mcp_endpoint){field('endpoint').value=selected.mcp_endpoint;field('auth').value='connection';if(!field('label').value.trim())field('label').value=selected.display_name;}
    });
    field('transport').addEventListener('change',transport);q('[data-mcp-reset]').addEventListener('click',reset);
    let poll=null;
    const unavailable=(error,off)=>{
      status(L('coding.mcp-config.unreadable',{reason:error.message}));
      if(!off&&error.code!=='actions.plugin_disabled')return;
      if(poll!==null){clearInterval(poll);poll=null;}
      status(L('coding.mcp-config.not-enabled'));
      const enable=document.createElement('button');enable.type='button';enable.className='mw-btn mw-btn--secondary';enable.textContent=L('coding.mcp-config.enable');
      enable.addEventListener('click',async()=>{
        enable.disabled=true;
        try{
          const project=new URL(root.dataset.prefix,location.origin).pathname.split('/').filter(Boolean)[1];
          if(!project)throw new Error(L('coding.mcp-config.choose-project'));
          const response=await fetch('/api/settings/projects/'+encodeURIComponent(project)+'/plugins',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({plugin_id:'coding'})});
          if(!response.ok)throw new Error((await response.json()).error || L('coding.mcp-config.enable-failed'));
          location.reload();
        }catch(error){unavailable(error,1);}
      });
      q('[data-mcp-status]').append(' ',enable);
    };
    const resume=()=>{
      void refresh().then(()=>status(L('coding.mcp-config.read'))).catch(unavailable);
      if(poll!==null)return;poll=setInterval(()=>{if(!root.isConnected){clearInterval(poll);poll=null;return;}void refresh().catch(unavailable);},3000);
    };
    transport();bindings.set(root,resume);resume();
  };
  bind(document);document.addEventListener('molis-work:settings-embed',event=>bind(event.detail.root));
})();`;
