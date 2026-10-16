/**
 * The person's words to a round under way, and what became of each (specs/ai-input-receipts §3.3, §4.1, §4.2): how a
 * supplement is sent, the bubble it shows while on its way, and the receipt line under it. The line says only what the
 * run's own ledger says (sent, in the model's context, read, not read by the end of the round, taken back), never that
 * the model followed it. A note the Host sent reads as the Host's, never as the person's words, and has no receipt.
 *
 * Every supplement has a key from the moment it is sent. When the answer is lost (the connection dropped, or the reply
 * could not be read), the words and the mode stay in the composer and the bubble says to send again: the same words in
 * the same mode go under the same key, so the runtime returns the first one instead of taking it twice (§7). Changed
 * words are a new supplement. An answer the Host refused clears the bubble.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = `({api,refresh})=>{
  const SENT={'next-boundary':'已送达，当前回复或这批工具结束后交给 AI。',interrupt:'已送达：正在写的回复已丢掉，按你的话接着做；已执行的操作不撤销。','after-run':'已存好，下一轮开始时带上。'};
  const small=text=>{const node=document.createElement('small');node.className='coding-turn-receipt';node.textContent=text;return node;};
  let item=null;
  const send=async sent=>{
    sent.lost=0;item=sent;refresh();
    try{
      const {receipt}=await api('/sessions/'+encodeURIComponent(sent.id)+'/control','POST',{kind:'steer',run_id:sent.run,text:sent.text,key:sent.key,mode:sent.mode});
      if(item==sent)item=null;
      return receipt.replayed?'之前已送到，没有重复发送。':receipt.delivered=='queued'&&sent.mode!='after-run'?'这一轮刚结束，已存好，下一轮开始时带上。':SENT[sent.mode];
    }catch(error){if(error instanceof TypeError||error.name=='SyntaxError'){sent.lost=1;throw Error('没确认送到：连接断了，或回复读不出。')}if(item==sent)item=null;throw error;}
    finally{refresh();}
  };
  return {
    receipt:turn=>turn.kind=='notice'?turn.steer&&small('Molis 的说明，不是你发的话'):turn.steer&&Object.assign(small({applied:'已放进上下文，等 AI 回应',read:'AI 已读到',unread:'这一轮结束时 AI 没读到，留给下一轮',withdrawn:'已撤回'}[turn.steer.state]||'已送达'),{title:'读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。'}),
    steer(id,run,text,mode){
      return send({id,run,text,mode,key:item?.lost&&item.id==id&&item.text==text&&item.mode==mode?item.key:'send.'+crypto.randomUUID()});
    },
    bubble(id){
      if(item?.id!=id)return null;
      if(item.node?.dataset.lost!=item.lost){
        const node=item.node=document.createElement('article');node.className='coding-turn is-sending';node.dataset.kind='user';node.dataset.lost=item.lost;node.textContent=item.text;
        node.append(small(item.lost?'没确认送到 · 再按发送，同一条不会重复':'发送中…'));
      }
      return item.node;
    },
  };
}`;
