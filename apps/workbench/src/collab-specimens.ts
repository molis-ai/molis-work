import { readFileSync } from "node:fs";
import { escapeHtml, icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RECEIPT_LAYERS_STYLES, renderReceiptLayersSpecimen } from "./receipt-layers-specimen.js";

/**
 * The component board's 协作零件 section: the parts the four Molis Work introduction demos (a bad review fixed the same day,
 * a passing wish turned into a plugin, a daily topic list, a trending post published) all draw — who is a person and who an
 * AI, a goal's completion requirements with their evidence, a discussion's topics, what an AI brings and the answers that can
 * be tapped, the sources that say the same thing and the rule that raised them, and a per-platform review before sending.
 * They are proposals for review (定样), not shipped parts: the markup and styles live on the board until they are approved
 * and moved into the design system. The demo copy is sample data, written through the board's translator (`say`, as the
 * conditions and service-connection sections are); the sample person names are data, not UI words.
 */

type Say = (text: string, values?: Record<string, string | number>) => string;
type Kind = "person" | "ai";
interface Who { readonly name: string; readonly kind: Kind; readonly mark?: string; readonly assistant?: boolean }

const YOU: Who = { name: "你", kind: "person" };
const ZHE: Who = { name: "阿哲", kind: "person", mark: "哲" };
const CODEX: Who = { name: "Codex", kind: "ai" };
const CLAUDE: Who = { name: "Claude Code", kind: "ai" };
const ASSISTANT: Who = { name: "workbench.collab-specimens.assistant", kind: "ai", assistant: true };

/** A person is round, an AI is square; the Assistant carries its spark instead of an initial. UI role names (“你”, the
 * Assistant) are words of the interface and go through the translator; real sample person names stay as data. */
const nameOf = (say: Say, who: Who) => who === YOU ? say("workbench.collab-specimens.you") : who.assistant ? say("workbench.collab-specimens.assistant") : who.name;
function who(say: Say, entry: Who, size: "sm" | "lg" = "sm"): string {
  const face = entry.assistant ? icon("sparkles") : (entry.mark ?? Array.from(entry.name)[0]!);
  const name = nameOf(say, entry);
  return `<span class="mw-who${size === "lg" ? " mw-who--lg" : ""}" data-kind="${entry.kind}"${entry.assistant ? " data-assistant" : ""} role="img" aria-label="${name}${entry.kind === "ai" ? say("workbench.collab-specimens.ai") : say("workbench.collab-specimens.person")}">${face}</span>`;
}

/** Who has it: the person's round face, and the AI they handed it to stacked behind. */
function owner(say: Say, label: string | null, ...faces: Who[]): string {
  return `<span class="mw-owner"><span class="mw-owner__faces">${faces.map((face) => who(say, face)).join("")}</span><span>${label ? say(label) : faces[0]?.name ?? ""}</span></span>`;
}

