// The board's parts for the unified input (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell `mw-composer`, the menu item's description line `mw-menu__desc` and the microphone glyph `mic` (a placeholder
// until voice input lands in batch 53). Like the patterns in
// catalog-patterns.ts they were on the board first; since K2 the shell's rules are served in the workbench sheet (`COMPOSER_STYLES`
// in composer-styles.ts, with the `mw-upload`, `mw-tag` and `mw-btn-group` rules it is built from) and the board reads the same
// constant. The shell holds only existing controls; it adds the box, its rows and its states. Its markup is the SDK's
// `renderComposer()` (K0c), the same first screen a plugin draws, and its menus are K2's own builders (composer-parts.ts), so the
// board, the SDK and the client cannot drift (UIC-13).
import { escapeHtml, icon, renderButton, renderComposer, renderProgress, type MwComposerAiLabels, type MwComposerStatus } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { renderComposerDeliveryMenu } from "../composer-parts.js";
import { section, specimen } from "./catalog-parts.js";
import { composerRestRules, composerRestTouch } from "../composer-styles.js";

export type Say = (text: string, values?: Record<string, string | number>) => string;

/** The board without a page translator (tests, other consumers): the Chinese text with its `{name}` values filled in. */
export const writeChinese: Say = (text, values = {}) => text.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));

/** The board's own layout for the three sections; the shell's look is `COMPOSER_STYLES` (composer-styles.ts), served to pages. */
export const COMPOSER_BOARD_STYLES = `
  .mw-catalog :is([data-primitive="composer"], [data-primitive="menu-desc"], [data-primitive="mic"]) .mw-catalog__specimen { margin: 0; }
  .mw-catalog [data-primitive="composer"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  /* The specimen whose ▾ menu is open keeps room above itself for it (the menu hangs from the whole composer), so it stays in its cell. */
  .mw-catalog [data-catalog-menu-room] { margin-top: var(--catalog-menu-room, 240px); }
  .mw-catalog [data-catalog-focus] .mw-composer__box { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-catalog [data-primitive="menu-desc"] .mw-menu { position: static; display: grid; width: min(340px, 100%); }
  .mw-catalog [data-primitive="menu-desc"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); align-items: start; }
  .mw-catalog-mic { display: grid; justify-items: center; align-content: center; gap: 8px; min-width: 72px; min-height: 80px; padding: 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); color: var(--ink); }
  .mw-catalog-mic > svg { width: var(--mic-size); height: var(--mic-size); }
  .mw-catalog-mic > span { color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
  /* At rest where height is scarce (user 11-08): the page sheet's one row, shown here under the board's own mark at a phone's
     width, with a finger's targets and with a mouse's (a short window). */
  .mw-catalog [data-catalog-compact] { display: grid; gap: 8px; max-width: 390px; }
  .mw-catalog [data-catalog-compact] > .mw-catalog__note { margin: 0; color: var(--muted); font-size: 12px; }${composerRestRules(".mw-catalog [data-catalog-compact] .mw-composer[data-rest]")}${composerRestTouch('.mw-catalog [data-catalog-compact="touch"] .mw-composer[data-rest]')}
  .mw-catalog [data-catalog-compact="touch"] .mw-composer__foot :is(.mw-btn--icon, .mw-btn--icon-only) { width: 44px; min-width: 44px; min-height: 44px; }
`;

const ghostIcon = (label: string, name: Parameters<typeof icon>[0], attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs: { title: label, ...attrs } });

/**
 * The ▾ menu as K2's client draws it (`renderComposerDeliveryMenu`): the three ways a message reaches a running AI (GLOSSARY: 补充,
 * 打断并改向, 下一轮再做), each with what choosing it does. `interruptRefused` is why the receiver cannot take an interruption: the item
 * stays, cannot be chosen and says why. The board draws it three times, so each copy names its items (`<scope>-delivery-<mode>`).
 */
function deliveryMenu(say: Say, add: string, scope: string, interruptRefused?: string): string {
  const yes = { available: true } as const;
  return renderComposerDeliveryMenu(scope, composerLabelsIn(say, say("助理"), add), { "next-boundary": yes, interrupt: interruptRefused ? { available: false, reason: interruptRefused } : yes, "after-run": yes }, true);
}

