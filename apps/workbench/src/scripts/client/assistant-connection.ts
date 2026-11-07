/**
 * A result's pending connection (specs/assistant-service-connections/spec.md §13.5 C5, ASC-69): the platform's connection card under the
 * result, drawn by the Host from the request's own state (`/api/assistant/works/<work>/cards/<card>/connection`), read and cancelled there
 * as whoever prepared it. Logging in and a pasted key go through the person's own connections routes with the prepared request, exactly as
 * the 「继续接入」 page does; the work goes on through its registered wait, once. Not drawn (another session's request, expired, a way
 * the card does not take), the result's own link stays. The login window is reserved during the press, so a browser that blocks a
 * later window does not; a desktop shell opens the system browser instead. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place.
 */
export const ASSISTANT_CONNECTION_PART = String.raw`  const connectionCard = (mount, work, card) => {
    if (mount.dataset.bound !== undefined) return; mount.dataset.bound = "";
    const path = "/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/connection";
    const way = mount.parentElement && mount.parentElement.querySelector("[data-ix-press=open]"), KEY = "[data-connection-need-key]";
    let state = null, timer = 0, busy = false;
    const show = (next) => {
      state = next; clearTimeout(timer);
      if (!mount.isConnected) return;
      const link = next.state === "link"; mount.hidden = link; if (way) way.hidden = !link;
      if (link) return;
      const typed = mount.querySelector(KEY)?.value || "";
      mount.innerHTML = next.html; mount.dataset.stage = next.state === "connected" || next.state === "cancelled" ? "line" : next.state;
      const key = mount.querySelector(KEY); if (key) key.value = typed;
      if (next.state === "pending") timer = setTimeout(read, 2000);
    };
    const read = () => api(path).then(show, () => show({ state: "link" }));
    const say = (text) => { const note = mount.querySelector(".connection-need-area__note"); if (note) { note.textContent = text; note.classList.add("is-error"); } };
    const failed = L("没有连上。这里什么都没改，可以再试一次。");
    const settings = (sub, body, method) => molisWorkRequest("/api/settings/connectors/" + sub, { method: method || "POST", body, fallback: failed });
    mount.addEventListener("click", async (event) => {
      const control = event.target.closest("[data-framed-control]");
      if (!control || !event.isTrusted || busy || !state || !state.html) return;
      const step = control.dataset.framedControl, setup = state.setup, external = globalThis.molisWorkOpenExternalUrl;
      const popup = step === "connect" && !external ? window.open("", "_blank") : null; if (popup) popup.opener = null;
      busy = true; mount.setAttribute("aria-busy", "true");
      try {
        if (step === "cancel") show(await api(path, "POST", { step: "cancel" }));
        else if (step === "connect" && setup) {
          const started = await settings("methods/oauth/start", { service_id: setup.service_id, display_name: setup.display_name, setup_id: setup.setup_id, ...(setup.connection_id ? { connection_id: setup.connection_id } : {}) });
          const url = started.authorization_url;
          if (!/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(url)) throw new Error(L("服务返回的授权地址无效，请重试。"));
          if (external) await external(url); else if (popup && !popup.closed) popup.location.replace(url);
          else { say(L("浏览器拦截了新窗口，允许弹出后再点一次连接。")); return; }
          await read();
        } else if (step === "save" && setup) {
          const input = mount.querySelector(KEY), token = input ? input.value.trim() : "";
          if (!token) { input?.focus(); return; }
          await (setup.connection_id ? settings("connections/" + encodeURIComponent(setup.connection_id), { token, setup_id: setup.setup_id }, "PATCH")
            : settings("connections", { service_id: setup.service_id, display_name: setup.display_name, token, setup_id: setup.setup_id }));
          await read();
        }
      } catch (error) { popup?.close(); say((error && error.message) || failed); }
      finally { busy = false; mount.removeAttribute("aria-busy"); }
    });
    window.addEventListener("focus", () => { if (state && state.state === "pending" && mount.isConnected) read(); });
    read();
  };
`;
