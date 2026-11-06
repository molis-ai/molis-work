import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * A proposal for review (定样) on the component board: the supplement receipt (packages/design-system/src/input-receipts-client.ts)
 * with each kind of content in its own container, so a reader tells at a glance what Molis recorded, what the AI says about
 * itself, and what waits on them — instead of reading the label of every row. Drawn next to the shipped receipt for the same
 * supplement (its markup copied here, styled by the shipped sheet the 补充的回执 section loads), so the two compare line for
 * line. Nothing in the receipt's program changes until this is approved. The turns are the 补充的回执 section's sample data.
 */

const QUOTE = "注册接口的失败路径放到第 4 步一起测";

/** The shipped receipt for steer-3, as `createInputReceipts` draws it opened. */
function shipped(): string {
  const rows = (pairs: readonly (readonly [string, string])[]) => pairs.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("");
  return `<details class="mw-receipt" data-state="read" open><summary><span class="mw-receipt__fact">AI 已读到</span><span class="mw-receipt__claim"><b>AI 说</b>留到后面某一步 · 影响范围、验收条件</span></summary>`
    + `<div class="mw-receipt__body"><p class="mw-receipt__note">读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。</p><p class="mw-receipt__who">记录里的</p>`
    + `<dl class="mw-receipt__facts">${rows([["运行记录", "AI 已读到 · 输入 steer-3"], ["为它加的步骤", "注册接口失败路径测试 · 等待前一步"]])}</dl>`
    + `<div class="mw-receipt__claimed"><p class="mw-receipt__who">AI 自己说的，Molis 没有核对</p><dl>${rows([["怎么处理", "新需求 · 留到后面某一步"], ["指向", "计划的一步 n4"], ["说会改变", "范围、验收条件"], ["AI 的原话", `“${QUOTE}”`], ["出处", "说明过 2 次，以最新一次为准 · 工具调用 call-9"]])}</dl></div>`
    + `<div class="mw-receipt__acts"><button type="button" class="mw-btn mw-btn--sm mw-btn--ghost">更正…</button></div></div></details>`;
}

/** One zone of the layered receipt: its own container and a label that says whose words these are. */
function zone(kind: "record" | "claim" | "ask", label: string, glyph: string, body: string, aside = ""): string {
  return `<section class="mw-rl__zone" data-zone="${kind}"><p class="mw-rl__label"><span class="mw-rl__tag">${glyph}${label}</span>${aside}</p>${body}</section>`;
}

const ai = `<span class="mw-rl__ai" aria-hidden="true">${icon("sparkles")}</span>`;

/** The same supplement, layered: the summary is two chips (fact, claim); the body is the record, the claim, then the ids. */
function layered(): string {
  const record = zone("record", "Molis 记录", icon("check"), `<ul class="mw-rl__facts">`
    + `<li><span class="mw-rl__key">状态</span><span>AI 已读到这条补充</span></li>`
    + `<li><span class="mw-rl__key">加了一步</span><span class="mw-rl__step">${icon("list-ordered")}注册接口失败路径测试<em>等待前一步</em></span></li></ul>`);
  const claim = zone("claim", "AI 自己说的", ai, `<p class="mw-rl__say"><b>留到后面某一步</b><span class="mw-rl__pill">新需求</span></p>`
    + `<blockquote class="mw-rl__quote">${QUOTE}</blockquote>`
    + `<ul class="mw-rl__facts"><li><span class="mw-rl__key">指向</span><span class="mw-rl__pill">${icon("target")}计划的一步 n4</span></li>`
    + `<li><span class="mw-rl__key">会改变</span><span class="mw-rl__pills"><span class="mw-rl__pill">范围</span><span class="mw-rl__pill">验收条件</span></span></li></ul>`,
  `<span class="mw-rl__unchecked">没有核对</span>`);
  return `<details class="mw-rl" open><summary class="mw-rl__summary"><span class="mw-rl__chip" data-chip="fact"><i></i>AI 已读到</span>`
    + `<span class="mw-rl__chip" data-chip="claim">${ai}留到后面某一步</span><span class="mw-rl__more" aria-hidden="true">${icon("chevron-down")}</span></summary>`
    + `<div class="mw-rl__body">${record}${claim}`
    + `<p class="mw-rl__help">${icon("info")}读到不等于照做，也不撤销之前的操作。</p>`
    + `<div class="mw-rl__foot"><span class="mw-rl__ids">编号 steer-3 · call-9 · AI 说明过 2 次</span>${renderButton({ label: "更正…", variant: "secondary", size: "sm" })}</div></div></details>`;
}