/** Every text is already in the page's language. */
interface ShellOptions {
  readonly state?: "sending" | "running" | "failed" | "unknown" | "disabled";
  readonly text?: string;
  readonly placeholder?: string;
  readonly to?: string;
  readonly restored?: boolean;
  readonly files?: string;
  readonly status?: MwComposerStatus;
  readonly focus?: boolean;
  /** The board opens this one's ▾ menu; keep room above it so the menu stays inside the specimen. */
  readonly menuRoom?: boolean;
}

/**
 * The words of the shell, in the board's language. `add` is the running send's name (补充, English Add), read by its stable key
 * (`workbench.composer.next-boundary`) where the board has the platform's words: by its Chinese alone it would meet the receipts'
 * 补充 (an input's kind, English Supplement).
 */
const composerLabelsIn = (say: Say, to: string, add: string): MwComposerAiLabels => ({
  input: say("发给 {who} 的话", { who: to }), send: say("发送"), sendTitle: say("发送（⌘↵）"), add: say("添加文件与资料"), more: say("更多"),
  files: say("文件与图片"), filesHint: say("从这台电脑选，或直接拖进输入框"), dropRefused: say("这里只收文件"), commands: say("命令"),
  searching: say("正在找…"), nothing: say("没有找到"), unavailable: say("{name} 现在用不了"), reading: say("读取中"), remove: say("移除 {name}"), retryFile: say("重试 {name}"),
  blocked: say("移除附不上的那一项再发"), restored: say("已恢复上次没发出的草稿 · {time}"), clear: say("清空草稿"), unsaved: say("草稿没能保存在本机；字还在，照常能发"),
  enterHint: say("回车已改为换行。要发送请按 {keys}"), enterHintDismiss: say("知道了"), notice: say("提示"), sending: say("发送中"), sendingText: say("正在发送…"),
  failed: say("没发出"), retry: say("重试"), unknown: say("待确认"), unknownText: say("没能确认是否送到；先别重复发"), check: say("查一下"),
  notSent: say("核对过：没有送到。字还在，可以再发"),
  to: say("发给："), stop: say("停止"), stopTitle: say("停止这一轮"), delivery: say("选择送达方式"), deliveryGroup: say("送达方式"),
  modes: {
    "next-boundary": { name: add, title: say("补充（⌘↵）"), description: say("当前回复或这批工具结束后读到，不打断") },
    interrupt: { name: say("打断并改向"), title: say("打断并改向"), description: say("丢掉正在写的回复，改按这句做；已做的不撤销") },
    "after-run": { name: say("下一轮再做"), title: say("下一轮再做（⌘⇧↵）"), description: say("排到下一轮开头，你开下一轮时带上") },
  },
  unsupported: say("这个对象不收这种送达方式"), running: say("运行中"), runningText: say("正在做这一轮 · 再发会作为补充"),
  queued: say("这一轮刚结束，留到下一轮"), replayed: say("这句已经发过，没有再发一次"),
});

/**
 * One composer as a page draws it: the SDK's first screen (`renderComposer`, the same function plugins call), with what K2's
 * client puts in as it happens (the attachment strip and the restored-draft line at the top of the box, the ▾ menu's items).
 */
