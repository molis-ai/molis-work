// The board's parts for the unified input (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell `mw-composer`, the menu item's description line `mw-menu__desc` and the microphone glyph `mic` (a placeholder
// until voice input lands in batch 53). Like the patterns in
// catalog-patterns.ts they live on the board first: the rules below are the board's own (not in the served sheets) and move into
// the page sheets with the component that first uses them (K2, together with the `mw-upload`, `mw-tag` and `mw-btn-group` rules
// the shell is built from). The shell holds only existing controls; it adds the box, its rows and its states. Its markup is the
// SDK's `renderComposer()` (K0c), the same first screen a plugin draws, so the board and the SDK cannot drift (UIC-13).
import { escapeHtml, icon, renderButton, renderComposer, renderProgress, type MwComposerAiLabels, type MwComposerStatus } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";

export type Say = (text: string, values?: Record<string, string | number>) => string;

/** The board without a page translator (tests, other consumers): the Chinese text with its `{name}` values filled in. */
export const writeChinese: Say = (text, values = {}) => text.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));

/**
 * The shell, as the home bar's one-line capsule draws it (`--r-composer`, `--lift-1`, `--line-strong` on focus), grown to rows.
 * States are one attribute on `.mw-composer`, `data-state`: `sending`, `running`, `failed`, `unknown` (sent, not confirmed:
 * `ComposerOutcome.state`, the same word as `[data-state="unknown"]` elsewhere) or `disabled`; none is the ordinary state. Focus is `:focus-within`, never an attribute. Menus inside open upwards, from the bar they belong to.
 */
export const COMPOSER_BOARD_STYLES = `
  .mw-composer { display: grid; gap: 6px; width: min(640px, 100%); min-width: 0; container: mw-composer / inline-size; }
  .mw-composer__to { display: flex; align-items: center; gap: 6px; min-width: 0; padding-inline: 4px; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .mw-composer__to .mw-tag { min-width: 0; max-width: min(100%, 320px); }
  .mw-composer__to .mw-tag > span { overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__box { position: relative; display: grid; min-width: 0; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); transition: box-shadow var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  .mw-composer__box:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-composer__files { width: auto; padding: 6px 6px 0; }
  .mw-composer__restore { margin: 0; padding: 8px 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__restore .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-composer__text { display: flex; padding: 10px 12px 0; }
  /* The page sheets style every bare textarea (a border and a field's fill); the field here is the box itself, so one id-weight
     \`:not\` takes those off, as the button group's joined corners do. */
  .mw-composer__text > .mw-composer__input:not(#mw-composer) { flex: 1; min-width: 0; min-height: 2lh; padding: 0; border: 0; border-radius: 0; outline: 0; background: transparent; box-shadow: none; color: var(--ink); font: inherit; font-size: 14px; line-height: 22px; }
  .mw-composer__input::placeholder { color: var(--muted); }
  .mw-composer__status { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 8px 12px 0; color: var(--ink-soft); font-size: 12px; line-height: 18px; text-wrap: pretty; }
  .mw-composer__status > .mw-status { flex: none; }
  .mw-composer__status > span:not(.mw-status) { flex: 1; min-width: 0; }
  .mw-composer__status .mw-btn--link { flex: none; min-height: 0; padding: 0; }
  /* In a narrow box the explanation is the part that must be read: it flows as one paragraph that starts beside the mark and
     wraps under it, with the action following its last words, instead of a thin column squeezed between the two. */
  @container mw-composer (max-width: 480px) {
    .mw-composer__status { display: block; }
    .mw-composer__status > .mw-status { margin-right: 8px; vertical-align: 1px; }
    .mw-composer__status .mw-btn--link { margin-left: 8px; vertical-align: baseline; }
  }
  .mw-composer__foot { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 6px 8px 8px; }
  .mw-composer__start, .mw-composer__end { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .mw-composer__start { flex: 1; }
  .mw-composer__end { flex: none; }
  /* The menu hangs from the input box's top right, not from the ▾ button, so it can be as wide as the box and never leave it. */
  .mw-composer__end .mw-compose__anchor { position: static; }
  .mw-composer .mw-compose__menu { top: auto; right: 0; bottom: calc(100% + 6px); left: auto; width: min(340px, 100%); }
  .mw-composer .mw-compose__menu .mw-menu { width: 100%; min-width: 0; animation-name: craft-rise-from-bar; }
  .mw-composer[data-state="failed"] .mw-composer__box { box-shadow: 0 0 0 1px color-mix(in srgb, var(--red) 45%, transparent), var(--lift-1); }
  .mw-composer[data-state="disabled"] .mw-composer__box { background: var(--wash); box-shadow: 0 0 0 1px var(--line); }
  .mw-composer[data-state="disabled"] .mw-composer__input:not(#mw-composer) { color: var(--muted); cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { .mw-composer__box { transition: none; } }
  @media (max-width: 600px), (pointer: coarse) {
    .mw-composer__text > .mw-composer__input:not(#mw-composer) { font-size: 16px; }
    .mw-composer__foot .mw-btn--sm, .mw-composer__foot .mw-btn--icon { min-height: 44px; }
    .mw-composer__foot .mw-btn--icon-only { width: 44px; min-width: 44px; }
  }

  /* Glyph, name and shortcut on the first row; the description takes the whole width under them, the shortcut's column too. */
  .mw-menu__item--described { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 2px 8px; padding-block: 8px; }
  .mw-menu__item--described > :is(svg, .mw-menu__check) { grid-area: 1 / 1; align-self: center; }
  .mw-menu__item--described > [data-slot="menu-item-label"] { display: contents; }
  .mw-menu__item--described > [data-slot="menu-item-label"] > span { grid-area: 1 / 2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-menu__item--described .mw-menu__shortcut { grid-area: 1 / 3; }
  .mw-menu__desc { grid-column: 2 / -1; color: var(--muted); font-size: 12px; font-weight: var(--weight-body, 400); line-height: 18px; text-wrap: pretty; word-break: keep-all; overflow-wrap: anywhere; }

  .mw-catalog :is([data-primitive="composer"], [data-primitive="menu-desc"], [data-primitive="mic"]) .mw-catalog__specimen { margin: 0; }
  .mw-catalog [data-primitive="composer"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  /* The specimen whose ▾ menu is open keeps room above itself for it, so the menu stays inside its own cell. */
  .mw-catalog [data-catalog-menu-room] { padding-top: var(--catalog-menu-room, 240px); }
  .mw-catalog [data-catalog-focus] .mw-composer__box { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-catalog [data-primitive="menu-desc"] .mw-menu { position: static; display: grid; width: min(340px, 100%); }
  .mw-catalog [data-primitive="menu-desc"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); align-items: start; }
  .mw-catalog-mic { display: grid; justify-items: center; align-content: center; gap: 8px; min-width: 72px; min-height: 80px; padding: 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); color: var(--ink); font-size: 11px; }
  .mw-catalog-mic > svg { width: var(--mic-size); height: var(--mic-size); }
  .mw-catalog-mic > small { color: var(--muted); font-variant-numeric: tabular-nums; }
`;

