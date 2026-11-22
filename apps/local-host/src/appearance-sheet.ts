import { BASELINE_FONT, BASELINE_REGISTRY, BASELINE_SKIN, renderFontScope, renderMonoScope, renderSkinScope } from "@molis-ai/molis-work-design-system";
import { fontFaceRules } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installedAppearance, installedAppearanceChoices } from "@molis-ai/molis-work-service-appearance";

const refKey = (ref: { readonly id: string; readonly revision: number }) => `${ref.id}@${ref.revision}`;

export function appearanceSheet(): string | null {
  const { skins, fonts } = installedAppearanceChoices();
  const baseSkin = refKey(BASELINE_SKIN.ref);
  const baseFont = refKey(BASELINE_FONT.ref);
  const parts: string[] = [];
  const emittedFonts = new Set<string>([baseFont]);

  for (const font of fonts) {
    const key = refKey(font.ref);
    if (emittedFonts.has(key)) continue;
    const resolved = installedAppearance({ skin: BASELINE_SKIN.ref, font: { policy: "pinned", scheme: font.ref }, mono: font.ref });
    if (!resolved) continue;
    const faces = fontFaceRules(resolved.font, BASELINE_REGISTRY);
    if (!faces.ok) continue;
    if (faces.value) parts.push(faces.value);
    parts.push(renderFontScope(resolved.font), renderMonoScope(resolved.mono));
    emittedFonts.add(key);
  }

  for (const skin of skins) {
    if (refKey(skin.ref) === baseSkin) continue;
    const resolved = installedAppearance({ skin: skin.ref, font: { policy: "follow-skin" }, mono: null });
    if (resolved) parts.push(renderSkinScope(resolved.skin));
  }

  const css = parts.filter(Boolean).join("\n");
  return css || null;
}