function shell(say: Say, add: string, options: ShellOptions): string {
  const { state } = options;
  const to = options.to ?? say("助理");
  const drawn = renderComposer({
    kind: "ai", labels: composerLabelsIn(say, to, add),
    receiver: { label: to, ...(options.to ? { resetLabel: say("改回发给助理") } : {}) },
    placeholder: options.placeholder ?? say("让助理做点什么…"),
    // The board shows the microphone's place; a product page draws it only once it takes voice (user 11-08).
    voice: say("语音输入（还没有接上）"),
    ...(options.text ? { text: options.text } : {}),
    ...(state === "disabled" && options.status ? { disabled: { caption: options.status.caption, reason: options.status.text } } : {}),
    ...(state && state !== "disabled" ? { state } : {}),
    ...(state !== "disabled" && options.status ? { status: options.status } : {}),
    attrs: { "data-catalog-focus": options.focus, "data-catalog-menu-room": options.menuRoom },
  });
  const restored = options.restored
    ? `<p class="mw-field__hint mw-composer__restore">${escapeHtml(say("已恢复上次没发出的草稿 · 上午 11:02"))} · ${renderButton({ label: say("清空草稿"), variant: "link" })}</p>` : "";
  const menu = deliveryMenu(say, add, "catalog-composer-running");
  return drawn
    .replace('<div class="mw-composer__box">', (box) => `${box}${options.files ?? ""}${restored}`)
    // The ▾'s menu, not ＋'s (both are empty in the first screen).
    .replace(/(data-compose-menu-toggle[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>)<div class="mw-compose__menu" data-compose-menu hidden><\/div>/, (_, toggle: string) => `${toggle}<div class="mw-compose__menu" data-compose-menu hidden>${menu}</div>`);
}

/** The attachment strip is the board's upload rows: one being read, one read, one refused with its reason. */
function files(say: Say): string {
  const row = (mark: Parameters<typeof icon>[0], name: string, body: string) =>
    `<li class="mw-upload"><span class="mw-mark">${icon(mark)}</span><span>${name}${body}</span>${ghostIcon(say("移除 {name}", { name }), "x")}</li>`;
  return `<ul class="mw-uploads mw-composer__files">${
    row("note", "访谈记录.docx", renderProgress({ value: 60, label: say("{name} 读取中", { name: "访谈记录.docx" }) }))
    + row("image", "首页草图.png", "<small>820 KB</small>")
    + row("file", "年度报告.pdf", `<small class="is-failed">${escapeHtml(say("太大（2.1 GB），附不上"))}</small>`)
  }</ul>`;
}

export function composerSection(say: Say, add = say("补充")): string {
  const task = say("把第 3 步的测试补上");
  // A request well past the field's cap (about twice its 240px in either language), so the box plainly scrolls inside.
  const long = [
    say("把第 3 步的测试补上：注册接口的失败路径要覆盖超时、重复提交和服务端拒绝三种情况，每种都要断言输入框里的字还在。"),
    say("另外看一下 Coding 的会话草稿在写入失败后刷新页面能不能恢复；能的话把恢复后的提示行截一张图，深色和浅色各一张。"),
    say("再核对一遍发送中按钮是不是真的锁住了：连按三次 ⌘↵ 只能发出一次，网络断开时状态行要写「待确认」而不是「失败」。"),
    say("附件那边，超过上限的文件要在附件条上当场写原因、可以移除，不要等到发送时才报错；读到一半取消的也要能重新选。"),
    say("窄屏也看一下：390 宽时底行的按钮要有 44px 高，状态行的说明成段折行，操作跟在文字后面，不要挤成一条细列。"),
    say("中文输入法选词的时候按回车只是确认选词，不能换行也不能发送；按 ⌘↵ 也一样要等选词结束。"),
    say("切到别的会话再回来，没发出的字要还在，各是各的；迟到的上传结果不能写进已经换掉的那个框。"),
    say("最后把这一轮改到的文件列出来，按改动大小排序，标出哪些是新文件，哪些只改了测试。"),
    say("如果中间遇到需要我决定的地方，先停下来问我，不要自己选；拿不准的写在最后，我一起看。"),
  ].join("\n\n");
  return section("composer", escapeHtml(say("多行输入框 / Composer")), `<p class="mw-catalog__hint">${escapeHtml(say("首页单行胶囊长成多行：同一套圆角、阴影和焦点描边。写字区随内容长高，到 240px 或窗口的 40% 后在框里滚动。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("空白")), shell(say, add, {}))}
    ${specimen(escapeHtml(say("静止 · 手机上收成一行")), `<div data-catalog-compact="touch">${shell(say, add, {})}<p class="mw-catalog__note">${escapeHtml(say("没人写字、没有附件也没有状态时，手机（≤ 600px 宽）上是一行：＋、发给谁的小标签、输入框、发送；一开始写就长回多行。"))}</p></div>`)}
    ${specimen(escapeHtml(say("静止 · 矮窗口收成一行")), `<div data-catalog-compact>${shell(say, add, {})}<p class="mw-catalog__note">${escapeHtml(say("矮窗口（≤ 560px 高）用鼠标时同样一行，按钮和输入框是鼠标的尺寸。"))}</p></div>`)}
    ${specimen(escapeHtml(say("普通 · 只有编辑器层")), renderComposer({ kind: "plain", labels: { ...composerLabelsIn(say, say("助理"), add), input: say("评论") }, placeholder: say("写评论…"), add: false }))}
    ${specimen(escapeHtml(say("聚焦")), shell(say, add, { focus: true, text: task }))}
    ${specimen(escapeHtml(say("有草稿 · 恢复行")), shell(say, add, { restored: true, text: say("把第 3 步的测试补上，再看一下 Coding 的会话草稿") }))}
    ${specimen(escapeHtml(say("附件与长高到上限 · 框内滚动")), shell(say, add, { to: say("Coding · 注册接口"), files: files(say), text: long }))}
    ${specimen(escapeHtml(say("处理中 · 发送中")), shell(say, add, { state: "sending", text: task, status: { caption: say("发送中"), text: say("正在发送…") } }))}
    ${specimen(escapeHtml(say("处理中 · 运行中 · 送达菜单")), shell(say, add, { state: "running", menuRoom: true, text: say("顺便把失败截图也附上"), status: { caption: say("运行中"), text: say("正在做这一轮 · 再发会作为补充") } }))}
    ${specimen(escapeHtml(say("失败")), shell(say, add, { state: "failed", text: task, status: { caption: say("失败"), text: say("没发出去：连接被重置。文字还在，可以改了再发"), action: say("重试") } }))}
    ${specimen(escapeHtml(say("待确认")), shell(say, add, { state: "unknown", text: task, status: { caption: say("待确认"), text: say("没能确认是否送到，正在核对；先别重复发"), action: say("查看") } }))}
    ${specimen(escapeHtml(say("不可用")), shell(say, add, { state: "disabled", placeholder: say("这个会话已结束"), status: { caption: say("不可用"), text: say("会话已结束，不能再发；新开一个会话接着做") } }))}
  </div>`);
}

export function menuDescSection(say: Say, delivery = say("补充")): string {
  const add = renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("项目资料…"), iconName: "book", description: say("从这个项目已经收进来的资料里选") })
    + renderMenuItem({ label: say("文件与图片"), iconName: "paperclip", description: say("从这台电脑选，或直接拖进输入框") })
    + renderMenuItem({ label: say("Todo · 待办"), iconName: "package", description: say("没有可选的待办：这个项目里还没有建"), disabled: true }) }) });
  return section("menu-desc", escapeHtml(say("菜单说明行 / Menu Description")), `<p class="mw-catalog__hint">${escapeHtml(say("挂在菜单项下一行的灰字，说清选它会怎样；不可选时写原因。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("带快捷键 · 送达方式")), deliveryMenu(say, delivery, "catalog-menu-desc"))}
    ${specimen(escapeHtml(say("不可选并写原因")), deliveryMenu(say, delivery, "catalog-menu-desc-refused", say("这个对象不支持打断：它一次只做完一整轮")))}
    ${specimen(escapeHtml(say("不带快捷键 · 添加")), add)}
    ${specimen(escapeHtml(say("长说明没有标点 · 在框内折行")), renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("合并到上一条"), iconName: "message", description: say("把这句话接在你上一条还没被读到的消息后面一起送给助理而不另起一条") }) }) }))}
  </div>`);
}

export function micSection(say: Say): string {
  const glyph = (size: 16 | 20) => `<span class="mw-catalog-mic" style="--mic-size: ${size}px">${icon("mic")}<span>${size}px</span></span>`;
  const voice = say("语音输入（还没有接上）");
  return section("mic", escapeHtml(say("麦克风图标 / Mic")), `<p class="mw-catalog__hint">${escapeHtml(say("只占位置：语音输入还没有接上（第 53 批）。放在输入框底行右侧，停止和发送的左边。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("两个尺寸")), glyph(16) + glyph(20))}
    ${specimen(escapeHtml(say("在按钮里 · 常态与不可用")), ghostIcon(say("语音输入"), "mic") + ghostIcon(voice, "mic", { disabled: true }) + renderButton({ label: say("语音输入"), variant: "secondary", icon: "mic" }))}
  </div>`);
}
