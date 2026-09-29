export const PLUGIN_EVENT_RECOVERY_CLIENT = `(host, market) => {
  const root=market.querySelector('[data-plugin-events]'), L=host.translate;
  const lifetime=host.mountPluginClient(root); if(!lifetime)return {scope:()=>{}};
  const q=selector=>root.querySelector(selector), dialog=q('[data-plugin-event-dialog]'), form=q('[data-plugin-event-form]');
  const status=q('[data-plugin-events-status]'), error=q('[data-plugin-event-error]');
  let rows=[], selected=null, fresh=false, busy=false, viewSignal, reading=0;
  const key=row=>JSON.stringify([row.cursor.subscriber_plugin_id,row.cursor.subscriber_install_id,row.cursor.subscriber_generation,row.cursor.source_plugin_id,row.cursor.event_type_id,row.cursor.type_version]);
  const message=text=>{error.textContent=text;error.hidden=!text;};
  const node=(tag,text,className)=>{const item=document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;};
  const sync=()=>{
    form.querySelectorAll('button,textarea,input').forEach(item=>{item.disabled=busy;});
    form.querySelector('[type=submit]').disabled=busy||!fresh||!selected?.can_recover;
    form.querySelector('[type=submit]').textContent=L(busy?'正在保存…':'确认处理');
    q('[data-plugin-events-refresh]').disabled=busy;
  };
  const describe=()=>{
    q('[data-plugin-event-description]').textContent=selected
      ? selected.subscriber_name+' · '+L('来自')+' '+selected.source_name+' · '+(selected.event?.occurred_at?new Date(selected.event.occurred_at).toLocaleString():'') : L('这条通知已处理或不再可用，请关闭后查看列表。');
    q('[data-plugin-event-payload]').textContent=selected?JSON.stringify({source:selected.cursor.source_plugin_id,event:selected.event,error:selected.cursor.last_error_code},null,2):'';
    if(selected&&!selected.can_recover)message(L(selected.unavailable_reason));
    sync();
  };
  const paint=(history=[])=>{
    q('[data-plugin-events-list]').replaceChildren(...rows.map((row,index)=>{
      const item=node('div','','plugin-event-row'), copy=node('div','');
      copy.append(node('strong',row.subscriber_name),node('p',L('来自')+' '+row.source_name+' · '+(row.event?.occurred_at?new Date(row.event.occurred_at).toLocaleString():'')));
      if(row.unavailable_reason)copy.append(node('small',L(row.unavailable_reason)));
      const button=node('button',L('查看并核对'),'mw-btn mw-btn--secondary');button.type='button';button.dataset.pluginEventOpen=String(index);
      item.append(copy,button);return item;
    }));
    q('[data-plugin-events-history]').hidden=!history.length;
    q('[data-plugin-events-history-list]').replaceChildren(...history.map(record=>node('p',
      new Date(record.resolved_at).toLocaleString()+' · '+record.actor_id+' · '+L(record.decision==='skip'?'已跳过':'已请求重试')+' · '+record.event_id+' · '+record.reason)));
  };
  const load=async(reselect=false)=>{
    if(busy||!lifetime.visible)return;
    const epoch=++reading, oldKey=selected&&key(selected), signal=viewSignal;fresh=false;sync();status.textContent=L('正在读取插件通知…');
    try{
      const response=await lifetime.fetch(host.route('/api/plugins/runtime/events'),{cache:'no-store',signal});
      const body=await response.json();lifetime.assertCurrent(signal);if(epoch!==reading)return;
      if(!response.ok)throw Error(body.error||L('无法读取插件通知，请重新读取。'));
      rows=body.pending||[];paint(body.history||[]);status.textContent=rows.length?L('有通知需要核对，其他插件可继续使用。'):L('没有待核对的通知。');
      if(reselect&&oldKey){selected=rows.find(row=>key(row)===oldKey)||null;form.elements.decision.forEach(item=>{item.checked=false;});message('');describe();}
      fresh=true;sync();
    }catch(cause){if(epoch===reading&&!signal?.aborted&&lifetime.alive){status.textContent=cause.message; if(dialog.open)message(cause.message);fresh=false;sync();}}
  };
  lifetime.whenVisible(signal=>{viewSignal=signal;void load();return()=>{reading++;fresh=false;if(dialog.open)dialog.close();};});
  lifetime.listen(root,'click',event=>{
    const open=event.target.closest('[data-plugin-event-open]');
    if(open&&!busy){selected=rows[Number(open.dataset.pluginEventOpen)];form.reset();message('');describe();dialog.showModal();form.elements.reason.focus();return;}
    if(event.target.closest('[data-plugin-event-cancel]')&&!busy){dialog.close();return;}
    if(event.target.closest('[data-plugin-events-refresh], [data-plugin-event-reload]'))void load(dialog.open);
  });
  lifetime.listen(dialog,'cancel',event=>{if(busy)event.preventDefault();});
  lifetime.listen(form,'submit',async event=>{
    event.preventDefault();if(busy||!fresh||!selected?.can_recover||!form.reportValidity())return;
    const data=new FormData(form), cursor=selected.cursor, signal=viewSignal;
    const input={subscriber_plugin_id:cursor.subscriber_plugin_id,source_plugin_id:cursor.source_plugin_id,event_type_id:cursor.event_type_id,type_version:cursor.type_version,
      expected_revision:cursor.revision,expected_install_id:cursor.subscriber_install_id,expected_generation:cursor.subscriber_generation,expected_version:selected.subscriber_version,
      event_id:selected.event.event_id,reason:String(data.get('reason')||''),decision:String(data.get('decision')||'')};
    busy=true;sync();message('');
    try{
      const response=await lifetime.fetch(host.route('/api/plugins/runtime/events/recover'),{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify(input),signal});
      const body=await response.json();lifetime.assertCurrent(signal);
      if(!response.ok)throw Error(body.error||L('无法确认处理结果，请重新读取后核对。'));
      dialog.close();selected=null;busy=false;await load();
    }catch(cause){if(!signal?.aborted&&lifetime.alive){fresh=false;message(cause.message);}}
    finally{busy=false;if(lifetime.alive)sync();}
  });
  return {scope:enabled=>{root.hidden=!enabled;}};
}`;