function specimen(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption>${body}</figure>`;
}

function requirement(say: Say, state: "done" | "open" | "none", title: string, evidence: string, extra: string): string {
  const checked = state === "done";
  const label = state === "none" ? say("workbench.collab-specimens.title-no-evidence-yet-so-it-cannot", { title: say(title) })
    : say(checked ? "workbench.collab-specimens.title-verified-tap-to-uncheck" : "workbench.collab-specimens.title-check-it-once-verified", { title: say(title) });
  return `<li class="mw-req" data-state="${state}"><button type="button" class="mw-req__check" aria-pressed="${checked}" aria-label="${label}"${state === "none" ? " disabled" : ""}><span class="mw-req__mark">${icon("check")}</span></button>`
    + `<div class="mw-req__body"><span class="mw-req__title">${say(title)}</span><span class="mw-req__evidence">${say(evidence)}</span>${extra}</div></li>`;
}

function requirementsSpecimen(say: Say): string {
  const rows = [
    requirement(say, "done", "workbench.collab-specimens.paying-inside-wechat-works", "workbench.collab-specimens.evidence-notices-moved-to-https-tests-16", owner(say, "workbench.collab-specimens.you-codex", YOU, CODEX)),
    requirement(say, "open", "workbench.collab-specimens.orders-made-up-for-23-users", "workbench.collab-specimens.evidence-21-orders-made-up-2-refunded", `<span class="mw-decision">${say("workbench.collab-specimens.you-decided-the-2-re-ordered-ones")}</span>${owner(say, "workbench.collab-specimens.zhe-claude-code", ZHE, CLAUDE)}`),
    requirement(say, "none", "workbench.collab-specimens.pay-once-on-a-real-device", "workbench.collab-specimens.no-evidence-yet-waiting-for-zhe-to", owner(say, "workbench.collab-specimens.zhe-accepts", ZHE)),
  ].join("");
  return `<div class="mw-reqs" data-collab-reqs><p class="mw-reqs__head"><span>${say("workbench.collab-specimens.completion")}</span><b data-reqs-count>1/3</b><span class="mw-reqs__bars" aria-hidden="true"><i data-on></i><i></i><i></i></span></p><ul>${rows}</ul></div>`;
}

const TOPICS: readonly { name: string; status: string; tone: "progress" | "done" | "quiet"; unread?: boolean; concluded?: boolean; current?: boolean }[] = [
  { name: "workbench.collab-specimens.main-group", status: "workbench.collab-specimens.value-4-members-last-09-20", tone: "quiet" },
  { name: "workbench.collab-specimens.friday-release", status: "workbench.collab-specimens.discussing-zhe-09-40", tone: "progress", unread: true },
  { name: "workbench.collab-specimens.new-home-page", status: "workbench.collab-specimens.discussing-xiaolin-yesterday-18-02", tone: "progress" },
  { name: "workbench.collab-specimens.payment-failing", status: "workbench.collab-specimens.concluded-you-confirmed-15-12", tone: "done", concluded: true, current: true },
];

function topicsSpecimen(say: Say): string {
  const current = TOPICS.find((topic) => topic.current)!;
  const chips = TOPICS.map((topic) => `<button type="button" class="mw-topic" aria-pressed="${Boolean(topic.current)}" data-status="${say(topic.status)}" data-tone="${topic.tone}"${topic.unread ? " data-unread" : ""}>${say(topic.name)}${topic.concluded ? icon("check") : ""}${topic.unread ? `<span class="mw-sr-only">${say("workbench.collab-specimens.unread")}</span>` : ""}</button>`).join("");
  return `<div class="mw-thread-head" data-collab-topics><div class="mw-topics" role="group" aria-label="${say("workbench.collab-specimens.project-discussion-topics")}">${chips}</div>`
    + `<p class="mw-thread-status" data-tone="${current.tone}" data-topic-status>${say(current.status)}</p>`
    + `<label class="mw-thread-compose"><span data-topic-to>${say("workbench.collab-specimens.to-name", { name: say(current.name) })}</span><input class="mw-thread-compose__input" placeholder="${say("workbench.collab-specimens.write-a-message")}" aria-label="${say("workbench.collab-specimens.messages")}"></label></div>`;
}

function conversationSpecimen(say: Say): string {
  return `<div class="mw-convo"><p class="mw-said">${say("workbench.collab-specimens.no-rush-heard", { heard: `<mark class="mw-heard">${say("workbench.collab-specimens.if-only-every-release-could-be-rehearsed")}</mark>` })}</p>`
    + `<p class="mw-preparing" data-collab-preparing>${who(say, ASSISTANT)}<span class="mw-preparing__line" data-preparing-line>${say("workbench.collab-specimens.read-zhe-s-document")}</span></p></div>`;
}

function broughtSpecimen(say: Say): string {
  const rows = [["workbench.collab-specimens.paying-inside-wechat-works", owner(say, "workbench.collab-specimens.you", YOU)], ["workbench.collab-specimens.orders-made-up-for-23-users", owner(say, null, ZHE)], ["workbench.collab-specimens.pay-once-on-a-real-device", owner(say, "workbench.collab-specimens.zhe-accepts", ZHE)]]
    .map(([title, face], index) => `<li><span class="mw-brought__n">${index + 1}</span><span>${say(title)}</span>${face}</li>`).join("");
  return `<article class="mw-brought" data-collab-brought><p class="mw-brought__by">${who(say, ASSISTANT)}<b>${say("workbench.collab-specimens.assistant")}</b><span>09:14</span></p>`
    + `<div class="mw-brought__card"><p class="mw-brought__note">${icon("history")}${say("workbench.collab-specimens.read-2-project-memories-july-s-payment")}</p>`
    + `<div class="mw-brought__fold"><div><div class="mw-brought__body"><h4>${say("workbench.collab-specimens.start-a-goal-one-owner-each-for")}</h4><ol>${rows}</ol></div>`
    + `<div class="mw-brought__answers">${renderButton({ label: say("workbench.collab-specimens.start-the-goal"), variant: "primary", size: "sm", attrs: { "data-answer": say("workbench.collab-specimens.goal-started-you-agree") } })}${renderButton({ label: say("workbench.collab-specimens.think-it-over"), variant: "secondary", size: "sm", attrs: { "data-answer": say("workbench.collab-specimens.left-aside-you-said-think-it-over") } })}</div></div></div>`
    + `<p class="mw-brought__result" data-brought-result hidden>${icon("check")}<span data-brought-said></span>${renderButton({ label: say("workbench.collab-specimens.withdraw"), variant: "ghost", size: "sm", attrs: { "data-brought-undo": true } })}</p></div></article>`;
}

function source(say: Say, glyph: "star" | "mail" | "git-branch", meta: { key: string } | { original: string }, text: string, span: "start" | "mid" | "end", joined: boolean): string {
  return `<li class="mw-source" data-span="${span}"${joined ? " data-joined" : ""}><span class="mw-source__icon">${icon(glyph)}</span><span><span class="mw-source__meta">${"key" in meta ? say(meta.key) : escapeHtml(meta.original)}</span>${say(text)}</span>${joined ? `<span class="mw-urgent">${say("workbench.collab-specimens.urgent")}</span>` : ""}</li>`;
}

function sourcesSpecimen(say: Say): string {
  return `<div class="mw-joined"><ul class="mw-sources" aria-label="${say("workbench.collab-specimens.three-sources-on-the-same-thing")}">${[
    source(say, "star", { key: "workbench.collab-specimens.app-store-review-08-41" }, "workbench.collab-specimens.spinning-ever-since-i-paid-no-order", "start", true),
    source(say, "mail", { key: "workbench.collab-specimens.customer-email-three-stores-08-57" }, "workbench.collab-specimens.all-3-of-our-clerks-fail-to", "mid", true),
    source(say, "star", { key: "workbench.collab-specimens.app-store-review-09-03" }, "workbench.collab-specimens.the-new-interface-looks-much-better", "mid", false),
    source(say, "git-branch", { original: "GitHub #331 · 09:10" }, "workbench.collab-specimens.in-ios-wechat-the-payment-success-notice", "end", true),
  ].join("")}</ul>`
    + `<div class="mw-rule"><p class="mw-rule__head">${icon("circle-alert")}${say("workbench.collab-specimens.urgent-wechat-payments-failing-23-users")}</p>`
    + `<p class="mw-rule__line">${say("workbench.collab-specimens.your-rule")}<b>${say("workbench.collab-specimens.touches-payments")}</b><b>${say("workbench.collab-specimens.affects-more-than-10-people")}</b>${icon("arrow")}${say("workbench.collab-specimens.open-a-topic-the-owner")}</p>`
    + `<p class="mw-rule__done">${icon("message")}${say("workbench.collab-specimens.it-called-you-in-at-payment-failing")}</p></div></div>`;
}

function reviewSpecimen(say: Say): string {
  const row = (title: string, meta: string) => `<li class="mw-review__row"><span class="mw-source__icon">${icon("file")}</span><span><b>${say(title)}</b><span class="mw-source__meta">${say(meta)}</span></span>${renderButton({ label: say("workbench.collab-specimens.review"), variant: "secondary", size: "sm", attrs: { "data-review": true, "aria-pressed": "false" } })}</li>`;
  return `<div class="mw-review" data-collab-review><p class="mw-review__head"><span>${say("workbench.collab-specimens.two-platforms-you-review-both-before-it")}</span><b data-review-count>0/2</b></p>`
    + `<ul>${row("workbench.collab-specimens.wechat-article", "workbench.collab-specimens.drafted-by-your-claude-3-200-words")}${row("workbench.collab-specimens.xiaohongshu-6-pages", "workbench.collab-specimens.made-by-xiaolin-s-chatgpt-portrait")}</ul>`
    + `<div class="mw-review__send">${renderButton({ label: say("workbench.collab-specimens.send-it-out"), variant: "primary", size: "sm", disabled: true, attrs: { "data-review-send": true } })}</div></div>`;
}

export function renderCollabSection(say: Say): string {
  const faces = [YOU, ZHE, ASSISTANT, CODEX, CLAUDE].map((entry) => `<span class="mw-collab-face">${who(say, entry, "lg")}<span>${nameOf(say, entry)}</span></span>`).join("");
  return `<section class="mw-catalog__section" id="collab" data-primitive="collab"><h2>${say("workbench.collab-specimens.collaboration-parts")}</h2>
    <p class="mw-catalog__hint">${say("workbench.collab-specimens.proposals-for-review-not-shipped-yet-collaboration")}</p>
    <div class="mw-catalog__specimens">
      ${specimen(say("workbench.collab-specimens.who-a-person-is-round-an-ai"), `<div class="mw-collab-faces">${faces}</div>`)}
      ${specimen(say("workbench.collab-specimens.who-has-it-the-person-first-the"), `<div class="mw-collab-row">${owner(say, "workbench.collab-specimens.you-codex", YOU, CODEX)}${owner(say, "workbench.collab-specimens.zhe-claude-code", ZHE, CLAUDE)}${owner(say, "workbench.collab-specimens.zhe-accepts", ZHE)}</div>`)}
      ${specimen(say("workbench.collab-specimens.completion-requirements-the-ai-brings-evidence-a"), requirementsSpecimen(say))}
      ${specimen(say("workbench.collab-specimens.project-discussion-topics-status-who-it-goes"), topicsSpecimen(say))}
      ${specimen(say("workbench.collab-specimens.conversation-the-half-sentence-the-assistant-heard"), conversationSpecimen(say))}
      ${specimen(say("workbench.collab-specimens.what-the-ai-brings-tappable-answers-answering"), broughtSpecimen(say))}
      ${specimen(say("workbench.collab-specimens.the-same-thing-joined-and-the-rule"), sourcesSpecimen(say))}
      ${specimen(say("workbench.collab-specimens.review-each-tap-every-platform-once-before"), reviewSpecimen(say))}
      ${renderReceiptLayersSpecimen()}
    </div>
  </section>`;
}

export const COLLAB_SECTION_STYLES = `#collab svg{width:14px;height:14px;flex:none}` + RECEIPT_LAYERS_STYLES
  + `.mw-who{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--wash);color:var(--ink-soft);font-size:11px;font-weight:500;line-height:1;flex:none}`
  + `.mw-who[data-kind=ai]{border-radius:6px;background:var(--ink);color:var(--paper)}.mw-who[data-assistant]{background:var(--accent-soft);color:var(--accent)}`
  + `#collab .mw-who svg{width:12px;height:12px}.mw-who--lg{width:32px;height:32px;font-size:13px}.mw-who--lg[data-kind=ai]{border-radius:8px}#collab .mw-who--lg svg{width:16px;height:16px}`
  + `.mw-collab-faces,.mw-collab-row{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.mw-collab-row{gap:8px}.mw-collab-face{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}`
  + `.mw-owner{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 3px;border-radius:999px;background:var(--wash);font-size:12px;color:var(--ink-soft)}.mw-owner__faces{display:inline-flex}.mw-owner__faces .mw-who+.mw-who{margin-left:-6px;box-shadow:0 0 0 2px var(--wash)}`
  + `.mw-reqs{width:min(100%,400px);font-size:13px}.mw-reqs__head{display:flex;align-items:center;gap:8px;margin:0 0 6px;color:var(--muted)}.mw-reqs__head b{color:var(--ink);font-variant-numeric:tabular-nums}`
  + `.mw-reqs__bars{display:inline-flex;gap:4px}.mw-reqs__bars i{width:22px;height:4px;border-radius:2px;background:var(--line);transition:background-color var(--dur-move) var(--ease-quint)}.mw-reqs__bars i[data-on]{background:var(--green)}`
  + `.mw-reqs ul,.mw-sources,.mw-review ul,.mw-brought ol{list-style:none;margin:0;padding:0}`
  + `.mw-req{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid var(--line)}`
  + `.mw-req__check{display:grid;place-items:center;width:32px;height:32px;margin-top:-7px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer}`
  + `.mw-req__check:focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,1px)}`
  + `.mw-req__mark{display:grid;place-items:center;width:20px;height:20px;border:1.5px solid var(--line-strong);border-radius:50%;color:transparent;transition:background-color var(--dur-move) var(--ease-quint),border-color var(--dur-move) var(--ease-quint)}`
  + `.mw-req__check[aria-pressed=true] .mw-req__mark{border-color:var(--green);background:var(--green);color:var(--on-accent)}#collab .mw-req__mark svg{width:12px;height:12px}.mw-req__check:disabled{cursor:not-allowed}.mw-req__check:disabled .mw-req__mark{border-style:dashed}`
  + `@media (max-width:600px),(pointer:coarse){.mw-req{grid-template-columns:44px minmax(0,1fr)}.mw-req__check{width:44px;height:44px;margin-top:-13px}}`
  + `.mw-req__body{display:grid;justify-items:start;gap:5px;min-width:0}.mw-req__title{color:var(--ink);font-weight:500}.mw-req__evidence{font-size:12px;color:var(--muted)}`
  + `.mw-decision{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:12px}.mw-decision::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}`
  + `.mw-thread-head{width:min(100%,360px)}.mw-topics{display:flex;flex-wrap:wrap;gap:8px}`
  + `.mw-topic{position:relative;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:0;border-radius:999px;background:var(--wash);color:var(--ink-soft);font:inherit;font-size:12px;cursor:pointer}`
  + `.mw-topic[aria-pressed=true]{background:var(--ink);color:var(--paper)}#collab .mw-topic svg{width:12px;height:12px}.mw-topic[data-unread]::after{content:"";position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--blue)}`
  + `.mw-thread-status{margin:8px 0 0;font-size:12px;color:var(--muted)}.mw-thread-status[data-tone=done]{color:var(--green)}`
  + `.mw-thread-compose{display:grid;gap:4px;margin-top:10px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--paper);font-size:11px;color:var(--muted)}.mw-thread-compose__input{border:0;padding:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none}`
  + `.mw-thread-compose__input:focus-visible{outline:var(--focus-stroke);outline-offset:1px}`
  + `.mw-convo{display:grid;gap:10px;width:min(100%,360px)}.mw-said{justify-self:end;max-width:85%;margin:0;padding:8px 14px;border-radius:16px 16px 4px 16px;background:var(--wash);font-size:13px;line-height:1.6}`
  + `.mw-heard{background:none;color:inherit;text-decoration:underline 2px var(--accent);text-underline-offset:4px}.mw-preparing{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;color:var(--muted)}`
  + `.mw-preparing__line{animation:craft-rise var(--dur-move) var(--ease-quint)}`
  + `.mw-brought{display:grid;gap:6px;width:min(100%,380px);font-size:13px}.mw-brought__by{display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--muted)}.mw-brought__by b{color:var(--ink);font-weight:500}`
  + `.mw-brought__card{overflow:hidden;border-radius:12px;background:var(--paper);box-shadow:0 0 0 1px var(--line)}.mw-brought__note{display:flex;align-items:flex-start;gap:6px;margin:0;padding:6px 12px;background:var(--accent-soft);color:var(--accent);font-size:12px;line-height:18px}#collab .mw-brought__note svg{margin-top:2px}`
  + `.mw-brought__fold{display:grid;grid-template-rows:1fr;transition:grid-template-rows var(--dur-move) var(--ease-quint)}.mw-brought__fold>div{min-height:0;overflow:hidden}.mw-brought[data-answered] .mw-brought__fold{grid-template-rows:0fr}`
  + `.mw-brought__body{padding:10px 12px 0}.mw-brought h4{margin:0 0 8px;font-size:13px;font-weight:600}.mw-brought li{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 0}.mw-brought__n{color:var(--faint);font-variant-numeric:tabular-nums}`
  + `.mw-brought__answers{display:flex;gap:8px;padding:10px 12px 12px}.mw-brought__result{display:flex;align-items:center;gap:6px;margin:0;padding:8px 12px;color:var(--green);font-size:12px}.mw-brought__result .mw-btn{margin-left:auto}`
  + `.mw-joined{display:grid;gap:12px;width:min(100%,400px)}.mw-sources{display:grid;gap:6px;padding-left:18px}`
  + `.mw-source,.mw-review__row{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--paper);box-shadow:0 0 0 1px var(--line);font-size:13px}`
  + `.mw-source__icon{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--wash);color:var(--muted)}.mw-source__meta{display:block;font-size:11px;color:var(--muted)}`
  + `.mw-source[data-span]::before{content:"";position:absolute;left:-12px;width:1.5px;background:var(--accent)}.mw-source[data-span=start]::before{top:50%;bottom:-6px}.mw-source[data-span=mid]::before{top:-6px;bottom:-6px}.mw-source[data-span=end]::before{top:-6px;bottom:50%}`
  + `.mw-source[data-joined]::after{content:"";position:absolute;left:-12px;top:50%;width:12px;height:1.5px;background:var(--accent)}`
  + `.mw-urgent{padding:1px 6px;border-radius:6px;background:var(--amber-soft);color:var(--amber);font-size:11px}`
  + `.mw-rule{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:var(--amber-soft);color:var(--ink-soft);font-size:12px}.mw-rule p{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}.mw-rule__head{color:var(--ink);font-size:13px;font-weight:600}`
  + `.mw-rule__line b{padding:1px 8px;border-radius:6px;background:var(--paper);box-shadow:0 0 0 1px var(--line);font-weight:400}.mw-rule__done{color:var(--muted)}`
  + `.mw-review{display:grid;gap:8px;width:min(100%,380px);font-size:13px}.mw-review__head{display:flex;justify-content:space-between;margin:0;color:var(--muted)}.mw-review__head b{color:var(--ink);font-variant-numeric:tabular-nums}.mw-review ul{display:grid;gap:6px}.mw-review__row b{font-weight:500}`
  + `.mw-review__row [aria-pressed=true]{color:var(--green)}.mw-review__send{display:flex;justify-content:flex-end}`
  + `@media (prefers-reduced-motion:reduce){.mw-preparing__line{animation:none}.mw-brought__fold,.mw-req__mark,.mw-reqs__bars i{transition:none}}`;

/** The section's program and the palette switch's, written in `src/browser/board/collab-section.ts` and bundled into `dist/`
 * when the package builds. */
export const COLLAB_SECTION_SCRIPT = readFileSync(new URL("./board-collab-section.js", import.meta.url), "utf8").trim();
