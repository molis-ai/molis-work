/// <reference lib="dom" />
// The board's AI kit specimens (`primitives/catalog-capability-packs.ts`) made to feel real: the state block's menu opens under its
// button. Presentation only; nothing here is a product control.
import { installAnchoredMenu } from "./anchored-menu.js";

export function wireCatalogCapabilityPacks(): void {
  installAnchoredMenu();
}
