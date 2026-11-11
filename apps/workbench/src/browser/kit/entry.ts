import { mountKit } from "./page.js";
import { addKitStyles } from "./styles.js";

// The 「能力包」 page's program, loaded only where the page is (settings-kit.ts): binds the page now and each one the settings cover
// places later (its root may be the page itself).
const bind = (scope: ParentNode) => {
  const roots = scope instanceof HTMLElement && scope.matches("[data-kit-settings]") ? [scope] : [...scope.querySelectorAll<HTMLElement>("[data-kit-settings]")];
  for (const root of roots) { addKitStyles(); mountKit(root); }
};
bind(document);
document.addEventListener("molis-work:settings-embed", event => bind((event as CustomEvent<{ root?: ParentNode }>).detail?.root ?? document));
