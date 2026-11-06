/**
 * English for the board's unified-input sections (catalog-composer.ts). The Chinese text is the key; words the product already
 * translates (发送, 停止, 补充, 待确认…) are not repeated here: the served dictionaries already carry them, so one Chinese key keeps
 * one English and a later renaming happens in one place. The workbench's board
 * dictionary spreads this in, as the Assistant's spreads `INPUT_RECEIPTS_EN`.
 */
export const COMPOSER_BOARD_EN: Readonly<Record<string, string>> = {
  "多行输入框 / Composer": "Composer",
  "首页单行胶囊长成多行：同一套圆角、阴影和焦点描边。写字区随内容长高，到 240px 或窗口的 40% 后在框里滚动。":
    "The home bar's one-line capsule, grown to rows: the same corners, shadow and focus edge. The text area grows with what is written and scrolls inside the box past 240px or 40% of the window.",
  "发给：": "To:",
  "改回发给助理": "Send to the Assistant instead",
  "已恢复上次没发出的草稿 · 上午 11:02": "Restored your unsent draft · 11:02 AM",
  "清空草稿": "Clear draft",
  "送达方式": "How it is delivered",
  "补充（⌘↵）": "Supplement (⌘↵)",
  "选择送达方式": "Choose how it is delivered",
  "发送（⌘↵）": "Send (⌘↵)",
  "添加文件与资料": "Add files and materials",
  "停止这一轮": "Stop this turn",
  "发给 {who} 的话": "Message to {who}",
  "移除 {name}": "Remove {name}",
  "{name} 读取中": "Reading {name}",
  "太大（2.1 GB），附不上": "Too large (2.1 GB); cannot attach",
  "把第 3 步的测试补上": "Add the tests for step 3",
  "把第 3 步的测试补上：注册接口的失败路径要覆盖超时、重复提交和服务端拒绝三种情况，每种都要断言输入框里的字还在。":
    "Add the tests for step 3: the sign-up endpoint's failure paths must cover a timeout, a repeated submit and a refusal from the server, each asserting that the text is still in the input.",
  "另外看一下 Coding 的会话草稿在写入失败后刷新页面能不能恢复；能的话把恢复后的提示行截一张图，深色和浅色各一张。":
    "Also check whether Coding's session draft comes back after a failed save and a page refresh; if it does, take a screenshot of the restored line, one dark and one light.",
  "再核对一遍发送中按钮是不是真的锁住了：连按三次 ⌘↵ 只能发出一次，网络断开时状态行要写「待确认」而不是「失败」。":
    "Check again that the button really locks while sending: pressing ⌘↵ three times sends once, and when the network drops the status line says \"Pending confirmation\", not \"Failed\".",
  "附件那边，超过上限的文件要在附件条上当场写原因、可以移除，不要等到发送时才报错；读到一半取消的也要能重新选。":
    "For attachments, a file over the limit says why on the attachment strip right away and can be removed, instead of failing only at send; one cancelled halfway through can be picked again.",
  "窄屏也看一下：390 宽时底行的按钮要有 44px 高，状态行的说明成段折行，操作跟在文字后面，不要挤成一条细列。":
    "Check narrow screens too: at 390 wide the bottom row's buttons are 44px tall, and the status line's words wrap as one paragraph with the action after them, not squeezed into a thin column.",
  "中文输入法选词的时候按回车只是确认选词，不能换行也不能发送；按 ⌘↵ 也一样要等选词结束。":
    "While a Chinese input method is choosing a word, Return only confirms the word: no new line and no sending. ⌘↵ also waits until the choice is done.",
  "切到别的会话再回来，没发出的字要还在，各是各的；迟到的上传结果不能写进已经换掉的那个框。":
    "Switch to another session and back, and the unsent text is still there, each session its own; an upload that finishes late never lands in a box that has since been switched.",
  "最后把这一轮改到的文件列出来，按改动大小排序，标出哪些是新文件，哪些只改了测试。":
    "Finally, list the files this turn changed, largest change first, and mark which are new and which only touch tests.",
  "如果中间遇到需要我决定的地方，先停下来问我，不要自己选；拿不准的写在最后，我一起看。":
    "If anything along the way needs my decision, stop and ask me; don't choose for me. Put what you're unsure of at the end and I'll go through it all.",
  "空白": "Empty",
  "有草稿 · 恢复行": "Draft · restored line",
  "把第 3 步的测试补上，再看一下 Coding 的会话草稿": "Add the tests for step 3, then look at Coding's session draft",
  "附件与长高到上限 · 框内滚动": "Attachments, grown to the cap · scrolls inside",
  "Coding · 注册接口": "Coding · Sign-up endpoint",
  "处理中 · 发送中": "Working · sending",
  "发送中": "Sending",
  "正在发送…": "Sending…",
  "处理中 · 运行中 · 送达菜单": "Working · running · delivery menu",
  "顺便把失败截图也附上": "Attach the failure screenshots too",
  "正在做这一轮 · 再发会作为补充": "Working on this turn · a new message is added to it",
  "补充（默认）": "Supplement (default)",
  "当前回复或这批工具结束后读到，不打断": "Read once the current reply or tool batch ends; nothing is cut off",
  "打断并改向": "Interrupt and redirect",
  "长说明没有标点 · 在框内折行": "Long description without punctuation · wraps inside",
  "合并到上一条": "Join the previous message",
  "把这句话接在你上一条还没被读到的消息后面一起送给助理而不另起一条": "Appends this to your previous unread message and sends both to the assistant together as one",
  "丢掉正在写的回复，改按这句做；已做的不撤销": "Drops the reply in progress and follows this instead; what's already done stays done",
  "下一轮再做": "Do it next turn",
  "排到下一轮开头，你开下一轮时带上": "Waits for the start of the next turn, which you start",
  "没发出去：连接被重置。文字还在，可以改了再发": "Not sent: the connection was reset. Your text is kept; edit it and send again",
  "没能确认是否送到，正在核对；先别重复发": "Could not confirm it arrived; checking now. Don't send it twice",
  "查看": "Details",
  "会话已结束，不能再发；新开一个会话接着做": "The session has ended and takes no more messages; start a new one to go on",
  "这个会话已结束": "This session has ended",
  "菜单说明行 / Menu Description": "Menu description",
  "挂在菜单项下一行的灰字，说清选它会怎样；不可选时写原因。": "A quiet line under a menu item: what choosing it does, or why it cannot be chosen.",
  "带快捷键 · 送达方式": "With shortcuts · delivery",
  "不可选并写原因": "Cannot be chosen, with the reason",
  "这个对象不支持打断：它一次只做完一整轮": "This receiver cannot be interrupted: it always finishes a whole turn",
  "不带快捷键 · 添加": "Without shortcuts · add",
  "项目资料…": "Project materials…",
  "从这个项目已经收进来的资料里选": "Pick from the materials this project already holds",
  "文件与图片": "Files and images",
  "从这台电脑选，或直接拖进输入框": "Pick from this computer, or drag them into the input",
  "Todo · 待办": "Todo · To-dos",
  "没有可选的待办：这个项目里还没有建": "No to-dos to pick: none created in this project yet",
};
