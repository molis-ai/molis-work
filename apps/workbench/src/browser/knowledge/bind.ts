import type { KnowledgeBindCandidate, KnowledgeBindPreviewResponse, KnowledgeBindRequest, KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import { el, L, request, subjectKey, unbound, when } from "./common.js";
import type { KnowledgeDetailHost } from "./detail.js";

/** A person's exact decision survives a lost response and a detail redraw, for this mounted page only. */
export function knowledgeBinding(root: HTMLElement, host: Pick<KnowledgeDetailHost, "api" | "replaced" | "toast" | "fail"> & { redraw(): void }) {
  const pending = new Map<string, { body: KnowledgeBindRequest; review: boolean }>();
  const dialog = root.querySelector<HTMLDialogElement>("[data-knowledge-bind-dialog]")!;
  const part = <T extends HTMLElement = HTMLElement>(name: string) => dialog.querySelector<T>("[data-knowledge-bind-" + name + "]")!;
  const form = dialog.querySelector("form")!;
  const original = part("original"), choices = part<HTMLFieldSetElement>("candidates"), error = part("error");
  const confirm = part<HTMLButtonElement>("confirm"), cancel = part<HTMLButtonElement>("cancel"), review = part<HTMLButtonElement>("review");
  const close = dialog.querySelector<HTMLButtonElement>("[data-dialog-close]")!;
  let card: KnowledgeCardRecord | null = null, candidates: KnowledgeBindCandidate[] = [], picked = -1, busy = false, reading = false, replacing = false;
  const working = (on: boolean) => {
    busy = on; form.setAttribute("aria-busy", String(on));
    confirm.disabled = on || !card || (replacing || !pending.has(subjectKey(card.subject))) && picked < 0;
    cancel.disabled = close.disabled = on;
    review.disabled = on; choices.disabled = on || !replacing && !!card && pending.has(subjectKey(card.subject));
  };
  const dismiss = () => { if (!busy) dialog.close(); };
  cancel.addEventListener("click", dismiss); close.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { card = null; candidates = []; picked = -1; replacing = false; });
  review.addEventListener("click", () => { if (card) void reviewBind(card); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (event.submitter !== confirm || busy || !card) return;
    const key = subjectKey(card.subject), candidate = candidates[picked];
    let body = replacing ? undefined : pending.get(key)?.body;
    if (!body && candidate) {
      const { provider_id, source_key, source_identity, source_revision } = candidate;
      body = Object.freeze({ subject: { ...card.subject }, operation_id: crypto.randomUUID(), provider_id, source_key, source_identity: Object.freeze({ ...source_identity }), source_revision });
      pending.set(key, { body, review: false }); replacing = false;
    }
    if (body) void dispatch(body);
  });
  async function dispatch(body: KnowledgeBindRequest) {
    if (busy) return;
    working(true); error.hidden = true; review.hidden = true;
    try {
      const saved = await host.api<KnowledgeCardRecord>("/bind", body);
      pending.delete(subjectKey(body.subject));
      if (!root.isConnected) return;
      dialog.close(); host.replaced(saved);
      host.toast(L("已关联当前来源，未自动整理"));
    } catch (failure) {
      request().show(error, failure); error.hidden = false;
      confirm.textContent = L("重试这次关联");
      const code = failure instanceof Error && "code" in failure ? failure.code : null;
      const command = pending.get(subjectKey(body.subject));
      if (command) command.review = code === "actions.conflict" || code === "actions.subject_unavailable" || code === "actions.forbidden";
      review.hidden = !command?.review;
      host.redraw(); if (!dialog.open) host.fail(failure);
      else error.scrollIntoView({ block: "nearest" });
    } finally { working(false); }
  }
  async function reviewBind(item: KnowledgeCardRecord) {
    if (busy || reading) return;
    working(true);
    try {
      const current = (await host.api<{ card: KnowledgeCardRecord | null }>("/card?kind=" + encodeURIComponent(item.subject.kind) + "&id=" + encodeURIComponent(item.subject.id))).card;
      if (!root.isConnected) return;
      if (current?.adoption) { pending.delete(subjectKey(item.subject)); dialog.close(); host.replaced(current); return; }
      if (!current || !unbound(current)) throw new Error(L("无法确认旧卡片现状，请保留原请求重试。"));
      await preview(current, true);
    } catch (failure) { host.fail(failure); } finally { working(false); }
  }
  async function preview(item: KnowledgeCardRecord, replace = false) {
      reading = true;
      const opener = document.activeElement;
      if (opener instanceof HTMLButtonElement) opener.disabled = true;
      try {
        const preview = await host.api<KnowledgeBindPreviewResponse>("/bind-preview", { subject: item.subject });
        if (!root.isConnected || !root.getClientRects().length) return;
        card = item; replacing = replace; candidates = preview.candidates; picked = candidates.length === 1 ? 0 : -1;
        review.hidden = true;
        error.hidden = true; original.replaceChildren(el("p", "settings-muted", L("保留的旧卡片")), el("strong", "", item.title), el("p", "knowledge-brief", item.brief));
        choices.replaceChildren(el("legend", "", L("选择当前来源")));
        if (!candidates.length) choices.append(el("p", "", L("暂无可关联来源，请确认资料或插件可用。")));
        for (const [index, candidate] of candidates.entries()) {
          const label = el("label", "mw-check-row"), radio = el("input", "mw-radio"), copy = el("span", "knowledge-row-copy");
          radio.type = "radio"; radio.name = "knowledge-bind-source"; radio.checked = picked === index;
          radio.dataset.knowledgeBindSource = String(index);
          radio.addEventListener("change", () => { picked = index; working(false); });
          copy.append(el("strong", "knowledge-brief", candidate.title), el("span", "", candidate.plugin_title));
          if (candidate.summary) copy.append(el("p", "knowledge-brief", candidate.summary));
          if (candidate.updated_at) copy.append(el("span", "", L("更新于 {time}", { time: when(candidate.updated_at) })));
          copy.append(el("span", "settings-muted", candidate.content_policy === "summary" ? L("仅提供标题和摘要") : L("可读取原文")));
          label.append(radio, copy); choices.append(label);
        }
        confirm.textContent = L("确认关联"); working(false); if (!dialog.open) dialog.showModal(); cancel.focus();
      } catch (failure) { host.fail(failure); }
      finally { reading = false; if (opener instanceof HTMLButtonElement) opener.disabled = false; }
  }
  return {
    retryBind: (item: KnowledgeCardRecord) => pending.has(subjectKey(item.subject)),
    canReviewBind: (item: KnowledgeCardRecord) => pending.get(subjectKey(item.subject))?.review === true,
    reviewBind,
    // A later read may prove that an apparently failed request committed. Do not offer that old decision again.
    current(items: readonly KnowledgeCardRecord[]) {
      for (const item of items) if (item.adoption) {
        pending.delete(subjectKey(item.subject));
        if (card && subjectKey(card.subject) === subjectKey(item.subject)) dialog.close();
      }
    },
    async bind(item: KnowledgeCardRecord) {
      if (busy || reading || dialog.open || !unbound(item)) return;
      const retry = pending.get(subjectKey(item.subject));
      if (retry) { await dispatch(retry.body); return; }
      await preview(item);
    },
  };
}
