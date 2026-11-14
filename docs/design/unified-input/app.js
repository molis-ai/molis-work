// Unified input design specimen (batch 10). A standalone review page: no Home, no model, every reply and status is
// simulated. Every control is the component board's own mw-* part (board.css, board-icons.js and board-ring.js, generated
// by extract-board.mjs); the few parts the board lacks are marked 组件板新增 on the page and listed in the intro.
(() => {
  "use strict";
  const KEY = "molis-proto.unified-input.v1";
  const REC = { editor: "A", deliver: "A", keys: "C", target: "A", states: "A", ext: "A" };
  const fresh = () => ({ lang: "zh", theme: "light", entry: "assistant", words: "1", d1: "next", d2: "give", d3: "turn",
    sch: { ...REC }, running: true, hintSeen: false, sendCount: 0, drafts: {}, restored: {}, threads: {}, mode: {}, atts: {}, target: {} });
  let s = load();
  const ui = { menu: null, nudge: false, toastIn: {} };
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v ? { ...fresh(), ...v, sch: { ...REC, ...(v.sch || {}) } } : fresh(); }
    catch { return fresh(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: the page still works */ } }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const en = () => s.lang === "en";
  const colon = () => (en() ? ": " : "：");

  // ---- board controls: every control below is the component board's own mw-* markup (board.css, board-icons.js) ----
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const at = (o) => (o ? " " + o : "");
  const btn = (variant, label, o = "", icon = "") => `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--sm" data-slot="button"${at(o)}>${icon ? ic(icon) : ""}<span data-slot="button-label">${label}</span></button>`;
  const menuBtn = (variant, label, o = "") => `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--sm" data-slot="button"${at(o)}><span data-slot="button-label">${label}</span>${ic("chevron-down")}</button>`;
  const iconBtn = (variant, icon, label, o = "") => `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--icon mw-btn--icon-only mw-btn--sm" data-slot="button" aria-label="${label}" title="${label}"${at(o)}>${ic(icon)}<span class="mw-sr-only">${label}</span></button>`;
  const linkBtn = (label, o = "") => `<button type="button" class="mw-btn mw-btn--link" data-slot="button"${at(o)}><span data-slot="button-label">${label}</span></button>`;
  const FAM = { starting: "running", running: "running", generating: "running", failed: "failed", verify: "verify", interrupted: "interrupted", disconnected: "disconnected", done: "done", waiting: "waiting", unread: "unread", read: "read" };
  const ring = (state) => `<svg class="mw-state-ring" data-mw-state="${state}" data-ring-family="${FAM[state]}" viewBox="0 0 24 24" aria-hidden="true"></svg>`;
  const pill = (tone, state, text) => `<span class="mw-status mw-status--${tone}" data-slot="status">${ring(state)}<span>${text}</span></span>`;
  const kbd = (k) => `<kbd class="mw-kbd">${k}</kbd>`;
  const toggles = (label, items, act) => `<div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${label}">${items.map(([v, text, on]) => `<button type="button" class="mw-toggle${on ? " is-current" : ""}" aria-pressed="${on}" data-act="${act}" data-v="${v}">${text}</button>`).join("")}</div>`;
  // Parts the board does not have yet are marked where they appear: data-new="n" draws the number when the strip's
  // "Mark new parts" is on, and the intro lists each with why the existing parts are not enough.
  const NEW = (n) => ` data-new="${n}"`;
  const MIC = '<symbol id="icon-mic" viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></symbol>';

  // ---- words that H4 decides (dashed underline = 待定) ----
  const WORDS = {
    work: { zh: { 1: "工作", 2: "任务", 3: "工作" }, en: { 1: "work", 2: "task", 3: "work" } },
    task: { zh: { 1: "任务", 2: "任务", 3: "工作" }, en: { 1: "task", 2: "task", 3: "work" } },
    sub: { zh: { 1: "子任务", 2: "子任务", 3: "子工作" }, en: { 1: "sub-task", 2: "sub-task", 3: "sub-work" } },
  };
  function word(n) {
    const L = en() ? "en" : "zh";
    if (WORDS[n]) return WORDS[n][L][s.words];
    const turn = s.d3 === "turn" ? "turn" : "round";
    if (n === "turn") return en() ? turn : "轮";
    if (n === "next") return en() ? (s.d1 === "next" ? `Do it next ${turn}` : `After this ${turn}`) : (s.d1 === "next" ? "下一轮再做" : "这一轮结束后再做");
    if (n === "to") return en() ? (s.d2 === "give" ? "Send to" : "Post to") : (s.d2 === "give" ? "发给" : "发到");
    return n;
  }
  const fill = (str, v = {}, plain = false) => str.replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : (plain ? word(n) : `<span class="h4w">${word(n)}</span>`)));

  // ---- strings: [中文, English] ----
  const S = {
    protoTitle: ["统一输入框定样 · 原型", "Unified input specimen · prototype"], entry: ["入口", "Entry"], words: ["用词", "Wording"],
    lang: ["语言", "Language"], theme: ["主题", "Theme"], light: ["浅色", "Light"], dark: ["深色", "Dark"], reset: ["重置", "Reset"],
    w1: ["方案一", "Option 1"], w2: ["方案二", "Option 2"], w3: ["方案三", "Option 3"],
    title: ["统一输入框：完整状态与送达语义", "Unified input: every state and how a message is delivered"],
    status: ["方案已定（2026-11-04，七块都照推荐）· 模拟（不连 Home、不调模型，回复和状态都是假的）", "Decided (2026-11-04, every block as recommended) · simulated (no Home, no model; replies and states are fake)"],
    introP: ["首页底栏、助理、Coding、项目讨论和创作台以后用同一个输入框。下面每一块是一个要定的问题，各有 2～3 个方案；点方案卡切换，下方的样张跟着变，可以直接打字、按键、拖文件试。顶上可以换入口、用词、语言和深浅色。", "The home bar, Assistant, Coding, project discussion and Plugin Studio will share one input. Each block below is one question with 2–3 options; pick an option card and the specimen under it changes. You can type, press keys and drop files in it. The strip on top switches entry, wording, language and theme."],
    already: ["已经定了、样张照着做的", "Already decided; the specimens follow these"],
    dec1: ["<b>分两层</b>：所有输入框共用编辑器层（长高、草稿、输入法、附件条）；只有对 AI 说话的才有送达菜单。入口切到「项目讨论」看对人的样子。", "<b>Two layers</b>: every input shares the editor layer (growing, drafts, input method, attachments); only inputs that talk to an AI get the delivery menu. Switch the entry to Project discussion to see the one for people."],
    dec2: ["<b>键位</b>（10-27）：Enter 换行，⌘/Ctrl+Enter 发送，⌘/Ctrl+Shift+Enter {next}；打断只走按钮或菜单；输入法选词不发送；Esc 只关局部菜单。", "<b>Keys</b> (10-27): Enter adds a line, ⌘/Ctrl+Enter sends, ⌘/Ctrl+Shift+Enter is “{next}”; interrupting only from a button or menu; picking an input-method candidate never sends; Esc only closes a local menu."],
    dec3: ["<b>运行中默认补充</b>：创作台也一样，另有明确的「打断并改向」。", "<b>Adding is the default while running</b>, Plugin Studio included, with an explicit “Interrupt and redirect”."],
    dec4: ["<b>决定理由型输入</b>（评审反馈、Jelly 指令、Goals 退回）只对齐长高、输入法和草稿，不绑发送键。", "<b>Decision-reason fields</b> (review feedback, Jelly instructions, Goals send-back) share growing, input method and drafts only; no send key."],
    dec5: ["<b>项目讨论里 Esc</b> 只关局部菜单，关面板用标题栏的 ×。", "<b>Esc in project discussion</b> only closes a local menu; the panel closes from the × in its header."],
    legend: ["带虚线下划线的词由 H4 决定；已定方案一（第 7 块），切别的方案只为对照。", "Words with a dashed underline depend on H4; option 1 was chosen (block 7); other options are for comparison only."],
    rec: ["推荐 · 已定", "Recommended · chosen"], pick: ["选", "Pick"], tryIt: ["试一试", "Try"],
    // block heads
    b1: ["编辑器层", "Editor layer"], b2: ["对 AI 的送达菜单", "Delivery menu for an AI"], b3: ["新键位与改键后的一次提示", "New keys and the one-time notice"],
    b4: ["发给谁", "Who it goes to"], b5: ["运行中、失败、被丢弃、离线", "Running, failed, dropped, offline"], b6: ["插件扩展的入口", "Where plugins add to the input"], b7: ["H4 对外用词", "H4 wording"],
    l1: ["所有输入框共用的一层：随内容长高、到上限内部滚动；没发出的草稿回来时恢复；输入法选词时 Enter 不发送；附件条。这一块要定的是附件放在哪、恢复草稿时怎么告诉人。", "The layer every input shares: grows with the text and scrolls inside at its cap; an unsent draft comes back; Enter while picking an input-method candidate never sends; an attachment strip. This block decides where attachments sit and how a restored draft is told."],
    l2: ["AI 正在做事时再发一句，有三种送法：补充（默认，当前回复或这批工具结束后读到）、打断并改向、{next}。这一块定这三种放在哪里。从菜单选一种只改这一次的按钮，发出去后回到补充；打断要两步，不会误触。", "Sending while the AI works can go three ways: Add (default, read once the current reply or tool batch ends), Interrupt and redirect, and {next}. This block decides where the three live. Picking from the menu only changes the button for this one send; it returns to Add afterwards, so interrupting always takes two steps."],
    l3: ["助理、项目讨论、创作台原来按 Enter 就发，改成 Enter 换行后要提醒一次。这一块定怎么提醒。点「模拟刚升级」可以重来。", "The Assistant, project discussion and Plugin Studio used to send on Enter; once Enter adds a line, people need one notice. This block decides how. “Simulate just updated” starts it over."],
    l4: ["发送前要看得出这句发给谁。助理里点了「对这项{task}说」会换成那项{task}，× 回到助理（沿用 03 定样）。这一块定这个标签放在哪。", "Before sending, it must be clear who receives it. In the Assistant, choosing “Talk to this {task}” switches to that {task}; × returns to the Assistant (as decided in batch 03). This block decides where that label sits."],
    l5: ["同一组状态在三个方案里的样子。不能只靠颜色：每种都有图标和一句话，能做的事给按钮。", "The same states in each option. Never colour alone: each has an icon and a sentence, and a button when there is something to do."],
    l6: ["插件经公开合同往输入框里加东西（资料、方法、关联对象、命令）。平台统一放，插件不自己画按钮。这一块定入口长什么样。输入 / 或 @ 在所有方案里都能用。", "Plugins add things to the input through the public contract (materials, methods, linked objects, commands). The platform places them; plugins draw no buttons of their own. This block decides what the entry looks like. Typing / or @ works in every option."],
    l7: ["界面里真正冲突的是「工作／任务／子任务」三个词；「工作简报」「受托工作」「子工作」只在文档里。选一个方案，顶上的「用词」会把整页的词换掉。下面三条小决定也在这里定。", "What actually clashes in the product is work / task / sub-task; “work brief”, “entrusted work” and “sub-work” only live in documents. Pick an option; the Wording switch on top rewrites the whole page. The three small decisions below are made here too."],
    // scheme cards
    e_A: ["附件在框里，草稿提示一行", "Attachments inside, a one-line draft notice"], e_Ap: ["附件和要写的话在同一个框里，一眼看全；恢复的草稿有一行说明和「清空」", "Attachments and words in one box, seen together; a restored draft gets a line and Clear"], e_Ac: ["附件多时框会变高", "Many attachments make the box taller"],
    e_B: ["附件在底行，草稿不提示", "Attachments in the bottom row, no draft notice"], e_Bp: ["框最矮，底行横向滚动放附件", "Shortest box; attachments scroll in the bottom row"], e_Bc: ["附件和模型、方式挤在一行；人可能没注意到旧草稿就发了出去", "Attachments crowd the model and mode; an old draft can go out unnoticed"],
    e_C: ["附件在框外上方，草稿是个标签", "Attachments above the box, the draft a tag"], e_Cp: ["框本身不变；附件像托盘", "The box never changes; attachments sit like a tray"], e_Cc: ["附件和框分开，看起来不像同一条消息", "Attachments apart from the box read as a different message"],
    d_A: ["发送按钮带方式菜单", "Send button with a mode menu"], d_Ap: ["运行时按钮写着「补充」，旁边 ▾ 选另外两种；位置不变，需求 §4.1 的原样", "While running the button reads Add; ▾ next to it holds the other two; nothing moves; as §4.1 describes"], d_Ac: ["打断藏在菜单里，要知道 ▾", "Interrupt hides behind ▾"],
    d_B: ["运行时框上出现三选一", "A three-way switch above the text while running"], d_Bp: ["三种都看得见，当前选哪种一目了然", "All three visible; the current one is obvious"], d_Bc: ["开始和结束运行时框会跳一下；占一行", "The box jumps when a run starts and ends; costs a row"],
    d_C: ["打断单独一个按钮", "Interrupt as its own button"], d_Cp: ["「打断并改向」最显眼，符合统筹 11-04 第 3 条的字面", "Interrupt and redirect is most visible, matching the 11-04 decision 3 wording"], d_Cc: ["右边三个按钮（停止、打断、补充）挤；{next}只能靠键盘", "Three buttons on the right (stop, interrupt, add); {next} only by keyboard"],
    k_A: ["升级后在发送键上弹一次说明", "One bubble on the send key after the update"], k_Ap: ["升级后第一眼就看到", "Seen right after the update"], k_Ac: ["打扰；人还没打字就要先关掉它", "Interrupts; it must be closed before typing"],
    k_B: ["框下一行键位说明，发三次后消失", "A key line under the box, gone after three sends"], k_Bp: ["不挡路，一直在眼前", "Never in the way, always in view"], k_Bc: ["多占一行；说明文字很快被忽略", "Costs a row; the text is soon ignored"],
    k_C: ["按老习惯回车时才提醒", "Only when Enter is pressed out of habit"], k_Cp: ["恰好在按错的那一刻出现，不打扰没按错的人；用 ⌘↵ 发过一次就不再出现", "Shows exactly when the habit misfires and never otherwise; gone after one ⌘↵ send"], k_Cc: ["不按回车的人看不到说明（发送键提示里仍有）", "Someone who never presses Enter never sees it (the send key’s tip still says it)"],
    t_A: ["框上方一行「{to}：对象」", "A line above the box: “{to}: who”"], t_Ap: ["03 已定的样子；位置固定，切换和 × 都在这一行", "As decided in 03; fixed place, switching and × on the same line"], t_Ac: ["多占一行", "Costs a row"],
    t_B: ["框里开头一个对象标签", "A chip at the start of the text"], t_Bp: ["不多占行；标签和要写的话挨着", "No extra row; the chip sits next to the words"], t_Bc: ["名字长时挤占写字的地方；窄屏更明显", "A long name eats writing room, worse when narrow"],
    t_C: ["只写在窗格标题上", "Only in the pane header"], t_Cp: ["输入框最干净", "Cleanest input"], t_Cc: ["离输入框远，切到某项{task}后容易忘了在对谁说", "Far from the input; easy to forget who you are talking to after switching"],
    s_A: ["状态写在框里、发送键上方", "Status inside the box, above the send key"], s_Ap: ["整句放得下，挨着发送键，框外什么都不动", "The whole sentence fits, next to the send key; nothing outside the box moves"], s_Ac: ["有状态时框高一行", "The box grows a row while a status shows"],
    s_B: ["框上方一条横幅", "A banner above the box"], s_Bp: ["最醒目，放得下整句和按钮", "Most visible; fits the whole sentence and a button"], s_Bc: ["出现时框会被往下推；和失败无关的状态也很抢眼", "The box shifts when it appears; minor states look loud"],
    s_C: ["只改发送键图标，加一条提示", "Only the send icon changes, plus a toast"], s_Cp: ["最安静", "Quietest"], s_Cc: ["提示几秒就没了，过后看不出为什么发不出去；只靠图标不够", "The toast is gone in seconds; afterwards nothing says why it will not send"],
    x_A: ["左下角一个 + 菜单", "A + menu at the bottom left"], x_Ap: ["插件再多也只有一个按钮；菜单按来源分组写出是哪个插件给的", "One button however many plugins; the menu groups by source and names the plugin"], x_Ac: ["要点一下才知道有什么", "One click to see what is there"],
    x_B: ["底行一排图标", "A row of icons in the bottom row"], x_Bp: ["常用的一眼可见", "Common ones in plain sight"], x_Bc: ["插件一多就挤，要折叠成「更多」；图标意思不好认", "Crowds as plugins grow and folds into More; icons are hard to read"],
    x_C: ["没有按钮，只靠 / 和 @", "No button, only / and @"], x_Cp: ["最干净", "Cleanest"], x_Cc: ["不知道 / 和 @ 的人找不到；附件只能拖进来", "People who don’t know / and @ never find it; files only by dragging"],
    // composer pieces
    send: ["发送", "Send"], add: ["补充", "Add"], addDef: ["补充（默认）", "Add (default)"], interrupt: ["打断并改向", "Interrupt and redirect"],
    addDesc: ["当前回复或这批工具结束后读到，不打断", "Read once the current reply or tool batch ends; nothing is cut off"],
    intDesc: ["丢掉正在写的回复，按这句接着做；已经做的操作不撤销", "Drops the reply being written and goes on from this; actions already taken stay"],
    nextDesc: ["排到下一{turn}开头，由你开启下一{turn}时带上", "Waits for the start of the next {turn}, which you start"],
    noKey: ["无快捷键", "no shortcut"], modeLbl: ["运行中再发：", "Sending now:"],
    stop: ["停止", "Stop"], stopTip: ["停止这一{turn}（不是停止录音）", "Stop this {turn} (not the recording)"], mic: ["语音输入（第 54 批做，这里只占位置）", "Voice input (batch 54; only its place here)"],
    attach: ["添加", "Add"], restored: ["已恢复没发出的草稿 · 上午 11:02", "Restored your unsent draft · 11:02"], clear: ["清空", "Clear"], draftTag: ["草稿", "Draft"],
    ime: ["输入法选词中：Enter 用来确认候选，不会发送", "Picking a candidate: Enter confirms it and does not send"],
    reading: ["读取中", "reading"], tooBig: ["太大（2.1 GB），附不上", "too large (2.1 GB); cannot attach"], remove: ["移除", "Remove"], retry: ["重试", "Retry"],
    // receipts and states
    rcAdd1: ["已收到 · 下一步开始时用上", "Received · used when the next step starts"], rcAdd2: ["已用上", "Used"],
    rcInt: ["已打断当前回复 · 按这句接着做", "Current reply interrupted · going on from this"], rcNext: ["排队中 · 下一{turn}开始时带上", "Waiting · goes with the next {turn}"], withdraw: ["撤回", "Take back"],
    rcLost: ["没用上：这一{turn}在读到它之前停止了", "Not used: this {turn} stopped before reading it"], again: ["再发一次", "Send again"], putback: ["放回输入框", "Back to the input"],
    aiReply: ["（模拟回复）收到，我先看看。", "(Simulated reply) Got it, looking now."], aiInt: ["（模拟）好，换成按你说的做。", "(Simulated) OK, switching to what you said."],
    aiWriting: ["助理正在写回复", "The Assistant is writing"], delivered: ["已送达", "Delivered"],
    stSending: ["正在发送…", "Sending…"], stRunning: ["正在做这一{turn} · 再发会作为补充", "Working on this {turn} · a new message is added to it"],
    stFailed: ["没发出去：连接被重置。文字还在，可以改了再发", "Not sent: the connection was reset. Your text is kept; edit and send again"],
    stUncertain: ["没能确认是否送到，正在核对；先别重复发", "Could not confirm it arrived; checking now. Don’t send it twice"],
    stDropped: ["上一条补充没用上：这一{turn}在读到它之前停止了", "Your last addition was not used: this {turn} stopped before reading it"],
    stOffline: ["离线：草稿留在本机，联网后再发", "Offline: the draft stays on this Mac; send once you are back online"],
    look: ["查看", "Details"], capSending: ["发送中", "Sending"], capRunning: ["运行中", "Running"], capFailed: ["失败", "Failed"], capUncertain: ["待确认", "Unconfirmed"], capDropped: ["被丢弃", "Dropped"], capOffline: ["离线", "Offline"],
    toastOnly: ["提示几秒后就会消失（方案 C）", "This toast disappears in seconds (option C)"],
    // tools
    tAttach: ["加两个附件", "Add two files"], tBad: ["加一个附不上的", "Add one that cannot attach"], tRefresh: ["模拟刷新或切回来", "Simulate reload or coming back"],
    tIme: ["模拟输入法选词", "Simulate picking a candidate"], tLong: ["填一段长文", "Fill a long text"], tRunning: ["AI 正在运行", "AI is running"],
    tUpdated: ["模拟刚升级", "Simulate just updated"], tTargets: ["发送对象", "Receiver"], tryEditor: ["打字看它长高；拖一个文件进框；填长文看上限内滚动。", "Type to watch it grow; drop a file on it; fill a long text to see it scroll at the cap."],
    tryDeliver: ["写一句，按 ⌘↵ 补充；按 ⌘⇧↵ 排到下一{turn}；打断走按钮或菜单。关掉「AI 正在运行」看平时的样子。", "Write a line; ⌘↵ adds it, ⌘⇧↵ waits for the next {turn}; interrupting goes through the button or menu. Turn “AI is running” off to see the idle look."],
    tryKeys: ["写一句，像以前那样按 Enter。", "Write a line and press Enter the old way."],
    tryExt: ["点 +，或在框里输入 / 或 @。Esc 只关菜单。", "Click +, or type / or @ in the box. Esc only closes the menu."],
    gotIt: ["知道了", "Got it"], coach: ["回车现在用来换行。⌘↵ 发送，⌘⇧↵ {next}。", "Enter now adds a line. ⌘↵ sends; ⌘⇧↵ is “{next}”."],
    nudge: ["回车已改为换行。要发送请按 ⌘↵", "Enter now adds a line. Press ⌘↵ to send"], keyline: ["Enter 换行 · ⌘↵ 发送 · ⌘⇧↵ {next}", "Enter new line · ⌘↵ send · ⌘⇧↵ {next}"],
    kTitle: ["已定的键位（10-27）", "Keys as decided (10-27)"], kKey: ["按键", "Key"], kDoes: ["做什么", "Does"],
    k1: ["换行；输入法选词、确认候选时不发送", "New line; never sends while picking or confirming a candidate"], k2: ["发送；运行中是补充", "Send; Add while running"], k3: ["{next}（运行中）；不在运行时等于发送", "“{next}” while running; plain send otherwise"],
    k4: ["打断并改向：只走按钮或菜单，没有快捷键", "Interrupt and redirect: button or menu only, no shortcut"], k5: ["在控件之间移动", "Moves between controls"], k6: ["只关局部菜单，不停 AI、不关面板", "Only closes a local menu; never stops the AI or closes the panel"],
    talkTo: ["对这项{task}说", "Talk to this {task}"], closeIM: ["关闭讨论（Esc 不再关闭）", "Close discussion (Esc no longer does)"], paneHead: ["对话", "Conversation"],
    groupFiles: ["附件", "Attachments"], groupMat: ["资料", "Materials"], groupPlug: ["插件提供", "From plugins"], files: ["文件…", "File…"], images: ["图片…", "Image…"],
    extNote: ["插件在 Manifest 里声明，平台统一放进这里（UIV-13～15）", "Plugins declare these in their Manifest; the platform places them (UIV-13–15)"],
    more: ["更多", "More"], cmd: ["命令", "Commands"], mention: ["提到", "Mention"], sim: ["（模拟）会打开 {what}", "(Simulated) would open {what}"],
    emptyNo: ["写点什么再发", "Write something first"], stateOnly: ["这一块只展示状态", "This block only shows states"], voiceLater: ["语音在第 54 批做，这里只占位置", "Voice comes in batch 54; this only holds its place"],
    // H4
    hScheme: ["方案", "Option"], hDo: ["做法", "What it does"], hPro: ["好处", "Good"], hCon: ["代价", "Cost"],
    h1d: ["工作＝助理里一项持续的事；任务＝交给执行者（Coding、子代理、后台）的具体一件；子任务＝再委托出去的一件。「受托工作」「子工作」不对外", "Work = an ongoing piece in the Assistant; task = one concrete job handed to an executor (Coding, a subagent, the background); sub-task = a job delegated onward. “Entrusted work” and “sub-work” stay internal"],
    h1p: ["最接近现状：助理已说「工作」，Coding 和看板已说「任务」，要改的只有几处", "Closest to today: the Assistant already says work, Coding and the board say task; only a few strings change"], h1c: ["Coding 看板的「子代理」标签要改成「子任务」或说明它是执行者", "Coding’s “Subagent” label becomes sub-task or is explained as the executor"],
    h2d: ["一律叫任务：新任务、任务简报、子任务、后台任务", "Everything is a task: new task, task brief, sub-task, background task"], h2p: ["口语、一个词", "Plain, one word"], h2c: ["「任务」已被 Goals 规划、Jelly 拆解、Coding 看板各用各的意思；助理 48 处要改", "“Task” already means different things in Goals planning, Jelly and the Coding board; 48 Assistant strings change"],
    h3d: ["一律叫工作：任务→工作，子任务→子工作", "Everything is work: task → work, sub-task → sub-work"], h3p: ["词最少", "Fewest words"], h3c: ["和工作区、工作树、工作流程撞词；Coding、Goals、Jelly 的「任务」要整体改", "Collides with workspace, worktree, workflow; Coding, Goals and Jelly’s “task” all change"],
    small: ["三条小决定", "Three small decisions"], sd1: ["排到下一轮那一项叫", "The wait-for-next item is called"], sd2: ["「发给谁」那一行用", "The receiver line says"], sd3: ["一轮的英文", "English for one round"],
    sd1a: ["下一轮再做（推荐：短，Coding 已在用）", "下一轮再做 (recommended: short, Coding uses it)"], sd1b: ["这一轮结束后再做（ai-input-receipts §4.1 原写法）", "这一轮结束后再做 (as §4.1 writes it)"],
    sd2a: ["发给（推荐：03 定样和 PWA-130 已在用）", "发给 (recommended: the 03 specimen and PWA-130 use it)"], sd2b: ["发到（项目讨论现在的写法）", "发到 (project discussion today)"],
    sd3a: ["turn（推荐：Coding 约 150 处已是 turn）", "turn (recommended: Coding has about 150)"], sd3b: ["round（助理现在 38 处）", "round (the Assistant’s 38 today)"],
    samples: ["整页里用到这些词的地方", "Where these words show up"], sNew: ["新建", "New"], sList: ["列表", "List"], sBg: ["后台", "Background"], sSub: ["委托", "Delegated"], sFrom: ["来源", "Source"], sMenu: ["菜单", "Menu"], sTo: ["发给谁", "Receiver"], sStop: ["停止", "Stop"],
    vNew: ["开始一项新{work}", "Start a new {work}"], vList: ["我的{work}", "My {work}"], vBg: ["{task}「写完发布说明」· 等你定", "{task} “Finish release notes” · needs you"], vSub: ["{sub}「整理三份纪要」已完成", "{sub} “Sort three minutes” finished"],
    vFrom: ["受托于 助理", "Delegated by the Assistant"], vMenu: ["补充 · 打断并改向 · {next}", "Add · Interrupt and redirect · {next}"], vTo: ["{to}：助理", "{to}: Assistant"], vStop: ["停止这一{turn}", "Stop this {turn}"],
    h4After: ["定下来后改 GLOSSARY；文案替换在第 10 批实现里做。", "Once picked, GLOSSARY changes; replacing the strings happens in the batch-10 build."],
    studioNote: ["创作台：统筹 11-04 第 3 条写「另加明确的『打断并改向』按钮」；需求 §4 允许按钮或菜单。用户 2026-11-04 定：创作台和别处一样走 ▾ 菜单。", "Plugin Studio: decision 3 of 11-04 says “an explicit Interrupt and redirect button”; requirement §4 allows a button or a menu. Decided 2026-11-04: the Studio uses the ▾ menu like everywhere else."],
    imNote: ["项目讨论是对人说话：没有送达菜单和停止，其余（键位、草稿、附件、发给谁）一样。", "Project discussion talks to people: no delivery menu and no Stop; keys, drafts, attachments and the receiver line are the same."],
    longText: ["第一节先讲这次改了什么：输入框统一成一个，回车换行，⌘↵ 发送。\n第二节讲运行中的三种送法，各配一个例子。\n第三节列出还没定的：发给谁那一行放在哪、状态写在哪。\n第四节是迁移说明：哪些入口改了键位，第一次会有提示。\n第五节是 FAQ。\n第六节附上截图。\n第七节写验收怎么做。\n第八节留给评论。", "Section 1: what changed — one input everywhere, Enter adds a line, ⌘↵ sends.\nSection 2: the three ways to send while running, one example each.\nSection 3: what is still open — where the receiver line sits, where status goes.\nSection 4: migration — which entries changed keys; a notice comes once.\nSection 5: FAQ.\nSection 6: screenshots.\nSection 7: how acceptance works.\nSection 8: room for comments."],
    // board alignment (2026-11-04)
    backTo: ["改回发给助理", "Back to the Assistant"], kNew: ["换行", "new line"], dropHere: ["松开就附上", "Drop to attach"], dropSub: ["放进这一条消息", "Goes with this message"],
    rcAdd1Body: ["当前回复或这批工具结束后读到", "Read once the current reply or tool batch ends"], rcAdd2Body: ["已在这一{turn}里读到", "Read during this {turn}"],
    rcIntBody: ["当前回复已停下，按这句接着做；已经做的操作不撤销", "The current reply stopped and work goes on from this; actions already taken stay"],
    rcNextBody: ["下一{turn}开始时带上；开始前可以撤回", "Goes with the next {turn}; you can take it back until then"],
    rcLostBody: ["这一{turn}在读到它之前停止了", "This {turn} stopped before reading it"], deliveredBody: ["已送到讨论里", "Posted to the discussion"],
    showNew: ["标出组件板新增", "Mark new parts"], newTitle: ["组件板新增（样里用虚线框和编号标出）", "New to the component board (dashed outline and number on the page)"],
    new1: ["<b>1 · 多行输入框外壳</b>：组件板只有首页底栏的单行输入框（胶囊形，样式挂在首页外壳上），放不下「发给谁」、附件、状态这几行。外观照它来：--r-composer 圆角、--lift-1 阴影、聚焦时 --line-strong 描边；文字区沿用 data-fit（240px 或 40% 封顶）。里面的控件都是组件板现成的。", "<b>1 · Multi-row composer shell</b>: the board only has the home bar’s one-line composer (a pill styled by the home shell), which has no room for the receiver line, attachments or status. The look follows it: --r-composer radius, --lift-1 shadow, --line-strong outline on focus; the text area keeps data-fit (240px or 40% cap). Everything inside is an existing board control."],
    new2: ["<b>2 · 菜单项的说明行</b>：mw-menu__item 只有名称、快捷键和勾。「打断并改向」会丢掉正在写的回复，选之前要看得到后果，所以三种送法各加一行说明（字号、颜色同 mw-field__hint）。", "<b>2 · Menu item description line</b>: mw-menu__item only has a name, shortcut and check. “Interrupt and redirect” throws away the reply being written, so the consequence must be visible before choosing; each of the three ways gets one line (same size and colour as mw-field__hint)."],
    new3: ["<b>3 · 麦克风图标</b>：图标表里没有。语音在第 54 批，这里只占位置；画法照现有图标（24 格、同线宽）。", "<b>3 · Microphone icon</b>: not in the icon set. Voice comes in batch 54; this only holds its place, drawn like the other icons (24 grid, same stroke)."],
    usedTitle: ["用到的组件板控件", "Board controls used"],
    usedList: ["按钮（主、次、幽灵、链接、危险描边）· 分体按钮（mw-btn-group）与菜单（mw-menu、分组、快捷键、勾）· 标签（发给谁、底行附件）· 上传行与进度（框里的附件）· 拖放区 · 状态环（mw-status）· 提示条（mw-alert）· 轻提示（mw-toast）· 弹出层（改键提示）· 键帽（mw-kbd）· 字段说明（mw-field__hint）· 切换组（mw-toggle-group）· 徽标（mw-badge）· 补充的回执（mw-receipt）", "Buttons (primary, secondary, ghost, link, danger outline) · split button (mw-btn-group) and menu (mw-menu with groups, shortcuts, checks) · tags (receiver, bottom-row attachments) · upload rows and progress (attachments in the box) · drop zone · status ring (mw-status) · alert · toast · popover (key notice) · kbd · field hint · toggle group · badge · input receipts (mw-receipt)"],
    chromeNote: ["方案卡、目录、对话气泡和顶上的斜纹条是评审页自己的样子，不进产品。", "Option cards, the contents list, the chat bubbles and the striped strip on top belong to this review page, not the product."],
  };
  const t = (k, v) => { const x = S[k]; return x ? fill(x[en() ? 1 : 0], v) : fill(k, v); };
  const tp = (k, v) => { const x = S[k]; return x ? fill(x[en() ? 1 : 0], v, true) : fill(k, v, true); };
  const tr = (pair) => fill(pair[en() ? 1 : 0]);
  const trp = (pair) => fill(pair[en() ? 1 : 0], {}, true);

  // ---- entries and receivers ----
  const ENTRIES = {
    assistant: { ai: true, label: ["助理（首页底栏）", "Assistant (home bar)"], pane: ["助理", "Assistant"], ph: ["让助理做点什么…", "Ask the Assistant to do something…"], opts: [] },
    coding: { ai: true, label: ["Coding", "Coding"], pane: ["Coding", "Coding"], ph: ["描述{task}，或补充这一{turn}的要求…", "Describe the {task}, or add to this {turn}…"], opts: [["MiniMax M2", "MiniMax M2"], ["可写工作区", "Can write workspace"]] },
    studio: { ai: true, label: ["插件创作台", "Plugin Studio"], pane: ["插件创作台", "Plugin Studio"], ph: ["说说要改什么…", "Say what to change…"], opts: [["功能与界面", "Behaviour and UI"]] },
    im: { ai: false, label: ["项目讨论（对人）", "Project discussion (people)"], pane: ["项目讨论", "Project discussion"], ph: ["写给大家…", "Write to everyone…"], opts: [] },
  };
  const RECEIVERS = {
    assistant: [["助理", "Assistant"], ["{work}「整理周报」", "{work} “Weekly report”"], ["{task}「写完发布说明」", "{task} “Finish release notes”"], ["{sub}「整理三份纪要」", "{sub} “Sort three minutes”"]],
    coding: [["会话「修复登录超时」", "Session “Fix login timeout”"], ["{sub}「补测试」", "{sub} “Add tests”"]],
    studio: [["草稿插件「读书笔记」· 指向 卡片列表", "Draft plugin “Reading notes” · pointing at Card list"], ["草稿插件「读书笔记」", "Draft plugin “Reading notes”"]],
    im: [["主群", "Main room"], ["话题「发布节奏」", "Thread “Release rhythm”"]],
  };
  const EXT = {
    assistant: { plug: [["Goals", "关联 Goal…", "Link a Goal…"], ["Pages", "引用页面…", "Quote a page…"]], slash: [["/新{work}", "/new {work}"], ["/停止", "/stop"]], at: [["Pages「发布说明」", "Pages “Release notes”"], ["Goal「Q4 上线」", "Goal “Q4 launch”"]] },
    coding: { plug: [["Coding", "方法…", "Method…"], ["Coding", "工作区…", "Workspace…"], ["Skills", "Skill…", "Skill…"]], slash: [["/方法", "/method"], ["/模型", "/model"], ["/清空", "/clear"]], at: [["文件 src/auth.ts", "File src/auth.ts"], ["{task}「补测试」", "{task} “Add tests”"]] },
    studio: { plug: [["创作台", "指向组件…", "Point at a part…"]], slash: [["/新插件", "/new plugin"]], at: [["组件 卡片列表", "Part Card list"]] },
    im: { plug: [], slash: [], at: [["小林", "Lin"], ["阿周", "Zhou"]] },
  };
  const entry = () => ENTRIES[s.entry];
  const receiver = (id) => { const list = RECEIVERS[s.entry]; return list[Math.min(s.target[id] || 0, list.length - 1)]; };
  const isRunning = (id, st) => entry().ai && (st === "running" || (id === "deliver" && s.running));


  // ---- the composer: board controls inside one new part, the multi-row shell (组件板新增 1) ----
  const STATES = {
    sending: { tone: "progress", ring: "starting", text: "stSending" }, running: { tone: "progress", ring: "running", text: "stRunning" },
    failed: { tone: "blocked", ring: "failed", text: "stFailed", act: ["retry", "retry"], alert: "danger", icon: "alert" },
    uncertain: { tone: "attention", ring: "verify", text: "stUncertain", act: ["look", "noop"], alert: "warning", icon: "clock" },
    dropped: { tone: "attention", ring: "interrupted", text: "stDropped", act: ["putback", "putback"], alert: "warning", icon: "alert" },
    offline: { tone: "hold", ring: "disconnected", text: "stOffline", alert: "warning", icon: "cloud" },
  };
  const capOf = (st) => t("cap" + st[0].toUpperCase() + st.slice(1));
  const modeName = (m) => (m === "add" ? t("add") : m === "interrupt" ? t("interrupt") : t("{next}"));
  function statusHTML(st, kind) {
    const d = STATES[st]; if (!d) return "";
    const act = d.act ? linkBtn(t(d.act[0]), `data-act="${d.act[1]}"`) : "";
    if (kind === "banner") return `<div class="mw-alert${d.alert ? " mw-alert--" + d.alert : ""}" data-slot="alert" role="status"><strong>${capOf(st)}</strong><p>${t(d.text)}${act ? " " + act : ""}</p></div>`;
    return `<div class="mwc__status" role="status">${pill(d.tone, d.ring, capOf(st))}<span>${t(d.text)}</span>${act}</div>`;
  }
  function attsHTML(id, where) {
    const list = s.atts[id] || []; if (!list.length) return "";
    if (where === "foot") return list.map((a, i) => `<span class="mw-tag mwc__chip${a.st === "bad" ? " is-failed" : ""}" title="${esc(a.name)}${a.st === "bad" ? " · " + tp("tooBig") : ""}">${ic(a.st === "bad" ? "alert" : a.img ? "image" : "file")}<span>${esc(a.name)}</span><button type="button" data-tag-remove data-act="rmatt" data-i="${i}" aria-label="${tp("remove")} ${esc(a.name)}">${ic("x")}</button></span>`).join("");
    return `<ul class="mw-uploads mwc__atts${where === "out" ? " mwc__atts--out" : ""}">${list.map((a, i) => `<li class="mw-upload"><span class="mw-mark">${ic(a.img ? "image" : "file")}</span><span>${esc(a.name)}${
      a.st === "reading" ? `<div class="mw-progress" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60" aria-label="${esc(a.name)} ${tp("reading")}"><span style="width:60%"></span></div>`
        : a.st === "bad" ? `<small class="is-failed">${t("tooBig")}</small>` : `<small>${esc(a.size || "")}</small>`
    }</span>${iconBtn("ghost", "x", tp("remove") + " " + esc(a.name), `data-act="rmatt" data-i="${i}"`)}</li>`).join("")}</ul>`;
  }
  function comp(id, o = {}) {
    const E = entry(), sc = { ...s.sch, ...(o.sch || {}) }, st = o.st || null;
    const running = isRunning(id, st), mode = s.mode[id] || "add";
    const value = s.drafts[id] ?? "";
    const hasContent = value.trim() || (s.atts[id] || []).some((a) => a.st !== "bad");
    const off = !hasContent || st === "sending" || st === "uncertain" || st === "offline" ? " disabled" : "";
    const rcv = receiver(id), chosen = (s.target[id] || 0) > 0;
    const open = (k) => ui.menu?.id === id && ui.menu.k === k;
    const mark = (n) => (id.startsWith("st-") ? "" : NEW(n)); // the six state specimens repeat the same parts
    // who it goes to: the board's tag; × goes back to the Assistant (as in batch 03)
    const rTag = (cls = "") => `<span class="mw-tag mwc__to${cls}" title="${esc(trp(rcv))}"><span>${tr(rcv)}</span>${chosen ? `<button type="button" data-tag-remove data-act="tgt0" aria-label="${tp("backTo")}" title="${tp("backTo")}">${ic("x")}</button>` : ""}</span>`;
    const toLine = sc.target === "A" ? `<div class="mwc__line">${t("{to}")}${colon()}${rTag()}</div>` : "";
    const toChip = sc.target === "B" ? rTag(" mwc__to--inline") : "";
    const restored = s.restored[id] && value.trim();
    const restoredLine = sc.editor === "A" && restored ? `<p class="mw-field__hint mwc__row">${t("restored")} · ${linkBtn(t("clear"), 'data-act="cleardraft"')}</p>` : "";
    const draftTag = sc.editor === "C" && restored ? `<span class="mw-badge mw-badge--neutral" data-slot="badge">${t("draftTag")}</span>${linkBtn(t("clear"), 'data-act="cleardraft"')}` : "";
    const modes = running && sc.deliver === "B" ? `<div class="mwc__row">${toggles(tp("modeLbl"), ["add", "interrupt", "next"].map((m) => [m, modeName(m), mode === m]), "mode")}</div>` : "";
    // + menu: the board's ghost icon button opening a mw-menu
    const extBtn = sc.ext === "A" ? `<div class="mw-compose__anchor">${iconBtn("ghost", "plus", tp("attach"), `data-act="menu" data-k="ext" aria-haspopup="menu" aria-expanded="${open("ext")}"`)}${open("ext") ? menuHTML(id, "ext") : ""}</div>` : "";
    const X = EXT[s.entry];
    const extRow = sc.ext === "B" ? `${iconBtn("ghost", "paperclip", tp("files"), 'data-act="pickfile"')}${entry().ai ? iconBtn("ghost", "book", tp("groupMat"), `data-act="sim" data-what="${tp("groupMat")}"`) : ""}${X.plug.slice(0, 1).map((p) => iconBtn("ghost", "package", esc(p[0] + " · " + (en() ? p[2] : p[1])), `data-act="sim" data-what="${esc(p[0] + " · " + (en() ? p[2] : p[1]))}"`)).join("")}${X.plug.length > 1 ? `<div class="mw-compose__anchor">${menuBtn("ghost", t("more"), `data-act="menu" data-k="ext" aria-haspopup="menu" aria-expanded="${open("ext")}"`)}${open("ext") ? menuHTML(id, "ext") : ""}</div>` : ""}` : "";
    const opts = E.opts.map((p) => menuBtn("ghost", esc(p[en() ? 1 : 0]), `data-act="sim" data-what="${esc(p[en() ? 1 : 0])}"`)).join("");
    // right side, in the order DESIGN.md fixes: voice, stop, send
    const mic = `<span class="mwc__new"${mark(3)}>${iconBtn("ghost", "mic", tp("mic"), `data-act="mic"${st === "offline" ? " disabled" : ""}`)}</span>`;
    const stop = running ? btn("danger-outline", t("stop"), `data-act="stop" title="${tp("stopTip")}"`) : "";
    const irb = running && sc.deliver === "C" ? btn("secondary", t("interrupt"), `data-act="send" data-m="interrupt"${off}`, "zap") : "";
    let send;
    if (running && st !== "sending") {
      const m = sc.deliver === "C" ? "add" : mode;
      const main = `<button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="send" data-m="${m}" title="${esc(tp(m === "add" ? "add" : m === "interrupt" ? "interrupt" : "{next}"))}${m === "add" ? "（⌘↵）" : m === "next" ? "（⌘⇧↵）" : ""}"${off}><span data-slot="button-label">${modeName(m)}</span></button>`;
      send = sc.deliver === "A"
        ? `<div class="mw-btn-group" role="group" aria-label="${tp("modeLbl")}">${main}<div class="mw-compose__anchor"><button type="button" class="mw-btn mw-btn--primary mw-btn--icon mw-btn--icon-only mw-btn--sm" data-slot="button" data-act="menu" data-k="modes" aria-haspopup="menu" aria-expanded="${open("modes")}" aria-label="${tp("modeLbl")}" title="${tp("modeLbl")}">${ic("chevron-down")}<span class="mw-sr-only">${tp("modeLbl")}</span></button>${open("modes") ? menuHTML(id, "modes") : ""}</div></div>`
        : main;
    } else {
      const icon = st === "sending" ? `<span class="mw-spinner" aria-hidden="true"></span>` : ic(sc.states === "C" && STATES[st]?.icon ? STATES[st].icon : "send");
      send = `<button type="button" class="mw-btn mw-btn--primary mw-btn--icon mw-btn--icon-only mw-btn--sm" data-slot="button" data-act="send" aria-label="${tp("send")}（⌘↵）" title="${tp("send")}（⌘↵）"${off}>${icon}<span class="mw-sr-only">${tp("send")}</span></button>`;
    }
    const statusIn = st && sc.states === "A" ? statusHTML(st, "line") : "";
    const banner = st && sc.states === "B" ? statusHTML(st, "banner") : "";
    const ftoast = st && sc.states === "C" && STATES[st]?.act ? `<div class="mwc__toastline"><div class="mw-toast${st === "failed" ? " is-error" : ""}" data-slot="toast" role="status"><span>${t(STATES[st].text)}</span><button type="button" class="mw-toast__action" data-act="${STATES[st].act[1]}">${t(STATES[st].act[0])}</button></div><p class="mw-field__hint">${t("toastOnly")}</p></div>` : "";
    // one-time key notices: the board's popover with a secondary button
    const coach = id === "keys" && sc.keys === "A" && !s.hintSeen ? `<div class="mw-popover mwc__pop" data-slot="popover" role="dialog" aria-label="${tp("kTitle")}"><p>${t("coach")}</p>${btn("secondary", t("gotIt"), 'data-act="gotit"')}</div>` : "";
    const nudge = id === "keys" && sc.keys === "C" && ui.nudge && !s.hintSeen ? `<div class="mw-popover mwc__pop" data-slot="popover" role="status"><p>${t("nudge")}</p>${btn("secondary", t("gotIt"), 'data-act="gotit"')}</div>` : "";
    const keyline = id === "keys" && sc.keys === "B" && s.sendCount < 3 ? `<p class="mw-field__hint mwc__keys">${kbd("Enter")} ${t("kNew")} · ${kbd("⌘↵")} ${t("send")} · ${kbd("⌘⇧↵")} ${t("{next}")} ${iconBtn("ghost", "x", tp("gotIt"), 'data-act="gotit"')}</p>` : "";
    return `<div class="mwc-wrap" data-spec="${id}">
      ${coach}${nudge}${toLine}${banner}${sc.editor === "C" ? attsHTML(id, "out") : ""}
      <div class="mwc${st === "failed" ? " is-failed" : ""}${st === "offline" ? " is-offline" : ""}"${mark(1)} data-drop="${id}">
        ${modes}${sc.editor === "A" ? attsHTML(id, "in") : ""}${restoredLine}
        <div class="mwc__text">${toChip}<textarea data-cid="${id}" data-fit rows="1" placeholder="${esc(trp(E.ph))}" aria-label="${esc(tp("{to}") + " " + trp(rcv))}">${esc(value)}</textarea></div>
        <p class="mw-field__hint mwc__row" data-ime="${id}" hidden>${t("ime")}</p>${statusIn}
        <div class="mwc__foot"><div class="mwc__start">${extBtn}${extRow}${sc.editor === "B" ? attsHTML(id, "foot") : ""}${opts}${draftTag}</div><div class="mwc__end">${mic}${stop}${irb}${send}</div></div>
        <div class="mw-drop mw-drop--compact mwc__drop" data-drop-live hidden><span class="mw-mark">${ic("upload")}</span><p>${t("dropHere")}</p><small>${t("dropSub")}</small></div>
      </div>
      ${keyline}${ftoast}
    </div>`;
  }
  function menuHTML(id, k) {
    const X = EXT[s.entry];
    const item = (o) => `<button type="button" class="mw-menu__item" role="${o.role || "menuitem"}"${o.checked != null ? ` aria-checked="${o.checked}"` : ""}${at(o.attrs)}>${ic(o.icon)}<span data-slot="menu-item-label">${o.label}${o.desc ? `<small class="mw-menu__desc"${o.mark ? NEW(2) : ""}>${o.desc}</small>` : ""}</span>${o.key ? `<span class="mw-menu__shortcut">${o.key}</span>` : ""}${o.checked ? `<span class="mw-menu__check">${ic("check")}</span>` : ""}</button>`;
    const group = (label, items) => (items ? `<div class="mw-menu__group" role="group" aria-label="${esc(label.replace(/<[^>]+>/g, ""))}"><div class="mw-menu__label">${label}</div>${items}</div>` : "");
    const wrap = (end, label, inner) => `<div class="mw-compose__menu mwc__menu${end ? " mwc__menu--end" : ""}" data-compose-menu><div class="mw-menu" data-slot="menu" role="menu" aria-label="${label}">${inner}</div></div>`;
    if (k === "modes") {
      const cur = s.mode[id] || "add";
      const row = (m, icon, desc, key) => item({ role: "menuitemradio", checked: cur === m, icon, label: m === "add" ? t("addDef") : modeName(m), desc: t(desc), mark: m === "add", key, attrs: `data-act="pickmode" data-m="${m}"` });
      return wrap(true, tp("modeLbl"), row("add", "message", "addDesc", "⌘↵") + row("interrupt", "zap", "intDesc", "") + row("next", "clock", "nextDesc", "⌘⇧↵"));
    }
    if (k === "ext") {
      const byPlugin = {};
      X.plug.forEach((p) => (byPlugin[p[0]] = (byPlugin[p[0]] || "") + item({ icon: "package", label: esc(en() ? p[2] : p[1]), attrs: `data-act="sim" data-what="${esc(p[0] + " · " + (en() ? p[2] : p[1]))}"` })));
      return wrap(false, tp("attach"), group(t("groupFiles"), item({ icon: "paperclip", label: t("files"), attrs: 'data-act="pickfile"' }) + item({ icon: "image", label: t("images"), attrs: 'data-act="pickfile"' }))
        + (entry().ai ? group(t("groupMat"), item({ icon: "book", label: en() ? "Project materials…" : "项目资料…", attrs: `data-act="sim" data-what="${tp("groupMat")}"` })) : "")
        + Object.entries(byPlugin).map(([name, items]) => group(esc(name), items)).join(""));
    }
    const list = k === "slash" ? X.slash : X.at;
    return wrap(false, k === "slash" ? tp("cmd") : tp("mention"), group(k === "slash" ? t("cmd") : t("mention"), list.map((p) => item({ icon: k === "slash" ? "hash" : "user", label: tr(p), attrs: `data-act="insert" data-v="${esc(trp(p))}"` })).join("")));
  }
  // The conversation above the composer is a simplified stand-in (not part of this design); receipts are the board's.
  const RC = { rcAdd1: "unread", rcAdd2: "read", rcInt: "read", rcNext: "waiting", rcLost: "unread", delivered: "read" };
  function threadHTML(id) {
    const list = (s.threads[id] || []).slice(-4);
    const rows = list.map((m, i) => {
      if (m.ai) return `<p class="mwt__ai">${t(m.ai)}</p>`;
      const acts = m.rc?.acts ? `<div class="mw-receipt__acts">${m.rc.acts.map((a) => btn("secondary", t(a[0]), `data-act="${a[1]}" data-i="${list.length - 1 - i}"`)).join("")}</div>` : "";
      const rc = m.rc ? `<details class="mw-receipt" data-state="${RC[m.rc.k] || "read"}"${acts ? " open" : ""}><summary><span class="mw-receipt__fact${m.rc.k === "rcLost" ? " mw-receipt__problem" : ""}">${t(m.rc.k)}</span></summary><div class="mw-receipt__body"><p>${m.via ? modeName(m.via) + " · " : ""}${t(m.rc.k + "Body")}</p>${acts}</div></details>` : "";
      return `<div class="mwt__me">${m.via ? `<span class="mw-badge mw-badge--neutral" data-slot="badge">${modeName(m.via)}</span>` : ""}<p class="mwt__bub">${esc(m.text)}${m.n ? ` · ${ic("paperclip")}${m.n}` : ""}</p>${rc}</div>`;
    }).join("");
    const writing = isRunning(id) && id === "deliver" ? `<p class="mwt__ai">${pill("progress", "generating", t("aiWriting"))}</p>` : "";
    return `<div class="mwt" role="log">${rows}${writing}</div>`;
  }
  function pane(id, inner, o = {}) {
    const E = entry();
    const head = (o.sch?.target || s.sch.target) === "C" ? `${t("{to}")}${colon()}${tr(receiver(id))}` : tr(E.pane);
    const close = s.entry === "im" ? iconBtn("ghost", "x", tp("closeIM"), `data-act="sim" data-what="${tp("closeIM")}"`) : "";
    return `<div class="spec">${o.cap ? `<div class="cap">${o.cap}</div>` : ""}<div class="pane"><div class="phd"><span class="grow">${head}</span>${close}</div>${o.thread === false ? "" : threadHTML(id)}${inner}</div></div>`;
  }

  // ---- blocks ----
  function schemes(block, prefix) {
    return `<div class="schemes" role="radiogroup" aria-label="${tp(block)}">${["A", "B", "C"].map((x) => `<button type="button" class="sc" role="radio" aria-pressed="${s.sch[block] === x}" data-act="scheme" data-b="${block}" data-x="${x}"><span class="nm">${x} · ${t(prefix + "_" + x)}${REC[block] === x ? `<span class="mw-badge mw-badge--info" data-slot="badge">${t("rec")}</span>` : ""}</span><span class="pro">${t(prefix + "_" + x + "p")}</span><span class="con">${t(prefix + "_" + x + "c")}</span></button>`).join("")}</div>`;
  }
  const head = (n, k, refs) => `<div class="bh"><span class="num">${n}</span><h2>${t(k)}</h2><span class="refs">${refs}</span></div>`;
  const BLOCKS = [
    { id: "editor", n: 1, k: "b1", refs: "UIV-01～04 · VUX-16 · VUX-18", render: () => `${head(1, "b1", "UIV-01～04 · VUX-16 · VUX-18")}<p class="lede">${t("l1")}</p>${schemes("editor", "e")}
      <div class="tools"><span class="lbl">${t("tryIt")}${colon()}</span><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="addatts" data-id="editor">${t("tAttach")}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="addbad" data-id="editor">${t("tBad")}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="long" data-id="editor">${t("tLong")}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="refresh" data-id="editor">${t("tRefresh")}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="imedemo" data-id="editor">${t("tIme")}</button></div>
      <div class="stage">${pane("editor", comp("editor"))}</div><p class="note">${t("tryEditor")}</p>` },
    { id: "deliver", n: 2, k: "b2", refs: "UIV-17 · ai-input-receipts §4.1", render: () => `${head(2, "b2", "UIV-17 · ai-input-receipts §4.1")}<p class="lede">${t("l2")}</p>${schemes("deliver", "d")}
      ${s.entry === "studio" ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="note"><p>${t("studioNote")}</p></div>` : ""}${s.entry === "im" ? `<div class="mw-alert" data-slot="alert" role="note"><p>${t("imNote")}</p></div>` : ""}
      <div class="tools"><label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" class="mw-check" data-act="running" ${s.running ? "checked" : ""} ${entry().ai ? "" : "disabled"}>${t("tRunning")}</label></div>
      <div class="stage">${pane("deliver", comp("deliver"))}</div><p class="note">${t("tryDeliver")}</p>` },
    { id: "keys", n: 3, k: "b3", refs: "§4 · UIV-02", render: () => `${head(3, "b3", "§4 · UIV-02")}<p class="lede">${t("l3")}</p>${schemes("keys", "k")}
      <div class="tools"><span class="lbl">${t("tryIt")}${colon()}</span><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="updated">${t("tUpdated")}</button></div>
      <div class="stage two">${pane("keys", comp("keys"))}<div class="spec"><div class="cap">${t("kTitle")}</div><div class="pane"><table class="ktable"><thead><tr><th>${t("kKey")}</th><th>${t("kDoes")}</th></tr></thead><tbody>
      <tr><td><kbd class="mw-kbd">Enter</kbd></td><td>${t("k1")}</td></tr><tr><td><kbd class="mw-kbd">⌘</kbd>/<kbd class="mw-kbd">Ctrl</kbd> <kbd class="mw-kbd">Enter</kbd></td><td>${t("k2")}</td></tr><tr><td><kbd class="mw-kbd">⌘</kbd>/<kbd class="mw-kbd">Ctrl</kbd> <kbd class="mw-kbd">Shift</kbd> <kbd class="mw-kbd">Enter</kbd></td><td>${t("k3")}</td></tr>
      <tr><td>—</td><td>${t("k4")}</td></tr><tr><td><kbd class="mw-kbd">Tab</kbd></td><td>${t("k5")}</td></tr><tr><td><kbd class="mw-kbd">Esc</kbd></td><td>${t("k6")}</td></tr></tbody></table></div></div></div><p class="note">${t("tryKeys")}</p>` },
    { id: "target", n: 4, k: "b4", refs: "§4 · PWA-130", render: () => `${head(4, "b4", "§4 · PWA-130")}<p class="lede">${t("l4")}</p>${schemes("target", "t")}
      <div class="tools"><span class="lbl">${t("tTargets")}${colon()}</span>${RECEIVERS[s.entry].map((r, i) => `<button type="button" class="mw-btn mw-btn--sm mw-btn--${(s.target.target || 0) === i ? "primary" : "secondary"}" aria-pressed="${(s.target.target || 0) === i}" data-act="tgt" data-i="${i}">${tr(r)}</button>`).join("")}</div>
      <div class="stage">${pane("target", comp("target"), { thread: false })}</div>` },
    { id: "states", n: 5, k: "b5", refs: "UIV-03 · §8", render: () => `${head(5, "b5", "UIV-03 · §8")}<p class="lede">${t("l5")}</p>${schemes("states", "s")}
      <div class="stage two">${["sending", "running", "failed", "uncertain", "dropped", "offline"].map((st) => pane("st-" + st, comp("st-" + st, { st }), { cap: t("cap" + st[0].toUpperCase() + st.slice(1)), thread: st === "dropped" })).join("")}</div>` },
    { id: "ext", n: 6, k: "b6", refs: "§2.2 · UIV-13～15 · VUX-17", render: () => `${head(6, "b6", "§2.2 · UIV-13～15 · VUX-17")}<p class="lede">${t("l6")}</p>${schemes("ext", "x")}
      <div class="stage">${pane("ext", comp("ext"), { thread: false })}</div><p class="note">${t("tryExt")}</p>` },
    { id: "h4", n: 7, k: "b7", refs: "H4", render: h4Block },
  ];
  function h4Block() {
    const row = (n) => `<tr aria-current="${s.words === n}"><td><button type="button" class="mw-btn mw-btn--sm mw-btn--${s.words === n ? "primary" : "secondary"}" aria-pressed="${s.words === n}" data-act="words" data-w="${n}">${t("w" + n)}${n === "1" ? ` · ${t("rec")}` : ""}</button></td><td>${t("h" + n + "d")}</td><td>${t("h" + n + "p")}</td><td>${t("h" + n + "c")}</td></tr>`;
    const choice = (key, a, b, va, vb) => `<div class="mini"><b style="font-weight:500">${t(key)}</b><div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${tp(key)}">${[[va, "a"], [vb, "b"]].map(([v, x]) => `<button type="button" class="mw-toggle${s[a] === v ? " is-current" : ""}" aria-pressed="${s[a] === v}" data-act="small" data-k="${a}" data-v="${v}">${t(key + x)}</button>`).join("")}</div></div>`;
    const sm = [["sNew", "vNew"], ["sList", "vList"], ["sBg", "vBg"], ["sSub", "vSub"], ["sFrom", "vFrom"], ["sMenu", "vMenu"], ["sTo", "vTo"], ["sStop", "vStop"]];
    return `${head(7, "b7", "H4 · GLOSSARY")}<p class="lede">${t("l7")}</p>
      <table class="wtable"><thead><tr><th>${t("hScheme")}</th><th>${t("hDo")}</th><th>${t("hPro")}</th><th>${t("hCon")}</th></tr></thead><tbody>${row("1")}${row("2")}${row("3")}</tbody></table>
      <h3 style="margin:6px 0 0;font-size:13.5px;font-weight:600">${t("small")}</h3>
      ${choice("sd1", "d1", null, "next", "after")}${choice("sd2", "d2", null, "give", "at")}${choice("sd3", "d3", null, "turn", "round")}
      <div><div class="cap" style="font-size:11.5px;color:var(--muted);padding:4px 0 6px">${t("samples")}</div><div class="samples">${sm.map(([a, b]) => `<div><small>${t(a)}</small><span>${t(b)}</span></div>`).join("")}</div></div>
      <p class="note">${t("h4After")}</p>`;
  }

  // ---- render ----
  function render() {
    document.documentElement.dataset.resolvedTheme = s.theme; document.documentElement.toggleAttribute("data-show-new", s.showNew !== false);
    document.documentElement.lang = en() ? "en" : "zh-CN";
    document.title = en() ? "Unified input specimen · Molis Work prototype" : "统一输入框定样 · Molis Work 原型";
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = tp(el.dataset.t); });
    const sel = document.getElementById("entry");
    sel.innerHTML = Object.entries(ENTRIES).map(([k, v]) => `<option value="${k}" ${s.entry === k ? "selected" : ""}>${esc(v.label[en() ? 1 : 0])}</option>`).join("");
    const press = (b, on) => { b.setAttribute("aria-pressed", String(on)); b.classList.toggle("is-current", on); };
    document.querySelectorAll("#words [data-words]").forEach((b) => { b.textContent = tp("w" + b.dataset.words); press(b, s.words === b.dataset.words); });
    document.querySelectorAll("#lang [data-lang]").forEach((b) => press(b, s.lang === b.dataset.lang));
    document.querySelectorAll("#theme [data-theme-set]").forEach((b) => press(b, s.theme === b.dataset.themeSet));
    press(document.getElementById("shownew"), s.showNew !== false);
    document.getElementById("toc").innerHTML = BLOCKS.map((b) => `<a href="#b-${b.id}"><span class="n">${b.n}</span>${t(b.k)}${s.sch[b.id] ? `<span class="pick">${s.sch[b.id]}</span>` : ""}</a>`).join("");
    document.getElementById("app").innerHTML = `<section class="intro"><h1>${t("title")}</h1><p><span class="mw-badge mw-badge--neutral mwr-sim" data-slot="badge">${t("status")}</span></p><p>${t("introP")}</p>
      <p style="margin-top:12px;font-weight:600;color:var(--ink)">${t("already")}</p><ul>${["dec1", "dec2", "dec3", "dec4", "dec5"].map((k) => `<li>${t(k)}</li>`).join("")}</ul>
      <div class="legend"><span class="h4w">${en() ? "dashed" : "虚线"}</span><span>${t("legend")}</span></div>
      <div class="mwr-new"><p><b>${t("newTitle")}</b></p><ul>${["new1", "new2", "new3"].map((k) => `<li>${t(k)}</li>`).join("")}</ul><p><b>${t("usedTitle")}</b>：${t("usedList")}</p><p class="mw-field__hint">${t("chromeNote")}</p></div></section>${BLOCKS.map((b) => `<section class="blk" id="b-${b.id}">${b.render()}</section>`).join("")}`;
    fitAll();
  }
  function renderBlock(blockId) {
    const el = document.getElementById("b-" + blockId); if (!el) return render();
    const act = document.activeElement, cid = act?.dataset?.cid, pos = act?.selectionStart;
    el.innerHTML = BLOCKS.find((b) => b.id === blockId).render();
    document.getElementById("toc").innerHTML = BLOCKS.map((b) => `<a href="#b-${b.id}"><span class="n">${b.n}</span>${t(b.k)}${s.sch[b.id] ? `<span class="pick">${s.sch[b.id]}</span>` : ""}</a>`).join("");
    fitAll();
    if (cid) { const ta = document.querySelector(`textarea[data-cid="${cid}"]`); if (ta) { ta.focus(); const p = pos ?? ta.value.length; ta.setSelectionRange(p, p); } }
  }
  const blockOf = (id) => (id.startsWith("st-") ? "states" : id);
  function fit(ta) { ta.style.height = "auto"; if (!ta.value) return; ta.style.height = ta.scrollHeight + "px"; }
  function fitAll() { document.querySelectorAll("textarea[data-cid]").forEach(fit); }
  let toastTimer;
  function toast(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

  // ---- actions ----
  function send(id, m) {
    if (id.startsWith("st-")) { toast(tp("stateOnly")); return; }
    const v = (s.drafts[id] || "").trim(), atts = (s.atts[id] || []).filter((a) => a.st !== "bad");
    if (!v && !atts.length) { toast(tp("emptyNo")); return; }
    const running = isRunning(id), mode = running ? (m || s.mode[id] || "add") : "send";
    const msg = { text: v || "📎", n: atts.length || 0 };
    const th = (s.threads[id] = s.threads[id] || []);
    if (mode === "add") { msg.via = "add"; msg.rc = { cls: "pending", k: "rcAdd1" }; }
    if (mode === "interrupt") { msg.via = "interrupt"; msg.rc = { k: "rcInt" }; }
    if (mode === "next") { msg.via = "next"; msg.rc = { cls: "pending", k: "rcNext", acts: [["withdraw", "withdraw"]] }; }
    if (mode === "send" && !entry().ai) msg.rc = { k: "delivered" };
    th.push(msg);
    s.drafts[id] = ""; s.atts[id] = []; s.mode[id] = "add"; s.restored[id] = false; s.sendCount += 1; ui.menu = null; ui.nudge = false;
    if (id === "keys") s.hintSeen = true;
    save(); renderBlock(blockOf(id));
    if (mode === "add") setTimeout(() => { msg.rc = { k: "rcAdd2" }; save(); renderBlock(blockOf(id)); }, 1600);
    if (mode === "interrupt") setTimeout(() => { th.push({ ai: "aiInt" }); save(); renderBlock(blockOf(id)); }, 700);
    if (mode === "send" && entry().ai) setTimeout(() => { th.push({ ai: "aiReply" }); save(); renderBlock(blockOf(id)); }, 700);
  }
  function addFiles(id, names) {
    const list = (s.atts[id] = s.atts[id] || []);
    names.forEach((n) => list.push({ name: n.name, size: n.size, img: /\.(png|jpe?g|webp|gif)$/i.test(n.name), st: "reading" }));
    save(); renderBlock(blockOf(id));
    setTimeout(() => { list.forEach((a) => { if (a.st === "reading") a.st = "done"; }); save(); renderBlock(blockOf(id)); }, 1200);
  }
  const specOf = (el) => el.closest("[data-spec]")?.dataset.spec || el.dataset.id;

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) { if (ui.menu && !e.target.closest(".mw-compose__menu")) { const b = blockOf(ui.menu.id); ui.menu = null; renderBlock(b); } return; }
    const a = el.dataset.act, id = specOf(el);
    if (a === "running") return;
    if (a === "scheme") { s.sch[el.dataset.b] = el.dataset.x; ui.menu = null; ui.nudge = false; save(); return renderBlock(el.dataset.b); }
    if (a === "send") return send(id, el.dataset.m);
    if (a === "menu") { ui.menu = ui.menu && ui.menu.id === id && ui.menu.k === el.dataset.k ? null : { id, k: el.dataset.k }; return renderBlock(blockOf(id)); }
    if (a === "pickmode" || a === "mode") { s.mode[id] = el.dataset.m || el.dataset.v; ui.menu = null; save(); renderBlock(blockOf(id)); document.querySelector(`textarea[data-cid="${id}"]`)?.focus(); return; }
    if (a === "pickfile") { ui.menu = null; const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.onchange = () => addFiles(id, [...inp.files].map((f) => ({ name: f.name, size: Math.max(1, Math.round(f.size / 1024)) + " KB" }))); inp.click(); return renderBlock(blockOf(id)); }
    if (a === "addatts") return addFiles(id, [{ name: en() ? "release-notes-draft.md" : "发布说明草稿.md", size: "12 KB" }, { name: en() ? "screenshot 2026-11-03.png" : "截图 2026-11-03.png", size: "340 KB" }]);
    if (a === "addbad") { (s.atts[id] = s.atts[id] || []).push({ name: en() ? "screen-recording.mov" : "录屏.mov", st: "bad" }); save(); return renderBlock(blockOf(id)); }
    if (a === "rmatt") { (s.atts[id] || []).splice(+el.dataset.i, 1); save(); return renderBlock(blockOf(id)); }
    if (a === "long") { s.drafts[id] = tp("longText"); save(); return renderBlock(blockOf(id)); }
    if (a === "refresh") { s.restored[id] = !!(s.drafts[id] || "").trim(); save(); toast(en() ? "Simulated a reload" : "已模拟刷新"); return renderBlock(blockOf(id)); }
    if (a === "cleardraft") { s.drafts[id] = ""; s.restored[id] = false; save(); return renderBlock(blockOf(id)); }
    if (a === "imedemo") { const p = document.querySelector(`[data-ime="${id}"]`); if (p) { p.hidden = false; setTimeout(() => { p.hidden = true; }, 2600); } return; }
    if (a === "updated") { s.hintSeen = false; s.sendCount = 0; ui.nudge = false; save(); return renderBlock("keys"); }
    if (a === "gotit") { s.hintSeen = true; s.sendCount = 3; ui.nudge = false; save(); return renderBlock("keys"); }
    if (a === "tgt") { s.target.target = +el.dataset.i; save(); return renderBlock("target"); }
    if (a === "tgt0") { s.target[id] = 0; save(); return renderBlock(blockOf(id)); }
    if (a === "insert") { s.drafts[id] = (s.drafts[id] || "").replace(/[/@]$/, "") + el.dataset.v + " "; ui.menu = null; save(); renderBlock(blockOf(id)); const ta = document.querySelector(`textarea[data-cid="${id}"]`); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } return; }
    if (a === "sim") { ui.menu = null; toast(tp("sim", { what: el.dataset.what })); return renderBlock(blockOf(id)); }
    if (a === "mic") return toast(tp("voiceLater"));
    if (a === "stop") { s.running = false; save(); toast(en() ? "(Simulated) stopping this " + word("turn") + "…" : "（模拟）正在停止这一轮…"); return renderBlock("deliver"); }
    if (a === "withdraw") { const th = s.threads[id] || []; const idx = th.length - 1 - +el.dataset.i; const [m] = th.splice(idx, 1); if (m && !(s.drafts[id] || "").trim()) s.drafts[id] = m.text; save(); return renderBlock(blockOf(id)); }
    if (a === "retry" || a === "noop" || a === "putback") return toast(tp("stateOnly"));
    if (a === "words") { s.words = el.dataset.w; save(); return render(); }
    if (a === "small") { s[el.dataset.k] = el.dataset.v; save(); return render(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches('[data-act="running"]')) { s.running = e.target.checked; ui.menu = null; save(); renderBlock("deliver"); }
    if (e.target.id === "entry") { s.entry = e.target.value; s.target = {}; ui.menu = null; save(); render(); }
  });
  document.addEventListener("input", (e) => {
    const ta = e.target.closest("textarea[data-cid]"); if (!ta) return;
    const id = ta.dataset.cid; s.drafts[id] = ta.value; s.restored[id] = false; fit(ta); save();
    const v = ta.value, pos = ta.selectionStart, ch = v[pos - 1], before = v[pos - 2];
    if ((ch === "/" && (pos === 1 || before === "\n") && EXT[s.entry].slash.length) || (ch === "@" && (pos === 1 || /\s/.test(before || "")))) { ui.menu = { id, k: ch === "/" ? "slash" : "at" }; renderBlock(blockOf(id)); }
    else if (ui.menu && (ui.menu.k === "slash" || ui.menu.k === "at") && ui.menu.id === id && !/[/@]\S*$/.test(v.slice(0, pos))) { ui.menu = null; renderBlock(blockOf(id)); }
    else { const send = ta.closest(".mwc").querySelectorAll('[data-act="send"]'); const off = !v.trim() && !(s.atts[id] || []).some((a) => a.st !== "bad"); send.forEach((b) => { if (!id.startsWith("st-") || !["sending", "uncertain", "offline"].includes(id.slice(3))) b.disabled = off; }); }
  });
  document.addEventListener("keydown", (e) => {
    const ta = e.target.closest?.("textarea[data-cid]");
    if (e.key === "Escape" && ui.menu) { e.preventDefault(); const id = ui.menu.id; ui.menu = null; renderBlock(blockOf(id)); document.querySelector(`textarea[data-cid="${id}"]`)?.focus(); return; }
    if (ta && e.key === "ArrowDown" && ui.menu && ui.menu.id === ta.dataset.cid) { e.preventDefault(); ta.closest(".mwc-wrap").querySelector(".mw-compose__menu .mw-menu__item")?.focus(); return; }
    const mi = e.target.closest?.(".mw-compose__menu .mw-menu__item");
    if (mi && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); const all = [...mi.closest(".mw-menu").querySelectorAll(".mw-menu__item")]; all[(all.indexOf(mi) + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length].focus(); return; }
    if (!ta || e.key !== "Enter") return;
    const id = ta.dataset.cid;
    if (e.isComposing || e.keyCode === 229) { const p = document.querySelector(`[data-ime="${id}"]`); if (p) { p.hidden = false; clearTimeout(p._t); p._t = setTimeout(() => { p.hidden = true; }, 1600); } return; }
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); send(id, e.shiftKey && isRunning(id) ? "next" : undefined); return; }
    if (id === "keys" && s.sch.keys === "C" && !s.hintSeen && ta.value.trim() && !ta.value.includes("\n")) { setTimeout(() => { ui.nudge = true; renderBlock("keys"); }, 0); }
  });
  document.addEventListener("compositionstart", (e) => { const ta = e.target.closest?.("textarea[data-cid]"); if (ta) { const p = document.querySelector(`[data-ime="${ta.dataset.cid}"]`); if (p) p.hidden = false; } });
  document.addEventListener("compositionend", (e) => { const ta = e.target.closest?.("textarea[data-cid]"); if (ta) { const p = document.querySelector(`[data-ime="${ta.dataset.cid}"]`); if (p) setTimeout(() => { p.hidden = true; }, 900); } });
  // drop zone: lit while a drag is over the box, kept while crossing children
  const dropZone = (box, on) => { const z = box.querySelector(".mwc__drop"); if (z) { z.hidden = !on; z.toggleAttribute("data-dropping", on); } };
  document.addEventListener("dragover", (e) => { const box = e.target.closest?.("[data-drop]"); if (!box) return; e.preventDefault(); dropZone(box, true); });
  document.addEventListener("dragleave", (e) => { const box = e.target.closest?.("[data-drop]"); if (box && !box.contains(e.relatedTarget)) dropZone(box, false); });
  document.addEventListener("drop", (e) => { const box = e.target.closest?.("[data-drop]"); if (!box) return; e.preventDefault(); dropZone(box, false); const files = [...(e.dataTransfer?.files || [])]; if (files.length) addFiles(box.dataset.drop, files.map((f) => ({ name: f.name, size: Math.max(1, Math.round(f.size / 1024)) + " KB" }))); });
  // strip
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("[data-lang]"); if (b) { s.lang = b.dataset.lang; save(); render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-set]"); if (b) { s.theme = b.dataset.themeSet; save(); render(); } });
  document.getElementById("words").addEventListener("click", (e) => { const b = e.target.closest("[data-words]"); if (b) { s.words = b.dataset.words; save(); render(); } });
  document.getElementById("shownew").addEventListener("click", () => { s.showNew = s.showNew === false; save(); render(); });
  document.getElementById("reset").addEventListener("click", () => { s = fresh(); ui.menu = null; ui.nudge = false; save(); render(); });
  // seed the state specimens so each shows its case
  const seed = { "st-sending": "把第二节改成三条要点", "st-running": "", "st-failed": "把第二节改成三条要点", "st-uncertain": "顺便把发布时间改到周四", "st-dropped": "", "st-offline": "联网后提醒我核对发布时间" };
  const seedEn = { "st-sending": "Make section two three bullet points", "st-failed": "Make section two three bullet points", "st-uncertain": "Also move the release to Thursday", "st-offline": "Remind me to check the release time once online" };
  function seedStates() { Object.keys(seed).forEach((k) => { s.drafts[k] = (en() ? seedEn[k] : seed[k]) || ""; }); s.threads["st-dropped"] = [{ text: en() ? "Also cover the sign-up endpoint" : "顺便把注册接口也覆盖一下", via: "add", rc: { cls: "bad", k: "rcLost", acts: [["again", "noop"], ["putback", "putback"]] } }]; }
  document.body.insertAdjacentHTML("afterbegin", (window.boardIcons || "").replace("</svg>", MIC + "</svg>"));
  const baseRender = render;
  render = function () { seedStates(); baseRender(); };
  render();
  window.addEventListener("resize", fitAll);
  window.addEventListener("load", fitAll);
})();