/** A supplement that asked the person something: the question is theirs to act on, so it is its own zone, folded or not. */
function asking(): string {
  return `<details class="mw-rl"><summary class="mw-rl__summary"><span class="mw-rl__chip" data-chip="fact"><i></i>AI 已读到</span>`
    + `<span class="mw-rl__chip" data-chip="ask">${icon("question")}等你回答 1 个问题</span><span class="mw-rl__more" aria-hidden="true">${icon("chevron-down")}</span></summary>`
    + `<div class="mw-rl__body">${zone("ask", "等你", icon("question"), `<p class="mw-rl__say"><b>超时改成多少合适？</b></p><p class="mw-rl__hint">回答之前，这一轮停在这里；补充要求不代替回答。</p>`
      + `<div class="mw-rl__acts">${renderButton({ label: "去回答", variant: "primary", size: "sm" })}</div>`)}</div></details>`;
}

const bubble = (text: string) => `<p class="mw-rl-bubble">${text}</p>`;

export function renderReceiptLayersSpecimen(): string {
  return `<figure class="mw-catalog__specimen mw-rl-compare"><figcaption>补充的回执 · 不同来源分区放（左：现行；右：改版定样，同一条补充）</figcaption>`
    + `<div class="mw-rl-cols"><div class="mw-rl-col"><p class="mw-rl-col__name">现行</p>${bubble("顺便把注册接口也覆盖一下")}${shipped()}</div>`
    + `<div class="mw-rl-col"><p class="mw-rl-col__name">分区</p>${bubble("顺便把注册接口也覆盖一下")}${layered()}${bubble("超时改成多少合适？")}${asking()}</div></div>`
    + `<ul class="mw-rl-legend"><li><span data-zone="record"></span>绿：Molis 记录的事实</li><li><span data-zone="claim"></span>强调色虚线、AI 方块：AI 自己说的，没核对</li><li><span data-zone="ask"></span>琥珀：等你做的事</li><li>编号与出处收到最后一行，说明文字降成一行小字</li></ul></figure>`;
}

