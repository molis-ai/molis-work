/**
 * The pieces of the conversation: an input with its receipt line, the expandable four-question detail, the "还没处理的"
 * tray, the end-of-run card and the recovery banner. Strings only; the browser swaps them in, the tests read them.
 */
import { evidenceSourceLabel } from "./evidence-labels.ts";
import { esc, icon, button } from "./html.ts";
import { clock, KIND_LABEL, TREATMENT_LABEL, TREATMENT_SHORT } from "./labels.ts";
import type { InputRow, ThreadRow, Tray, View } from "./scene-state.ts";
import type { Correction, Draft, Offer, Ui } from "./ui-state.ts";

export interface PartContext {
  readonly ui: Ui;
  readonly view: View;
  readonly offer: Offer;
  /** Does the recording have the "insist" branch for this input? */
  readonly canInsist: (row: InputRow) => boolean;
}

const idOf = (row: InputRow): string => `${row.receipt.steerId}@${String(row.run)}`;
const short = (text: string, max = 22): string => (text.length > max ? `${text.slice(0, max)}…` : text);

function corrections(ui: Ui, row: InputRow): readonly Correction[] {
  return ui.corrections.filter(one => one.inputId === row.receipt.steerId);
}

function bar(row: InputRow, expanded: boolean, mine: readonly Correction[]): string {
  const detailId = `detail-${idOf(row)}`;
  const first = mine[0];
  return `<div class="rc-bar" data-tone="${row.headline.tone}">
    <button type="button" class="rc-status" data-action="toggle" data-id="${esc(idOf(row))}" aria-expanded="${String(expanded)}" aria-controls="${esc(detailId)}">
      ${icon(row.headline.icon)}<span class="rc-status-text">${esc(row.headline.text)}</span>${icon(expanded ? "chevron-up" : "chevron-down")}
    </button>
    ${first === undefined ? "" : `<p class="rc-yours">${icon("edit")}<span>你改为：${esc(first.summary)} · 等 AI 采纳</span><em>Molis 层（模拟）</em></p>`}
  </div>`;
}

function evidenceList(row: InputRow, mine: readonly Correction[]): string {
  const items = [...row.evidence, ...mine.map(one => ({ source: "molis" as const, label: `你在页面上改为：${one.summary}（没有 SDK 事实，模拟）` }))];
  return `<section class="rc-evidence" aria-label="依据"><h5>依据</h5><ol>${items.map(one => `<li data-source="${one.source}"><span class="rc-src">${esc(evidenceSourceLabel(one.source))}</span><span>${esc(one.label)}</span></li>`).join("")}</ol></section>`;
}

function correctionForm(row: InputRow, draft: Draft, canInsist: boolean): string {
  const id = idOf(row);
  const kinds: readonly (readonly [Draft["kind"], string])[] = [["treatment", "改处理方式"], ["target", "改关联"], ["note", "补一句"]];
  const picker = draft.kind === "treatment"
    ? `<fieldset class="rc-choices"><legend>改成</legend>${Object.entries(TREATMENT_SHORT).map(([key, label]) =>
      `<label><input type="radio" name="treatment-${esc(id)}" value="${esc(key)}"${draft.treatment === key ? " checked" : ""} data-action="draft-treatment"><span>${esc(label)}</span></label>`).join("")}</fieldset>`
    : draft.kind === "target"
      ? '<p class="rc-note">关联目标是任务板步骤或产品对象——它们在后面的切片里才有真实事实，预览不让你选假的。</p>'
      : "";
  return `<form class="rc-correct" data-id="${esc(id)}" aria-label="纠正这一条">
    <div class="rc-correct-kinds" role="group" aria-label="纠正什么">${kinds.map(([kind, label]) => button({ label, variant: "ghost", action: "draft-kind", data: { kind }, pressed: draft.kind === kind })).join("")}</div>
    ${picker}
    <label class="rc-field"><span>补一句说明（会和纠正一起交给 AI）</span><textarea rows="2" data-draft-note placeholder="例如：这条是给步骤 4 的">${esc(draft.note)}</textarea></label>
    <div class="rc-correct-actions">
      ${button({ label: "提交纠正", variant: "primary", action: "submit-correction", data: { id }, disabled: draft.kind === "target" })}
      ${canInsist ? button({ label: "坚持采纳（播放录好的这一支）", variant: "secondary", action: "insist", data: { id } }) : ""}
      ${button({ label: "取消", variant: "ghost", action: "cancel-correction" })}
    </div>
    <p class="rc-note">提交后立刻记为你的决定，同时作为一条带原输入引用的新输入交给 AI。${canInsist ? "" : "预览没录 AI 的回应，所以只显示「你改为…」。"}</p>
  </form>`;
}

