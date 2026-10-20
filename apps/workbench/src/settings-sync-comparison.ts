/** Read-only field comparison. It never merges or interprets a version as execution authority. */
export const SYNC_COMPARISON_SCRIPT=String.raw`
    const comparison=(view,collection)=>{
      const body=node('div',''),labels={title:'标题',name:'名称',body:'正文',markdown:'正文',content:'内容',text:'文本',description:'说明',state:'状态',status:'状态',questions:'问题',answers:'回答',submissions:'提交记录',children:'子项',record:'记录',facts:'业务内容',project:'项目',plugins:'插件',events:'历史记录',references:'关联',created_at:'创建时间',updated_at:'更新时间'};
      const scalar=value=>value===undefined?L('不存在'):value===null?L('已删除'):typeof value==='string'?value:JSON.stringify(value);
      const changes=[];let visited=0,limited=false;
      const walk=(a,b,path)=>{
        if(++visited>5000){limited=true;return;}if(JSON.stringify(a)===JSON.stringify(b))return;
        const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
        if(object(a)&&object(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],[...path,labels[key]?L(labels[key]):key]);return;}
        changes.push({path:path.join(' › ')||L('整项内容'),a,b});
      };walk(view.local,view.remote,[]);
      body.append(node('p','settings-muted',collection.title+' · '+L('变化字段')+' '+changes.length+(limited?' · '+L('部分差异未展开'):'')));
      const table=node('table',''),head=node('tr','');for(const label of ['字段','本机版本','云端版本'])head.append(node('th','',L(label)));table.append(head);table.style.width='100%';table.style.tableLayout='fixed';
      for(const change of changes){const row=node('tr','');row.append(node('th','',change.path));for(const value of [change.a,change.b]){const cell=node('td',''),text=scalar(value),pre=node('pre','settings-connection-output',text.length>2000?text.slice(0,2000)+'\n…':text);pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';cell.append(pre);if(text.length>2000)cell.append(button('展开完整内容',()=>{pre.textContent=text;}));row.append(cell);}table.append(row);}body.append(table);
      const raw=node('details','settings-data-disclosure');raw.append(node('summary','',L('完整版本')));
      for(const [side,label] of [['local','本机版本'],['remote','云端版本']]){
        const text=JSON.stringify(view[side],null,2)||'null';raw.append(node('h3','',L(label)),node('pre','settings-connection-output',text.length>20000?text.slice(0,20000)+'\n… '+L('内容预览已省略较长部分'):text));
        raw.append(button('导出完整版本',()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=node('a','');link.href=url;link.download='sync-'+side+'-'+view.revision+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
      }body.append(raw);
      if(view.location){const target=new URL(view.location,location.origin);if(target.origin===location.origin&&target.protocol===location.protocol){const link=node('a','mw-btn mw-btn--secondary',L('定位当前内容'));link.href=target.pathname+target.search+target.hash;body.prepend(link);}}
      return body;
    };
`;
