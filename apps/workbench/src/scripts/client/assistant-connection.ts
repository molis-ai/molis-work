import { isLoopbackHostname, isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { isConnectionLoginUrl } from "../../connection-need-card.js";

/**
 * A result's pending connection (specs/assistant-service-connections/spec.md §13.5 C5, ASC-69): the platform's connection card under the
 * result, drawn by the Host from the request's own state (`/api/assistant/works/<work>/cards/<card>/connection`), read and cancelled there
 * as whoever prepared it. Logging in and a pasted key go through the person's own connections routes with the prepared request, exactly as
 * the 「继续接入」 page does; the work goes on through its registered wait, once. The result's own link stays beside the card, whether it
 * is drawn or not (another session's request, expired, a way the card does not take): it is the keyboard's way to the connections
 * page (ASC-23), so the card never hides it. A read that changes nothing leaves the card as it is, and a redraw puts the focus back
 * on the same control (or the card's line), so polling never takes a control from under the person. The login window is reserved during the press, so a browser that blocks a
 * later window does not; a desktop shell opens the system browser instead. The result's own 「继续接入」 link opens the connections page as
 * a return trip of the work shown (specs/draft-and-return §2.3). A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. The login
 * address check is the card's own (`isConnectionLoginUrl` on the one loopback spelling), written in from those functions. While a login
 * is under way the card reads every 2 s only while the page shows, and at once when it shows again or the window comes back; its
 * listeners go with the card.
 */
export const ASSISTANT_CONNECTION_PART = String.raw`  const connectionCard = (mount, work, card) => {
    if (mount.dataset.bound !== undefined) return; mount.dataset.bound = "";
    const path = "/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/connection";
    const KEY = "[data-connection-need-key]";
    const isLoopbackHostname = ${isLoopbackHostname.toString()};
    const isLoopbackHttpUrl = ${isLoopbackHttpUrl.toString()};
    const isConnectionLoginUrl = ${isConnectionLoginUrl.toString()};
    let state = null, timer = 0, busy = false, drawn = "";
    const gone = () => { clearTimeout(timer); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", shown); };
    const show = (next) => {
      state = next; clearTimeout(timer);
      if (!mount.isConnected) { gone(); return; }
      if (mount.hidden = next.state === "link") { gone(); return; }
      mount.dataset.stage = next.state === "connected" || next.state === "cancelled" ? "line" : next.state;
      if (next.html !== drawn) {
        const held = mount.contains(document.activeElement) && document.activeElement, typed = mount.querySelector(KEY)?.value || "";
        drawn = mount.innerHTML = next.html;
        const key = mount.querySelector(KEY); if (key) key.value = typed;
        if (held) (mount.querySelector(held.matches(KEY) ? KEY : "[data-framed-control='" + held.dataset.framedControl + "']") || mount.querySelector("[tabindex='-1'],[data-framed-control]"))?.focus({ preventScroll: true });
      }
      if (next.state === "pending") { window.addEventListener("focus", focused); timer = setTimeout(tick, 2000); } else gone();
    };
    const read = () => api(path).then(show, () => show({ state: "link" }));
    const tick = () => { if (!mount.isConnected) gone(); else if (document.hidden) document.addEventListener("visibilitychange", shown); else read(); };
    const shown = () => { if (document.hidden) return; document.removeEventListener("visibilitychange", shown); tick(); };
    const focused = () => { if (!mount.isConnected) gone(); else if (state && state.state === "pending") read(); };
    const say = (text) => { const note = mount.querySelector(".connection-need-area__note"); if (note) { note.textContent = text; note.classList.add("is-error"); } };
    const failed = globalThis.t.text("workbench.assistant-connection.not-connected-nothing-changed-here-can-try-again");
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
          if (!isConnectionLoginUrl(url)) throw new Error(globalThis.t.text("workbench.assistant-connection.service-returned-invalid-authorization-address-please-retry"));
          if (external) await external(url); else if (popup && !popup.closed) popup.location.replace(url);
          else { say(globalThis.t.text("workbench.assistant-connection.browser-blocked-new-window-allow-pop-ups-then")); return; }
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
    window.addEventListener("focus", focused);
    read();
  };
  // 继续接入 opens the connections page for the work shown here and waits for the authorization the host named on the link
  // (specs/draft-and-return §2.3): the settings close onto this work once it is connected. Only where the settings open in place (the
  // settings directory with its return bar); elsewhere (Home with no project) the link goes where it points, by mouse or keyboard (ASC-23).
  thread.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href][data-return-setup]");
    if (!link || !curId || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!document.querySelector("template[data-settings-return-bar-template]")) return;
    event.preventDefault();
    document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: link.href, from: { kind: "assistant", work_id: curId }, need: { kind: "setup", authorization_id: link.dataset.returnSetup } } }));
  });
`;
