// The component board's parts as markup, for the prototypes under docs/design/. Same classes and slots as
// /__ui/catalog and the product (packages/design-system primitives, apps/workbench context-onboarding.ts); the look
// comes from the stylesheet exported to ./dist/. The last group draws the 「组件板新增」 parts in ./prototype.css.
// Usage: const P = window.molisParts(() => lang);  P.btn({ label: "继续", variant: "primary" })
window.molisParts = (lang) => {
  const zh = () => lang() === "zh";
  const say = (a, b) => (zh() ? a : b);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const attrs = (o = {}) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
  const act = (a, arg) => ({ "data-act": a, "data-arg": arg });

  // mw-btn: variant primary | secondary | ghost | link | danger; size sm | lg; `only` = icon-only, its name kept for screen readers.
  const btn = (o) => `<button type="button" class="mw-btn mw-btn--${o.variant || "secondary"}${o.size ? ` mw-btn--${o.size}` : ""}${o.only ? " mw-btn--icon-only" : ""}${o.cls ? ` ${o.cls}` : ""}" data-slot="button"${attrs({ ...o.attrs, disabled: o.disabled, "aria-label": o.only ? o.label : o.aria })}>${o.icon ? ic(o.icon) : ""}${o.only ? `<span class="mw-sr-only">${o.label}</span>` : `<span data-slot="button-label">${o.label}</span>`}${o.key ? `<kbd class="mw-btn__key" aria-hidden="true">${o.key}</kbd>` : ""}</button>`;
  // mw-choice: selected is graphite with a check (DESIGN.md).
  const choice = (o) => `<button type="button" class="mw-choice" data-slot="choice" aria-pressed="${o.on ? "true" : "false"}"${attrs(o.attrs)}><span class="mw-choice__label">${o.icon ? ic(o.icon) : ""}${o.label}</span><span class="mw-choice__check" aria-hidden="true">${ic("check")}</span></button>`;
  const choices = (label, items) => `<div class="mw-choice-group welcome-options" role="group" aria-label="${esc(label)}">${items.map(choice).join("")}</div>`;
  // mw-status with the state ring (foundation.js draws it from data-mw-state).
  const STATE = { done: ["done", "done"], run: ["progress", "running"], fail: ["blocked", "failed"], wait: ["attention", "waiting"], todo: ["idle", "idle"], answer: ["attention", "answer"], paused: ["idle", "paused"] };
  const STATE_NAME = { done: ["完成", "Done"], run: ["进行中", "Running"], fail: ["失败", "Failed"], wait: ["等待", "Waiting"], todo: ["未开始", "Not started"], answer: ["等你", "Your turn"], paused: ["暂停", "Paused"] };
  const status = (kind, text = "") => `<span class="mw-status mw-status--${STATE[kind][0]} mw-status--plain" data-slot="status" data-mw-state="${STATE[kind][1]}"${text ? "" : ` aria-label="${esc(say(...STATE_NAME[kind]))}"`}><span>${text}</span></span>`;
  const badge = (tone, text) => `<span class="mw-badge mw-badge--${tone}" data-slot="badge">${text}</span>`;
  // mw-alert: danger | warning | success, or the plain fact (no tone).
  const alert = (tone, title, body = "", extra = "") => `<div class="mw-alert${tone ? ` mw-alert--${tone}` : ""}" data-slot="alert" role="${tone === "danger" ? "alert" : "status"}">${title ? `<strong>${title}</strong>` : ""}${body ? `<p>${body}</p>` : ""}${extra}</div>`;
  const spinner = () => '<span class="mw-spinner" data-slot="spinner" aria-hidden="true"></span>';
  const progress = (value, max, label) => `<div class="mw-progress" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"${label ? ` aria-label="${esc(label)}"` : ""}><span style="width:${max ? Math.round((value / max) * 100) : 0}%"></span></div>`;
  const collapsible = (summary, body, open = false) => `<details class="mw-collapsible" data-slot="collapsible"${open ? " open" : ""}><summary>${summary}</summary><div class="mw-collapsible__body">${body}</div></details>`;
  const avatar = (text, hue) => `<span class="mw-avatar" data-slot="avatar"${hue ? ` style="background:color-mix(in srgb, var(--hue-${hue}) 16%, var(--paper));color:var(--hue-${hue})"` : ""}>${text}</span>`;
  const monogram = (text, hue = "purple") => `<span class="project-monogram" data-hue="${hue}" aria-hidden="true">${text}</span>`;
  // mw-dir-row: icon, name, caption, what sits at the end. Static rows are divs; .ob-sources lays a list of them out.
  const row = (o) => `<${o.tag || "div"} class="mw-dir-row mw-dir-row--meta directory-list-row" data-slot="directory-row"${attrs(o.attrs)}><span class="mw-dir-row__icon">${o.icon}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${o.title}</strong></span>${o.caption ? `<small>${o.caption}</small>` : ""}</span>${o.end ? `<span class="q-row">${o.end}</span>` : ""}</${o.tag || "div"}>`;
  const rows = (items, label, cls = "") => `<div class="ob-sources ${cls}" role="list"${label ? ` aria-label="${esc(label)}"` : ""}>${items.map((x) => `<div class="ob-source" role="listitem">${x}</div>`).join("")}</div>`;
  const note = (text, icon = "lock") => `<p class="ob-note">${ic(icon)}<span>${text}</span></p>`;
  // mw-hint: the longer explanation, one tap away.
  const hint = (id, text) => `<span class="mw-hint"><button type="button" class="mw-hint__trigger" popovertarget="hint-${id}" aria-label="${say("说明", "Help")}" style="anchor-name:--hint-${id}">${ic("question")}</button><div id="hint-${id}" class="mw-tooltip mw-hint__tooltip" data-slot="tooltip" role="tooltip" popover="auto" style="position-anchor:--hint-${id}">${text}</div></span>`;
  // mw-bar-status: the bottom bar's middle — what is happening now.
  const barStatus = (o) => `<div class="mw-bar-status" data-slot="bar-status" role="status" aria-live="polite"><span class="mw-bar-status__tile" aria-hidden="true">${o.spin ? spinner() : ic(o.icon || "info")}</span><span class="mw-bar-status__text"><strong>${o.title}</strong>${o.caption ? `<small>${o.caption}</small>` : ""}</span></div>`;
  // The arrival wordmark and caption (molisArrival animates them).
  const LETTERS = [..."Molis Work"].map((ch, i) => `<span class="mw-wordmark__l" aria-hidden="true" data-i="${i}">${ch === " " ? "&nbsp;" : ch}</span>`).join("");
  const wordmark = (extra = "") => `<span class="mw-wordmark" data-slot="wordmark" data-wordmark role="img" aria-label="Molis Work"${extra}>${LETTERS}<i class="mw-wordmark__caret" aria-hidden="true"></i></span>`;
  const PHRASES = [["mplify", "deas"], ["waken", "magination"], ["dvance", "ntuition"], ["ugment", "ntelligence"]];
  const caption = () => `<button type="button" class="mw-caption" data-slot="caption" data-caption aria-pressed="false" aria-label="${say("暂停标题动画", "Pause the title animation")}" data-label-pause="${say("暂停标题动画", "Pause the title animation")}" data-label-play="${say("播放标题动画", "Play the title animation")}" data-phrases="${esc(JSON.stringify(PHRASES))}"><span class="mw-caption__row" lang="en"><span class="mw-caption__ini">A</span><span class="mw-caption__tail"></span></span><span class="mw-caption__row" lang="en"><span class="mw-caption__ini">I</span><span class="mw-caption__tail"></span></span></button>`;
  const toast = (msg) => {
    document.querySelectorAll(".proto-toast").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "mw-toast proto-toast"; el.dataset.slot = "toast"; el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(msg)}</span>`; document.body.append(el);
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.remove(), 3200);
  };

  // 「组件板新增」 (./prototype.css)
  const kind = (icon, hue, cls = "") => `<span class="cand-kind${hue === "mute" ? " is-mute" : ""}${cls ? ` ${cls}` : ""}"${hue === "mute" ? "" : ` style="--kind:var(--hue-${hue})"`} aria-hidden="true">${ic(icon)}</span>`;
  const ring = (n, total, cls = "", big = false) => `<span class="cand-ring${cls ? ` ${cls}` : ""}${big ? " is-lg" : ""}" style="--p:${total ? Math.round((n / total) * 100) : 0}" role="img" aria-label="${n} / ${total}"><span>${big ? `<span><b>${n}</b>/ ${total}</span>` : `${n}/${total}`}</span></span>`;

  return { say, esc, ic, attrs, act, btn, choice, choices, status, badge, alert, spinner, progress, collapsible, avatar, monogram, row, rows, note, hint, barStatus, wordmark, caption, toast, kind, ring };
};