export const RECEIPT_LAYERS_STYLES = `.mw-rl-compare{grid-column:1/-1}.mw-rl-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;align-items:start}`
  + `.mw-rl-col{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:14px;background:var(--paper);box-shadow:0 0 0 1px var(--line)}.mw-rl-col__name{margin:0 0 4px;font-size:11px;color:var(--faint);letter-spacing:.04em}`
  + `.mw-rl-col .mw-receipt{align-self:flex-end;max-width:92%}.mw-rl-bubble{align-self:flex-end;max-width:85%;margin:8px 0 0;padding:8px 12px;border-radius:14px 14px 4px 14px;background:var(--wash);color:var(--ink);font-size:13px}.mw-rl-bubble:first-of-type{margin-top:0}`
  + `.mw-rl{align-self:flex-end;width:min(100%,340px);font-size:12px;color:var(--ink-soft)}#collab .mw-rl svg{width:12px;height:12px;flex:none}`
  + `.mw-rl__summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;list-style:none;cursor:pointer;border-radius:8px}.mw-rl__summary::-webkit-details-marker{display:none}.mw-rl__summary:focus-visible{outline:var(--focus-stroke);outline-offset:2px}`
  + `.mw-rl__chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;line-height:1}`
  + `.mw-rl__chip[data-chip=fact]{background:var(--green-soft);color:var(--green)}.mw-rl__chip[data-chip=fact] i{width:6px;height:6px;border-radius:50%;background:var(--green)}`
  + `.mw-rl__chip[data-chip=claim]{padding-left:3px;border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft);color:var(--accent)}.mw-rl__chip[data-chip=ask]{background:var(--amber-soft);color:var(--amber)}`
  + `.mw-rl__more{display:inline-grid;place-items:center;color:var(--faint);transition:transform var(--dur-hover,130ms) var(--ease-quint)}.mw-rl[open] .mw-rl__more{transform:rotate(180deg)}`
  + `.mw-rl__ai{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;background:var(--accent-soft);color:var(--accent)}#collab .mw-rl__ai svg{width:10px;height:10px}`
  + `.mw-rl__body{display:grid;gap:8px;margin-top:8px}`
  + `.mw-rl__zone{display:grid;gap:8px;padding:10px 12px;border-radius:12px}.mw-rl__zone[data-zone=record]{--zone:var(--green);background:var(--green-soft)}`
  + `.mw-rl__zone[data-zone=claim]{--zone:var(--accent);border:1px dashed color-mix(in srgb,var(--accent) 40%,transparent);background:var(--accent-soft)}.mw-rl__zone[data-zone=ask]{--zone:var(--amber);background:var(--amber-soft)}`
  + `.mw-rl__label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0}.mw-rl__tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--muted)}`
  + `.mw-rl__zone .mw-rl__tag{color:var(--zone)}.mw-rl__unchecked{padding:0 6px;border-radius:6px;background:var(--paper);font-size:11px;color:var(--muted)}`
  + `.mw-rl__facts{display:grid;gap:6px;margin:0;padding:0;list-style:none}.mw-rl__facts li{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:baseline;gap:8px}`
  + `.mw-rl__key{font-size:11px;color:var(--faint)}.mw-rl__facts li>span:last-child{justify-self:start;color:var(--ink)}`
  + `.mw-rl__step{display:inline-flex;flex-wrap:wrap;align-items:center;gap:5px}.mw-rl__step em{padding:0 6px;border-radius:6px;background:var(--paper);box-shadow:0 1px 2px color-mix(in srgb,var(--shadow-color,#000) 8%,transparent);color:var(--muted);font-size:11px;font-style:normal}`
  + `.mw-rl__say{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;font-size:13px}.mw-rl__say b{color:var(--ink);font-weight:500}`
  + `.mw-rl__quote{margin:0;padding:2px 0 2px 10px;border-left:2px solid color-mix(in srgb,var(--accent) 50%,transparent);color:var(--ink-soft);font-size:12px;line-height:1.6}.mw-rl__quote::before{content:"“"}.mw-rl__quote::after{content:"”"}`
  + `.mw-rl__pills{display:flex;flex-wrap:wrap;gap:4px}.mw-rl__pill{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:6px;background:var(--paper);color:var(--zone,var(--ink-soft));font-size:11px;box-shadow:0 1px 2px color-mix(in srgb,var(--shadow-color,#000) 8%,transparent)}`
  + `.mw-rl__hint{margin:0;color:var(--muted)}.mw-rl__acts{display:flex;gap:6px}`
  + `.mw-rl__help{display:flex;align-items:center;gap:5px;margin:0;padding:0 2px;font-size:11px;color:var(--faint)}`
  + `.mw-rl__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px}.mw-rl__ids{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}`
  + `.mw-rl-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:12px 0 0;padding:0;list-style:none;font-size:12px;color:var(--muted)}.mw-rl-legend li{display:inline-flex;align-items:center;gap:6px}`
  + `.mw-rl-legend span{width:14px;height:10px;border-radius:4px}.mw-rl-legend [data-zone=record]{background:var(--green-soft);box-shadow:0 0 0 1px color-mix(in srgb,var(--green) 35%,transparent)}.mw-rl-legend [data-zone=claim]{border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft)}.mw-rl-legend [data-zone=ask]{background:var(--amber-soft)}`
  + `@media (prefers-reduced-motion:reduce){.mw-rl__more{transition:none}}`;
