/** Uses the same settings lifetime, request gate and explicit confirmation sheets. */
export const SYNC_PROJECT_RECYCLE_SCRIPT=String.raw`
    root.querySelector('[data-sync-projects]').addEventListener('click',async()=>{
      try{
        const response=await request('/recycle',undefined,'GET','/api/settings/projects'),spaceId=state?.policy?.spaceId,body=node('div','');
        if(!root.isConnected)return;
        if(!response.items.length)body.append(node('p','settings-muted',L('暂无项目')));
        for(const item of response.items){
          const row=node('section','settings-section'),action=item.recycled?'恢复项目':'移入回收站',operationId=crypto.randomUUID();
          row.append(node('h3','',item.display_name),node('p','settings-muted',L(item.recycled?'已回收':'正常')));
          row.append(button(action,()=>sheet(action,node('p','',L(item.recycled?'恢复后不会自动启动任务或终端。':'项目内容会保留，删除状态将在同步后传播。')),[
            [action,async()=>{if(state?.policy?.spaceId!==spaceId)throw new Error(L('同步状态已变化'));
              await request('/'+encodeURIComponent(item.project_id)+'/recycle',{recycled:!item.recycled,confirmed:true,expected_state:item.state,operation_id:operationId},'POST','/api/settings/projects');
              row.remove();root.querySelector('[data-sync-reload]')?.click();}]
          ])));body.append(row);
        }
        sheet('项目回收',body,[]);
      }catch(failure){error.hidden=false;error.textContent=L(failure.message);}
    });
`;