function detail(row: InputRow, ctx: PartContext, mine: readonly Correction[]): string {
  const { four, receipt } = row;
  const id = idOf(row);
  const canWithdraw = ctx.offer.withdraw.includes(receipt.steerId);
  const readAlready = receipt.state === "read";
  const withdraw = receipt.state === "withdrawn" ? ""
    : canWithdraw ? button({ label: "撤回（播放录好的撤回）", variant: "secondary", action: "withdraw", data: { id: receipt.steerId } })
      : readAlready ? `<span class="rc-cannot">${icon("info")}已读到，不能撤回，可发更正</span>`
        : receipt.state === "unread" ? `<span class="rc-cannot">${icon("info")}在会话排队里；撤回见本轮结束卡片</span>`
          : button({ label: "撤回", variant: "secondary", disabled: true, title: "预览没录这条输入的撤回" });
  const answers = [["怎么处理", four.how], ["在哪里", four.where], ["改变了什么", four.changed], ["还差什么", four.left]] as const;
  return `<div class="rc-detail" id="detail-${esc(id)}" role="region" aria-label="第 ${String(row.n)} 条输入的回执">
    <dl class="rc-four">${answers.map(([q, a]) => `<div><dt>${q}</dt><dd>${esc(a.text)}${a.note === undefined ? "" : `<small>${esc(a.note)}</small>`}</dd></div>`).join("")}</dl>
    ${row.corrects === undefined ? "" : `<p class="rc-note">这是你对 #${String(row.corrects)} 的纠正（账上的 about 指着它）。</p>`}
    ${evidenceList(row, mine)}
    <div class="rc-actions">
      ${receipt.state === "withdrawn" ? "" : button({ label: "纠正…", variant: "ghost", icon: "edit", action: "correct", data: { id }, expanded: ctx.ui.correcting === id })}
      ${withdraw}
    </div>
    ${ctx.ui.correcting === id ? correctionForm(row, ctx.ui.draft, ctx.canInsist(row)) : ""}
  </div>`;
}

export function inputRow(row: InputRow, ctx: PartContext): string {
  const id = idOf(row);
  const expanded = ctx.ui.expanded.includes(id);
  const mine = corrections(ctx.ui, row);
  const tags = [
    row.receipt.state === "withdrawn" ? '<span class="rc-tag" data-tone="muted">已撤回</span>' : "",
    row.receipt.about === undefined ? "" : `<span class="rc-tag">更正 #${String(row.corrects ?? 0)}</span>`,
  ].join("");
  return `<article class="rc-input" data-input="${esc(row.receipt.steerId)}" data-key="${esc(row.headline.key)}" id="in-${esc(id)}">
    <div class="rc-bubble${row.receipt.state === "withdrawn" ? " is-withdrawn" : ""}">
      <header><span class="rc-num">#${String(row.n)}</span><span>你</span><time datetime="${new Date(row.receipt.atMs).toISOString()}">${clock(row.receipt.atMs)}</time>${tags}</header>
      <p>${esc(row.receipt.text)}</p>
    </div>
    ${bar(row, expanded, mine)}
    ${expanded ? detail(row, ctx, mine) : ""}
  </article>`;
}

export function hostNote(row: Extract<ThreadRow, { kind: "host" }>): string {
  return `<p class="rc-host">${icon("info")}<span><strong>系统说明</strong> · ${esc(row.text)}</span><time>${clock(row.atMs)}</time></p>`;
}

