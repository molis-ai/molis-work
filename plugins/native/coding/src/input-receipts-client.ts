/**
 * The person's words to a round under way, and what became of each (specs/ai-input-receipts §3.3, §4.1, §4.2): how a
 * supplement is sent and the bubble it shows while on its way. The receipt under it is the workbench's shared one
 * (`host.receipts`, the same as the Assistant's): it says what the run's own ledger says and, apart from that, what the AI
 * says, and it announces its own changes.
 *
 * Every supplement has a key from the moment it is sent. When the answer is lost (the connection dropped, or the reply
 * could not be read), the words and the mode stay in the composer and the bubble says to send again: the same words in
 * the same mode go under the same key, so the runtime returns the first one instead of taking it twice (§7). Changed
 * words are a new supplement. An answer the Host refused clears the bubble. When the run's record shows a supplement under
 * that key, the lost one did arrive: the bubble goes, so the same words are not shown twice with opposite claims, and the
 * page says once that it had arrived, as it does for a resend the runtime recognises (`landed`).
 *
 * Interrupting drops the reply the model was writing: the page dims the one it was showing being written and says so. The runtime's
 * record does not mark that reply (a Prologue need in the spec), so the mark is the page's own and a reload loses it.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = `({api,refresh,q,landed})=>{
  const SENT={'next-boundary':'已送达，当前回复或这批工具结束后交给 AI。',interrupt:'已送达：正在写的回复已丢掉，按你的话接着做；已执行的操作不撤销。','after-run':'已存好，下一轮开始时带上。'};
  const small=text=>{const node=document.createElement('small');node.className='coding-turn-receipt';node.textContent=text;return node;};
  const AGAIN='之前已送到，没有重复发送。';let item=null;
  const send=async sent=>{
    sent.lost=0;item=sent;refresh();const writing=sent.mode=='interrupt'&&q('.coding-turn.is-writing');
    try{
      const {receipt}=await api('/sessions/'+encodeURIComponent(sent.id)+'/control','POST',{kind:'steer',run_id:sent.run,text:sent.text,key:sent.key,mode:sent.mode});
      if(item==sent)item=null;
      if(writing&&receipt.delivered=='run'&&!receipt.replayed){writing.classList.add('is-dropped');writing.append(small('这段回复已丢掉（你打断了它）'));}
      return receipt.replayed?AGAIN:receipt.delivered=='queued'&&sent.mode!='after-run'?'这一轮刚结束，已存好，下一轮开始时带上。':SENT[sent.mode];
    }catch(error){if(error instanceof TypeError||error.name=='SyntaxError'){sent.lost=1;throw Error('没确认送到：连接断了，或回复读不出。')}if(item==sent)item=null;throw error;}
    finally{refresh();}
  };
  return {
    steer(id,run,text,mode){
      return send({id,run,text,mode,key:item?.lost&&item.id==id&&item.text==text&&item.mode==mode?item.key:'send.'+crypto.randomUUID()});
    },
    bubble(id,run){
      if(item?.id!=id)return null;
      if(item.lost&&run.turns.some(turn=>turn.steer?.key==item.key)){const sent=item;item=null;landed(sent,AGAIN);return null;}
      if(item.node?.dataset.lost!=item.lost){
        const node=item.node=document.createElement('article');node.className='coding-turn is-sending';node.dataset.kind='user';node.dataset.lost=item.lost;node.textContent=item.text;
        node.append(small(item.lost?'没确认送到 · 再按发送，同一条不会重复':'发送中…'));
      }
      return item.node;
    },
  };
}`;
