// The board's parts for the unified input (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell `mw-composer` and the menu item's description line `mw-menu__desc` (the microphone glyph and its place in the
// bar come with K0c, which owns the SDK's icon names). Like the patterns in
// catalog-patterns.ts they live on the board first: the rules below are the board's own (not in the served sheets) and move into
// the page sheets with the component that first uses them (K2, together with the `mw-upload`, `mw-tag` and `mw-btn-group` rules
// the shell is built from). The shell holds only existing controls; it adds the box, its rows and its states.
import { escapeHtml, icon, renderButton, renderProgress, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";

export type Say = (text: string, values?: Record<string, string | number>) => string;

/** The board without a page translator (tests, other consumers): the Chinese text with its `{name}` values filled in. */
export const writeChinese: Say = (text, values = {}) => text.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));

/**
 * The shell, as the home bar's one-line capsule draws it (`--r-composer`, `--lift-1`, `--line-strong` on focus), grown to rows.
 * States are one attribute on `.mw-composer`, `data-state`: `sending`, `running`, `failed`, `unconfirmed` or `disabled`; none is
 * the ordinary state. Focus is `:focus-within`, never an attribute. Menus inside open upwards, from the bar they belong to.
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
  /* While its menu is open the ▾ stays pressed, the same fill as the primary button's :active. */
  .mw-composer .mw-btn--primary[aria-expanded="true"]:not(:disabled) { background: color-mix(in srgb, var(--action) 82%, var(--action-ink)); }
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

  .mw-catalog :is([data-primitive="composer"], [data-primitive="menu-desc"]) .mw-catalog__specimen { margin: 0; }
  .mw-catalog [data-primitive="composer"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  /* The specimen whose ▾ menu is open keeps room above itself for it, so the menu stays inside its own cell. */
  .mw-catalog [data-catalog-menu-room] { padding-top: var(--catalog-menu-room, 240px); }
  .mw-catalog [data-catalog-focus] .mw-composer__box { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-catalog [data-primitive="menu-desc"] .mw-menu { position: static; display: grid; width: min(340px, 100%); }
  .mw-catalog [data-primitive="menu-desc"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); align-items: start; }
`;

const ghostIcon = (label: string, name: Parameters<typeof icon>[0], attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs: { title: label, ...attrs } });

/**
 * The three ways a message reaches a running AI (GLOSSARY: 补充, 打断并改向, 下一轮再做), each with what choosing it does.
 * `interruptRefused` is why the receiver cannot take an interruption: the item stays, cannot be chosen and says why.
 */
function deliveryItems(say: Say, interruptRefused?: string): string {
  return renderMenuItem({ label: say("补充（默认）"), iconName: "message", description: say("当前回复或这批工具结束后读到，不打断"), shortcut: "⌘↵" })
    + renderMenuItem({ label: say("打断并改向"), iconName: "zap", description: interruptRefused ?? say("丢掉正在写的回复，改按这句做；已做的不撤销"), disabled: Boolean(interruptRefused) })
    + renderMenuItem({ label: say("下一轮再做"), iconName: "clock", description: say("排到下一轮开头，你开下一轮时带上"), shortcut: "⌘⇧↵" });
}

/** Every text is already in the page's language. */
interface ShellOptions {
  readonly state?: "sending" | "running" | "failed" | "unconfirmed" | "disabled";
  readonly text?: string;
  readonly placeholder?: string;
  readonly to?: string;
  readonly restored?: boolean;
  readonly files?: string;
  readonly status?: { readonly tone: MwStatusTone; readonly ring: StateRingState; readonly caption: string; readonly text: string; readonly action?: string };
  readonly focus?: boolean;
  /** The board opens this one's ▾ menu; keep room above it so the menu stays inside the specimen. */
  readonly menuRoom?: boolean;
}

/** One composer as K2 will draw it: who it goes to, files, the text, the status and the bar. */
function shell(say: Say, options: ShellOptions): string {
  const { state } = options;
  const disabled = state === "disabled", running = state === "running", busy = state === "sending" || state === "unconfirmed";
  const to = options.to ?? say("助理");
  const back = escapeHtml(say("改回发给助理"));
  const receiver = `<div class="mw-composer__to"><span>${escapeHtml(say("发给："))}</span><span class="mw-tag"><span>${escapeHtml(to)}</span>${
    options.to ? `<button type="button" data-tag-remove aria-label="${back}" title="${back}">${icon("x")}</button>` : ""}</span></div>`;
  const restored = options.restored
    ? `<p class="mw-field__hint mw-composer__restore">${escapeHtml(say("已恢复上次没发出的草稿 · 上午 11:02"))} · ${renderButton({ label: say("清空草稿"), variant: "link" })}</p>` : "";
  const status = options.status
    ? `<div class="mw-composer__status" role="status">${renderStatusMark({ label: options.status.caption, state: options.status.ring, tone: options.status.tone })}<span>${escapeHtml(options.status.text)}</span>${
      options.status.action ? renderButton({ label: options.status.action, variant: "link" }) : ""}</div>`
    : "";
  const empty = !options.text;
  const modes = say("送达方式");
  const send = running
    ? `<div class="mw-btn-group" role="group" aria-label="${escapeHtml(modes)}">${renderButton({ label: say("补充"), variant: "primary", size: "sm", disabled: empty, attrs: { title: say("补充（⌘↵）") } })}<div class="mw-compose__anchor">${renderButton({
      label: say("选择送达方式"), variant: "primary", size: "icon", icon: "chevron-down", iconOnly: true,
      attrs: { title: say("选择送达方式"), "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" },
    })}<div class="mw-compose__menu" data-compose-menu hidden>${renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say) }) })}</div></div></div>`
    : renderButton({ label: say("发送"), variant: "primary", size: "icon", icon: "send", iconOnly: true, loading: state === "sending", disabled: empty || busy || disabled, attrs: { title: say("发送（⌘↵）") } });
  const off: Record<string, boolean> = disabled ? { disabled: true } : {};
  const add = `<div class="mw-compose__anchor">${ghostIcon(say("添加文件与资料"), "plus", { "aria-haspopup": "menu", "aria-expanded": "false", ...off })}</div>`;
  const stop = running ? renderButton({ label: say("停止"), variant: "danger-outline", size: "sm", attrs: { title: say("停止这一轮") } }) : "";
  return `<div class="mw-composer" data-slot="composer"${state ? ` data-state="${state}"` : ""}${options.focus ? " data-catalog-focus" : ""}${options.menuRoom ? " data-catalog-menu-room" : ""}>
    ${receiver}
    <div class="mw-composer__box">
      ${options.files ?? ""}${restored}
      <div class="mw-composer__text"><textarea class="mw-composer__input" data-fit rows="1" aria-label="${escapeHtml(say("发给 {who} 的话", { who: to }))}" placeholder="${escapeHtml(options.placeholder ?? say("让助理做点什么…"))}"${disabled ? " disabled" : ""}>${escapeHtml(options.text ?? "")}</textarea></div>
      ${status}
      <div class="mw-composer__foot"><div class="mw-composer__start">${add}</div><div class="mw-composer__end">${stop}${send}</div></div>
    </div>
  </div>`;
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
  // A request long enough to pass the field's cap, so the box scrolls inside.
  const long = [
    say("把第 3 步的测试补上：注册接口的失败路径要覆盖超时、重复提交和服务端拒绝三种情况，每种都要断言输入框里的字还在。"),
    say("另外看一下 Coding 的会话草稿在写入失败后刷新页面能不能恢复；能的话把恢复后的提示行截一张图，深色和浅色各一张。"),
    say("最后把这一轮改到的文件列出来，按改动大小排序，标出哪些是新文件。"),
    say("如果中间遇到需要我决定的地方，先停下来问我，不要自己选。"),
  ].join("\n\n");
  return section("composer", escapeHtml(say("多行输入框 / Composer")), `<p class="mw-catalog__hint">${escapeHtml(say("首页单行胶囊长成多行：同一套圆角、阴影和焦点描边。写字区随内容长高，到 240px 或窗口的 40% 后在框里滚动。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("空白")), shell(say, {}))}
    ${specimen(escapeHtml(say("聚焦")), shell(say, { focus: true, text: task }))}
    ${specimen(escapeHtml(say("有草稿 · 恢复行")), shell(say, { restored: true, text: say("把第 3 步的测试补上，再看一下 Coding 的会话草稿") }))}
    ${specimen(escapeHtml(say("附件与长高到上限 · 框内滚动")), shell(say, { to: say("Coding · 注册接口"), files: files(say), text: long }))}
    ${specimen(escapeHtml(say("处理中 · 发送中")), shell(say, { state: "sending", text: task, status: { tone: "progress", ring: "starting", caption: say("发送中"), text: say("正在发送…") } }))}
    ${specimen(escapeHtml(say("处理中 · 运行中 · 送达菜单")), shell(say, { state: "running", menuRoom: true, text: say("顺便把失败截图也附上"), status: { tone: "progress", ring: "running", caption: say("运行中"), text: say("正在做这一轮 · 再发会作为补充") } }))}
    ${specimen(escapeHtml(say("失败")), shell(say, { state: "failed", text: task, status: { tone: "blocked", ring: "failed", caption: say("失败"), text: say("没发出去：连接被重置。文字还在，可以改了再发"), action: say("重试") } }))}
    ${specimen(escapeHtml(say("待确认")), shell(say, { state: "unconfirmed", text: task, status: { tone: "attention", ring: "verify", caption: say("待确认"), text: say("没能确认是否送到，正在核对；先别重复发"), action: say("查看") } }))}
    ${specimen(escapeHtml(say("不可用")), shell(say, { state: "disabled", placeholder: say("这个会话已结束"), status: { tone: "hold", ring: "unavailable", caption: say("不可用"), text: say("会话已结束，不能再发；新开一个会话接着做") } }))}
  </div>`);
}

export function menuDescSection(say: Say): string {
  const modes = say("送达方式");
  const add = renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("项目资料…"), iconName: "book", description: say("从这个项目已经收进来的资料里选") })
    + renderMenuItem({ label: say("文件与图片"), iconName: "paperclip", description: say("从这台电脑选，或直接拖进输入框") })
    + renderMenuItem({ label: say("Todo · 待办"), iconName: "package", description: say("没有可选的待办：这个项目里还没有建"), disabled: true }) }) });
  return section("menu-desc", escapeHtml(say("菜单说明行 / Menu Description")), `<p class="mw-catalog__hint">${escapeHtml(say("挂在菜单项下一行的灰字，说清选它会怎样；不可选时写原因。"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("带快捷键 · 送达方式")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say) }) }))}
    ${specimen(escapeHtml(say("不可选并写原因")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say, say("这个对象不支持打断：它一次只做完一整轮")) }) }))}
    ${specimen(escapeHtml(say("不带快捷键 · 添加")), add)}
    ${specimen(escapeHtml(say("长说明没有标点 · 在框内折行")), renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("合并到上一条"), iconName: "message", description: say("把这句话接在你上一条还没被读到的消息后面一起送给助理而不另起一条") }) }) }))}
  </div>`);
}