const ghostIcon = (label: string, name: Parameters<typeof icon>[0], attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs: { title: label, ...attrs } });

/**
 * The three ways a message reaches a running AI (GLOSSARY: 补充, 打断并改向, 下一轮再做), each with what choosing it does.
 * `interruptRefused` is why the receiver cannot take an interruption: the item stays, cannot be chosen and says why.
 */
function deliveryItems(say: Say, scope: string, interruptRefused?: string): string {
  // The board draws this menu three times, so each copy names its items (`<scope>-delivery-<mode>`, as K2's client will).
  return renderMenuItem({ id: `${scope}-delivery-next-boundary`, label: say("补充（默认）"), iconName: "message", description: say("当前回复或这批工具结束后读到，不打断"), shortcut: "⌘↵" })
    + renderMenuItem({ id: `${scope}-delivery-interrupt`, label: say("打断并改向"), iconName: "zap", description: interruptRefused ?? say("丢掉正在写的回复，改按这句做；已做的不撤销"), disabled: Boolean(interruptRefused) })
    + renderMenuItem({ id: `${scope}-delivery-after-run`, label: say("下一轮再做"), iconName: "clock", description: say("排到下一轮开头，你开下一轮时带上"), shortcut: "⌘⇧↵" });
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

/** The words of the shell, in the board's language. */
const labelsIn = (say: Say, to: string): MwComposerAiLabels => ({
  input: say("发给 {who} 的话", { who: to }), send: say("发送"), sendTitle: say("发送（⌘↵）"), add: say("添加文件与资料"),
  voice: say("语音输入（还没有接上）"), to: say("发给："), stop: say("停止"), supplement: say("补充"), supplementTitle: say("补充（⌘↵）"),
  delivery: say("选择送达方式"), deliveryGroup: say("送达方式"),
});

/**
 * One composer as a page draws it: the SDK's first screen (`renderComposer`, the same function plugins call), with what K2's
 * client puts in as it happens (the attachment strip and the restored-draft line at the top of the box, the ▾ menu's items).
 */
function shell(say: Say, options: ShellOptions): string {
  const { state } = options;
  const to = options.to ?? say("助理");
  const drawn = renderComposer({
    kind: "ai", labels: labelsIn(say, to),
    receiver: { label: to, ...(options.to ? { resetLabel: say("改回发给助理") } : {}) },
    placeholder: options.placeholder ?? say("让助理做点什么…"),
    ...(options.text ? { text: options.text } : {}),
    ...(state === "disabled" && options.status ? { disabled: { caption: options.status.caption, reason: options.status.text } } : {}),
    ...(state && state !== "disabled" ? { state } : {}),
    ...(state !== "disabled" && options.status ? { status: options.status } : {}),
    attrs: { "data-catalog-focus": options.focus, "data-catalog-menu-room": options.menuRoom },
  });
  const restored = options.restored
    ? `<p class="mw-field__hint mw-composer__restore">${escapeHtml(say("已恢复上次没发出的草稿 · 上午 11:02"))} · ${renderButton({ label: say("清空草稿"), variant: "link" })}</p>` : "";
  const menu = renderMenu({ items: renderMenuGroup({ label: say("送达方式"), items: deliveryItems(say, "catalog-composer-running") }) });
  return drawn
    .replace('<div class="mw-composer__box">', (box) => `${box}${options.files ?? ""}${restored}`)
    .replace('<div class="mw-compose__menu" data-compose-menu hidden></div>', () => `<div class="mw-compose__menu" data-compose-menu hidden>${menu}</div>`);
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

export function composerSection(say: Say): string {
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
    ${specimen(escapeHtml(say("空白")), shell(say, {}))}
    ${specimen(escapeHtml(say("聚焦")), shell(say, { focus: true, text: task }))}
    ${specimen(escapeHtml(say("有草稿 · 恢复行")), shell(say, { restored: true, text: say("把第 3 步的测试补上，再看一下 Coding 的会话草稿") }))}
    ${specimen(escapeHtml(say("附件与长高到上限 · 框内滚动")), shell(say, { to: say("Coding · 注册接口"), files: files(say), text: long }))}
    ${specimen(escapeHtml(say("处理中 · 发送中")), shell(say, { state: "sending", text: task, status: { caption: say("发送中"), text: say("正在发送…") } }))}
    ${specimen(escapeHtml(say("处理中 · 运行中 · 送达菜单")), shell(say, { state: "running", menuRoom: true, text: say("顺便把失败截图也附上"), status: { caption: say("运行中"), text: say("正在做这一轮 · 再发会作为补充") } }))}
    ${specimen(escapeHtml(say("失败")), shell(say, { state: "failed", text: task, status: { caption: say("失败"), text: say("没发出去：连接被重置。文字还在，可以改了再发"), action: say("重试") } }))}
    ${specimen(escapeHtml(say("待确认")), shell(say, { state: "unknown", text: task, status: { caption: say("待确认"), text: say("没能确认是否送到，正在核对；先别重复发"), action: say("查看") } }))}
    ${specimen(escapeHtml(say("不可用")), shell(say, { state: "disabled", placeholder: say("这个会话已结束"), status: { caption: say("不可用"), text: say("会话已结束，不能再发；新开一个会话接着做") } }))}
  </div>`);
}

export function menuDescSection(say: Say): string {
  const modes = say("送达方式");
  const add = renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("项目资料…"), iconName: "book", description: say("从这个项目已经收进来的资料里选") })
    + renderMenuItem({ label: say("文件与图片"), iconName: "paperclip", description: say("从这台电脑选，或直接拖进输入框") })
    + renderMenuItem({ label: say("Todo · 待办"), iconName: "package", description: say("没有可选的待办：这个项目里还没有建"), disabled: true }) }) });
  return section("menu-desc", escapeHtml(say("菜单说明行 / Menu Description")), `<p class="mw-catalog__hint">${escapeHtml(say("挂在菜单项下一行的灰字，说清选它会怎样；不可选时写原因。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("带快捷键 · 送达方式")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say, "catalog-menu-desc") }) }))}
    ${specimen(escapeHtml(say("不可选并写原因")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say, "catalog-menu-desc-refused", say("这个对象不支持打断：它一次只做完一整轮")) }) }))}
    ${specimen(escapeHtml(say("不带快捷键 · 添加")), add)}
    ${specimen(escapeHtml(say("长说明没有标点 · 在框内折行")), renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("合并到上一条"), iconName: "message", description: say("把这句话接在你上一条还没被读到的消息后面一起送给助理而不另起一条") }) }) }))}
  </div>`);
}

export function micSection(say: Say): string {
  const glyph = (size: 16 | 20) => `<span class="mw-catalog-mic" style="--mic-size: ${size}px">${icon("mic")}<small>${size}px</small></span>`;
  const voice = say("语音输入（还没有接上）");
  return section("mic", escapeHtml(say("麦克风图标 / Mic")), `<p class="mw-catalog__hint">${escapeHtml(say("只占位置：语音输入还没有接上（第 53 批）。放在输入框底行右侧，停止和发送的左边。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("两个尺寸")), glyph(16) + glyph(20))}
    ${specimen(escapeHtml(say("在按钮里 · 常态与不可用")), ghostIcon(say("语音输入"), "mic") + ghostIcon(voice, "mic", { disabled: true }) + renderButton({ label: say("语音输入"), variant: "secondary", icon: "mic" }))}
  </div>`);
}
