import { mountWorkRecords } from "./page.js";
import { addWorkRecordsStyles } from "./styles.js";

const mounted = new WeakMap<HTMLElement, () => void>();
const bind = (scope: ParentNode) => {
  const roots = scope instanceof HTMLElement && scope.matches("[data-work-records-settings]")
    ? [scope]
    : [...scope.querySelectorAll<HTMLElement>("[data-work-records-settings]")];
  for (const root of roots) {
    const sync = mounted.get(root);
    if (sync) sync();
    else {
      addWorkRecordsStyles();
      mounted.set(root, mountWorkRecords(root));
    }
  }
};
bind(document);
document.addEventListener("molis-work:settings-embed", (event) => bind((event as CustomEvent<{ root?: ParentNode }>).detail?.root ?? document));
document.addEventListener("molis-work:language-changed", () => bind(document));
