// Shared helpers for the two groups of this prototype. Every renderer comes from the component board: ../kit/kit.js
// (window.mwKit) and ./dist/parts.js (window.mw05, what the kit does not carry, from this build; where both have one, this
// build's wins, so markup and ./dist/board.css match). Nothing here draws a part of its own.
(() => {
  const M = window.mw05 || {}, K = { ...window.mwKit, ...M };
  const S = { lang: "zh" };
  const esc = K.escapeHtml;
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const ic = (name) => K.icon(name);
  // A button from the board. `only` is an icon-only button; `act` is the prototype's click hook.
  const btn = ({ only, act, data = {}, variant = "secondary", size = "sm", attrs = {}, ...rest }) => K.renderButton({
    ...rest, variant, size, iconOnly: only,
    attrs: { ...attrs, ...(act ? { "data-act": act } : {}), ...Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v])) },
  });
  // A state with its words: a ring (state) or a glyph (icon) beside the label, in the state's tone; never colour alone.
  const status = (label, tone, mark = {}) => K.renderStatusMark({ label, tone, plain: true, ...mark });
  const kind = (name) => K.renderFileKind(name);
  const ring = (state, size) => K.renderStateRing(size ? { state, size } : { state });
  let toastTimer = 0;
  // The board's toast (graphite capsule above the bar); an undo is its own action.
  const toast = (message, action, tone = "") => {
    document.querySelectorAll(".proto-toast").forEach((node) => node.remove());
    const node = document.createElement("div");
    node.className = "mw-toast proto-toast" + (tone === "danger" ? " is-error" : "");
    node.dataset.slot = "toast";
    node.setAttribute("role", "status");
    if (tone === "success") node.dataset.mwState = "done";
    node.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="mw-toast__action mw-toast__action--primary" data-act="${esc(action.act)}">${esc(action.label)}</button>` : ""}`;
    document.body.append(node);
    requestAnimationFrame(() => node.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), action ? 6000 : 3600);
  };
  // What the prototype simulates, said on the page where it happens (not product UI).
  const sim = (text) => `<span class="proto-sim" title="${esc(text)}">${esc(L("模拟", "Simulated"))}</span>`;
  // [组件板新增] marker: a part the board does not have yet, with the reason, shown only while the prototype marks are on.
  const added = (why) => `<span class="proto-added" tabindex="0" title="${esc(why)}">${esc(L("组件板新增", "Board addition"))}<span class="proto-added__why">${esc(why)}</span></span>`;
  window.P = { K, M, S, esc, L, T, ic, btn, status, kind, ring, toast, sim, added };
})();
