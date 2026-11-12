/// <reference lib="dom" />
import type { UiTextTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { createLookFade } from "../look-fade.js";
// The board's look parts made to feel real (primitives/catalog-appearance.ts): choosing a look card, the card's menu letting go, and the fade when the whole
// page changes look. Presentation only; nothing here is a product control, and nothing is stored: a reload is Soft Workbench again.

const all = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(selector)];

/** Picking a card says which look the specimen shows: one card is pressed, and unless it is the look in use it wears the "in the specimen" badge. */
function wireCards(): void {
  for (const group of all("[data-look-cards]")) {
    group.addEventListener("click", (event) => {
      const target = event.target as Element;
      const pick = target.closest<HTMLElement>(".mw-look-card__pick");
      if (pick) {
        for (const other of all(".mw-look-card__pick", group)) {
          const pressed = other === pick;
          other.setAttribute("aria-pressed", String(pressed));
          const trial = other.querySelector<HTMLElement>(".mw-look-card__trial");
          if (trial) trial.hidden = !pressed || other.hasAttribute("data-look-in-use");
        }
        return;
      }
      // Choosing from a card's menu closes it and gives the focus back to the button that opened it.
      const item = target.closest<HTMLButtonElement>(".mw-look-card .mw-menu__item");
      if (!item || item.disabled) return;
      const menu = item.closest<HTMLElement>("[data-compose-menu]");
      const toggle = menu?.parentElement?.querySelector<HTMLElement>("[data-compose-menu-toggle]");
      if (!menu || !toggle || menu.hasAttribute("data-menu-held")) return;
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });
  }
}

/**
 * The page, words and focus change together. The shared fade lets the old page colour fade over the live controls.
 */
function wireFade(): void {
  const stage = document.querySelector<HTMLElement>("[data-look-fade]");
  const now = stage?.querySelector<HTMLElement>("[data-look-fade-now]");
  const to = stage?.querySelector<HTMLButtonElement>("[data-look-fade-to]");
  const back = stage?.querySelector<HTMLButtonElement>("[data-look-fade-back]");
  const look = stage?.dataset.lookFadeLook;
  if (!stage || !now || !to || !back || !look) return;
  const root = document.documentElement;
  const fade = createLookFade();
  const label = () => {
    const words = (globalThis as typeof globalThis & { t: UiTextTool }).t.text;
    const name = root.dataset.look === look ? words(stage.dataset.lookFadeName!) : stage.dataset.lookFadeSoft!;
    now.textContent = words("workbench.catalog-appearance.using-name", { name });
  };
  const show = (worn: boolean) => {
    if (worn) root.dataset.look = look;
    else delete root.dataset.look;
    label();
    to.disabled = worn;
    back.disabled = !worn;
    (worn ? back : to).focus();
  };
  const change = (worn: boolean) => {
    stage.dataset.fade = fade(() => show(worn)) ? "fade" : "direct";
  };
  to.addEventListener("click", () => change(true));
  back.addEventListener("click", () => change(false));
  document.addEventListener("molis-work:language-changed", label);
}

export function wireCatalogAppearance(): void {
  wireCards();
  wireFade();
}
