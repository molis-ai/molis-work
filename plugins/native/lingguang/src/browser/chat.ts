import { isAbort, messageOf, required, textCard } from "./dom.js";
import type { ConversationPayload, LingguangPage, Message, Spark } from "./types.js";

/** The brainstorm, the hand-over to the Assistant and the copy of what is picked. */
export function installChat(page: LingguangPage): void {
  const { host, L, el, s, request, api } = page;
  const roleName = (message: Message) => message.role === "assistant" ? L("lingguang.page.title") : message.role === "stub" ? L("lingguang.chat.local-record") : L("lingguang.action.capture");
  const renderMessages = (messages: readonly Message[] | undefined) => {
    s.shownMessages = [...(messages || [])];
    el.messagesEl.replaceChildren(...s.shownMessages.map((message) => textCard(roleName(message), message.body, "lingguang-message")));
  };
  const renderContext = (sparks: readonly Spark[] | undefined) => {
    el.contextEl.replaceChildren(...(sparks || []).map((spark) => textCard(spark.title, spark.body || "")));
  };
  const askToggle = () => el.workbench.querySelector<HTMLElement>("[data-lingguang-ask-toggle]");

  /*
   * Handing this spark to the Assistant: the spark itself and only the last few brainstorm lines, named as such —
   * never the whole conversation. Submitting the form is the person's asking; “只带过去” leaves Send to them.
   */
  page.handOver = (purpose, text) => {
    const open = s.selected;
    if (!open) return;
    const recent = s.shownMessages.filter((message) => message.role !== "stub").slice(-6);
    const name = open.title || L("lingguang.page.title");
    const materials = [{ title: L("lingguang.handover.material", { title: name }), text: (open.title || "") + (open.body ? "\n" + open.body : "") }];
    if (recent.length) {
      materials.push({
        title: L("lingguang.handover.recent", { count: recent.length }),
        text: recent.map((message) => L("lingguang.handover.line", { who: message.role === "assistant" ? L("lingguang.page.title") : L("lingguang.handover.me"), text: message.body })).join("\n"),
      });
    }
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose, source: { surface: "lingguang", title: L("lingguang.page.title") },
      object: { kind: "lingguang_spark", id: open.id, title: name, version: open.updated_at + ":" + (open.status || "inbox") },
      text, materials,
    } }));
    el.askForm.hidden = true;
    askToggle()?.setAttribute("aria-expanded", "false");
    el.askInput.value = "";
  };
  el.askForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(el.askInput.value || "").trim();
    if (!text) { el.askInput.focus(); return; }
    await page.save();
    page.handOver("delegate", text);
  });
  el.askForm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { el.askForm.hidden = true; askToggle()?.focus(); }
  });

  page.openBrainstorm = async () => {
    const ids = s.picks.size ? [...s.picks] : (s.selected ? [s.selected.id] : []);
    if (!ids.length) throw new Error(L("lingguang.error.select-one"));
    await page.save();
    ids.forEach((id) => s.fresh.delete(id));
    const payload = await request<ConversationPayload>("POST", `${api}/conversations`, { spark_ids: ids });
    s.conversation = payload.conversation;
    el.workbench.setAttribute("data-expanded", "true");
    el.workspace.hidden = false;
    page.showChat(true);
    el.titleEl.textContent = L("lingguang.action.brainstorm");
    renderContext(payload.sparks);
    renderMessages(payload.messages);
    el.chatInput.value = "";
    window.molisFit?.(el.chatInput);
    el.chatInput.focus();
  };

  page.copyDispatch = async (button) => {
    const picked = page.selectedRecords(), items = picked.length ? picked : (s.selected ? [s.selected] : []);
    if (!items.length) throw new Error(L("lingguang.error.select-one"));
    const text = items.map((item) => item.title + (item.body ? "\n" + item.body : "")).join("\n\n");
    if (!await window.molisCopy?.(button as HTMLElement, text, { done: L("lingguang.copy.done"), failed: L("lingguang.copy.failed") })) page.showNote(L("lingguang.copy.failed"), true);
  };

  /*
   * The reply shows as the model writes it, marked as not yet kept; only the reply the Host checked and saved stays.
   * Stop closes the request, which stops the call: nothing is saved and the words stay in the box.
   */
  let controller: AbortController | null = null;
  const stop = required<HTMLElement>(el.chatForm, "[data-lingguang-chat-stop]");
  stop.addEventListener("click", () => controller?.abort());
  el.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!s.conversation || s.sending) return;
    const conversationId = s.conversation.id, body = el.chatInput.value;
    s.sending = true;
    const submit = el.chatForm.querySelector<HTMLButtonElement>('[type="submit"]');
    if (submit) submit.disabled = true;
    page.showNote("", false);
    const draft = document.createElement("article"), draftHead = document.createElement("strong"), draftBody = document.createElement("p");
    draft.className = "lingguang-message is-draft";
    draft.dataset.lingguangDraft = "";
    draft.setAttribute("aria-busy", "true");
    draftHead.textContent = L("lingguang.chat.draft-head");
    draftBody.textContent = "";
    draft.append(draftHead, draftBody);
    el.messagesEl.append(draft);
    controller = new AbortController();
    stop.hidden = false;
    try {
      const payload = await molisWorkRequest.stream<ConversationPayload | null>(host.pluginRoute(`${api}/conversations/${encodeURIComponent(conversationId)}/messages`), {
        body: { body }, signal: controller.signal, scope: page.life,
        onProgress: (progress) => { if (typeof progress.text_delta === "string") draftBody.textContent += progress.text_delta; },
      });
      if (!payload) throw new Error(L("lingguang.chat.not-saved"));
      if (s.conversation?.id !== conversationId) return;
      s.conversation = payload.conversation;
      renderContext(payload.sparks);
      renderMessages(payload.messages);
      if (el.chatInput.value === body) { el.chatInput.value = ""; window.molisFit?.(el.chatInput); }
    } catch (error) {
      draft.remove();
      if (s.conversation?.id === conversationId) page.showNote(isAbort(error) ? L("lingguang.chat.stopped") : messageOf(error) || L("lingguang.error.request"), !isAbort(error));
    } finally {
      s.sending = false;
      controller = null;
      stop.hidden = true;
      if (submit) submit.disabled = false;
    }
  });
  el.chatForm.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      el.chatForm.requestSubmit();
    }
  });
}
