/** Personal island: Lingguang plus the Assistant composer shell. */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = `(host) => {
  const { translate: L, showToast } = host;
  const island = document.querySelector("[data-assistant-island]");
  if (!island) return null;
  const toggle = island.querySelector("[data-assistant-toggle]");
  const composer = island.querySelector("[data-assistant-composer]");
  const input = island.querySelector("[data-assistant-input]");
  const send = island.querySelector("[data-assistant-send]");
  if (!toggle || !composer || !input || !send) return null;

  const syncSend = () => {
    send.disabled = !String(input.value || "").trim();
  };
  const place = () => {
    const rect = toggle.getBoundingClientRect();
    const width = composer.offsetWidth || 300;
    const height = composer.offsetHeight || 32;
    const left = Math.min(rect.right + 8, innerWidth - width - 8);
    const top = Math.max(8, Math.min(rect.top + (rect.height - height) / 2, innerHeight - height - 8));
    composer.style.inset = "auto";
    composer.style.margin = "0";
    composer.style.left = Math.max(8, left) + "px";
    composer.style.top = top + "px";
  };
  const isOpen = () => composer.matches(":popover-open");

  composer.addEventListener("toggle", (event) => {
    const open = event.newState === "open";
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      place();
      syncSend();
      requestAnimationFrame(() => {
        place();
        input.focus();
      });
    }
  });
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    syncSend();
    if (send.disabled) return;
    composer.requestSubmit(send);
  });
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!String(input.value || "").trim()) return;
    showToast(L("对话尚未接入"));
  });
  island.querySelector("[data-plugin-id]")?.addEventListener("click", () => {
    if (isOpen()) composer.hidePopover();
  });
  addEventListener("resize", () => { if (isOpen()) place(); });
  syncSend();
  return { isOpen };
}`;
