import { BASELINE_REGISTRY, BASELINE_SKIN, renderFontScope, renderMonoScope, renderSkinScope } from "@molis-ai/molis-work-design-system";
import { fontFaceRules } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installedAppearance } from "@molis-ai/molis-work-service-appearance";

export function appearanceSheet(): string | null {
  const folio = installedAppearance({ skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: null });
  const reading = installedAppearance({ skin: BASELINE_SKIN.ref, font: { policy: "pinned", scheme: { id: "relaxed-reading", revision: 1 } }, mono: null });
  const menlo = installedAppearance({ skin: BASELINE_SKIN.ref, font: { policy: "follow-skin" }, mono: { id: "system-menlo", revision: 1 } });
  const parts = [reading && renderFontScope(reading.font), reading && renderMonoScope(reading.mono),
    menlo && renderFontScope(menlo.mono), menlo && renderMonoScope(menlo.mono)];
  if (folio) {
    const faces = fontFaceRules(folio.font, BASELINE_REGISTRY);
    if (faces.ok) parts.push(faces.value, renderSkinScope(folio.skin), renderFontScope(folio.font), renderMonoScope(folio.mono));
  }
  const css = parts.filter(Boolean).join("\n");
  return css || null;
}