export function tray(trayData: Tray, open: boolean): string {
  if (trayData.total === 0) return `<p class="rc-tray-empty">${icon("check")}没有还没处理的输入</p>`;
  const groups = trayData.groups.filter(one => one.entries.length > 0);
  return `<div class="rc-tray">
    <button type="button" class="rc-tray-toggle" data-action="tray" aria-expanded="${String(open)}" aria-controls="tray-list">${icon("status-needs-you")}<span>${String(trayData.total)} 条还没处理完</span>${icon(open ? "chevron-down" : "chevron-up")}</button>
    ${open ? `<div class="rc-tray-list" id="tray-list" role="region" aria-label="还没处理的">${groups.map(group => `<section><h5>${esc(group.label)} <span>${String(group.entries.length)}</span></h5><ul>${group.entries.map(entry =>
      `<li><button type="button" class="rc-tray-item" data-action="open-input" data-n="${String(entry.n)}"><b>#${String(entry.n)}</b><span>${esc(short(entry.text, 18))}</span><small>${esc(entry.why)}</small></button></li>`).join("")}</ul></section>`).join("")}</div>` : ""}
  </div>`;
}

const END_LABEL: Readonly<Record<string, string>> = { completed: "完成", cancelled: "被停下", failed: "失败" };

export function endCard(row: Extract<ThreadRow, { kind: "end" }>, ctx: PartContext, last: boolean): string {
  const mine = ctx.view.rows.filter((one): one is InputRow => one.kind === "input" && one.run === row.run);
  const queue = ctx.view.queue;
  const waiting = last && queue !== undefined && queue.queued.length > 0;
  const own = new Set(mine.map(one => one.receipt.steerId));
  // What the app queued itself never ran in this run, but it is waiting in the same queue.
  const queued = last ? (queue?.queued ?? []).filter(item => !own.has(item.inputId)) : [];
  const rows = mine.map(one => `<li data-tone="${one.headline.tone}"><b>#${String(one.n)}</b><span>${esc(short(one.receipt.text, 16))}</span><em>${esc(conclusion(one))}</em></li>`).join("")
    + queued.map(item => `<li data-tone="warn"><b>#${String(ctx.view.number(item.inputId))}</b><span>${esc(short(item.text, 16))}</span><em>你交给会话的，排着</em></li>`).join("");
  return `<section class="rc-end" aria-label="这一轮的结论">
    <h4>${icon(row.state === "completed" ? "status-done" : "status-cancelled")}这一轮${esc(END_LABEL[row.state] ?? row.state)}${row.code === undefined ? "" : `（${esc(row.code)}）`}${mine.length === 0 ? " · 没有中途输入" : ` · ${String(mine.length)} 条中途输入`}</h4>
    ${rows === "" ? "" : `<ul>${rows}</ul>`}
    ${last && queue !== undefined && queue.queued.length === 0 && queue.settled.length > 0 ? `<p class="rc-end-queue">${icon("check")}排队里的 ${String(queue.settled.length)} 条已处理（${queue.settled.map(one => (one.outcome === "carried" ? "带进下一轮" : "撤回")).filter((one, at, all) => all.indexOf(one) === at).join("、")}），SDK 的会话排队现在是空的。</p>` : ""}
    ${waiting ? `<p class="rc-end-queue">${icon("status-needs-you")}${String(queue.queued.length)} 条留在会话里，没有自己开新的一轮。</p>
      <div class="rc-end-actions">${button({ label: "带到下一轮", variant: "primary", action: "carry", disabled: !ctx.view.scene.checkpoints.some(one => one.id === "carried") })}
        ${button({ label: "全部撤回", variant: "secondary", action: "withdraw-all", disabled: ctx.view.scene.id !== "stopped-carry" && ctx.view.scene.id !== "stopped-withdraw" })}
        ${button({ label: "逐条处理", variant: "ghost", action: "tray-open" })}</div>
      <p class="rc-note">三个操作都是录好的分支：带到下一轮 = 下一轮开头带上；全部撤回 = 逐条 withdrawQueuedInput。</p>` : ""}
  </section>`;
}

function conclusion(row: InputRow): string {
  const handling = row.receipt.handling;
  if (row.supersededBy !== undefined) return `被 #${String(row.supersededBy)} 的纠正替代`;
  switch (row.headline.key) {
    case "withdrawn": return "已撤回";
    case "unread": return "没读到";
    case "read": return "读到，没说明";
    default: return handling === undefined ? row.headline.text : `${KIND_LABEL[handling.kind ?? ""] ?? "输入"} · ${TREATMENT_SHORT[handling.treatment] ?? TREATMENT_LABEL[handling.treatment] ?? handling.treatment}`;
  }
}

export function recoveryBanner(view: View): string {
  const rows = view.rows.filter((one): one is InputRow => one.kind === "input");
  const recovered = view.rows.some(one => one.kind === "recovered");
  const lines = rows.map(row => {
    const how = row.receipt.state === "accepted" ? "已送达，未交给 AI" : row.receipt.state === "applied" ? "已交给 AI，没读到" : row.receipt.state === "unread" ? "没读到" : row.headline.text;
    return `<li><b>#${String(row.n)}</b><span>${esc(short(row.receipt.text, 16))}</span><em>${esc(how)}</em></li>`;
  }).join("");
  return `<section class="rc-banner" role="status" data-tone="warn">
    <h4>${icon("alert")}${recovered ? "这一轮被中断，已核对并收口" : "宿主被强杀了（演示）"} · ${String(rows.length)} 条输入需要确认</h4>
    <ul>${lines}</ul>
    ${recovered
      ? `<p class="rc-note">重启后只分类：不自动带入，不自动开新的一轮，也没有重放任何操作。${view.queue === undefined ? "" : `它们现在在会话排队里（${String(view.queue.queued.length)} 条）。`}</p>
         <div class="rc-end-actions">${button({ label: "带到下一轮", variant: "secondary", disabled: true, title: "「被停下的一轮」场景里演示了带到下一轮" })}${button({ label: "撤回", variant: "ghost", disabled: true, title: "「被停下的一轮」场景里演示了全部撤回" })}</div>`
      : `<div class="rc-end-actions">${button({ label: "重启并核对", variant: "primary", action: "recover" })}</div>`}
  </section>`;
}
