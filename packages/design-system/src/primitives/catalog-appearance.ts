// The board's parts for choosing a look (docs/design/appearance-selection/README.md「组件板新增」, decided by the user 2026-11-04: plan C, a specimen beside
// the choices, then apply): the look card, the specimen card and the fade when the look changes. Batch 16's Settings page is the first product page that draws
// them; the render functions are not published yet (they are lifted with that page), and the rules are the board's own (catalog-appearance-styles.ts).
// Every control inside is an existing one: these parts only place them, and a look's tokens come from the interface's baseline files (catalog-appearance-looks.ts).
import { escapeHtml, renderBadge, renderButton, renderField, renderInput, renderStateRing, renderStatusMark, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";
import { BASELINE_FONT_NAME, SOFT_LOOK, TEAL_LOOK, WARM_LOOK, type BoardLook, type LookTheme } from "./catalog-appearance-looks.js";

/** Long enough to meet the narrowest card and the narrowest line, in both languages. */
const LONG_NAME = "一套名字很长很长的外观，窄卡里要折行读全";
const LONG_FONT = "一款名字也很长的推荐字体";
const PROBLEMS = ["深色下正文和底色的对比不够。", "推荐字体不在这台电脑上，也没有随方案带来。"];
const LONG_PROBLEMS = [...PROBLEMS, "有一处颜色引用了规格里没有的角色，换成规格里有的，或者交给助理改好再试一次。"];

export type AppearanceLook = Pick<BoardLook, "id" | "name" | "by"> & { readonly previewSkin?: string };

export interface LookCardState {
  readonly inUse?: boolean;
  readonly trying?: boolean;
  readonly fails?: boolean;
  readonly pressed?: boolean;
  readonly menuOpen?: boolean;
  readonly more?: boolean;
  readonly name?: string;
  readonly fontName?: string;
}

/**
 * One look as a card: the picture the look draws of itself, its name and where it came from, the type it suggests, and what state it is in, said in
 * words. The whole card is one button; the more-actions button beside it is the card's other control, not inside the first.
 */
export function renderLookCard(say: Say, look: AppearanceLook, state: LookCardState = {}): string {
  const t = (text: string, values?: Record<string, string | number>) => escapeHtml(say(text, values));
  const name = state.name ?? look.name;
  const badges = [
    `<span class="mw-look-card__current"${state.inUse ? "" : " hidden"}>${renderBadge({ label: say("在用"), tone: "success" })}</span>`,
    `<span class="mw-look-card__trial"${state.trying ? "" : " hidden"}>${renderBadge({ label: say("样张里"), tone: "info" })}</span>`,
    state.fails ? renderBadge({ label: say("没通过检查"), tone: "warning" }) : "",
  ].join("");
  const picture = `<span class="mw-look-card__view" data-look="${escapeHtml(look.id)}"${look.previewSkin ? ` data-ui-skin="${escapeHtml(look.previewSkin)}"` : ""} aria-hidden="true"><span class="mw-look-card__sheet"><span class="mw-look-card__sample">Aa 你好 12</span><i class="mw-look-card__line"></i><i class="mw-look-card__line"></i><span class="mw-look-card__marks"><i class="mw-look-card__button"></i><i class="mw-look-card__dot"></i><i class="mw-look-card__dot"></i><i class="mw-look-card__dot"></i></span></span></span>`;
  const mine = look.by === "我的方案";
  const items = renderMenuItem({ label: say("复制为我的方案"), iconName: "copy" })
    + (mine ? renderMenuItem({ label: say("导出…"), iconName: "download" }) + renderMenuItem({ label: say("移除"), iconName: "trash", danger: true, disabled: state.inUse, ...(state.inUse ? { description: say("在用的外观不能移除") } : {}) }) : "");
  const more = renderButton({ label: say("更多操作：{name}", { name: say(name) }), variant: "ghost", size: "sm", icon: "more", iconOnly: true, attrs: { "aria-haspopup": "menu", "aria-expanded": String(Boolean(state.menuOpen)), "data-compose-menu-toggle": "" } });
  return `<div class="mw-look-card" data-look-card="${escapeHtml(look.id)}">
    <button type="button" class="mw-look-card__pick" aria-pressed="${Boolean(state.pressed)}"${state.inUse ? " data-look-in-use" : ""}>
      ${picture}
      <span class="mw-look-card__text"><span class="mw-look-card__name">${t(name)}</span><span class="mw-look-card__meta">${t("{by} · 推荐「{font}」", { by: say(look.by), font: say(state.fontName ?? BASELINE_FONT_NAME) })}</span></span>
      <span class="mw-look-card__badges">${badges}</span>
    </button>
    ${state.more ? `<div class="mw-look-card__more">${more}<div class="mw-compose__menu" data-compose-menu${state.menuOpen ? " data-menu-held" : " hidden"}>${renderMenu({ items })}</div></div>` : ""}
  </div>`;
}

export const renderLookGroup = (say: Say, cards: string, className = ""): string =>
  `<div class="mw-look-grid${className}" role="group" aria-label="${escapeHtml(say("皮肤"))}" data-look-cards>${cards}</div>`;

export function lookCardSection(say: Say): string {
  const card = (look: BoardLook, state: LookCardState) => renderLookCard(say, look, { ...state, more: true });
  return section("look-card", say("外观卡 / Look Card"), `<div class="mw-catalog__specimens">
    ${specimen(say("一排外观：在用、样张里、没通过检查"), renderLookGroup(say, card(SOFT_LOOK, { inUse: true }) + card(TEAL_LOOK, { pressed: true, trying: true }) + card(WARM_LOOK, { fails: true })))}
    ${specimen(say("最挤：名字很长，卡窄"), renderLookGroup(say, card(WARM_LOOK, { fails: true, name: LONG_NAME, fontName: LONG_FONT }), " mw-look-grid--narrow"))}
    ${specimen(say("更多操作：卡角的独立按钮"), renderLookGroup(say, card(TEAL_LOOK, { inUse: true, menuOpen: true }), " mw-look-grid--narrow mw-look-grid--room"))}
  </div>`);
}

type ProofState = "idle" | "ready" | "loading" | "failed" | "invalid" | "conflict";

export interface LookProofOptions {
  readonly look: AppearanceLook;
  readonly state: ProofState;
  /** Keeps the canvas in one theme whatever the page does; left out it wears the page's. */
  readonly theme?: LookTheme;
  readonly problems?: readonly string[];
  readonly name?: string;
  readonly scopes?: { readonly skin: string; readonly font: string; readonly mono: string };
}

/** The picture of a look: the lists, forms, buttons, long text, numbers and code a look has to carry. A picture, not a form: inert, and named once as a whole. */
function renderLookCanvas(say: Say, look: AppearanceLook, name: string, theme?: LookTheme, scopes?: LookProofOptions["scopes"]): string {
  const t = (text: string) => escapeHtml(say(text));
  const row = (state: StateRingState, title: string, end: string) => `<li>${renderStateRing({ state })}<span>${t(title)}</span><span>${t(end)}</span></li>`;
  return `<div class="mw-look-proof__picture" role="img" aria-label="${escapeHtml(say("样张：{name}（示意，不可操作）", { name: say(name) }))}">
    <div class="mw-look-proof__canvas" data-look="${escapeHtml(look.id)}"${theme ? ` data-look-theme="${theme}"` : ""}${scopes ? ` data-ui-skin="${escapeHtml(scopes.skin)}" data-ui-font="${escapeHtml(scopes.font)}" data-ui-mono="${escapeHtml(scopes.mono)}"` : ""} inert>
      <div class="mw-look-proof__sheet">
        <h4><span>${t("本周工作")}</span>${renderBadge({ label: say("3 项"), tone: "info" })}</h4>
        <ul class="mw-look-proof__rows">${row("done", "整理访谈记录", "09:41")}${row("running", "起草第四季度计划", "进行中")}${row("waiting", "等设计评审", "11/06")}</ul>
        ${renderField({ label: say("项目名称"), control: renderInput({ value: say("Molis 新版发布"), invalid: true }), error: say("已经有一个同名项目。") })}
        <div class="mw-look-proof__buttons">${renderButton({ label: say("保存"), variant: "primary" })}${renderButton({ label: say("取消"), variant: "secondary" })}${renderButton({ label: say("更多"), variant: "ghost", icon: "more" })}</div>
        <p class="mw-look-proof__read">${t("2026 年 11 月 4 日，完成 1,284 条整理，用时 3.5 秒。长一点的说明在阅读时更舒展，标点「，。」与 English words 混排也要对齐。")}</p>
        <pre class="mw-look-proof__code">const look = "<span data-look-code-name>${escapeHtml(look.id)}</span>";  // ${t("等宽")}</pre>
      </div>
    </div>
  </div>`;
}

/** What the card's foot says and offers in each state: loading, a failure, a failed check and a clash are said here, and the page underneath never changes. */
function proofFoot(say: Say, { state, problems = PROBLEMS }: LookProofOptions): { status: string; extra: string; disabled: boolean; primary: string } {
  const t = (text: string, values?: Record<string, string | number>) => escapeHtml(say(text, values));
  const mark = (ring: StateRingState, text: string, values?: Record<string, string | number>) => renderStatusMark({ state: ring, label: say(text, values), plain: true });
  const ask = renderButton({ label: say("交给助理修改"), variant: "secondary", icon: "sparkles" });
  const use = say("用上");
  switch (state) {
    case "idle": return { status: t("点一个皮肤或字体，样张先换，页面不变。"), extra: "", disabled: true, primary: use };
    case "ready": return { status: t("页面没变；用上之后这个 Home 的所有窗口一起换。"), extra: "", disabled: false, primary: use };
    case "loading": return { status: mark("running", "字体加载中，样张先用后备字体"), extra: "", disabled: true, primary: use };
    case "failed": return { status: mark("failed", "字体没加载上，样张先用后备字体；这个组合还不能用上"), extra: "", disabled: true, primary: use };
    case "invalid": return { status: `${mark("blocked", "有 {n} 个问题，修好之前不能用上", { n: problems.length })}<ul>${problems.map((problem) => `<li>${t(problem)}</li>`).join("")}</ul>`, extra: ask, disabled: true, primary: use };
    case "conflict": return { status: mark("conflict", "另一个窗口刚换成了「{name}」；用上会替换它", { name: say(SOFT_LOOK.name) }), extra: "", disabled: false, primary: say("仍然用上") };
  }
}

/**
 * The specimen card: the card is the page's, the canvas in it is drawn in `look`. In use, nothing to try, it shows the look in use and offers nothing;
 * otherwise "Use it" is the one primary and "Not this time" lets go.
 */
export function renderLookProof(say: Say, options: LookProofOptions): string {
  const { look, state, theme } = options;
  const name = options.name ?? look.name;
  const trying = state !== "idle";
  const foot = proofFoot(say, options);
  return `<article class="mw-card mw-look-proof" data-slot="card" data-state="${state}">
    <header class="mw-card__header"><div><h3 class="mw-card__title">${escapeHtml(say("样张"))}</h3><p class="mw-card__description">${escapeHtml(say(trying ? "试：{name}" : "现在用的：{name}", { name: say(name) }))}</p></div>${renderBadge({ label: say(trying ? "没用上" : "在用"), tone: trying ? "info" : "success" })}</header>
    <div class="mw-card__panel">${renderLookCanvas(say, look, name, theme, options.scopes)}</div>
    <footer class="mw-card__footer"><div class="mw-look-proof__status" role="status" aria-live="polite">${foot.status}</div><div class="mw-look-proof__actions">${foot.extra}${renderButton({ label: say("再试一次"), variant: "secondary", attrs: { "data-look-retry": true, hidden: state !== "failed" } })}${renderButton({ label: say("这次不换"), variant: "secondary", disabled: !trying, attrs: { "data-look-cancel": true } })}${renderButton({ label: foot.primary, variant: "primary", disabled: foot.disabled, attrs: { "data-look-apply": true } })}</div></footer>
  </article>`;
}

export function lookProofSection(say: Say): string {
  const card = (options: LookProofOptions) => renderLookProof(say, options);
  const side = (theme: LookTheme, caption: string) => `<figure><figcaption>${escapeHtml(say(caption))}</figcaption>${renderLookCanvas(say, TEAL_LOOK, TEAL_LOOK.name, theme)}</figure>`;
  return section("look-proof", say("样张卡 / Look Specimen"), `<div class="mw-catalog__specimens">
    ${specimen(say("试一套外观：页面不变，样张换样"), card({ look: TEAL_LOOK, state: "ready" }))}
    ${specimen(say("没在试：样张画着在用的外观"), card({ look: SOFT_LOOK, state: "idle" }))}
    ${specimen(say("字体加载中：先用后备字体"), card({ look: TEAL_LOOK, state: "loading" }))}
    ${specimen(say("字体没加载上：外观保持原样，给下一步"), card({ look: TEAL_LOOK, state: "failed" }))}
    ${specimen(say("没通过检查：能看，不能用上"), card({ look: WARM_LOOK, state: "invalid" }))}
    ${specimen(say("另一个窗口刚改过：用上会替换它"), card({ look: TEAL_LOOK, state: "conflict" }))}
    ${specimen(say("浅色与深色并排：页面切换主题，它们不变"), `<div class="mw-look-sides">${side("light", "浅色")}${side("dark", "深色")}</div>`)}
    ${specimen(say("最挤：名字很长、问题很长、卡很窄"), `<div class="mw-look-narrow">${card({ look: WARM_LOOK, state: "invalid", name: LONG_NAME, problems: LONG_PROBLEMS })}</div>`)}
  </div>`);
}

/**
 * Putting a look to use changes the whole page: `<html data-look>` wears it, and the page fades from the old picture to the new over `--dur-move` on
 * `--ease-quint` (browser/catalog-appearance.ts starts the View Transition; styles are in catalog-appearance-styles.ts). A page that asks for less motion changes at once.
 */
const FADE_LOOK = WARM_LOOK;

export function lookFadeSection(say: Say): string {
  const now = (look: BoardLook) => say("正在用 {name}", { name: say(look.name) });
  // The look the page changes to is the one that differs most from the baseline in the page's own tones, so the change is seen.
  const data = `data-look-fade-look="${FADE_LOOK.id}" data-now-soft="${escapeHtml(now(SOFT_LOOK))}" data-now-look="${escapeHtml(now(FADE_LOOK))}"`;
  return section("look-fade", say("换外观的淡入 / Look Fade"), `<div class="mw-catalog__specimens">
    ${specimen(say("用上、撤销、恢复时，整页从旧样子淡到新样子"), `<div class="mw-look-fade" data-look-fade ${data}>
      <p class="mw-look-fade__now" role="status" aria-live="polite" data-look-fade-now>${escapeHtml(now(SOFT_LOOK))}</p>
      <div class="mw-catalog__row">${renderButton({ label: say("换成「{name}」", { name: say(FADE_LOOK.name) }), variant: "secondary", attrs: { "data-look-fade-to": "" } })}${renderButton({ label: say("换回 {name}", { name: SOFT_LOOK.name }), variant: "ghost", disabled: true, attrs: { "data-look-fade-back": "" } })}</div>
      <p class="mw-look-fade__clock"><code>--dur-move</code><code>--ease-quint</code><span>${escapeHtml(say("系统要求减少动态效果时，直接换，不淡入。"))}</span></p>
    </div>`)}
  </div>`);
}

/** The board's own sample words that need no translation (a Latin name, a time, a date) are not asked for one. */
const translated = (say: Say): Say => (text, values) => (/\p{Script=Han}/u.test(text) ? say(text, values) : text);

export function lookSections(say: Say): string {
  const words = translated(say);
  return lookCardSection(words) + lookProofSection(words) + lookFadeSection(words);
}
