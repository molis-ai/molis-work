import { ASSISTANT_THREAD_REPLY_SCRIPT } from "./assistant-step-row.js";

/** What plugin pages tell the Assistant (spec 8.3): opening, messages, delegation and filling the input, with the thread-reply fragment joined in. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_PAGE_MESSAGES_PART = String.raw`  /* ─── What plugin pages tell the Assistant (spec 8.3): by purpose, never by wording ───────────────────────── */
  const heard = new Set();
  let requestOverride = null, pageText = null;
  const tidyMessage = (raw) => {
    if (!raw || typeof raw !== "object" || typeof raw.message_id !== "string" || !raw.message_id || raw.message_id.length > 120) return null;
    if (!["background", "change", "suggest", "delegate", "reply"].includes(raw.purpose)) return null;
    if (!raw.source || typeof raw.source.surface !== "string" || !raw.source.surface) return null;
    const source = { surface: raw.source.surface.slice(0, 80), title: typeof raw.source.title === "string" && raw.source.title ? raw.source.title.slice(0, 80) : raw.source.surface.slice(0, 80), ...(typeof raw.source.plugin_id === "string" && raw.source.plugin_id ? { plugin_id: raw.source.plugin_id.slice(0, 200) } : {}) };
    const object = raw.object && typeof raw.object.kind === "string" && typeof raw.object.id === "string" && raw.object.kind && raw.object.id
      ? Object.assign({ kind: raw.object.kind.slice(0, 80), id: raw.object.id.slice(0, 200) }, typeof raw.object.title === "string" ? { title: raw.object.title.slice(0, 200) } : {},
        typeof raw.object.version === "number" || typeof raw.object.version === "string" ? { version: raw.object.version } : {}) : null;
    const mats = Array.isArray(raw.materials) ? raw.materials.filter((item) => item && typeof item.title === "string" && typeof item.text === "string" && item.text)
      .slice(0, 4).map((item) => ({ title: item.title.slice(0, 200), text: item.text.slice(0, 20000) })) : [];
    return { message_id: raw.message_id, purpose: raw.purpose, source, object, text: typeof raw.text === "string" ? raw.text.trim().slice(0, 8000) : "", materials:mats,
      work_id: typeof raw.work_id === "string" && raw.work_id ? raw.work_id : null, executor: typeof raw.executor === "string" && raw.executor ? raw.executor.slice(0, 200) : null, thread: tidyThread(raw.thread) };
  };
  const bring = (message) => {
    (message.materials.length || !message.object ? message.materials : [{ kind: "object", title: message.object.title || message.object.id }]).forEach((item, index) => files.some((file) => file.title === item.title && file.text === item.text) || files.push(Object.assign({ material_id: "msg-" + message.message_id.slice(0, 40) + "-" + index, kind: item.kind || "text", title: item.title, text: item.text,
      explicit: true, source: { surface: message.source.surface, title: message.source.title } }, message.object ? { object: message.object } : {})));
    if (message.text) input.value = message.text;
    syncSend(); paintMats();
  };
  const showOffer = (message, unconfirmed) => stepRow?.offer(message, unconfirmed); ${ASSISTANT_THREAD_REPLY_SCRIPT}
  const delegate = async (message) => {
    if (busy) { showOffer(message, false); return; }
    if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id);
    else if (message.work_id || curId) await switchTo(null);
    await executorsLoaded;
    if (!message.work_id && message.executor && executorOffer(message.executor)) { nextExec = message.executor; nextMode = ""; paintAim(); paintSum(); } // e.g. the 成果库's 「交给 Coding」
    bring(message);
    if (!String(input.value || "").trim()) { setPanel(true); input.focus(); return; }
    requestOverride = "msg-" + message.message_id; pageText = message.text && input.value.trim();
    compose.requestSubmit(send);
  };
  document.addEventListener("molis:assistant-open", async (event) => {
    const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
    const named = typeof detail.work_id === "string" && detail.work_id ? detail.work_id : "";
    if (named && !works.some((work) => work.work_id === named)) await loadWorks();
    // The work on show reads itself again, so a card just placed in it shows now.
    if (named && works.some((work) => work.work_id === named)) await (named === curId ? reload().then(poll) : switchTo(named));
    else if (detail.new === true || named) await switchTo(null);
    const source = detail.source && typeof detail.source.surface === "string" && detail.source.surface
      ? { surface: detail.source.surface.slice(0, 80), title: typeof detail.source.title === "string" && detail.source.title ? detail.source.title.slice(0, 80) : detail.source.surface.slice(0, 80) } : null;
    // What was in hand goes in the strip with the object it came from, so the work is linked under it; no words are
    // written for the person (spec §21.2 point 4). It stands for the page's selection, which is not carried twice.
    const object = tidyMessage({ message_id: "open", purpose: "delegate", source: { surface: "page" }, object: detail.object })?.object;
    const brought = Array.isArray(detail.materials) ? detail.materials.filter((item) => item && typeof item.title === "string" && (typeof item.text === "string" && item.text || item.subject && !files.some((file) => file.reference?.subject?.kind === item.subject.kind && file.reference.subject.id === item.subject.id))).slice(0, 10) : [];
    brought.forEach((item, index) => files.push(item.subject ? { material_id: "kn-" + crypto.randomUUID(), kind: "object", title: item.title.slice(0, 200), explicit: true, reference: { subject: { kind: item.subject.kind, id: item.subject.id } }, object: { kind: item.subject.kind, id: item.subject.id, title: item.title.slice(0, 200) }, ...(source ? { source } : {}) } : Object.assign({ material_id: "open-" + Date.now().toString(36) + "-" + index, kind: "text", title: item.title.slice(0, 200),
      text: item.text.slice(0, 20000), explicit: true }, source ? { source } : {}, object ? { object } : {})));
    if (brought.length) sel = null;
    syncSend(); paintMats(); setPanel(true); input.focus();
  });
  window.addEventListener("molis:assistant-message", (event) => {
    const message = tidyMessage(event.detail);
    if (!message || heard.has(message.message_id)) return;
    heard.add(message.message_id);
    if (message.purpose === "background") {
      background = message; paintMats(); return;
    }
    if (message.purpose === "change") {
      if (!message.object) return;
      forgetRelated(message.object);
      if (view && belongsToWork(message.object)) void reload().then(poll).catch(() => {});
      return;
    }
    if (message.purpose === "suggest") { showOffer(message, false); return; }
    if (message.purpose === "delegate") {
      const asked = Boolean(navigator.userActivation && navigator.userActivation.isActive);
      if (asked) void delegate(message); else showOffer(message, true);
      return;
    }
    if (message.purpose === "reply") {
      if (!message.work_id || !message.object) return;
      void api("/works/" + encodeURIComponent(message.work_id) + "/results", "POST", { object: message.object, source: message.source })
        .then((res) => { if (curId === message.work_id) { view = res; render(); } })
        .catch((error) => showError(error));
    }
  });`;
