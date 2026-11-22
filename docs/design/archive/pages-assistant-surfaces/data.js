/* Example content only. No connection to a user's Home or model. */
window.sliceData = {
  launch: {
    title: "第一次使用", subtitle: "产品方向 / 体验设计", count: "约 680 字",
    html: '<p class="eyebrow">PRODUCT NOTES · 01</p><h1>把第一次使用，<br>变成一次真正的完成</h1><p class="lead">让一个想法在工作台里继续生长。第一次打开时，先陪人完成一件小事。</p><div class="byline"><span class="mini-avatar">骏</span><span>一骏</span><span>·</span><span>10 月 13 日</span><span>·</span><span>产品方向草稿</span></div><hr><h2>从已有的工作开始</h2><p>来到这里的人，往往已经带着一些东西：一份没写完的计划、几段散落的资料，或一个还说不清楚的念头。</p><p id="anchor-promise"><button class="highlight" data-thread="t1">第一次使用的目标，是让用户在十分钟内完成一件值得留下的小事。</button><sup class="comment-index">1</sup> 这个结果可以是一份整理好的访谈、一段更清楚的表达，或一张可以接着执行的计划。</p><h2>给过程一个看得见的位置</h2><p>正文是正在工作的地方，评论留在旁边。助理被邀请时就加入讨论，回答和疑问待在一起。阅读的人不必重新寻找那段对话发生在哪里。</p><p id="anchor-continuity"><button class="highlight" data-thread="t2">无论从哪里继续，都应保留原来的材料、问题和进度。</button><sup class="comment-index">2</sup> 简短交流留在底部；需要展开想法时，再把对话放到主区。<button class="note-link" data-action="note" aria-label="查看这段的备注"><span data-icon="note"></span></button></p><blockquote>一个好的工作台，应当让人记得自己正在做什么。</blockquote><h2>第一轮，我们验证什么</h2><table><thead><tr><th>时刻</th><th>可观察的结果</th></tr></thead><tbody><tr><td>带着材料进入</td><td>能找到一件明确的小事</td></tr><tr><td>遇到不确定</td><td>能在原处问、在原处得到回应</td></tr><tr><td>回来继续</td><td>材料、草稿与讨论都还在</td></tr></tbody></table><p>先邀请三位朋友，把一份真实材料带进来。观察他们在哪一步停住，再决定下一轮要改什么。</p>',
  },
  research: {
    title: "访谈观察", subtitle: "研究 / 第一轮访谈", count: "约 320 字",
    html: '<p class="eyebrow">FIELD NOTES · 02</p><h1>人们在什么时候，<br>需要一个助理？</h1><p class="lead">三次对话里，反复出现的是“帮我接着做”，而不是“替我从头开始”。</p><div class="byline"><span class="mini-avatar">骏</span><span>一骏</span><span>·</span><span>10 月 12 日</span><span>·</span><span>访谈记录</span></div><hr><h2>一个反复出现的停顿</h2><p id="anchor-research"><button class="highlight" data-thread="t3">切换工具后，人们需要重新解释自己刚才在做什么。</button><sup class="comment-index">1</sup> 解释的成本不只是一段文字，还有找回材料、辨认版本、重述约束。</p><blockquote>“我已经写了一半，只想有人陪我把后面想清楚。”</blockquote><h2>下一次访谈</h2><p>让参与者带着正在做的真实任务进入，观察他们如何在正文、评论和助理之间移动。记录每次停顿发生的位置。</p><p>我们尤其想知道：回复出现在原评论里，是否能减少重新解释的次数？</p>',
  },
  threads: [
    { id:"t1", doc:"launch", anchor:"anchor-promise", quote:"第一次使用的目标，是让用户在十分钟内完成一件值得留下的小事。", messages:[{id:"m1",author:"user",name:"一骏",body:"这里的“十分钟”会不会太绝对？我们真正想验证的是什么？"}], draft:"", ask:false, replyTo:null, run:null },
    { id:"t2", doc:"launch", anchor:"anchor-continuity", quote:"无论从哪里继续，都应保留原来的材料、问题和进度。", messages:[{id:"m2",author:"user",name:"一骏",body:"这里要特别保留草稿。切到另一篇文档，再回来时，不应该重新写。"}], draft:"", ask:false, replyTo:null, run:null },
    { id:"t3", doc:"research", anchor:"anchor-research", quote:"切换工具后，人们需要重新解释自己刚才在做什么。", messages:[{id:"m3",author:"user",name:"一骏",body:"下一轮可以记录：每个人重复交代了几次背景？"}], draft:"", ask:false, replyTo:null, run:null }
  ],
  assistant: [
    {author:"user",body:"我们准备把 Pages 评论和个人助理接起来。你觉得第一轮最值得验证什么？"},
    {author:"assistant",body:"先围绕一个真实的写作任务，验证三件事。\n\n01  讨论是否留在原处\n读到有疑问的段落时，能直接邀请助理参与，回答回到同一条评论。\n\n02  切换是否连续\n换到另一篇文档、收起侧栏再回来，草稿和回复都还在。\n\n03  长对话是否有足够空间\n需要深入讨论时，把当前对话展开到主区；文档仍留在旁边的标签里。\n\n可以先用「第一次使用」这篇文稿走一遍。"}
  ]
};
