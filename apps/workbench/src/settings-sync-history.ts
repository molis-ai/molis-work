/** Runs in the existing settings binding; it adds no global or independent page. */
export const SYNC_CLOUD_HISTORY_SCRIPT=String.raw`
    const historyList=(title,read,row)=>{
      const spaceId=state?.policy?.spaceId,body=node('div',''),problem=node('p','settings-form-error'),loading=node('p','settings-muted mw-loading',L('正在读取…')),dialog=sheet(title,body,[]);problem.setAttribute('role','alert');problem.dataset.syncHistoryProblem='';problem.hidden=true;body.append(problem,loading);
      let cursor,pending=false,count=0,more;
      const load=async()=>{
        if(pending)return;pending=true;problem.hidden=true;loading.hidden=false;if(more)more.disabled=true;
        try{const page=await read(cursor);if(!dialog.isConnected||state?.policy?.spaceId!==spaceId)return;
          more?.remove();for(const item of page.items){const entry=row(item,dialog);entry.style.display='grid';entry.style.gridTemplateColumns='minmax(0,1fr) auto';body.append(entry);count++;}
          if(!count)body.append(node('p','settings-muted',L('暂无保留版本')));
          if(page.more){cursor=page.next;more=button('加载更多',load);body.append(more);}else more=null;
        }catch(failure){if(dialog.isConnected){problem.textContent=L(failure.message);problem.hidden=false;if(!more){more=button('重试',load);body.append(more);}}}
        finally{pending=false;loading.hidden=true;if(more)more.disabled=false;}
      };
      void load();return dialog;
    };
    const historyKey=(key,compact=false)=>{const label=node('code','',key);label.style.overflowWrap='anywhere';label.style.minWidth='0';if(compact){label.style.whiteSpace='nowrap';label.style.overflow='hidden';label.style.textOverflow='ellipsis';label.title=key;}return label;};
    const cloudHistory=(collection)=>{
      const ns=namespace(collection.selection),spaceId=state?.policy?.spaceId,query='?namespace='+encodeURIComponent(ns);
      const keys=historyList('云端保留版本',after=>request('/history/keys'+query+(after===undefined?'':'&after='+encodeURIComponent(after))),item=>{
        const entry=node('div','settings-setting-row');entry.append(historyKey(item.key,true),button('查看版本',()=>{
          const versions=historyList('云端保留版本',before=>request('/history'+query+'&key='+encodeURIComponent(item.key)+(before===undefined?'':'&before='+before)),version=>{
            const row=node('div','settings-setting-row'),label=L('版本')+' '+version.revision+' · '+new Date(version.createdAt).toLocaleString()+(version.current?' · '+L('当前版本'):'');
            row.append(node('span','',label),button('查看',async()=>{
              try{
              const view=await request('/history/version'+query+'&key='+encodeURIComponent(item.key)+'&revision='+version.revision);
              if(!versions.isConnected||state?.policy?.spaceId!==spaceId)return;
              const body=node('div',''),text=JSON.stringify(view.value,null,2)||'null';body.append(historyKey(view.key),node('pre','settings-connection-output',text.length>20000?text.slice(0,20000)+'\n… '+L('内容预览已省略较长部分'):text));
              const value={namespace:ns,key:view.key,sourceRevision:view.revision,revision:view.currentRevision},operationId=crypto.randomUUID();
              const close=()=>{versions.close();keys.close();requestAnimationFrame(()=>{if(root.isConnected&&!document.querySelector('[data-sync-dialog][open]'))root.querySelector('[data-sync-run]')?.focus();});};
              body.append(node('p','settings-muted',L('永久清理暂未开放，保留内容仍计入云端容量。')));
              const actions=view.revision===view.currentRevision?[]:[['恢复为当前版本',async()=>{await act(()=>request('/history/restore',{...value,operationId},'POST'),false,true);close();}]];
              const preview=sheet('云端保留版本',body,actions);if(actions.length)preview.querySelector('footer button').classList.replace('mw-btn--secondary','mw-btn--primary');
              }catch(failure){if(versions.isConnected){const problem=versions.querySelector('[data-sync-history-problem]');problem.hidden=false;problem.textContent=L(failure.message);}}
            }));return row;
          });
        }));return entry;
      });
    };
`;
